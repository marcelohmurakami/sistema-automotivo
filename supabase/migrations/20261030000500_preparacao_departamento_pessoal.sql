begin;
create table public.lancamentos_departamento_pessoal (
 id uuid primary key,oficina_id uuid not null,funcionario_id uuid not null,competencia date not null,
 natureza text not null check(natureza in ('provento','desconto','informativo')),rubrica text not null check(length(trim(rubrica)) between 2 and 120),
 valor_centavos bigint not null check(valor_centavos between 0 and 1000000000),referencia text not null check(length(trim(referencia)) between 3 and 1000),
 cancelado_em timestamptz,motivo_cancelamento text,autor uuid not null references auth.users(id),criado_em timestamptz not null default now(),
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id)
);
create index lancamentos_dp_periodo on public.lancamentos_departamento_pessoal(oficina_id,competencia,funcionario_id);
create table public.exportacoes_departamento_pessoal (
 id uuid primary key,oficina_id uuid not null references public.oficinas(id),inicio date not null,fim date not null,
 dados jsonb not null,hash text not null,autor uuid not null references auth.users(id),criado_em timestamptz not null default now()
);
create index exportacoes_dp_periodo on public.exportacoes_departamento_pessoal(oficina_id,criado_em desc);
create trigger exportacao_dp_imutavel before update or delete on public.exportacoes_departamento_pessoal for each row execute function private.reject_mutation();
create function public.lancar_departamento_pessoal(p_oficina uuid,p_id uuid,p_dados jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare f uuid:=(p_dados->>'funcionario_id')::uuid;dia date:=(p_dados->>'competencia')::date;a public.lancamentos_departamento_pessoal;begin
 perform private.exigir_produtividade_equipe(p_oficina);perform pg_advisory_xact_lock(hashtextextended('dp:'||p_id,0));
 if p_id is null or jsonb_typeof(p_dados) is distinct from 'object' or octet_length(p_dados::text)>8000 or dia is null or not isfinite(dia) or coalesce(p_dados->>'natureza','') not in ('provento','desconto','informativo') or coalesce(p_dados->>'valor_centavos','')!~'^\d{1,10}$' or (p_dados->>'valor_centavos')::bigint>1000000000 or length(trim(coalesce(p_dados->>'rubrica',''))) not between 2 and 120 or length(trim(coalesce(p_dados->>'referencia',''))) not between 3 and 1000 then raise exception 'Confira funcionário, competência, rubrica, valor e referência.' using errcode='22023';end if;
 if not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=f) then raise exception 'Funcionário indisponível.' using errcode='42501';end if;
 select * into a from public.lancamentos_departamento_pessoal where id=p_id;
 if found then if a.oficina_id<>p_oficina or a.funcionario_id<>f or a.competencia<>dia or a.natureza<>p_dados->>'natureza' or a.rubrica<>trim(p_dados->>'rubrica') or a.valor_centavos<>(p_dados->>'valor_centavos')::bigint or a.referencia<>trim(p_dados->>'referencia') then raise exception 'Chave já utilizada em outro lançamento.' using errcode='PT409';end if;return p_id;end if;
 insert into public.lancamentos_departamento_pessoal(id,oficina_id,funcionario_id,competencia,natureza,rubrica,valor_centavos,referencia,autor) values(p_id,p_oficina,f,dia,p_dados->>'natureza',trim(p_dados->>'rubrica'),(p_dados->>'valor_centavos')::bigint,trim(p_dados->>'referencia'),auth.uid());return p_id;
end $$;
create function public.cancelar_lancamento_dp(p_oficina uuid,p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_produtividade_equipe(p_oficina);if length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Informe o motivo da correção.' using errcode='22023';end if;
 update public.lancamentos_departamento_pessoal set cancelado_em=now(),motivo_cancelamento=trim(p_motivo) where oficina_id=p_oficina and id=p_id and cancelado_em is null;
 if not found and not exists(select 1 from public.lancamentos_departamento_pessoal where oficina_id=p_oficina and id=p_id) then raise exception 'Lançamento indisponível.' using errcode='42501';end if;
end $$;
create view private.horas_exportacao_equipe as
 select oficina_id,id,documento_id,funcionario_id,null::uuid usuario_id,inicio,fim,cancelado_em,'producao'::text origem from public.horas_producao_equipe
 union all select oficina_id,id,atendimento_id,funcionario_id,null::uuid,inicio,fim,null::timestamptz,'atendimento' from public.horas_atendimento
 union all select h.oficina_id,h.id,h.ordem_servico_id,case when a.dados->'fontes'->>('hora:'||h.id) ~ '^[0-9a-f-]{36}$' then (a.dados->'fontes'->>('hora:'||h.id))::uuid else null::uuid end,h.usuario_id,h.iniciado_em,h.encerrado_em,null::timestamptz,'os' from public.apontamentos_tempo h left join public.atribuicoes_equipe a on a.oficina_id=h.oficina_id and a.documento_id=h.ordem_servico_id;
create view private.comissoes_exportacao_equipe as
 select e.oficina_id,e.id,e.atendimento_id documento_id,e.funcionario_id,f.nome,e.comissao_centavos valor_centavos,e.titulo_id,d.data from public.equipe_atendimento e join public.funcionarios f on f.id=e.funcionario_id join private.documentos_custeio d on d.oficina_id=e.oficina_id and d.id=e.atendimento_id where e.comissao_centavos>0
 union all select c.oficina_id,c.id,c.ordem_servico_id,null::uuid,c.nome_profissional,c.total_centavos,(select t.id from public.titulos_financeiros t where t.oficina_id=c.oficina_id and t.comissao_id=c.id and t.cancelado_em is null limit 1),d.data from public.comissoes_servico c join private.documentos_custeio d on d.oficina_id=c.oficina_id and d.id=c.ordem_servico_id;
create function public.consultar_departamento_pessoal(p_oficina uuid,p_inicio date,p_fim date) returns jsonb language plpgsql security definer set search_path='' as $$
declare funcionarios jsonb;begin
 perform private.exigir_produtividade_equipe(p_oficina);if p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim) or p_fim<p_inicio or p_fim-p_inicio>30 then raise exception 'Escolha até 31 dias para o departamento pessoal.' using errcode='22023';end if;
 if (select count(*) from public.funcionarios where oficina_id=p_oficina)>1000 then raise exception 'Exportação limitada a 1.000 funcionários por empresa.' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'matricula',f.dados->>'matricula','ativo',f.ativo,'admissao',f.admissao,'desligamento',f.desligamento,'salario_base_atual',f.salario_centavos,'periodicidade',f.dados->>'salario_periodicidade','jornada_informada',f.dados->>'jornada','vinculo_informado',f.dados->>'vinculo') order by f.nome),'[]') into funcionarios from public.funcionarios f where oficina_id=p_oficina;
 return jsonb_build_object('versao','patio.dp.v1','finalidade','Preparação para conferência do contador e integração futura; não é folha calculada, ponto legal ou transmissão ao eSocial.','inicio',p_inicio,'fim',p_fim,'funcionarios',funcionarios,
 'lancamentos',(select coalesce(jsonb_agg(to_jsonb(x) order by competencia,id),'[]') from public.lancamentos_departamento_pessoal x where oficina_id=p_oficina and competencia between p_inicio and p_fim),
 'ocorrencias',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'funcionario_id',r.funcionario_id,'tipo',r.tipo,'inicio',r.inicio,'fim',r.fim,'situacao',r.situacao,'valor_centavos',r.valor_centavos,'descricao',case when r.tipo='salario' then r.descricao else null end) order by inicio,r.id),'[]') from public.registros_funcionario r where oficina_id=p_oficina and inicio<=p_fim and coalesce(fim,inicio)>=p_inicio and tipo in ('ausencia','ferias','afastamento','salario','vale','emprestimo')),
 'horas_produtivas',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'funcionario_id',h.funcionario_id,'documento_id',h.documento_id,'inicio',greatest(h.inicio,p_inicio::timestamp at time zone 'America/Sao_Paulo'),'fim',case when h.fim is not null then least(h.fim,(p_fim+1)::timestamp at time zone 'America/Sao_Paulo') end,'minutos',extract(epoch from(case when h.fim is not null then least(h.fim,(p_fim+1)::timestamp at time zone 'America/Sao_Paulo') end-greatest(h.inicio,p_inicio::timestamp at time zone 'America/Sao_Paulo')))/60,'cancelado_em',h.cancelado_em)),'[]') from public.horas_producao_equipe h where oficina_id=p_oficina and inicio<((p_fim+1)::timestamp at time zone 'America/Sao_Paulo') and fim>(p_inicio::timestamp at time zone 'America/Sao_Paulo')),
 'pendencias',jsonb_build_array('Conferir salário e vigência das alterações com o contador.','Definir rubricas, encargos, convenção coletiva e regras do provedor.','Horas produtivas não equivalem a jornada ou ponto legal.','Vales e empréstimos são informativos: nenhum desconto automático foi feito.','Conectar e homologar provedor de folha/eSocial/ponto; nenhuma transmissão realizada.'),
 'exportacoes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select id,inicio,fim,hash,criado_em from public.exportacoes_departamento_pessoal where oficina_id=p_oficina order by criado_em desc limit 20)x));
end $$;
create function public.exportar_departamento_pessoal(p_oficina uuid,p_id uuid,p_inicio date,p_fim date) returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.exportacoes_departamento_pessoal;d jsonb;begin
 perform private.exigir_produtividade_equipe(p_oficina);if p_id is null then raise exception 'Identificador obrigatório.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dp-export:'||p_id,0));select * into x from public.exportacoes_departamento_pessoal where id=p_id;
 if found then if x.oficina_id<>p_oficina or x.inicio<>p_inicio or x.fim<>p_fim then raise exception 'Exportação já utilizada.' using errcode='PT409';end if;return to_jsonb(x)||jsonb_build_object('dados_canonicos',x.dados::text);end if;
 d:=public.consultar_departamento_pessoal(p_oficina,p_inicio,p_fim)-'exportacoes';
 insert into public.exportacoes_departamento_pessoal values(p_id,p_oficina,p_inicio,p_fim,d,encode(sha256(convert_to(d::text,'UTF8')),'hex'),auth.uid(),now()) returning * into x;return to_jsonb(x)||jsonb_build_object('dados_canonicos',x.dados::text);
end $$;
create function public.obter_exportacao_dp(p_oficina uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_produtividade_equipe(p_oficina);return (select to_jsonb(x)||jsonb_build_object('dados_canonicos',x.dados::text) from public.exportacoes_departamento_pessoal x where oficina_id=p_oficina and id=p_id);
end $$;
do $$declare t text;r record;begin
 foreach t in array array['lancamentos_departamento_pessoal','exportacoes_departamento_pessoal'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('lancar_departamento_pessoal','cancelar_lancamento_dp','consultar_departamento_pessoal','exportar_departamento_pessoal','obter_exportacao_dp') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;
end $$;
revoke all on private.horas_exportacao_equipe,private.comissoes_exportacao_equipe from public,anon,authenticated;
notify pgrst,'reload schema';commit;
