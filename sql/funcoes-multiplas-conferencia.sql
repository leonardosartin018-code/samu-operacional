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
      -- Compatibilidade com cliente offline antigo: nunca apagar funções existentes.
      chosen_roles:=array[chosen_primary] || coalesce(p.funcoes_habilitadas,'{}'::text[]);
      select coalesce(array_agg(distinct role),'{}'::text[]) into chosen_roles
        from unnest(chosen_roles) as role;
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
    select array_agg(distinct v) into aliases_old
      from unnest(coalesce(c.aliases,'{}'::text[])||
        array[p.nome_completo,p.nome_de_guerra]) as v
      where v is not null and trim(v)<>'';
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
    total:=total+1;
  end loop;
  return total;
end $$;

revoke all on function public.samu_conferir_nomes(jsonb) from public,anon;
grant execute on function public.samu_conferir_nomes(jsonb) to authenticated;
