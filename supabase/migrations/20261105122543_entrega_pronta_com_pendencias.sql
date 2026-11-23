begin;

-- Exceção explícita de gerente para concluir OS prontas com dados desconhecidos.
-- Não infere origem, data, custo ou pagamento; vale somente para uma revisão.
create table private.autorizacoes_entrega_pendente (
 oficina_id uuid not null, ordem_servico_id uuid not null, revisao integer not null,
 itens_sem_origem uuid[] not null default '{}', entrada_sem_data boolean not null default false,
 motivo text not null check(length(btrim(motivo)) between 10 and 2000),
 autorizado_por uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 primary key(oficina_id,ordem_servico_id,revisao),
 foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id),
 check(entrada_sem_data or cardinality(itens_sem_origem)>0),
 check(array_position(itens_sem_origem,null) is null)
);
alter table private.autorizacoes_entrega_pendente enable row level security;
revoke all on private.autorizacoes_entrega_pendente from public,anon,authenticated;

do $$ declare d text;antigo text;novo text;begin
 d:=pg_get_functiondef('public.atualizar_mapa_ordem_servico(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz,text)'::regprocedure);
 antigo:='if p_situacao=''delivered'' and p_recebido_em is null then';
 novo:='if p_situacao=''delivered'' and p_recebido_em is null and not exists(select 1 from private.autorizacoes_entrega_pendente a where a.oficina_id=p_oficina and a.ordem_servico_id=w.id and a.revisao=w.revisao and a.entrada_sem_data) then';
 if position(antigo in d)=0 then raise exception 'Validação de entrada inesperada.';end if;
 execute replace(d,antigo,novo);

 d:=pg_get_functiondef('private.baixar_estoque_entrega_os()'::regprocedure);
 antigo:='if not found then raise exception ''Defina a origem da peça';
 novo:='if not found then
   if i.origem_peca is null and i.produto_estoque_id is null and exists(select 1 from private.autorizacoes_entrega_pendente a where a.oficina_id=new.oficina_id and a.ordem_servico_id=new.id and a.revisao=new.revisao-1 and i.id=any(a.itens_sem_origem)) then continue;end if;
   raise exception ''Defina a origem da peça';
 if position(antigo in d)=0 then raise exception 'Validação da origem da peça inesperada.';end if;
 d:=replace(d,antigo,novo);
 d:=replace(d,'tipo=''part'' and situacao<>''cancelled''','tipo=''part'' and removido_em is null and situacao<>''cancelled''');
 execute d;

 d:=pg_get_functiondef('private.conferir_entrega_os()'::regprocedure);
 antigo:='ordem_servico_id=new.id and situacao not in';
 if position(antigo in d)=0 then raise exception 'Validação dos itens inesperada.';end if;
 execute replace(d,antigo,'ordem_servico_id=new.id and removido_em is null and situacao not in');
end $$;

create function public.entregar_ordem_servico_com_pendencias(
 p_oficina uuid,p_os uuid,p_revisao integer,p_itens_sem_origem uuid[],p_entrada_sem_data boolean,p_motivo text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;o public.ordens_servico;itens uuid[]:=coalesce(p_itens_sem_origem,'{}');detalhes jsonb;r jsonb;
begin
 perform private.conferir_operacao(p_oficina,'entregar_ordem_servico_com_pendencias');
 u:=private.require_staff(p_oficina);
 if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in('owner','manager')) then
  raise exception 'Somente o gerente pode autorizar a entrega com dados pendentes.' using errcode='42501';end if;
 if p_entrada_sem_data is null or (not p_entrada_sem_data and cardinality(itens)=0) or cardinality(itens)>500
  or array_position(itens,null) is not null or cardinality(itens)<>(select count(distinct x) from unnest(itens) x)
  or p_motivo is null or length(btrim(p_motivo)) not between 10 and 2000 then
  raise exception 'Informe as pendências autorizadas e o motivo da conclusão.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||p_oficina||':'||p_os,0));
 select * into o from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 if not found then raise exception 'OS não encontrada.' using errcode='P0002';end if;
 if p_revisao is null or p_revisao<>o.revisao then raise exception 'Esta OS foi alterada. Confira os dados atuais.' using errcode='PT409';end if;
 if o.situacao<>'ready' or o.arquivado_em is not null then raise exception 'Esta ação é exclusiva para OS prontas.' using errcode='22023';end if;
 if p_entrada_sem_data and o.recebido_em is not null then raise exception 'A data de entrada já está registrada; preserve-a.' using errcode='22023';end if;
 if exists(select 1 from unnest(itens) x where not exists(
  select 1 from public.itens_ordem_servico i where i.oficina_id=p_oficina and i.ordem_servico_id=p_os and i.id=x
  and i.tipo='part' and i.situacao='done' and i.removido_em is null and i.origem_peca is null and i.produto_estoque_id is null
  and not exists(select 1 from public.estoque_produtos e where e.oficina_id=p_oficina and e.item_catalogo_id=i.item_catalogo_id)
 )) then raise exception 'Só podem ficar pendentes peças concluídas sem origem nem vínculo de estoque. Peças vinculadas seguem a baixa normal.' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'descricao',i.descricao,'quantidade',i.quantidade,'unidade',i.unidade) order by i.posicao,i.id),'[]') into detalhes
 from public.itens_ordem_servico i where i.oficina_id=p_oficina and i.ordem_servico_id=p_os and i.id=any(itens);
 insert into private.autorizacoes_entrega_pendente(oficina_id,ordem_servico_id,revisao,itens_sem_origem,entrada_sem_data,motivo,autorizado_por)
 values(p_oficina,p_os,o.revisao,itens,p_entrada_sem_data,btrim(p_motivo),u);
 r:=public.mover_ordem_no_mapa(p_oficina,p_os,o.revisao,'avancar');
 insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,metadados)
 values(p_oficina,p_os,'delivery_pending_data',u,
  'Entrega autorizada com informações pendentes. '||case when p_entrada_sem_data then 'Data de entrada não informada. ' else '' end||
  case when cardinality(itens)>0 then cardinality(itens)||' peça(s) sem origem registrada, sem baixa de estoque: '||
  (select string_agg(value->>'descricao','; ') from jsonb_array_elements(detalhes))||'. ' else '' end||
  'Pagamentos preservados. Motivo: '||btrim(p_motivo),
  jsonb_build_object('entrada_sem_data',p_entrada_sem_data,'pecas_sem_origem',detalhes,'revisao_autorizada',o.revisao,'motivo',btrim(p_motivo)));
 return r;
end $$;
revoke all on function public.entregar_ordem_servico_com_pendencias(uuid,uuid,integer,uuid[],boolean,text) from public,anon;
grant execute on function public.entregar_ordem_servico_com_pendencias(uuid,uuid,integer,uuid[],boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;
