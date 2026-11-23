begin;
alter table public.membros_oficina add column empresa_padrao boolean not null default false;
create unique index membros_uma_empresa_padrao on public.membros_oficina(usuario_id) where empresa_padrao;
-- Define a empresa operacional solicitada, sem remover o acesso à empresa anterior.
update public.membros_oficina m set empresa_padrao=true
where m.oficina_id='e898f8dc-5e29-50d5-a746-7929f8cef4ab'
  and m.usuario_id='ef17b401-a899-4a48-9452-99b34f53bf6b';
create or replace function public.consultar_meu_acesso()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'ramo',o.ramo,'especialidade',o.especialidade,'perfil',m.perfil,'padrao',m.empresa_padrao,
 'codigo_plano',s.codigo_plano,'nome_plano',p.nome,'situacao',s.situacao,'valido_ate',s.valido_ate,
 'recursos',(select coalesce(jsonb_agg(r.codigo order by r.codigo),'[]'::jsonb) from public.recursos r where private.has_feature(o.id,r.codigo))) order by m.empresa_padrao desc,o.nome,o.id),'[]'::jsonb)
 from public.membros_oficina m join public.oficinas o on o.id=m.oficina_id
 left join public.assinaturas_oficina s on s.oficina_id=o.id left join public.planos p on p.codigo=s.codigo_plano
 where m.usuario_id=auth.uid() and m.ativo and o.arquivado_em is null;
$$;

commit;
