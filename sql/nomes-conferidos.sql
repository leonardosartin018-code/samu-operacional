alter table public.profissionais add column if not exists nome_exibicao text;
alter table public.profissionais add column if not exists nomes_anteriores text[];
create table public.profissionais_nomes_conferidos (
 profissional_id uuid primary key references public.profissionais(id),
 nome_completo text not null, nome_de_guerra text, nome_exibicao text,
 aliases text[] not null default '{}', historico jsonb not null default '[]',
 atualizado_em timestamptz not null default now(), atualizado_por uuid default auth.uid()
);
alter table public.profissionais_nomes_conferidos enable row level security;
create policy nomes_leitura on public.profissionais_nomes_conferidos for select to authenticated using(true);
create policy nomes_insercao on public.profissionais_nomes_conferidos for insert to authenticated with check(private.can_operate());
create policy nomes_edicao on public.profissionais_nomes_conferidos for update to authenticated using(private.can_operate()) with check(private.can_operate());
grant select,insert,update on public.profissionais_nomes_conferidos to authenticated;
create or replace function public.samu_preservar_nome_conferido() returns trigger language plpgsql security invoker set search_path=public as $$
declare c public.profissionais_nomes_conferidos;
begin
 select * into c from public.profissionais_nomes_conferidos where profissional_id=new.id;
 if found then new.nome_completo=c.nome_completo;new.nome_de_guerra=c.nome_de_guerra;new.nome_exibicao=c.nome_exibicao;new.nomes_anteriores=c.aliases;end if;
 return new;
end $$;
create trigger preservar_nome_conferido before update on public.profissionais for each row execute function public.samu_preservar_nome_conferido();
create or replace function public.samu_conferir_nomes(p_changes jsonb) returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb;p public.profissionais;c public.profissionais_nomes_conferidos; total integer:=0;h jsonb;a text[];
begin
 if auth.uid() is null or not private.can_operate() then raise exception 'Sem permissão para conferir nomes';end if;
 if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>500 then raise exception 'Envie até 500 nomes por vez';end if;
 for item in select value from jsonb_array_elements(p_changes) order by value->>'id' loop
 select * into p from public.profissionais where id=(item->>'id')::uuid for update;
 if not found then raise exception 'Profissional não encontrado';end if;
 if jsonb_build_array(p.nome_completo,p.nome_de_guerra,p.nome_exibicao) is distinct from item->'expected' then raise exception 'Cadastro alterado por outro operador. Reabra a conferência.';end if;
 if length(trim(item->>'nome_completo'))<3 or length(item->>'nome_completo')>200 or length(item->>'nome_de_guerra')>120 or length(item->>'nome_exibicao')>120 then raise exception 'Confira o tamanho dos nomes';end if;
 select * into c from public.profissionais_nomes_conferidos where profissional_id=p.id;
 h=coalesce(c.historico,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('quando',now(),'por',auth.uid(),'nome_completo',p.nome_completo,'nome_de_guerra',p.nome_de_guerra,'nome_exibicao',p.nome_exibicao));
 select array_agg(distinct v) into a from unnest(coalesce(c.aliases,'{}'::text[])||array[p.nome_completo,p.nome_de_guerra]) v where v is not null and trim(v)<>'';
 insert into public.profissionais_nomes_conferidos(profissional_id,nome_completo,nome_de_guerra,nome_exibicao,aliases,historico)
 values(p.id,trim(item->>'nome_completo'),nullif(trim(item->>'nome_de_guerra'),''),nullif(trim(item->>'nome_exibicao'),''),coalesce(a,'{}'),h)
 on conflict(profissional_id) do update set nome_completo=excluded.nome_completo,nome_de_guerra=excluded.nome_de_guerra,nome_exibicao=excluded.nome_exibicao,aliases=excluded.aliases,historico=excluded.historico,atualizado_em=now(),atualizado_por=auth.uid();
 update public.profissionais set atualizado_em=now() where id=p.id;
 total=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.samu_conferir_nomes(jsonb) from public,anon;
grant execute on function public.samu_conferir_nomes(jsonb) to authenticated;
