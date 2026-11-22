-- Funções múltiplas: mantém funcao_sistema como função principal.
-- Não altera nomes, função principal, escalas ou registros históricos existentes.
alter table public.profissionais
  add column if not exists funcoes_habilitadas text[] not null default '{}'::text[];

comment on column public.profissionais.funcoes_habilitadas is
  'Funções adicionais conferidas; interpretar sempre junto com funcao_sistema (principal).';

create or replace function public.samu_conferir_nomes(p_changes jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare
  item jsonb;
  p public.profissionais;
  c public.profissionais_nomes_conferidos;
  total integer:=0;
  h jsonb;
  aliases_old text[];
  chosen_primary text;
  chosen_roles text[];
  allowed constant text[]:=array[
    'Condutor','Sanitária','TARM','Rádio-operador','Lavador',
    'Motolância','Técnico de Enfermagem','Enfermeiro','Médico'
  ];
begin
  if auth.uid() is null or not private.can_operate() then
    raise exception 'Sem permissão para conferir nomes e funções';
  end if;
  if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>500 then
    raise exception 'Envie até 500 profissionais por vez';
  end if;
  for item in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
    select * into p from public.profissionais
      where id=(item->>'id')::uuid for update;
    if not found then raise exception 'Profissional não encontrado'; end if;

    chosen_primary:=coalesce(item->>'funcao_sistema',p.funcao_sistema);
    if not chosen_primary=any(allowed) then raise exception 'Função principal inválida'; end if;
    if p.funcao_sistema is distinct from item->>'expected_funcao' then
      raise exception 'A função principal foi alterada por outro operador. Reabra a conferência';
    end if;
    if jsonb_build_array(p.nome_completo,p.nome_de_guerra,p.nome_exibicao)
       is distinct from item->'expected' then
      raise exception 'Cadastro alterado por outro operador. Reabra a conferência';
    end if;

    if item ? 'funcoes_habilitadas' then
      if jsonb_typeof(item->'funcoes_habilitadas')<>'array' then
        raise exception 'Funções habilitadas devem ser uma lista';
      end if;
      if to_jsonb(p.funcoes_habilitadas) is distinct from item->'expected_funcoes' then
        raise exception 'As funções foram alteradas em outra sessão. Reabra a conferência';
      end if;
      select array_agg(e.value order by e.ordinality) into chosen_roles
      from jsonb_array_elements_text(item->'funcoes_habilitadas')
        with ordinality as e(value,ordinality);
      chosen_roles:=coalesce(chosen_roles,'{}'::text[]);
      if cardinality(chosen_roles)<1 or cardinality(chosen_roles)>9 then
        raise exception 'Selecione de 1 a 9 funções';
      end if;
      if chosen_primary<>all(chosen_roles) then
        raise exception 'A função principal deve constar nas funções habilitadas';
      end if;
    else
      -- Conferência de NOME não modifica nenhuma função, nem inicializa
      -- automaticamente categorias. A escala define o posto em cada turno.
      chosen_roles:=coalesce(p.funcoes_habilitadas,'{}'::text[]);
    end if;
    if exists (select 1 from unnest(chosen_roles) as role where role<>all(allowed)) then
      raise exception 'Função não reconhecida';
    end if;
    if (select count(*) from unnest(chosen_roles) as role) <>
       (select count(distinct role) from unnest(chosen_roles) as role) then
      raise exception 'Funções duplicadas na seleção';
    end if;

    if length(trim(item->>'nome_completo'))<3
       or length(item->>'nome_completo')>200
       or length(coalesce(item->>'nome_de_guerra',''))>120
       or length(coalesce(item->>'nome_exibicao',''))>120 then
      raise exception 'Confira o tamanho dos nomes';
    end if;

    select * into c from public.profissionais_nomes_conferidos
      where profissional_id=p.id;
    h:=coalesce(c.historico,'[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'quando',now(),'por',auth.uid(),'nome_completo',p.nome_completo,
        'nome_de_guerra',p.nome_de_guerra,'nome_exibicao',p.nome_exibicao,
        'funcao_sistema',p.funcao_sistema,
        'funcoes_habilitadas',coalesce(p.funcoes_habilitadas,'{}'::text[])
      )
    );
    -- Preserva apelidos antigos e nomes de referência das escalas já
    -- VINCULADAS ao ID, inclusive "Leonardo" quando agora será "Sartin".
    select array_agg(distinct v) into aliases_old from (
      select unnest(coalesce(c.aliases,'{}'::text[])||
        array[p.nome_completo,p.nome_de_guerra,p.nome_exibicao]) as v
      union all
      select f.nome_referencia as v
        from public.escala_fixa_anapolis f where f.profissional_id=p.id
      union all
      select f.nome_referencia as v
        from public.escala_fixa_interna_anapolis f where f.profissional_id=p.id
    ) as refs where v is not null and trim(v)<>'';
    insert into public.profissionais_nomes_conferidos(
      profissional_id,nome_completo,nome_de_guerra,nome_exibicao,aliases,historico
    ) values (
      p.id,trim(item->>'nome_completo'),
      nullif(trim(item->>'nome_de_guerra'),''),
      nullif(trim(item->>'nome_exibicao'),''),
      coalesce(aliases_old,'{}'::text[]),h
    )
    on conflict(profissional_id) do update set
      nome_completo=excluded.nome_completo,
      nome_de_guerra=excluded.nome_de_guerra,
      nome_exibicao=excluded.nome_exibicao,
      aliases=excluded.aliases,historico=excluded.historico,
      atualizado_em=now(),atualizado_por=auth.uid();

    update public.profissionais
      set funcao_sistema=chosen_primary,
          funcoes_habilitadas=chosen_roles,
          atualizado_em=now()
      where id=p.id;
    -- Apenas as escalas FIXAS de referência podem ser atualizadas para o
    -- nome de guerra conferido. Nunca reescrever plantões já encerrados.
    update public.escala_fixa_anapolis
      set nome_referencia=coalesce(nullif(trim(item->>'nome_exibicao'),''),
                                  nullif(trim(item->>'nome_de_guerra'),''),p.nome_completo)
      where profissional_id=p.id and nome_referencia is distinct from
        coalesce(nullif(trim(item->>'nome_exibicao'),''),
                 nullif(trim(item->>'nome_de_guerra'),''),p.nome_completo);
    update public.escala_fixa_interna_anapolis
      set nome_referencia=coalesce(nullif(trim(item->>'nome_exibicao'),''),
                                  nullif(trim(item->>'nome_de_guerra'),''),p.nome_completo)
      where profissional_id=p.id and nome_referencia is distinct from
        coalesce(nullif(trim(item->>'nome_exibicao'),''),
                 nullif(trim(item->>'nome_de_guerra'),''),p.nome_completo);
    total:=total+1;
  end loop;
  return total;
end $$;

revoke all on function public.samu_conferir_nomes(jsonb) from public,anon;
grant execute on function public.samu_conferir_nomes(jsonb) to authenticated;

-- Bloqueio de regressão em NOVOS uploads de escala fixa já vinculados ao ID.
-- Guarda a grafia recebida como alias e substitui o nome de referência pela
-- grafia confirmada. Sem ID resolvido, deixa pendente de conferência.
create or replace function public.samu_proteger_referencia_escala()
returns trigger language plpgsql security invoker set search_path=public as $$
declare c public.profissionais_nomes_conferidos; old_reference text; chosen text;
begin
  if new.profissional_id is null then return new; end if;
  select * into c from public.profissionais_nomes_conferidos
    where profissional_id=new.profissional_id;
  if not found then return new; end if;
  old_reference:=nullif(trim(new.nome_referencia),'');
  chosen:=coalesce(nullif(trim(c.nome_exibicao),''),
                   nullif(trim(c.nome_de_guerra),''),c.nome_completo);
  if old_reference is not null and
     not (old_reference=any(coalesce(c.aliases,'{}'::text[]))) and
     old_reference is distinct from chosen then
     update public.profissionais_nomes_conferidos
       set aliases=array_append(coalesce(aliases,'{}'::text[]),old_reference)
       where profissional_id=new.profissional_id;
     -- O gatilho em profissionais utiliza estas referências como nomes
     -- alternativos, sem alterar o nome confirmado.
     update public.profissionais
       set nomes_anteriores=array_append(
         coalesce(nomes_anteriores,'{}'::text[]),old_reference)
       where id=new.profissional_id;
  end if;
  new.nome_referencia:=chosen;
  return new;
end $$;

drop trigger if exists proteger_nome_escala_fixa on public.escala_fixa_anapolis;
create trigger proteger_nome_escala_fixa
  before insert or update of nome_referencia,profissional_id
  on public.escala_fixa_anapolis
  for each row execute function public.samu_proteger_referencia_escala();

drop trigger if exists proteger_nome_escala_interna on public.escala_fixa_interna_anapolis;
create trigger proteger_nome_escala_interna
  before insert or update of nome_referencia,profissional_id
  on public.escala_fixa_interna_anapolis
  for each row execute function public.samu_proteger_referencia_escala();
