begin;
alter table public.atendimentos_servicos add column compartilhado_cliente boolean not null default false;
alter table public.atendimentos_servicos add column resumo_cliente text not null default '' check(length(resumo_cliente)<=3000);
create function public.compartilhar_atendimento_cliente(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_compartilhar boolean,p_resumo text default '') returns text language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos;slug text;
begin
 perform private.gerencia_servicos(p_oficina);
 if not private.has_feature(p_oficina,'customer_portal') then raise exception 'Área do cliente indisponível no plano.' using errcode='42501';end if;
 if p_compartilhar is null or length(coalesce(p_resumo,''))>3000 then raise exception 'Confira o resumo compartilhado.' using errcode='22023';end if;
 select identificador_url into slug from public.sites_oficina where oficina_id=p_oficina and publicado and portal_habilitado;
 if p_compartilhar and slug is null then raise exception 'Publique o site e habilite a área do cliente antes de compartilhar.' using errcode='22023';end if;
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao<>p_revisao then raise exception 'Atendimento alterado. Atualize antes de compartilhar.' using errcode='40001';end if;
 update public.atendimentos_servicos set compartilhado_cliente=p_compartilhar,resumo_cliente=trim(coalesce(p_resumo,'')),revisao=revisao+1 where id=a.id;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,a.id,'compartilhamento',case when p_compartilhar then 'Disponível na área do cliente' else 'Compartilhamento removido' end,auth.uid());
 return '/oficina/'||slug||'#area-cliente';
end $$;
create function public.consultar_meus_atendimentos(p_oficina uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'numero',a.numero,'titulo',a.titulo,'situacao',a.situacao,'data_servico',a.data_servico,'concluido_em',a.concluido_em,'valor_centavos',a.valor_centavos,'resumo',a.resumo_cliente,'revisao',a.revisao,'objeto',o.nome,'itens',(select coalesce(jsonb_agg(jsonb_build_object('descricao',i.descricao,'quantidade',i.quantidade,'unidade',i.unidade,'preco_centavos',i.preco_centavos)),'[]') from public.itens_atendimento_servico i where i.atendimento_id=a.id),'desconto_centavos',coalesce((select desconto_centavos from public.comercial_atendimento where atendimento_id=a.id),0)) order by a.data_servico desc,a.numero desc),'[]') from public.atendimentos_servicos a join public.objetos_atendimento o on o.id=a.objeto_id where a.oficina_id=p_oficina and a.compartilhado_cliente and private.has_portal_access(a.oficina_id,a.cliente_id);
$$;
create function public.aprovar_meu_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos;
begin
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found or not a.compartilhado_cliente or not private.has_portal_access(p_oficina,a.cliente_id) then raise exception 'Orçamento indisponível.' using errcode='42501';end if;
 if a.situacao='aprovado' and exists(select 1 from public.eventos_atendimento where atendimento_id=a.id and tipo='aprovacao_cliente' and autor=auth.uid() and depois=p_revisao::text) then return;end if;
 if a.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Confira os valores atualizados antes de aprovar.' using errcode='40001';end if;
 if a.situacao<>'orcamento' then raise exception 'Este atendimento não aguarda aprovação.' using errcode='22023';end if;
 update public.atendimentos_servicos set situacao='aprovado',revisao=revisao+1 where id=a.id;
 insert into public.comercial_atendimento(oficina_id,atendimento_id,orcado_centavos) values(p_oficina,a.id,a.valor_centavos) on conflict(atendimento_id) do update set orcado_centavos=coalesce(comercial_atendimento.orcado_centavos,excluded.orcado_centavos);
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,a.id,'aprovacao_cliente',p_revisao::text,auth.uid());
end $$;
-- Reaproveita o portal existente e mantém os contratos automotivos.
alter function public.consultar_meu_portal(uuid) rename to consultar_meu_portal_base;
revoke all on function public.consultar_meu_portal_base(uuid) from public,anon,authenticated;
create function public.consultar_meu_portal(p_oficina uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.consultar_meu_portal_base(p_oficina)||case when exists(select 1 from public.oficinas where id=p_oficina and ramo<>'automotivo') then jsonb_build_object('atendimentos',public.consultar_meus_atendimentos(p_oficina)) else '{}'::jsonb end;
$$;
alter function public.consultar_site_publicado(text) rename to consultar_site_publicado_base;
revoke all on function public.consultar_site_publicado_base(text) from public,anon,authenticated;
create function public.consultar_site_publicado(p_identificador_url text) returns jsonb language sql stable security definer set search_path='' as $$
 select public.consultar_site_publicado_base(p_identificador_url)||jsonb_build_object('ramo',w.ramo) from public.sites_oficina s join public.oficinas w on w.id=s.oficina_id where s.identificador_url=p_identificador_url;
$$;
revoke all on function public.compartilhar_atendimento_cliente(uuid,uuid,integer,boolean,text),public.consultar_meus_atendimentos(uuid),public.aprovar_meu_atendimento(uuid,uuid,integer),public.consultar_meu_portal(uuid),public.consultar_site_publicado(text) from public,anon,authenticated;
grant execute on function public.compartilhar_atendimento_cliente(uuid,uuid,integer,boolean,text),public.consultar_meus_atendimentos(uuid),public.aprovar_meu_atendimento(uuid,uuid,integer),public.consultar_meu_portal(uuid) to authenticated;
grant execute on function public.consultar_site_publicado(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
