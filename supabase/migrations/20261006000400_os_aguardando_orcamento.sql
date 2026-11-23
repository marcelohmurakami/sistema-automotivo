begin;

-- Uma OS de entrada pode existir antes da autorização, sem itens executáveis.
alter table public.ordens_servico add column orcamento_aguardando_id uuid;
alter table public.ordens_servico add constraint os_orcamento_aguardando_fk
  foreign key(oficina_id,orcamento_aguardando_id) references public.orcamentos(oficina_id,id);
create unique index os_orcamento_aguardando_unico on public.ordens_servico(oficina_id,orcamento_aguardando_id);
alter table public.ordens_servico add constraint os_orcamento_aguardando_estado check
  (orcamento_aguardando_id is null or (orcamento_origem_id is null and situacao in ('open','cancelled')));
comment on column public.ordens_servico.orcamento_aguardando_id is 'Orçamento vinculado à entrada da OS, ainda sem autorização de execução. Após aprovar, transfere o vínculo para orcamento_origem_id.';

create function private.proteger_os_aguardando_orcamento() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.orcamento_aguardando_id is not null then
    if new.orcamento_aguardando_id is null then
      if new.orcamento_origem_id is distinct from old.orcamento_aguardando_id or not exists(
        select 1 from public.orcamentos q join public.aprovacoes_orcamento a
          on a.oficina_id=q.oficina_id and a.versao_orcamento_id=q.versao_atual_id and a.decisao='approved'
        where q.oficina_id=new.oficina_id and q.id=old.orcamento_aguardando_id and q.situacao='approved'
          and q.versao_atual_id=new.versao_orcamento_origem_id
      ) then raise exception 'Aguarde a aprovação do orçamento para liberar a OS.' using errcode='23514'; end if;
    elsif new.orcamento_aguardando_id<>old.orcamento_aguardando_id or new.situacao not in ('open','cancelled') then
      raise exception 'Aguarde a aprovação do orçamento para iniciar o serviço.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger os_proteger_orcamento_pendente before update on public.ordens_servico
for each row execute function private.proteger_os_aguardando_orcamento();

create function private.proteger_itens_os_aguardando() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.ordens_servico where oficina_id=new.oficina_id and id=new.ordem_servico_id and orcamento_aguardando_id is not null) then
    raise exception 'Edite os itens no orçamento. A OS receberá os serviços autorizados após a aprovação.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger itens_os_proteger_orcamento_pendente before insert or update on public.itens_ordem_servico
for each row execute function private.proteger_itens_os_aguardando();

create function private.proteger_parada_orcamento_pendente() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.motivo='approval' and old.encerrado_em is null and (tg_op='DELETE' or new.encerrado_em is not null) and exists(
    select 1 from public.ordens_servico where oficina_id=old.oficina_id and id=old.ordem_servico_id
      and orcamento_aguardando_id is not null and situacao<>'cancelled'
  ) then raise exception 'A parada será resolvida quando o cliente aprovar o orçamento.' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger parada_proteger_orcamento_pendente before update or delete on public.paradas_ordem_servico
for each row execute function private.proteger_parada_orcamento_pendente();

-- Usada pelo aceite público e pelo reprocessamento autenticado. Não é uma RPC.
create function private.aplicar_orcamento_os_pendente(p_oficina uuid,p_orcamento uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.orcamentos; v public.versoes_orcamento; o public.ordens_servico; sub bigint; desconto bigint;
begin
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found or q.situacao<>'approved' then return null; end if;
  select * into o from public.ordens_servico where oficina_id=p_oficina and orcamento_aguardando_id=q.id for update;
  if not found then return null; end if;
  if o.situacao='cancelled' or not private.has_feature(p_oficina,'work_orders') then return o.id; end if;
  select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id for update;
  if v.publicado_em is null or not exists(select 1 from public.aprovacoes_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and decisao='approved') then
    raise exception 'A versão atual ainda não foi aprovada.' using errcode='23514';
  end if;
  sub:=private.valor_autorizado(v.id); desconto:=private.valor_autorizado(v.id,true);
  if sub is null or sub is distinct from (
    select sum(total_item_centavos) from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and private.grupo_autorizado(v.id,grupo_servico)
  ) or exists(select 1 from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=o.id) then
    raise exception 'Confira os itens autorizados antes de liberar a OS.' using errcode='23514';
  end if;
  update public.ordens_servico set orcamento_aguardando_id=null,orcamento_origem_id=q.id,versao_orcamento_origem_id=v.id,
    cliente_id=q.cliente_id,veiculo_id=q.veiculo_id,dados_cliente=v.dados_cliente,dados_veiculo=v.dados_veiculo,
    subtotal_centavos=sub,desconto_centavos=desconto
  where oficina_id=p_oficina and id=o.id;
  insert into public.itens_ordem_servico(oficina_id,ordem_servico_id,item_catalogo_id,item_orcamento_origem_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos)
  select oficina_id,o.id,item_catalogo_id,id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos
  from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and private.grupo_autorizado(v.id,grupo_servico);
  update public.paradas_ordem_servico set encerrado_em=now(),resolvido_por=auth.uid()
    where oficina_id=p_oficina and ordem_servico_id=o.id and motivo='approval' and encerrado_em is null;
  perform private.evento_os(p_oficina,o.id,'Orçamento aprovado. Itens autorizados incorporados à OS.',jsonb_build_object('orcamento_id',q.id,'versao_id',v.id,'total_autorizado_centavos',sub-desconto));
  return o.id;
end $$;

create function private.aprovar_os_vinculada() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.situacao='approved' and old.situacao is distinct from new.situacao then
    perform private.aplicar_orcamento_os_pendente(new.oficina_id,new.id);
  end if;
  return new;
end $$;
create trigger orcamento_liberar_os after update of situacao on public.orcamentos
for each row execute function private.aprovar_os_vinculada();

-- A conversão tradicional continua igual quando não há OS de entrada.
alter function public.converter_orcamento_em_os(uuid,uuid) set schema private;
alter function private.converter_orcamento_em_os(uuid,uuid) rename to converter_orcamento_aprovado_base;
revoke all on function private.converter_orcamento_aprovado_base(uuid,uuid) from public,anon,authenticated,service_role;
create function public.converter_orcamento_em_os(p_oficina uuid,p_orcamento uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare id_os uuid;
begin
  perform private.exigir_os(p_oficina);
  id_os:=private.aplicar_orcamento_os_pendente(p_oficina,p_orcamento);
  if id_os is not null then return id_os; end if;
  if exists(select 1 from public.ordens_servico where oficina_id=p_oficina and orcamento_aguardando_id=p_orcamento) then
    raise exception 'A OS está aguardando a aprovação do orçamento.' using errcode='23514';
  end if;
  return private.converter_orcamento_aprovado_base(p_oficina,p_orcamento);
end $$;

create function public.criar_os_aguardando_orcamento(p_oficina uuid,p_orcamento uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos; o uuid; resultado jsonb;
begin
  u:=private.exigir_orcamentos(p_oficina); perform private.exigir_os(p_oficina);
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if exists(select 1 from public.complementos_ordem_servico where oficina_id=p_oficina and orcamento_id=q.id) then
    raise exception 'Este orçamento já é um adicional de outra OS.' using errcode='23514';
  end if;
  if q.situacao='approved' then return public.converter_orcamento_em_os(p_oficina,q.id); end if;
  select id into o from public.ordens_servico where oficina_id=p_oficina and (orcamento_origem_id=q.id or orcamento_aguardando_id=q.id);
  if found then return o; end if;
  if q.situacao not in ('draft','awaiting_approval') then
    raise exception 'Use um orçamento em rascunho ou aguardando aprovação.' using errcode='23514';
  end if;
  if exists(select 1 from public.ordens_servico where oficina_id=p_oficina and veiculo_id=q.veiculo_id and situacao not in ('delivered','cancelled')) then
    raise exception 'Este veículo já possui uma OS aberta. Confira o atendimento existente.' using errcode='23514';
  end if;
  resultado:=public.salvar_ordem_servico(p_oficina,jsonb_build_object('cliente_id',q.cliente_id,'veiculo_id',q.veiculo_id),gen_random_uuid());
  o:=(resultado->>'id')::uuid;
  update public.ordens_servico set orcamento_aguardando_id=q.id where oficina_id=p_oficina and id=o;
  insert into public.paradas_ordem_servico(oficina_id,ordem_servico_id,motivo,detalhes,criado_por)
    values(p_oficina,o,'approval','Aguardando aprovação do orçamento #'||q.numero,u);
  perform private.evento_os(p_oficina,o,'OS aberta aguardando aprovação do orçamento #'||q.numero||'.',jsonb_build_object('orcamento_id',q.id));
  return o;
end $$;

-- O orçamento também encontra a OS que ainda está aguardando aprovação.
do $$declare s text; novo text; begin
  s:=pg_get_functiondef('private.dados_orcamento(uuid,uuid,uuid)'::regprocedure);
  novo:=replace(s,'os.orcamento_origem_id=q.id','(os.orcamento_origem_id=q.id or os.orcamento_aguardando_id=q.id)');
  if s=novo then raise exception 'Consulta do orçamento incompatível com vínculo pendente.'; end if;
  execute novo;
end $$;

revoke all on function private.proteger_os_aguardando_orcamento(),private.proteger_itens_os_aguardando(),private.proteger_parada_orcamento_pendente(),private.aplicar_orcamento_os_pendente(uuid,uuid),private.aprovar_os_vinculada(),public.criar_os_aguardando_orcamento(uuid,uuid),public.converter_orcamento_em_os(uuid,uuid) from public,anon,authenticated;
grant execute on function public.criar_os_aguardando_orcamento(uuid,uuid),public.converter_orcamento_em_os(uuid,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
