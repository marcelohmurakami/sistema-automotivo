begin;
create or replace function public.salvar_atendimento_servico(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos%rowtype; begin
 perform private.exigir_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if a.id is not null and a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado. Atualize a tela.' using errcode='40001'; end if;
 if not exists(select 1 from public.objetos_atendimento where oficina_id=p_oficina and id=(p_dados->>'objeto_id')::uuid and cliente_id=(p_dados->>'cliente_id')::uuid and (not arquivado or id=a.objeto_id)) then raise exception 'Selecione um cadastro ativo deste cliente.' using errcode='22023'; end if;
 if exists(select 1 from public.cobrancas_atendimento c join public.titulos_financeiros t on t.id=c.titulo_id where c.atendimento_id=p_id and t.cancelado_em is null) and
 ((p_dados->>'valor_centavos')::bigint is distinct from a.valor_centavos or p_dados->>'situacao'='cancelado' or (p_dados->>'cliente_id')::uuid is distinct from a.cliente_id) then raise exception 'Atendimento faturado: ajuste a cobrança no financeiro antes de alterar o contrato.' using errcode='22023'; end if;
 insert into public.atendimentos_servicos(id,oficina_id,cliente_id,objeto_id,titulo,situacao,dados,valor_centavos,vencimento)
 values(p_id,p_oficina,(p_dados->>'cliente_id')::uuid,(p_dados->>'objeto_id')::uuid,trim(p_dados->>'titulo'),p_dados->>'situacao',coalesce(p_dados->'dados','{}'),(p_dados->>'valor_centavos')::bigint,(p_dados->>'vencimento')::date)
 on conflict(id) do update set cliente_id=excluded.cliente_id,objeto_id=excluded.objeto_id,titulo=excluded.titulo,situacao=excluded.situacao,dados=excluded.dados,valor_centavos=excluded.valor_centavos,vencimento=excluded.vencimento,revisao=atendimentos_servicos.revisao+1 where atendimentos_servicos.oficina_id=p_oficina;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501'; end if;
 if p_dados->>'situacao'='cancelado' then update public.agenda_servicos set situacao='cancelado',revisao=revisao+1 where oficina_id=p_oficina and atendimento_id=p_id and situacao in ('agendado','confirmado'); end if;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,auth.uid(),'user','servico.salvo','atendimento',p_id,gen_random_uuid());
 return p_id;
end $$;
create or replace function public.salvar_agenda_servico(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.agenda_servicos%rowtype; ri uuid:=(p_dados->>'recurso_id')::uuid; ini timestamptz:=(p_dados->>'inicio')::timestamptz; fimv timestamptz:=(p_dados->>'fim')::timestamptz; begin
 perform private.exigir_servicos(p_oficina);
 -- Serializa as reservas da empresa, inclusive remarcações entre equipes.
 perform pg_advisory_xact_lock(hashtextextended('agenda:'||p_oficina::text,0));
 select * into a from public.agenda_servicos where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if a.id is not null and a.revisao is distinct from p_revisao then raise exception 'Agendamento alterado. Atualize a tela.' using errcode='40001'; end if;
 perform 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=(p_dados->>'atendimento_id')::uuid for update;
 if not exists(select 1 from public.recursos_agenda where oficina_id=p_oficina and id=ri and (ativo or (a.recurso_id=ri and p_dados->>'situacao' in ('cancelado','concluido','faltou')))) or not exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=(p_dados->>'atendimento_id')::uuid and (situacao<>'cancelado' or (a.atendimento_id=id and p_dados->>'situacao'='cancelado'))) then raise exception 'Equipe ou atendimento indisponível.' using errcode='22023'; end if;
 if p_dados->>'situacao' in ('agendado','confirmado') and exists(select 1 from public.agenda_servicos where oficina_id=p_oficina and recurso_id=ri and id<>p_id and situacao in ('agendado','confirmado') and inicio<fimv and fim>ini) then raise exception 'Esta equipe já tem um atendimento nesse horário.' using errcode='23P01'; end if;
 insert into public.agenda_servicos(id,oficina_id,atendimento_id,recurso_id,inicio,fim,situacao,observacoes)
 values(p_id,p_oficina,(p_dados->>'atendimento_id')::uuid,ri,ini,fimv,p_dados->>'situacao',coalesce(p_dados->>'observacoes',''))
 on conflict(id) do update set atendimento_id=excluded.atendimento_id,recurso_id=excluded.recurso_id,inicio=excluded.inicio,fim=excluded.fim,situacao=excluded.situacao,observacoes=excluded.observacoes,revisao=agenda_servicos.revisao+1 where agenda_servicos.oficina_id=p_oficina;
 if not found then raise exception 'Agendamento indisponível.' using errcode='42501'; end if;
 return p_id;
end $$;
notify pgrst,'reload schema';
commit;
