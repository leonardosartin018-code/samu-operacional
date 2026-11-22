alter table public.profissionais add column if not exists nomes_anteriores text[];
create or replace function public.samu_preservar_nome_conferido() returns trigger language plpgsql security invoker set search_path=public as $$
declare c public.profissionais_nomes_conferidos;
begin
 select * into c from public.profissionais_nomes_conferidos where profissional_id=new.id;
 if found then new.nome_completo=c.nome_completo;new.nome_de_guerra=c.nome_de_guerra;new.nome_exibicao=c.nome_exibicao;new.nomes_anteriores=c.aliases;end if;
 return new;
end $$;
