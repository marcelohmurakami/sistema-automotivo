begin;
alter table public.acompanhamentos_comerciais drop constraint acompanhamentos_comerciais_origem_check;
alter table public.acompanhamentos_comerciais add constraint acompanhamentos_comerciais_origem_check check(origem in ('orcamento','adiados','manutencao','retirada'));
create or replace function private.candidatos_retorno(p_oficina uuid) returns table(origem text,origem_id uuid,cliente_id uuid,veiculo_id uuid,descricao text,valor_centavos bigint,data_referencia date) language sql stable security definer set search_path='' as $$
 select 'orcamento',q.id,q.cliente_id,q.veiculo_id,'Orçamento #'||q.numero,v.total_centavos,coalesce(v.expira_em,v.publicado_em)::date from public.orcamentos q join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id where q.oficina_id=p_oficina and (q.situacao in ('declined','expired') or (q.situacao='awaiting_approval' and v.publicado_em<now()-interval '1 day'))
 union all
 select 'adiados',q.id,q.cliente_id,q.veiculo_id,'Serviços adiados · orçamento #'||q.numero,v.total_centavos-a.total_aprovado_centavos,a.confirmado_em::date from public.orcamentos q join public.versoes_orcamento v on v.id=q.versao_atual_id and v.oficina_id=q.oficina_id join public.aprovacoes_orcamento a on a.oficina_id=q.oficina_id and a.versao_orcamento_id=v.id where q.oficina_id=p_oficina and q.situacao='approved' and a.grupos_aprovados is not null and exists(select 1 from public.itens_orcamento i where i.oficina_id=q.oficina_id and i.versao_orcamento_id=v.id and not i.grupo_servico=any(a.grupos_aprovados))
 union all
 select 'manutencao',m.id,o.cliente_id,o.veiculo_id,m.descricao,0::bigint,m.data_prevista from public.manutencoes_programadas m join public.ordens_servico o on o.oficina_id=m.oficina_id and o.id=m.ordem_servico_id where m.oficina_id=p_oficina and m.concluida_em is null and (m.data_prevista<=current_date+30 or m.data_prevista is null)
 union all
 select 'retirada',o.id,o.cliente_id,o.veiculo_id,'Serviço pronto — combinar retirada · OS #'||o.numero,o.total_centavos,(o.concluido_em at time zone 'America/Sao_Paulo')::date from public.ordens_servico o where o.oficina_id=p_oficina and o.situacao='ready'

$$;
create or replace function public.consultar_oportunidades(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_orcamentos(p_oficina);
 return jsonb_build_object('itens',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
 select k.*,coalesce(c.nome,pr.dados_cliente->>'nome','Cliente') cliente,coalesce(c.telefone_e164,pr.dados_cliente->>'telefone_e164') telefone,coalesce(v.modelo,pr.dados_veiculo->>'modelo','Serviço') veiculo,coalesce(v.placa,pr.dados_veiculo->>'placa') placa,coalesce(a.situacao,'aberto') situacao,a.proximo_contato,a.anotacao,a.contatado_em,a.orcamento_id,a.revisao,coalesce(pr.id,o.id) ordem_servico_id,
 coalesce((select sum(b.valor_centavos*(case when b.estorno_de is null then 1 else -1 end)) from public.titulos_financeiros t join public.baixas_financeiras b on b.oficina_id=t.oficina_id and b.titulo_id=t.id where t.oficina_id=p_oficina and t.ordem_servico_id=o.id and a.contatado_em is not null and b.criado_em>=a.contatado_em),0) recebido_centavos
 from (select * from private.candidatos_retorno(p_oficina) union all select a0.origem,a0.origem_id,q.cliente_id,q.veiculo_id,'Retorno acompanhado',0::bigint,a0.contatado_em::date from public.acompanhamentos_comerciais a0 join public.orcamentos q on q.oficina_id=a0.oficina_id and q.id=a0.orcamento_id where a0.oficina_id=p_oficina and not exists(select 1 from private.candidatos_retorno(p_oficina) k0 where k0.origem=a0.origem and k0.origem_id=a0.origem_id)) k
 left join public.ordens_servico pr on k.origem='retirada' and pr.id=k.origem_id and pr.oficina_id=p_oficina
 left join public.clientes c on c.oficina_id=p_oficina and c.id=k.cliente_id and c.arquivado_em is null left join public.veiculos v on v.oficina_id=p_oficina and v.id=k.veiculo_id
 left join public.acompanhamentos_comerciais a on a.oficina_id=p_oficina and a.origem=k.origem and a.origem_id=k.origem_id
 left join public.ordens_servico o on o.oficina_id=p_oficina and o.orcamento_origem_id=a.orcamento_id and o.situacao<>'cancelled'
 where k.origem='retirada' or (c.id is not null and v.id is not null)
 order by coalesce(a.proximo_contato,k.data_referencia) nulls last,k.origem_id limit 500)x));
end $$;
create or replace function public.acompanhar_oportunidade(p_oficina uuid,p_origem text,p_origem_id uuid,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k record;a public.acompanhamentos_comerciais;q public.orcamentos;r jsonb;itens jsonb;
begin perform private.exigir_orcamentos(p_oficina);perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_origem||p_origem_id::text,0));
 select * into a from public.acompanhamentos_comerciais where oficina_id=p_oficina and origem=p_origem and origem_id=p_origem_id for update;
 select * into k from private.candidatos_retorno(p_oficina) where origem=p_origem and origem_id=p_origem_id;
 if not found and a.oficina_id is null then raise exception 'Oportunidade indisponível.' using errcode='P0002';end if;
 if a.oficina_id is not null and a.revisao is distinct from (p_dados->>'revisao')::integer then raise exception 'Acompanhamento alterado. Atualize a tela.' using errcode='PT409';end if;
 if p_origem='retirada' and p_dados->>'acao'='orcamento' then raise exception 'Abra a OS existente para combinar a retirada.' using errcode='22023';end if;
 if p_dados->>'acao'='orcamento' then
  if a.orcamento_id is not null then return jsonb_build_object('orcamento',a.orcamento_id);end if;
  if p_origem in ('orcamento','adiados') then
   select * into q from public.orcamentos where oficina_id=p_oficina and id=p_origem_id;
   if q.situacao='awaiting_approval' and exists(select 1 from public.versoes_orcamento where id=q.versao_atual_id and expira_em>now()) then r:=jsonb_build_object('id',q.id);
   else
    select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('depende_grupo','') order by posicao),'[]') into itens from public.itens_orcamento i where i.oficina_id=p_oficina and i.versao_orcamento_id=q.versao_atual_id and (p_origem<>'adiados' or not private.grupo_autorizado(q.versao_atual_id,i.grupo_servico));
   end if;
  end if;
  if r is null then r:=public.salvar_orcamento(p_oficina,jsonb_build_object('cliente_id',k.cliente_id,'veiculo_id',k.veiculo_id,'itens',coalesce(itens,'[]'),'observacoes','Retorno: '||k.descricao||'. Revise os preços e as dependências antes de enviar.','condicoes','Execução após aprovação.','desconto_centavos',0),gen_random_uuid());end if;
 end if;
 insert into public.acompanhamentos_comerciais(oficina_id,origem,origem_id,situacao,proximo_contato,anotacao,contatado_em,orcamento_id) values(p_oficina,p_origem,p_origem_id,coalesce(p_dados->>'situacao',a.situacao,'aberto'),nullif(p_dados->>'proximo_contato','')::date,coalesce(p_dados->>'anotacao',a.anotacao,''),case when p_dados->>'situacao'='contatado' then coalesce(a.contatado_em,now()) else a.contatado_em end,coalesce((r->>'id')::uuid,a.orcamento_id))
 on conflict(oficina_id,origem,origem_id) do update set situacao=excluded.situacao,proximo_contato=excluded.proximo_contato,anotacao=excluded.anotacao,contatado_em=excluded.contatado_em,orcamento_id=excluded.orcamento_id,revisao=acompanhamentos_comerciais.revisao+1;
 return jsonb_build_object('orcamento',coalesce((r->>'id')::uuid,a.orcamento_id));
end $$;


commit;
