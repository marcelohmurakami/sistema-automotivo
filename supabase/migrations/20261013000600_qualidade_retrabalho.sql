begin;

insert into public.recursos(codigo,descricao) values ('employee_reports','Relatórios completos de funcionários');
insert into public.recursos_plano(codigo_plano,codigo_recurso,habilitado) values ('complete','employee_reports',true);
alter table public.funcionarios add constraint funcionarios_oficina_id_unico unique(oficina_id,id);

create table public.ocorrencias_qualidade (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 ordem_original_id uuid not null, ordem_retrabalho_id uuid, item_os_id uuid, funcionario_id uuid,
 tipo text not null check(tipo in ('garantia','retrabalho','reclamacao')),
 situacao text not null default 'aberta' check(situacao in ('aberta','em_analise','em_retrabalho','resolvida','cancelada')),
 cobertura text not null default 'em_analise' check(cobertura in ('em_analise','coberta','nao_coberta','nao_aplicavel')),
 motivo text not null check(motivo in ('execucao','peca','diagnostico','prazo','atendimento','recorrencia','outro')),
 descricao text not null check(length(trim(descricao)) between 5 and 3000),
 diagnostico text not null default '' check(length(diagnostico)<=3000),
 solucao text not null default '' check(length(solucao)<=3000),
 reclamacao boolean not null default false, houve_retrabalho boolean not null default false,
 aberto_em timestamptz not null, resolvido_em timestamptz,
 horas_retrabalho numeric(10,2) not null default 0 check(horas_retrabalho between 0 and 100000),
 custo_hora_centavos bigint not null default 0 check(custo_hora_centavos between 0 and 100000000),
 custo_pecas_centavos bigint not null default 0 check(custo_pecas_centavos between 0 and 10000000000),
 outros_custos_centavos bigint not null default 0 check(outros_custos_centavos between 0 and 10000000000),
 reembolso_centavos bigint not null default 0 check(reembolso_centavos between 0 and 10000000000),
 recuperado_centavos bigint not null default 0 check(recuperado_centavos between 0 and 10000000000),
 nota_cliente smallint check(nota_cliente between 1 and 5),
 comentario_cliente text not null default '' check(length(comentario_cliente)<=2000),
 custos_conferidos boolean not null default false,
 revisao integer not null default 1, criado_por uuid references auth.users(id),
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 foreign key(oficina_id,ordem_original_id) references public.ordens_servico(oficina_id,id),
 foreign key(oficina_id,ordem_retrabalho_id) references public.ordens_servico(oficina_id,id),
 foreign key(oficina_id,item_os_id) references public.itens_ordem_servico(oficina_id,id),
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id),
 check(ordem_retrabalho_id is null or ordem_original_id<>ordem_retrabalho_id),
 check(resolvido_em is null or resolvido_em>=aberto_em),
 check((situacao='resolvida')=(resolvido_em is not null)),
 check(situacao<>'resolvida' or length(trim(solucao))>=3),
 check(recuperado_centavos<=round(horas_retrabalho*custo_hora_centavos)+custo_pecas_centavos+outros_custos_centavos+reembolso_centavos),
 unique(oficina_id,id)
);
create index qualidade_oficina_periodo on public.ocorrencias_qualidade(oficina_id,aberto_em desc);
create index qualidade_os on public.ocorrencias_qualidade(oficina_id,ordem_original_id);
create unique index qualidade_retrabalho_unico on public.ocorrencias_qualidade(oficina_id,ordem_retrabalho_id) where ordem_retrabalho_id is not null;
alter table public.ocorrencias_qualidade enable row level security;
revoke all on public.ocorrencias_qualidade from public,anon,authenticated;

create table public.historico_qualidade (
 id bigint generated always as identity primary key, oficina_id uuid not null, ocorrencia_id uuid not null,
 revisao integer not null, autor uuid references auth.users(id), ocorrido_em timestamptz not null default now(),
 antes jsonb, depois jsonb not null,
 foreign key(oficina_id,ocorrencia_id) references public.ocorrencias_qualidade(oficina_id,id)
);
alter table public.historico_qualidade enable row level security;
revoke all on public.historico_qualidade from public,anon,authenticated;

create function private.auditar_qualidade() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.historico_qualidade(oficina_id,ocorrencia_id,revisao,autor,antes,depois)
 values(new.oficina_id,new.id,new.revisao,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 return new;
end $$;
create trigger auditar_qualidade after insert or update on public.ocorrencias_qualidade for each row execute function private.auditar_qualidade();

-- Preserva os vínculos de garantia já existentes. Uma ocorrência por retorno.
insert into public.ocorrencias_qualidade(id,oficina_id,ordem_original_id,ordem_retrabalho_id,tipo,motivo,descricao,aberto_em,houve_retrabalho,criado_em)
select id,oficina_id,ordem_original_id,ordem_retorno_id,'garantia','outro',motivo,criado_em,true,criado_em from public.retornos_garantia;
create function private.integrar_retorno_qualidade() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.ocorrencias_qualidade(id,oficina_id,ordem_original_id,ordem_retrabalho_id,tipo,motivo,descricao,aberto_em,houve_retrabalho)
 values(new.id,new.oficina_id,new.ordem_original_id,new.ordem_retorno_id,'garantia','outro',new.motivo,new.criado_em,true)
 on conflict(id) do nothing;
 return new;
end $$;
create trigger integrar_retorno_qualidade after insert on public.retornos_garantia for each row execute function private.integrar_retorno_qualidade();

create function public.salvar_ocorrencia_qualidade(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; anterior public.ocorrencias_qualidade%rowtype; novo public.ocorrencias_qualidade%rowtype;
begin
 u:=private.exigir_gestao(p_oficina,'work_orders');
 if p_id is null or jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Informe os dados da ocorrência.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('qualidade:'||p_id,0));
 select * into anterior from public.ocorrencias_qualidade where id=p_id for update;
 if found then
  if anterior.oficina_id<>p_oficina then raise exception 'Ocorrência indisponível.' using errcode='42501';end if;
  if p_revisao is null then return p_id;end if;
  if anterior.revisao<>p_revisao then raise exception 'Ocorrência alterada. Atualize antes de salvar.' using errcode='PT409';end if;
 end if;
 novo:=jsonb_populate_record(null::public.ocorrencias_qualidade,
  coalesce(to_jsonb(anterior),'{}')||jsonb_build_object('id',p_id,'oficina_id',p_oficina,'revisao',coalesce(anterior.revisao,0)+1)
  ||p_dados||jsonb_build_object('id',p_id,'oficina_id',p_oficina,'revisao',coalesce(anterior.revisao,0)+1));
 novo.tipo:=coalesce(novo.tipo,'garantia');novo.situacao:=coalesce(novo.situacao,'aberta');novo.cobertura:=coalesce(novo.cobertura,'em_analise');
 novo.descricao:=trim(novo.descricao);novo.diagnostico:=coalesce(novo.diagnostico,'');novo.solucao:=coalesce(novo.solucao,'');
 novo.reclamacao:=coalesce(novo.reclamacao,false);novo.houve_retrabalho:=coalesce(novo.houve_retrabalho,false);
 novo.aberto_em:=coalesce(novo.aberto_em,now());novo.resolvido_em:=case when novo.situacao='resolvida' then coalesce(novo.resolvido_em,now()) end;
 novo.horas_retrabalho:=coalesce(novo.horas_retrabalho,0);novo.custo_hora_centavos:=coalesce(novo.custo_hora_centavos,0);
 novo.custo_pecas_centavos:=coalesce(novo.custo_pecas_centavos,0);novo.outros_custos_centavos:=coalesce(novo.outros_custos_centavos,0);
 novo.reembolso_centavos:=coalesce(novo.reembolso_centavos,0);novo.recuperado_centavos:=coalesce(novo.recuperado_centavos,0);
 novo.comentario_cliente:=coalesce(novo.comentario_cliente,'');novo.custos_conferidos:=coalesce(novo.custos_conferidos,false);
 novo.criado_por:=coalesce(anterior.criado_por,u);novo.criado_em:=coalesce(anterior.criado_em,now());novo.atualizado_em:=now();
 if not exists(select 1 from public.ordens_servico where oficina_id=p_oficina and id=novo.ordem_original_id and arquivado_em is null)
  or (anterior.id is not null and anterior.ordem_original_id<>novo.ordem_original_id) then raise exception 'Selecione uma OS válida. O vínculo original não pode ser trocado.' using errcode='22023';end if;
 if novo.item_os_id is not null and not exists(select 1 from public.itens_ordem_servico where oficina_id=p_oficina and id=novo.item_os_id and ordem_servico_id=novo.ordem_original_id and tipo='service' and removido_em is null) then raise exception 'Selecione um serviço da OS original.' using errcode='22023';end if;
 if novo.funcionario_id is not null and not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=novo.funcionario_id) then raise exception 'Funcionário de outra oficina.' using errcode='22023';end if;
 if novo.ordem_retrabalho_id is not null and not exists(select 1 from public.ordens_servico r join public.ordens_servico o on o.id=novo.ordem_original_id and o.oficina_id=r.oficina_id where r.oficina_id=p_oficina and r.id=novo.ordem_retrabalho_id and r.arquivado_em is null and ((o.cliente_id is not null and o.cliente_id=r.cliente_id) or (o.cliente_id is null and r.cliente_id is null and o.dados_cliente->>'nome'=r.dados_cliente->>'nome'))) then raise exception 'Selecione uma OS de retrabalho do mesmo cliente.' using errcode='22023';end if;
 if novo.aberto_em>now()+interval '5 minutes' or novo.resolvido_em>now()+interval '5 minutes' then raise exception 'As datas da ocorrência não podem estar no futuro.' using errcode='22023';end if;
 if anterior.id is null then insert into public.ocorrencias_qualidade select novo.*;
 else update public.ocorrencias_qualidade set
  ordem_retrabalho_id=novo.ordem_retrabalho_id,item_os_id=novo.item_os_id,funcionario_id=novo.funcionario_id,tipo=novo.tipo,situacao=novo.situacao,cobertura=novo.cobertura,
  motivo=novo.motivo,descricao=novo.descricao,diagnostico=novo.diagnostico,solucao=novo.solucao,reclamacao=novo.reclamacao,houve_retrabalho=novo.houve_retrabalho,
  aberto_em=novo.aberto_em,resolvido_em=novo.resolvido_em,horas_retrabalho=novo.horas_retrabalho,custo_hora_centavos=novo.custo_hora_centavos,
  custo_pecas_centavos=novo.custo_pecas_centavos,outros_custos_centavos=novo.outros_custos_centavos,reembolso_centavos=novo.reembolso_centavos,recuperado_centavos=novo.recuperado_centavos,
  nota_cliente=novo.nota_cliente,comentario_cliente=novo.comentario_cliente,custos_conferidos=novo.custos_conferidos,revisao=novo.revisao,atualizado_em=now() where id=p_id;
 end if;
 return p_id;
exception when check_violation or not_null_violation then raise exception 'Confira motivo, descrição, datas, custos e nota da ocorrência. Para resolver, informe a solução.' using errcode='22023';
end $$;

create function public.consultar_qualidade(p_oficina uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 then raise exception 'Escolha um período de até 367 dias.' using errcode='22023';end if;
 return jsonb_build_object('ocorrencias',(
  select coalesce(jsonb_agg(to_jsonb(x) order by x.aberto_em desc),'[]') from (
   select q.*,w.numero numero_os,w.dados_cliente->>'nome' cliente,w.dados_veiculo->>'modelo' veiculo,w.cliente_id,w.tipo_servico,
    i.descricao servico,f.nome funcionario,r.numero numero_retrabalho,
    round(q.horas_retrabalho*q.custo_hora_centavos)+q.custo_pecas_centavos+q.outros_custos_centavos+q.reembolso_centavos-q.recuperado_centavos custo_total_centavos
   from public.ocorrencias_qualidade q join public.ordens_servico w on w.oficina_id=q.oficina_id and w.id=q.ordem_original_id
   left join public.itens_ordem_servico i on i.oficina_id=q.oficina_id and i.id=q.item_os_id
   left join public.funcionarios f on f.oficina_id=q.oficina_id and f.id=q.funcionario_id
   left join public.ordens_servico r on r.oficina_id=q.oficina_id and r.id=q.ordem_retrabalho_id
   where q.oficina_id=p_oficina and (q.aberto_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  ) x),'abertas',(select count(*) from public.ocorrencias_qualidade where oficina_id=p_oficina and situacao not in ('resolvida','cancelada')));
end $$;

create function public.opcoes_os_qualidade(p_oficina uuid,p_busca text default '',p_os uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
  select w.id,w.numero,w.cliente_id,w.dados_cliente->>'nome' cliente,w.dados_veiculo->>'modelo' veiculo,w.responsavel,w.tipo_servico,w.garantia_ate,
   coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'descricao',i.descricao)) from public.itens_ordem_servico i where i.oficina_id=p_oficina and i.ordem_servico_id=w.id and i.tipo='service' and i.removido_em is null),'[]') servicos
  from public.ordens_servico w where oficina_id=p_oficina and arquivado_em is null and (p_os is null or id=p_os)
   and (p_os is not null or concat(w.numero,' ',w.dados_cliente->>'nome',' ',w.dados_veiculo->>'modelo') ilike '%'||left(coalesce(p_busca,''),100)||'%')
  order by w.numero desc limit 30
 ) x);
end $$;

create function public.consultar_historico_qualidade(p_oficina uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 return (select coalesce(jsonb_agg(to_jsonb(h) order by ocorrido_em desc,id desc),'[]') from public.historico_qualidade h where oficina_id=p_oficina and ocorrencia_id=p_id);
end $$;

revoke all on function private.auditar_qualidade(),private.integrar_retorno_qualidade(),public.salvar_ocorrencia_qualidade(uuid,uuid,jsonb,integer),public.consultar_qualidade(uuid,date,date),public.opcoes_os_qualidade(uuid,text,uuid),public.consultar_historico_qualidade(uuid,uuid) from public,anon,authenticated;
grant execute on function public.salvar_ocorrencia_qualidade(uuid,uuid,jsonb,integer),public.consultar_qualidade(uuid,date,date),public.opcoes_os_qualidade(uuid,text,uuid),public.consultar_historico_qualidade(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
