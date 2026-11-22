-- Preparação local para revisão. Aplicar em ambiente de homologação antes da produção.
-- Executar como uma única transação pelo responsável pelo banco.
begin;

create table if not exists public.samu_acoes_offline (
  user_id uuid not null references auth.users(id),
  operation_id uuid not null,
  payload_hash text not null,
  label text not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
alter table public.samu_acoes_offline enable row level security;
revoke all on public.samu_acoes_offline from anon, authenticated;
grant select, insert on public.samu_acoes_offline to authenticated;

drop policy if exists samu_offline_owner on public.samu_acoes_offline;
create policy samu_offline_owner on public.samu_acoes_offline
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists samu_offline_operator on public.samu_acoes_offline;
create policy samu_offline_operator on public.samu_acoes_offline
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.usuarios_perfis u
      where u.user_id = (select auth.uid()) and u.ativo
        and u.papel::text in ('ADMIN','RADIO_OPERADOR')
    )
  );

create or replace function public.samu_offline_capacidades()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select case when exists (
    select 1 from public.usuarios_perfis u where u.user_id=auth.uid() and u.ativo
  ) then jsonb_build_object('version',1) else null end;
$$;
revoke all on function public.samu_offline_capacidades() from public, anon;
grant execute on function public.samu_offline_capacidades() to authenticated;

-- Constrói apenas filtros tipados permitidos. Nomes são validados e escapados.
create or replace function public.samu_offline_predicate(p_table text, p_filters jsonb)
returns text language plpgsql security invoker set search_path = ''
as $$
declare
  f jsonb;
  v_column_name text;
  v_operator_name text;
  typed_value text;
  clauses text[] := array[]::text[];
begin
  if p_table not in (
    'bases','usuarios_perfis','escala_fixa_anapolis','escala_fixa_interna_anapolis',
    'revezamento_plantao','plantoes','profissionais','viaturas','equipe_plantao',
    'ocorrencias','equipe_ocorrencia','prioridade_manual_revezamento',
    'livro_plantao','escala_interna_plantao'
  ) then raise exception 'Tabela offline inválida.'; end if;
  for f in select value from jsonb_array_elements(p_filters)
  loop
    v_column_name := f->>'column';
    v_operator_name := f->>'operator';
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name=p_table and c.column_name=v_column_name
    ) then raise exception 'Filtro offline inválido.'; end if;
    if v_operator_name in ('eq','is') then
      typed_value := format(
        '(jsonb_populate_record(null::public.%I, %L::jsonb)).%I',
        p_table, jsonb_build_object(v_column_name,f->'value')::text, v_column_name
      );
      clauses := array_append(clauses,format('t.%I is not distinct from %s',v_column_name,typed_value));
    elsif v_operator_name='in' and jsonb_typeof(f->'value')='array' then
      clauses := array_append(clauses,format(
        't.%I in (select (jsonb_populate_record(null::public.%I,jsonb_build_object(%L,x))).%I from jsonb_array_elements(%L::jsonb) x)',
        v_column_name,p_table,v_column_name,v_column_name,(f->'value')::text
      ));
    else raise exception 'Operador offline inválido.'; end if;
  end loop;
  return case when cardinality(clauses)=0 then 'true' else array_to_string(clauses,' and ') end;
end;
$$;
revoke all on function public.samu_offline_predicate(text,jsonb) from public, anon;
grant execute on function public.samu_offline_predicate(text,jsonb) to authenticated;

create or replace function public.samu_aplicar_acao_offline(p_action jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_operation_id uuid := (p_action->>'id')::uuid;
  actor uuid := auth.uid();
  fingerprint text := md5((p_action - 'error' - 'errorCode')::text);
  receipt public.samu_acoes_offline%rowtype;
  change jsonb;
  guard jsonb;
  expected jsonb;
  actual jsonb;
  normalized_expected jsonb;
  actual_rows jsonb;
  expected_ids text[];
  actual_ids text[];
  v_table_name text;
  field_name text;
  field_value jsonb;
  row_id uuid;
  column_list text;
  value_list text;
  assignment_list text;
  affected integer;
  v_shift_id uuid;
  v_vehicle_id uuid;
  v_professional_id uuid;
  relevant_occurrence public.ocorrencias%rowtype;
  eligible boolean;
begin
  if actor is null or not exists (
    select 1 from public.usuarios_perfis u where u.user_id=actor and u.ativo
      and u.papel::text in ('ADMIN','RADIO_OPERADOR')
  ) then raise exception using errcode='42501',message='Perfil sem autorização para sincronizar.'; end if;
  if jsonb_typeof(p_action->'changes') is distinct from 'array'
    or jsonb_array_length(p_action->'changes')>500
    or jsonb_typeof(p_action->'guards') is distinct from 'array'
    or jsonb_array_length(p_action->'guards')>100
    or octet_length(p_action::text)>2000000 then
    raise exception 'Ação offline inválida ou grande demais.';
  end if;

  -- O recibo e todas as alterações usam a mesma transação.
  -- Uma resposta perdida pode ser reenviada com o mesmo UUID.
  perform pg_advisory_xact_lock(732601,1);
  select * into receipt from public.samu_acoes_offline
    where user_id=actor and samu_acoes_offline.operation_id=v_operation_id;
  if found then
    if receipt.payload_hash<>fingerprint then
      raise exception using errcode='40001',message='Identificador de sincronização reutilizado com outro conteúdo.';
    end if;
    return jsonb_build_object('id',v_operation_id,'appliedAt',receipt.applied_at,'repeated',true);
  end if;

  -- Conferir as consultas usadas para validar disponibilidade no acionamento.
  for guard in select value from jsonb_array_elements(p_action->'guards')
  loop
    v_table_name := guard->>'table';
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where %s',
      v_table_name,public.samu_offline_predicate(v_table_name,guard->'filters')
    ) into actual_rows;
    select coalesce(array_agg(x->>'id' order by x->>'id'),array[]::text[])
      into expected_ids from jsonb_array_elements(guard->'rows') x;
    select coalesce(array_agg(coalesce(x->>'id',x->>'user_id') order by coalesce(x->>'id',x->>'user_id')),array[]::text[])
      into actual_ids from jsonb_array_elements(actual_rows) x;
    if expected_ids is distinct from actual_ids then
      raise exception using errcode='40001',message='A disponibilidade mudou em '||v_table_name||'. Confira o conflito.';
    end if;
    for expected in select value from jsonb_array_elements(guard->'rows')
    loop
      select value into actual from jsonb_array_elements(actual_rows)
        where coalesce(value->>'id',value->>'user_id')=expected->>'id';
      -- Perfis usam user_id como chave primária.
      if v_table_name='usuarios_perfis' then expected := expected-'id'; end if;
      execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',v_table_name)
        into normalized_expected using expected;
      for field_name,field_value in select key,value from jsonb_each(expected)
      loop
        if actual->field_name is distinct from normalized_expected->field_name then
          raise exception using errcode='40001',message='Um dado consultado mudou em '||v_table_name||'. Confira o conflito.';
        end if;
      end loop;
    end loop;
  end loop;

  for change in select value from jsonb_array_elements(p_action->'changes')
  loop
    v_table_name := change->>'table';
    if v_table_name not in (
      'plantoes','profissionais','viaturas','equipe_plantao','ocorrencias',
      'equipe_ocorrencia','prioridade_manual_revezamento','livro_plantao','escala_interna_plantao'
    ) then raise exception 'Gravação offline não permitida nesta tabela.'; end if;
    row_id := (change->>'id')::uuid;
    if change->'after'<>'null'::jsonb and (change->'after'->>'id') is distinct from row_id::text then
      raise exception 'Identificador do registro não confere.';
    end if;
    if change->'after'='null'::jsonb then
      -- SELECT FOR UPDATE exige política de UPDATE mesmo quando o objetivo é
      -- excluir. Algumas tabelas operacionais permitem INSERT/DELETE apenas.
      execute format('select to_jsonb(t) from public.%I t where id=$1',v_table_name)
        into actual using row_id;
    else
      execute format('select to_jsonb(t) from public.%I t where id=$1 for update',v_table_name)
        into actual using row_id;
    end if;
    expected := change->'before';
    if expected='null'::jsonb then
      if actual is not null then raise exception using errcode='40001',message='O registro já existe em '||v_table_name||'.'; end if;
    else
      if actual is null then raise exception using errcode='40001',message='O registro foi removido de '||v_table_name||'.'; end if;
      execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',v_table_name)
        into normalized_expected using expected;
      for field_name,field_value in select key,value from jsonb_each(expected)
      loop
        if field_name in ('criado_em','atualizado_em','alterado_em') then continue; end if;
        if actual->field_name is distinct from normalized_expected->field_name then
          raise exception using errcode='40001',message='Alteração concorrente em '||v_table_name||' ('||row_id::text||'). Confira antes de continuar.';
        end if;
      end loop;
    end if;

    -- Um turno encerrado em outro computador exige conferência.
    v_shift_id := coalesce(
      nullif(change->'after'->>'plantao_id','')::uuid,
      nullif(change->'before'->>'plantao_id','')::uuid
    );
    if v_table_name='equipe_ocorrencia' then
      select plantao_id into v_shift_id from public.ocorrencias
        where id=coalesce(
          nullif(change->'after'->>'ocorrencia_id','')::uuid,
          nullif(change->'before'->>'ocorrencia_id','')::uuid
        );
    end if;
    if v_shift_id is not null then
      select status='ABERTO' into eligible from public.plantoes where id=v_shift_id for update;
      if eligible is distinct from true then
        raise exception using errcode='40001',message='O plantão foi encerrado ou não está disponível.';
      end if;
    end if;

    if change->'after'='null'::jsonb then
      execute format('delete from public.%I t where id=$1 and to_jsonb(t)=$2',v_table_name) using row_id,actual;
    else
      for field_name in select jsonb_object_keys(change->'after')
      loop
        if not exists (select 1 from information_schema.columns c
          where c.table_schema='public' and c.table_name=v_table_name and c.column_name=field_name) then
          raise exception 'Coluna offline inválida.';
        end if;
      end loop;
      if expected='null'::jsonb then
        select string_agg(format('%I',key),',' order by key),
               string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',v_table_name,key),',' order by key)
          into column_list,value_list from jsonb_object_keys(change->'after') key;
        execute format('insert into public.%I (%s) select %s',v_table_name,column_list,value_list)
          using change->'after';
      else
        select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,v_table_name,key),',' order by key)
          into assignment_list from jsonb_object_keys(change->'after') key
          where key<>'id' and (change->'after'->key is distinct from expected->key);
        if assignment_list is null then continue; end if;
        execute format('update public.%I set %s where id=$2',v_table_name,assignment_list)
          using change->'after',row_id;
      end if;
    end if;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception using errcode='42501',message='A política do banco impediu a gravação em '||v_table_name||'.'; end if;
  end loop;

  -- Revalidar recursos compartilhados após o pacote inteiro, antes do commit.
  for change in select value from jsonb_array_elements(p_action->'changes')
  loop
    if change->'after'='null'::jsonb then continue; end if;
    if change->>'table'='ocorrencias' then
      select * into relevant_occurrence from public.ocorrencias where id=(change->>'id')::uuid;
      if relevant_occurrence.status in ('EM OCORRENCIA','RETORNANDO') and relevant_occurrence.viatura_id is not null
        and exists (
          select 1 from public.ocorrencias o where o.id<>relevant_occurrence.id
            and o.viatura_id=relevant_occurrence.viatura_id and o.status in ('EM OCORRENCIA','RETORNANDO')
            and (o.plantao_id=relevant_occurrence.plantao_id or o.acionada_em>now()-interval '48 hours')
        ) then
        raise exception using errcode='40001',message='A viatura já foi empenhada por outro operador.';
      end if;
    elsif change->>'table'='plantoes' and change->'before'='null'::jsonb then
      if exists (
        select 1 from public.plantoes p
        where p.data_plantao=(change->'after'->>'data_plantao')::date
          and p.turno=change->'after'->>'turno' and p.id<>(change->>'id')::uuid
      ) then raise exception using errcode='40001',message='Este turno já foi aberto em outro computador.'; end if;
    elsif change->>'table'='equipe_ocorrencia' then
      select * into relevant_occurrence from public.ocorrencias
        where id=(change->'after'->>'ocorrencia_id')::uuid;
      v_professional_id := (change->'after'->>'profissional_id')::uuid;
      if not exists (select 1 from public.profissionais p where p.id=v_professional_id and p.ativo) then
        raise exception using errcode='40001',message='O cadastro de um integrante não está ativo.';
      end if;
      if relevant_occurrence.status in ('EM OCORRENCIA','RETORNANDO')
        and (change->'after'->>'tipo_escala_no_momento') is distinct from 'AVULSO_ACIONAMENTO'
        and not exists (
          select 1 from public.equipe_plantao e
          join public.viaturas target on target.id=relevant_occurrence.viatura_id
          left join public.viaturas origin on origin.id=e.viatura_id
          join public.bases b on b.id=target.base_id
          where e.profissional_id=v_professional_id and e.plantao_id=relevant_occurrence.plantao_id
            and e.status='ATIVO' and (
              origin.base_id=target.base_id or (
                e.viatura_id is null and
                translate(upper(b.nome),'ÁÀÂÃÄÉÊÍÓÔÕÚÜÇ','AAAAAEEIOOOUUC')='ANAPOLIS'
              )
            )
        ) then raise exception using errcode='40001',message='Um integrante saiu da escala ou pertence a outra base.'; end if;
      if relevant_occurrence.status in ('EM OCORRENCIA','RETORNANDO') and exists (
        select 1 from public.equipe_ocorrencia e join public.ocorrencias o on o.id=e.ocorrencia_id
        where e.profissional_id=v_professional_id and o.id<>relevant_occurrence.id
          and o.status in ('EM OCORRENCIA','RETORNANDO')
          and (o.plantao_id=relevant_occurrence.plantao_id or o.acionada_em>now()-interval '48 hours')
      ) then raise exception using errcode='40001',message='Um integrante já está empenhado em outra ocorrência.'; end if;
    elsif change->>'table'='equipe_plantao' then
      if change->'after'->>'status'='ATIVO' and not exists (
        select 1 from public.profissionais p where p.id=(change->'after'->>'profissional_id')::uuid and p.ativo
      ) then raise exception using errcode='40001',message='O cadastro do profissional escalado não está ativo.'; end if;
      if change->'after'->>'status'='ATIVO' and exists (
        select 1 from public.equipe_plantao e
        where e.plantao_id=(change->'after'->>'plantao_id')::uuid
          and e.profissional_id=(change->'after'->>'profissional_id')::uuid and e.status='ATIVO'
          and e.id<>(change->>'id')::uuid
      ) then raise exception using errcode='40001',message='O profissional já possui outra escala ativa neste plantão.'; end if;
    end if;
  end loop;

  insert into public.samu_acoes_offline(user_id,operation_id,payload_hash,label)
    values(actor,v_operation_id,fingerprint,left(coalesce(p_action->>'label','Ação offline'),120))
    returning * into receipt;
  return jsonb_build_object('id',v_operation_id,'appliedAt',receipt.applied_at,'repeated',false);
end;
$$;
revoke all on function public.samu_aplicar_acao_offline(jsonb) from public, anon;
grant execute on function public.samu_aplicar_acao_offline(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
