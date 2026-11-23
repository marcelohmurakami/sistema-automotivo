begin;

-- Autorização interna é distinta do aceite obtido por link do cliente.
alter table public.aprovacoes_orcamento
  alter column token_acesso_id drop not null,
  add column usuario_autorizador_id uuid references auth.users(id),
  drop constraint quote_approvals_verification_method_check,
  add constraint aprovacao_metodo_valido check (metodo_verificacao in ('bearer_link','otp','oficina')),
  add constraint aprovacao_origem_valida check (
    (metodo_verificacao='oficina' and usuario_autorizador_id is not null and token_acesso_id is null)
    or (metodo_verificacao in ('bearer_link','otp') and token_acesso_id is not null and usuario_autorizador_id is null)
  );

create function private.resumo_orcamento_pendente(p_oficina uuid,p_orcamento uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',q.id,'numero',q.numero,'revisao',q.revisao,'versao_id',v.id,'total_centavos',v.total_centavos,
    'pode_autorizar',q.arquivado_em is null and q.situacao in ('draft','awaiting_approval')
      and (v.publicado_em is null or v.expira_em>now())
      and exists(select 1 from public.itens_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id))
  from public.orcamentos q join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id
  where q.oficina_id=p_oficina and q.id=p_orcamento;
$$;

-- A versão/valor exibidos acompanham o clique, protegendo contra edição simultânea.
do $$declare s text; novo text; begin
  s:=pg_get_functiondef('public.listar_ordens_servico_gestao(uuid,text,text,integer,boolean)'::regprocedure);
  novo:=replace(s,'select w.*,(select count(*)','select w.*,private.resumo_orcamento_pendente(w.oficina_id,w.orcamento_aguardando_id) as orcamento_pendente,(select count(*)');
  if novo=s then raise exception 'Listagem de OS incompatível.'; end if; execute novo;
  s:=pg_get_functiondef('public.consultar_ordem_servico(uuid,uuid)'::regprocedure);
  novo:=replace(s,'''itens'',coalesce(','''orcamento_pendente'',private.resumo_orcamento_pendente(w.oficina_id,w.orcamento_aguardando_id),''autorizacao_oficina_em'',(select a.confirmado_em from public.aprovacoes_orcamento a where a.oficina_id=w.oficina_id and a.versao_orcamento_id=w.versao_orcamento_origem_id and a.metodo_verificacao=''oficina''),''itens'',coalesce(');
  if novo=s then raise exception 'Consulta de OS incompatível.'; end if; execute novo;
end $$;

create function public.autorizar_servico_pela_os(p_oficina uuid,p_os uuid,p_revisao integer,p_orcamento uuid,p_revisao_orcamento integer,p_versao uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos; o public.ordens_servico; v public.versoes_orcamento; grupos text[]; sub bigint;
begin
  u:=private.exigir_os(p_oficina); perform private.exigir_orcamentos(p_oficina);
  -- Mesma ordem de bloqueios usada no aceite por link: orçamento, OS, versão.
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  select * into o from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if o.arquivado_em is not null or o.situacao in ('cancelled','delivered') then
    raise exception 'Esta OS está encerrada.' using errcode='22023'; end if;
  -- Repetir o clique ou receber o aceite público simultaneamente não duplica itens.
  if o.orcamento_origem_id=q.id and o.versao_orcamento_origem_id=p_versao and q.situacao='approved' then
    return public.consultar_ordem_servico(p_oficina,p_os); end if;
  if o.orcamento_aguardando_id is distinct from q.id then
    raise exception 'Este orçamento não está aguardando autorização nesta OS.' using errcode='22023'; end if;
  if o.revisao is distinct from p_revisao or q.revisao is distinct from p_revisao_orcamento or q.versao_atual_id is distinct from p_versao then
    raise exception 'A OS ou o orçamento mudou. Atualize a tela e confira os valores antes de autorizar.' using errcode='40001'; end if;
  if q.arquivado_em is not null or q.situacao not in ('draft','awaiting_approval') then
    raise exception 'O orçamento não está disponível para autorização.' using errcode='22023'; end if;
  select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=p_versao for update;
  if v.publicado_em is not null and v.expira_em<=now() then
    raise exception 'O orçamento venceu. Revise os valores antes de autorizar.' using errcode='22023'; end if;
  if not exists(select 1 from public.clientes where oficina_id=p_oficina and id=q.cliente_id and arquivado_em is null)
    or not exists(select 1 from public.veiculos where oficina_id=p_oficina and id=q.veiculo_id and arquivado_em is null)
    or not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=q.cliente_id and veiculo_id=q.veiculo_id and encerrado_em is null) then
    raise exception 'Confira o cadastro do cliente e o vínculo com o veículo.' using errcode='22023'; end if;
  select array_agg(distinct grupo_servico order by grupo_servico),sum(total_item_centavos) into grupos,sub
    from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
  if grupos is null or sub is distinct from v.subtotal_centavos then
    raise exception 'Confira os itens e valores do orçamento antes de autorizar.' using errcode='22023'; end if;
  if exists(select 1 from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and depende_grupo<>'' and not depende_grupo=any(grupos)) then
    raise exception 'O orçamento possui dependências de serviços não incluídas.' using errcode='22023'; end if;
  -- Congela o rascunho antes de aprovar; não cria um link nem simula resposta do cliente.
  if v.publicado_em is null then
    update public.versoes_orcamento set publicado_em=now(),expira_em=now()+interval '7 days' where id=v.id;
  end if;
  insert into public.aprovacoes_orcamento(oficina_id,versao_orcamento_id,decisao,nome_informado,metodo_verificacao,usuario_autorizador_id,texto_confirmacao,grupos_aprovados,subtotal_aprovado_centavos,desconto_aprovado_centavos,total_aprovado_centavos)
  values(p_oficina,v.id,'approved','Responsável da oficina','oficina',u,
    'Autorização integral registrada pela oficina na OS #'||o.numero||'. Orçamento #'||q.numero||', versão '||v.numero_versao||'.',
    grupos,sub,v.desconto_centavos,v.total_centavos);
  update public.orcamentos set situacao='approved',revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
  -- O gatilho existente incorpora os itens e encerra somente a parada de aprovação.
  perform private.evento_os(p_oficina,o.id,'Serviço autorizado pela oficina nesta OS.',
    jsonb_build_object('acao','autorizacao_oficina','orcamento_id',q.id,'versao_id',v.id,'usuario_id',u,'total_autorizado_centavos',v.total_centavos));
  perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.autorizado_oficina',u);
  return public.consultar_ordem_servico(p_oficina,p_os);
end $$;

revoke all on function private.resumo_orcamento_pendente(uuid,uuid),public.autorizar_servico_pela_os(uuid,uuid,integer,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.autorizar_servico_pela_os(uuid,uuid,integer,uuid,integer,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
