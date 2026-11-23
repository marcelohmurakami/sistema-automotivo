begin;
-- O site público recebe somente dados necessários à apresentação.
create or replace function public.consultar_site_publicado(p_identificador_url text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('oficina_id',s.oficina_id,'titulo',s.titulo,'descricao',s.descricao,'identificador_url',s.identificador_url,
 'identidade',jsonb_build_object('cor',w.identidade_documentos->>'cor','logo',w.identidade_documentos->>'logo'),'telefone',w.telefone_e164,
 'portal_habilitado',s.portal_habilitado and private.has_feature(s.oficina_id,'customer_portal'),
 'pedidos_habilitados',s.portal_habilitado and s.pedidos_pecas_habilitados and private.has_feature(s.oficina_id,'parts_requests'),
 'produtos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'titulo',p.titulo,'descricao',p.descricao,'preco_centavos',p.preco_exibido_centavos) order by p.titulo,p.id)
 from public.produtos_site p join public.itens_catalogo i on i.id=p.item_catalogo_id and i.oficina_id=p.oficina_id
 join public.estoque_produtos e on e.item_catalogo_id=i.id and e.oficina_id=i.oficina_id
 where p.oficina_id=s.oficina_id and p.visivel and i.tipo='part' and i.arquivado_em is null),'[]'))
 from public.sites_oficina s join public.oficinas w on w.id=s.oficina_id where s.identificador_url=p_identificador_url and s.publicado and private.has_feature(s.oficina_id,'website');
$$;

create or replace function public.configurar_site(p_oficina uuid,p_dados jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'website');
 if p_dados is null or jsonb_typeof(p_dados)<>'object' or coalesce(p_dados->>'identificador_url','')!~'^[a-z0-9][a-z0-9-]{2,60}[a-z0-9]$'
 or length(trim(coalesce(p_dados->>'titulo',''))) not between 2 and 120 or length(coalesce(p_dados->>'descricao',''))>3000
 or exists(select 1 from jsonb_each(p_dados) v where v.key in ('publicado','portal_habilitado','pedidos_pecas_habilitados') and jsonb_typeof(v.value)<>'boolean')
 then raise exception 'Confira o endereço, título, descrição e opções do site.' using errcode='22023';end if;
 if coalesce((p_dados->>'pedidos_pecas_habilitados')::boolean,false) and not coalesce((p_dados->>'portal_habilitado')::boolean,false)
 then raise exception 'Habilite a área do cliente antes de permitir pedidos de peças.' using errcode='22023';end if;
 insert into public.sites_oficina(oficina_id,identificador_url,titulo,descricao,publicado,portal_habilitado,pedidos_pecas_habilitados)
 values(p_oficina,p_dados->>'identificador_url',trim(p_dados->>'titulo'),p_dados->>'descricao',coalesce((p_dados->>'publicado')::boolean,false),coalesce((p_dados->>'portal_habilitado')::boolean,false),coalesce((p_dados->>'pedidos_pecas_habilitados')::boolean,false))
 on conflict(oficina_id) do update set identificador_url=excluded.identificador_url,titulo=excluded.titulo,descricao=excluded.descricao,publicado=excluded.publicado,portal_habilitado=excluded.portal_habilitado,pedidos_pecas_habilitados=excluded.pedidos_pecas_habilitados;
 exception when unique_violation then raise exception 'Este endereço já está em uso. Escolha outro endereço para o site.' using errcode='22023';
end $$;

create or replace function public.publicar_produto_site(p_oficina uuid,p_item uuid,p_visivel boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'website');
 if p_visivel is null then raise exception 'Informe se a peça será exibida.' using errcode='22023';end if;
 if not exists(select 1 from public.sites_oficina where oficina_id=p_oficina) then raise exception 'Salve a apresentação do site antes de publicar peças.' using errcode='22023';end if;
 -- Ocultar continua permitido mesmo se o item tiver sido arquivado.
 if not p_visivel then update public.produtos_site set visivel=false where oficina_id=p_oficina and item_catalogo_id=p_item;return;end if;
 insert into public.produtos_site(oficina_id,item_catalogo_id,titulo,descricao,visivel,preco_exibido_centavos)
 select p_oficina,i.id,i.descricao,i.descricao,true,i.preco_padrao_centavos from public.itens_catalogo i
 join public.estoque_produtos e on e.oficina_id=i.oficina_id and e.item_catalogo_id=i.id
 where i.oficina_id=p_oficina and i.id=p_item and i.tipo='part' and i.arquivado_em is null
 on conflict(oficina_id,item_catalogo_id) do update set visivel=excluded.visivel,titulo=excluded.titulo,descricao=excluded.descricao,preco_exibido_centavos=excluded.preco_exibido_centavos;
 if not found then raise exception 'Selecione uma peça ativa cadastrada no estoque.' using errcode='22023';end if;
end $$;

create or replace function public.solicitar_pecas(p_oficina uuid,p_cliente uuid,p_chave uuid,p_itens jsonb,p_observacoes text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); item jsonb; product public.produtos_site%rowtype; existing public.pedidos_pecas%rowtype; r uuid; fingerprint text; qty numeric; product_id uuid;
begin
 if not private.has_portal_access(p_oficina,p_cliente) or not private.has_feature(p_oficina,'parts_requests')
 or not exists(select 1 from public.sites_oficina where oficina_id=p_oficina and pedidos_pecas_habilitados)
 then raise exception 'Pedidos de peças indisponíveis' using errcode='42501';end if;
 if p_chave is null or p_itens is null or jsonb_typeof(p_itens)<>'array' then raise exception 'Selecione as peças do pedido.' using errcode='22023';end if;
 if jsonb_array_length(p_itens) not between 1 and 30 or length(coalesce(p_observacoes,''))>2000 then raise exception 'Use de 1 a 30 peças e até 2.000 caracteres nas observações.' using errcode='22023';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('customer_id',p_cliente,'items',p_itens,'notes',p_observacoes)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||u::text||p_chave::text,0));
 select * into existing from public.pedidos_pecas where oficina_id=p_oficina and solicitado_por=u and chave_idempotencia=p_chave;
 if found then
   if existing.hash_solicitacao<>fingerprint then raise exception 'A chave de repetição já foi usada com outros dados' using errcode='23514';end if;
   return existing.id;
 end if;
 insert into public.pedidos_pecas(oficina_id,cliente_id,solicitado_por,chave_idempotencia,observacoes_cliente,hash_solicitacao) values(p_oficina,p_cliente,u,p_chave,p_observacoes,fingerprint) returning id into r;
 for item in select value from jsonb_array_elements(p_itens) loop
   if jsonb_typeof(item)<>'object' or coalesce(item->>'product_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(jsonb_typeof(item->'quantity'),'null')<>'number' then raise exception 'Confira a peça e a quantidade do pedido.' using errcode='22023';end if;
   product_id:=(item->>'product_id')::uuid; qty:=(item->>'quantity')::numeric;
   if qty<=0 or qty>10000 or qty<>round(qty,3) then raise exception 'Informe uma quantidade maior que zero, até 10.000, com no máximo 3 casas decimais.' using errcode='22023';end if;
   select p.* into product from public.produtos_site p join public.itens_catalogo i on i.oficina_id=p.oficina_id and i.id=p.item_catalogo_id
   join public.estoque_produtos e on e.oficina_id=i.oficina_id and e.item_catalogo_id=i.id
   where p.oficina_id=p_oficina and p.id=product_id and p.visivel and i.arquivado_em is null and i.tipo='part';
   if not found then raise exception 'Esta peça não está mais disponível no site. Atualize a página e escolha outra.' using errcode='23514';end if;
   insert into public.itens_pedido_pecas(oficina_id,pedido_id,produto_site_id,descricao,quantidade) values(p_oficina,r,product.id,product.titulo,qty);
 end loop;
 insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados)
 values(p_oficina,'parts.requested','part_request',r,1,'part_request:'||r||':created',jsonb_build_object('request_id',r));
 return r;
end $$;

create or replace function public.consultar_minhas_ordens_servico(p_oficina uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'numero',w.numero,'situacao',w.situacao,'veiculo',jsonb_build_object('placa',w.dados_veiculo->>'placa','modelo',w.dados_veiculo->>'modelo'),'entrega_prevista_em',w.entrega_prevista_em,'resumo',w.resumo_cliente,'recebido_em',w.recebido_em,'entregue_em',w.entregue_em) order by w.criado_em desc),'[]') from public.ordens_servico w where w.oficina_id=p_oficina and w.arquivado_em is null and private.has_portal_access(w.oficina_id,w.cliente_id);
$$;

CREATE OR REPLACE FUNCTION public.consultar_meu_historico_os(p_oficina uuid, p_ordem_servico uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'description',e.descricao,'occurred_at',e.ocorrido_em)
    order by e.ocorrido_em),'[]'::jsonb)
  from public.historico_ordem_servico e join public.ordens_servico w on w.oficina_id=e.oficina_id and w.id=e.ordem_servico_id
  where w.oficina_id=p_oficina and w.id=p_ordem_servico and e.visivel_ao_cliente
    and w.arquivado_em is null and private.has_portal_access(w.oficina_id,w.cliente_id);
$function$;

create or replace function public.minhas_manutencoes(p_oficina uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'descricao',m.descricao,'data_prevista',m.data_prevista,'quilometragem_prevista',m.quilometragem_prevista,'concluida_em',m.concluida_em,'veiculo',w.dados_veiculo->>'modelo','placa',w.dados_veiculo->>'placa') order by m.data_prevista nulls last),'[]') from public.manutencoes_programadas m join public.ordens_servico w on w.oficina_id=m.oficina_id and w.id=m.ordem_servico_id where m.oficina_id=p_oficina and w.arquivado_em is null and private.has_portal_access(w.oficina_id,w.cliente_id);
$$;

-- Uma mudança no e-mail do cadastro exige nova conferência e liberação.
create function private.revogar_portal_email_alterado() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(trim(coalesce(new.email,''))) is distinct from lower(trim(coalesce(old.email,''))) then
   update public.acessos_portal_cliente set revogado_em=now() where oficina_id=new.oficina_id and cliente_id=new.id and revogado_em is null;
 end if;return new;
end $$;
revoke all on function private.revogar_portal_email_alterado() from public,anon,authenticated;
create trigger revogar_portal_email_alterado after update of email on public.clientes for each row execute function private.revogar_portal_email_alterado();
notify pgrst,'reload schema';
commit;
