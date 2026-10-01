-- Executar somente depois de criar as duas contas de teste com Auto confirm user.
-- Prepara uma oficina isolada. O atendimento é testado por logins Auth reais, não por esta sessão SQL.
begin;
create temporary table resultado_preparo_validacao(oficina_id uuid, nome text) on commit drop;
do $$
declare a uuid;b uuid;w uuid;nome_teste text;
begin
 select id into a from auth.users where email='qa.automotivo.a.20260930@example.com' and email_confirmed_at is not null;
 select id into b from auth.users where email='qa.automotivo.b.20260930@example.com' and email_confirmed_at is not null;
 if a is null or b is null or a=b then raise exception 'Crie e confirme as duas contas exclusivas de teste antes de preparar a oficina.';end if;
 if exists(select 1 from public.membros_oficina m join public.oficinas o on o.id=m.oficina_id where m.usuario_id in(a,b) and o.nome not like '[VALIDAÇÃO]%') then raise exception 'As contas indicadas não são exclusivas de validação.';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 nome_teste:='[VALIDAÇÃO] Atendimento completo '||to_char(clock_timestamp(),'YYYY-MM-DD HH24:MI:SS');
 w:=public.criar_oficina(nome_teste,null);
 insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values(w,b,'manager',true);
 update public.assinaturas_oficina set codigo_plano='intermediate',situacao='trialing',valido_ate=now()+interval '7 days' where oficina_id=w;
 insert into resultado_preparo_validacao values(w,nome_teste);
end $$;
select oficina_id,nome,'Contas A proprietário / B gerente. Dados fictícios. Avaliação de 7 dias.' as finalidade from resultado_preparo_validacao;
commit;
