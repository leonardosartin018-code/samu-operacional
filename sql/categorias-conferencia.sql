create or replace function public.samu_conferir_nomes(p_changes jsonb) returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb;p public.profissionais;c public.profissionais_nomes_conferidos; total integer:=0;h jsonb;a text[];
begin
 if auth.uid() is null or not private.can_operate() then raise exception 'Sem permissão para conferir nomes';end if;
 if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>500 then raise exception 'Envie até 500 nomes por vez';end if;
 for item in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
 select * into p from public.profissionais where id=(item->>'id')::uuid for update;
 if not found then raise exception 'Profissional não encontrado';end if;
 if item ? 'funcao_sistema' then
 if item->>'funcao_sistema' not in ('Condutor','Sanitária','TARM','Rádio-operador','Lavador','Motolância','Técnico de Enfermagem','Enfermeiro','Médico') then raise exception 'Categoria inválida';end if;
 if p.funcao_sistema is distinct from item->>'expected_funcao' then raise exception 'Categoria alterada por outro operador. Reabra a conferência.';end if;end if;
 if jsonb_build_array(p.nome_completo,p.nome_de_guerra,p.nome_exibicao) is distinct from item->'expected' then raise exception 'Cadastro alterado por outro operador. Reabra a conferência.';end if;
 if length(trim(item->>'nome_completo'))<3 or length(item->>'nome_completo')>200 or length(item->>'nome_de_guerra')>120 or length(item->>'nome_exibicao')>120 then raise exception 'Confira o tamanho dos nomes';end if;
 select * into c from public.profissionais_nomes_conferidos where profissional_id=p.id;
 h=coalesce(c.historico,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('quando',now(),'por',auth.uid(),'nome_completo',p.nome_completo,'nome_de_guerra',p.nome_de_guerra,'nome_exibicao',p.nome_exibicao,'funcao_sistema',p.funcao_sistema));
 select array_agg(distinct v) into a from unnest(coalesce(c.aliases,'{}'::text[])||array[p.nome_completo,p.nome_de_guerra]) v where v is not null and trim(v)<>'';
 insert into public.profissionais_nomes_conferidos(profissional_id,nome_completo,nome_de_guerra,nome_exibicao,aliases,historico)
 values(p.id,trim(item->>'nome_completo'),nullif(trim(item->>'nome_de_guerra'),''),nullif(trim(item->>'nome_exibicao'),''),coalesce(a,'{}'),h)
 on conflict(profissional_id) do update set nome_completo=excluded.nome_completo,nome_de_guerra=excluded.nome_de_guerra,nome_exibicao=excluded.nome_exibicao,aliases=excluded.aliases,historico=excluded.historico,atualizado_em=now(),atualizado_por=auth.uid();
 update public.profissionais set funcao_sistema=coalesce(item->>'funcao_sistema',p.funcao_sistema),atualizado_em=now() where id=p.id;
 total=total+1;
 end loop;
 return total;
end $$;
