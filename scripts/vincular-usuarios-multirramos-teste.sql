-- Usuários criados pelo painel oficial de Authentication. Somente empresas fictícias.
begin;
do $$
declare r record; u uuid; p text; e text;
begin
 for r in select * from (values
 ('e25d59bc-c20c-4aa1-bd57-c1b1d77aa0f2'::uuid,'assistencia','assistencia_tecnica','ZZ [TESTE MULTIRRAMOS] Assistência técnica'),
 ('5218bdd8-0191-4f42-9d01-5db4fb3fe3ea'::uuid,'manutencao','manutencao_campo','ZZ [TESTE MULTIRRAMOS] Manutenção de campo'),
 ('5fb21ca1-a81f-4898-a00b-eb30be57f964'::uuid,'limpeza','limpeza','ZZ [TESTE MULTIRRAMOS] Limpeza')
 ) x(id,slug,ramo,nome) loop
  if not exists(select 1 from public.oficinas where id=r.id and ramo=r.ramo and nome=r.nome) then raise exception 'Empresa de teste divergente'; end if;
  foreach p in array array['gerente','colaborador'] loop
   e:='teste.'||r.slug||'.'||p||'@example.com';
   select id into strict u from auth.users where email=e and email_confirmed_at is not null;
   if exists(select 1 from public.membros_oficina where usuario_id=u and oficina_id<>r.id) then raise exception 'Usuário já vinculado a outra empresa';end if;
   insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo)
   values(r.id,u,case p when 'gerente' then 'manager' else 'staff' end,true)
   on conflict(oficina_id,usuario_id) do nothing;
  end loop;
 end loop;
end $$;
commit;
select o.nome,u.email,m.perfil,m.ativo from public.membros_oficina m
join public.oficinas o on o.id=m.oficina_id join auth.users u on u.id=m.usuario_id
where u.email in ('teste.assistencia.gerente@example.com','teste.assistencia.colaborador@example.com','teste.manutencao.gerente@example.com','teste.manutencao.colaborador@example.com','teste.limpeza.gerente@example.com','teste.limpeza.colaborador@example.com') order by o.ramo,m.perfil;
