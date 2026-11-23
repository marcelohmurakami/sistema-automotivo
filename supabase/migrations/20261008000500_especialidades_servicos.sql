begin;
create function private.catalogo_especialidades() returns jsonb language sql immutable set search_path='' as $catalogo$ select '{"mecanica":{"ramo":"automotivo","tipos":["motor","injecao","revisao","cambio","cabecote","freios","suspensao","oleo","outros"]},"retifica":{"ramo":"automotivo","tipos":["motor","cabecote","virabrequim","pistao","bloco","outros"]},"autoeletrica":{"ramo":"automotivo","tipos":["eletrica","bateria","injecao","iluminacao","outros"]},"autocenter":{"ramo":"automotivo","tipos":["revisao","pneus","alinhamento","freios","suspensao","oleo","motor","cambio","outros"]},"borracharia":{"ramo":"automotivo","tipos":["pneus","alinhamento","outros"]},"estetica":{"ramo":"automotivo","tipos":["polimento","higienizacao","lavagem","pintura","outros"]},"lava_rapido":{"ramo":"automotivo","tipos":["lavagem","higienizacao","polimento","outros"]},"troca_oleo":{"ramo":"automotivo","tipos":["oleo","revisao","outros"]},"acessorios":{"ramo":"automotivo","tipos":["acessorios","iluminacao","eletrica","outros"]},"funilaria":{"ramo":"automotivo","tipos":["funilaria","pintura","polimento","outros"]},"assistencia_geral":{"ramo":"assistencia_tecnica","tipos":["celular","computador","eletrodomestico","placa","software","outros"]},"manutencao_geral":{"ramo":"manutencao_campo","tipos":["climatizacao","eletrica","hidraulica","instalacao","preventiva","corretiva","outros"]},"limpeza_geral":{"ramo":"limpeza","tipos":["residencial","comercial","pos_obra","estofados","vidros","higienizacao","outros"]}}'::jsonb $catalogo$;
alter table public.oficinas add column especialidade text;
update public.oficinas set especialidade=case ramo when 'automotivo' then 'mecanica' when 'assistencia_tecnica' then 'assistencia_geral' when 'manutencao_campo' then 'manutencao_geral' else 'limpeza_geral' end;
update public.oficinas set especialidade='retifica' where id='e898f8dc-5e29-50d5-a746-7929f8cef4ab';
create function private.validar_especialidade_empresa() returns trigger language plpgsql set search_path='' as $$ begin
 if new.especialidade is null then new.especialidade:=case new.ramo when 'automotivo' then 'mecanica' when 'assistencia_tecnica' then 'assistencia_geral' when 'manutencao_campo' then 'manutencao_geral' else 'limpeza_geral' end;end if;
 if new.especialidade is not null and (private.catalogo_especialidades()->new.especialidade->>'ramo') is distinct from new.ramo then raise exception 'Especialidade incompatível com o ramo.' using errcode='22023';end if;return new;end $$;
create trigger validar_especialidade_empresa before insert or update of ramo,especialidade on public.oficinas for each row execute function private.validar_especialidade_empresa();
create function public.configurar_nova_empresa(p_chave uuid,p_nome text,p_telefone text,p_endereco jsonb,p_ramo text,p_especialidade text) returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid;begin
 if p_especialidade is null or (private.catalogo_especialidades()->p_especialidade->>'ramo') is distinct from p_ramo then raise exception 'Selecione uma especialidade válida para o ramo.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_chave::text,0));
 select oficina_id into w from public.cadastros_oficina where usuario_id=auth.uid() and chave=p_chave;
 if found then if (select especialidade from public.oficinas where id=w) is distinct from p_especialidade then raise exception 'Cadastro já concluído com outra especialidade.' using errcode='22023';end if;return w;end if;
 w:=public.configurar_nova_oficina(p_chave,p_nome,p_telefone,p_endereco);
 update public.oficinas set ramo=p_ramo,especialidade=p_especialidade where id=w;return w;end $$;
revoke all on function public.configurar_nova_empresa(uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.configurar_nova_empresa(uuid,text,text,jsonb,text,text) to authenticated;
revoke execute on function public.configurar_nova_empresa(uuid,text,text,jsonb,text) from authenticated;
create function public.salvar_especialidade_empresa(p_oficina uuid,p_especialidade text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.exigir_gestao(p_oficina,'customers');
 if p_especialidade is null or not(private.catalogo_especialidades() ? p_especialidade) then raise exception 'Selecione a especialidade.' using errcode='22023';end if;
 update public.oficinas set especialidade=p_especialidade where id=p_oficina;end $$;
revoke all on function public.salvar_especialidade_empresa(uuid,text) from public,anon;
grant execute on function public.salvar_especialidade_empresa(uuid,text) to authenticated;
alter table public.ordens_servico add column tipo_servico text, add column detalhes_especialidade text not null default '' check(length(detalhes_especialidade)<=3000);
create function private.validar_tipo_servico() returns trigger language plpgsql security definer set search_path='' as $$
declare tipo text; anterior text; especialidade text;begin
 if tg_table_name='ordens_servico' then tipo:=new.tipo_servico; if tg_op='UPDATE' then anterior:=old.tipo_servico;end if;
 else tipo:=new.dados->>'tipo_servico';if tg_op='UPDATE' then anterior:=old.dados->>'tipo_servico';end if;end if;
 if tipo is null or tipo='' or (tg_op='UPDATE' and tipo is not distinct from anterior) then return new;end if;
 select o.especialidade into especialidade from public.oficinas o where o.id=new.oficina_id;
 if not coalesce(private.catalogo_especialidades()->especialidade->'tipos' ? tipo,false) then raise exception 'Tipo de serviço incompatível com a especialidade da empresa.' using errcode='22023';end if;return new;end $$;
create trigger validar_tipo_servico before insert or update on public.ordens_servico for each row execute function private.validar_tipo_servico();
create trigger validar_tipo_servico before insert or update on public.atendimentos_servicos for each row execute function private.validar_tipo_servico();
create or replace function public.consultar_meu_acesso()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'ramo',o.ramo,'especialidade',o.especialidade,'perfil',m.perfil,
 'codigo_plano',s.codigo_plano,'nome_plano',p.nome,'situacao',s.situacao,'valido_ate',s.valido_ate,
 'recursos',(select coalesce(jsonb_agg(r.codigo order by r.codigo),'[]'::jsonb) from public.recursos r where private.has_feature(o.id,r.codigo))) order by o.nome,o.id),'[]'::jsonb)
 from public.membros_oficina m join public.oficinas o on o.id=m.oficina_id
 left join public.assinaturas_oficina s on s.oficina_id=o.id left join public.planos p on p.codigo=s.codigo_plano
 where m.usuario_id=auth.uid() and m.ativo and o.arquivado_em is null;
$$;

create or replace function public.salvar_ordem_servico(p_oficina uuid,p_dados jsonb,p_chave uuid,p_os uuid default null,p_revisao integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; w public.ordens_servico%rowtype; c public.clientes%rowtype; v public.veiculos%rowtype; n bigint; id_os uuid; campo text; begin
 u:=private.exigir_os(p_oficina);
 foreach campo in array array['queixa_cliente','diagnostico','observacoes_internas','resumo_cliente','pertences','condicoes_garantia'] loop if length(p_dados->>campo)>5000 then raise exception 'Texto muito longo' using errcode='22023'; end if; end loop;
 if length(p_dados->>'responsavel')>160 or length((p_dados->'checklist')::text)>2000 then raise exception 'Dados inválidos' using errcode='22023'; end if;
 if p_os is null then
  if p_chave is null then raise exception 'Chave obrigatória' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
  select id into id_os from public.ordens_servico where oficina_id=p_oficina and chave_criacao=p_chave; if found then return public.consultar_ordem_servico(p_oficina,id_os); end if;
  select * into c from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid and arquivado_em is null;
  select * into v from public.veiculos where oficina_id=p_oficina and id=(p_dados->>'veiculo_id')::uuid and arquivado_em is null;
  if c.id is null or v.id is null or not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=c.id and veiculo_id=v.id and encerrado_em is null) then raise exception 'Selecione cliente e veículo vinculados' using errcode='22023'; end if;
  update public.oficinas set proximo_numero_os=proximo_numero_os+1 where id=p_oficina returning proximo_numero_os-1 into n;
  insert into public.ordens_servico(oficina_id,numero,cliente_id,veiculo_id,dados_cliente,dados_veiculo,criado_por,chave_criacao,recebido_em) values(p_oficina,n,c.id,v.id,jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164),jsonb_build_object('modelo',v.modelo,'marca',v.marca,'placa',v.placa),u,p_chave,now()) returning * into w;
 else
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada' using errcode='P0002'; end if;
  if p_revisao is distinct from w.revisao then raise exception 'OS alterada. Reabra antes de salvar.' using errcode='40001'; end if;
 end if;
 if w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada: histórico preservado' using errcode='22023'; end if;
 update public.ordens_servico set tipo_servico=case when p_dados ? 'tipo_servico' then nullif(p_dados->>'tipo_servico','') else tipo_servico end,detalhes_especialidade=case when p_dados ? 'detalhes_especialidade' then coalesce(p_dados->>'detalhes_especialidade','') else detalhes_especialidade end,queixa_cliente=p_dados->>'queixa_cliente',diagnostico=p_dados->>'diagnostico',observacoes_internas=p_dados->>'observacoes_internas',resumo_cliente=p_dados->>'resumo_cliente',responsavel=p_dados->>'responsavel',prioridade=coalesce(p_dados->>'prioridade','normal'),quilometragem_entrada=nullif(p_dados->>'quilometragem_entrada','')::integer,quilometragem_saida=nullif(p_dados->>'quilometragem_saida','')::integer,combustivel_percentual=nullif(p_dados->>'combustivel_percentual','')::smallint,pertences=p_dados->>'pertences',entrega_prevista_em=nullif(p_dados->>'entrega_prevista_em','')::timestamptz,condicoes_garantia=p_dados->>'condicoes_garantia',garantia_ate=nullif(p_dados->>'garantia_ate','')::date,checklist=coalesce(p_dados->'checklist','{}') where id=w.id;
 perform private.evento_os(p_oficina,w.id,case when p_os is null then 'Ordem de serviço aberta.' else 'Dados do atendimento atualizados.' end,jsonb_build_object('antes',to_jsonb(w),'depois',p_dados));
 return public.consultar_ordem_servico(p_oficina,w.id);
end $$;
commit;
