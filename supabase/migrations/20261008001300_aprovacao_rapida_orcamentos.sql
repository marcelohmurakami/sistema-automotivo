begin;
create function public.aprovar_orcamento_interno(p_oficina uuid,p_orcamento uuid,p_revisao integer,p_versao uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos; v public.versoes_orcamento; grupos text[]; sub bigint;
begin
 u:=private.exigir_orcamentos(p_oficina);
 select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
 if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
 if q.arquivado_em is not null then raise exception 'Orçamento excluído.' using errcode='22023'; end if;
 if q.situacao='approved' and q.versao_atual_id=p_versao then return; end if;
 if q.revisao is distinct from p_revisao or q.versao_atual_id is distinct from p_versao then raise exception 'Orçamento alterado. Atualize a lista antes de aprovar.' using errcode='40001'; end if;
  if q.arquivado_em is not null or q.situacao <> 'awaiting_approval' then
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
    'Aprovação integral registrada pela oficina na lista. Orçamento #'||q.numero||', versão '||v.numero_versao||'.',
    grupos,sub,v.desconto_centavos,v.total_centavos);
  update public.orcamentos set situacao='approved',revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;

 perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.autorizado_oficina',u);
end $$;
revoke all on function public.aprovar_orcamento_interno(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.aprovar_orcamento_interno(uuid,uuid,integer,uuid) to authenticated;
do $$declare s text; begin
 s:=pg_get_functiondef('public.listar_orcamentos_gestao(uuid,text,text,integer,boolean)'::regprocedure);
 if position('q.id,q.numero' in s)=0 then raise exception 'Listagem incompatível'; end if;
 execute replace(s,'q.id,q.numero','q.id,(select os.id from public.ordens_servico os where os.oficina_id=q.oficina_id and (os.orcamento_origem_id=q.id or os.orcamento_aguardando_id=q.id) limit 1) as ordem_servico_id,(select c.ordem_servico_id from public.complementos_ordem_servico c where c.oficina_id=q.oficina_id and c.orcamento_id=q.id limit 1) as adicional_os_id,q.numero');
end $$;
notify pgrst,'reload schema';
commit;
