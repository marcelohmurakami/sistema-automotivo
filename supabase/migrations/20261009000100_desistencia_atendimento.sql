begin;
alter table public.orcamentos add column encerramento jsonb;
create function public.registrar_desistencia_atendimento(p_oficina uuid,p_tipo text,p_id uuid,p_revisao integer,p_decisao text,p_motivo text,p_encerrar_os boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos; w public.ordens_servico; qid uuid; descricao text;begin
 u:=private.require_staff(p_oficina);
 if p_tipo not in ('os','orcamento') or p_tipo is null or p_decisao not in ('nao_aprovou','desistiu') or p_decisao is null or length(trim(coalesce(p_motivo,''))) not between 3 and 1000 then raise exception 'Informe a decisão e um motivo de 3 a 1000 caracteres.' using errcode='22023';end if;
 if not private.has_feature(p_oficina,case when p_tipo='os' then 'work_orders' else 'quotes' end) then raise exception 'Recurso indisponível.' using errcode='42501';end if;
 if p_tipo='os' then
  select coalesce(orcamento_origem_id,orcamento_aguardando_id) into qid from public.ordens_servico where oficina_id=p_oficina and id=p_id;
 else qid:=p_id;end if;
 if qid is not null then select * into q from public.orcamentos where oficina_id=p_oficina and id=qid for update;end if;
 if p_tipo='orcamento' then
  if q.id is null or q.arquivado_em is not null then raise exception 'Orçamento indisponível.' using errcode='22023';end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a tela.' using errcode='PT409';end if;
  if q.situacao in ('cancelled','declined') then raise exception 'Este orçamento já foi encerrado. Confira o histórico.' using errcode='22023';end if;
  if exists(select 1 from public.complementos_ordem_servico where oficina_id=p_oficina and orcamento_id=q.id and aplicado_em is not null) then raise exception 'Adicional já aplicado. Registre a desistência na OS.' using errcode='22023';end if;
  select * into w from public.ordens_servico where oficina_id=p_oficina and (orcamento_origem_id=q.id or orcamento_aguardando_id=q.id) for update;
  if w.id is not null and w.situacao<>'cancelled' and not coalesce(p_encerrar_os,false) then raise exception 'Há uma OS vinculada. Confirme o encerramento conjunto ou trate o atendimento pela OS.' using errcode='22023';end if;
 else
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_id for update;
  if w.id is null or w.arquivado_em is not null then raise exception 'OS indisponível.' using errcode='22023';end if;
  if w.revisao is distinct from p_revisao then raise exception 'A OS mudou. Atualize a tela.' using errcode='PT409';end if;
 end if;
 if q.situacao='approved' and p_decisao='nao_aprovou' then raise exception 'O orçamento já foi aprovado. Escolha desistência após aprovação.' using errcode='22023';end if;
 descricao:=case when p_decisao='nao_aprovou' then 'Cliente não aprovou: ' else 'Cliente desistiu: ' end||trim(p_motivo);
 if w.id is not null and w.situacao<>'cancelled' then
  if w.situacao='delivered' then raise exception 'A OS já foi entregue. O histórico de entrega deve ser preservado.' using errcode='22023';end if;
  perform public.atualizar_mapa_ordem_servico(p_oficina,w.id,w.revisao,'cancelled',null,null,w.entrega_prevista_em,w.recebido_em,descricao);
  update public.paradas_ordem_servico set encerrado_em=now() where oficina_id=p_oficina and ordem_servico_id=w.id and encerrado_em is null;
  perform private.evento_os(p_oficina,w.id,descricao,jsonb_build_object('decisao',p_decisao,'orcamento_id',qid));
 end if;
 if q.id is not null and q.situacao not in ('cancelled','declined') then
  update public.tokens_acesso_orcamento set revogado_em=now() where oficina_id=p_oficina and versao_orcamento_id in(select id from public.versoes_orcamento where oficina_id=p_oficina and orcamento_id=q.id) and revogado_em is null;
  update public.orcamentos set situacao=case when p_decisao='nao_aprovou' then 'declined' else 'cancelled' end,encerramento=jsonb_build_object('decisao',p_decisao,'motivo',trim(p_motivo),'registrado_em',now(),'usuario_id',u,'versao_id',q.versao_atual_id),revisao=revisao+1,atualizado_em=now() where oficina_id=p_oficina and id=q.id returning * into q;
  perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.'||p_decisao,u);
 end if;
end $$;
revoke all on function public.registrar_desistencia_atendimento(uuid,text,uuid,integer,text,text,boolean) from public,anon;
grant execute on function public.registrar_desistencia_atendimento(uuid,text,uuid,integer,text,text,boolean) to authenticated;
commit;
