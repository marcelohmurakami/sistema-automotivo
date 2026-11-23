begin;

-- Exporta as três origens de horas e as comissões já existentes. Não recalcula
-- versões exportadas nem gera pagamentos, rubricas legais ou transmissões.
create or replace function public.consultar_departamento_pessoal(p_oficina uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare funcionarios jsonb; inicio_periodo timestamptz; fim_periodo timestamptz;
begin
 perform private.exigir_produtividade_equipe(p_oficina);
 if p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim) or p_fim<p_inicio or p_fim-p_inicio>30 then
  raise exception 'Escolha até 31 dias para o departamento pessoal.' using errcode='22023';
 end if;
 if (select count(*) from public.funcionarios where oficina_id=p_oficina)>1000 then
  raise exception 'Exportação limitada a 1.000 funcionários por empresa.' using errcode='22023';
 end if;
 inicio_periodo:=p_inicio::timestamp at time zone 'America/Sao_Paulo';
 fim_periodo:=(p_fim+1)::timestamp at time zone 'America/Sao_Paulo';
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'matricula',f.dados->>'matricula','ativo',f.ativo,
  'admissao',f.admissao,'desligamento',f.desligamento,'salario_base_atual',f.salario_centavos,
  'periodicidade',f.dados->>'salario_periodicidade','jornada_informada',f.dados->>'jornada','vinculo_informado',f.dados->>'vinculo') order by f.nome,f.id),'[]')
 into funcionarios from public.funcionarios f where oficina_id=p_oficina;
 return jsonb_build_object(
  'versao','patio.dp.v1','finalidade','Preparação para conferência do contador e integração futura; não é folha calculada, ponto legal ou transmissão ao eSocial.',
  'inicio',p_inicio,'fim',p_fim,'funcionarios',funcionarios,
  'lancamentos',(select coalesce(jsonb_agg(to_jsonb(x) order by competencia,id),'[]') from public.lancamentos_departamento_pessoal x where oficina_id=p_oficina and competencia between p_inicio and p_fim),
  'ocorrencias',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'funcionario_id',r.funcionario_id,'tipo',r.tipo,
   'inicio',r.inicio,'fim',r.fim,'situacao',r.situacao,'valor_centavos',r.valor_centavos,
   'descricao',case when r.tipo='salario' then r.descricao else null end) order by inicio,r.id),'[]')
   from public.registros_funcionario r where oficina_id=p_oficina and inicio<=p_fim and coalesce(fim,inicio)>=p_inicio and tipo in ('ausencia','ferias','afastamento','salario','vale','emprestimo')),
  'horas_produtivas',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'funcionario_id',h.funcionario_id,
   'usuario_id',h.usuario_id,'documento_id',h.documento_id,'origem',h.origem,'em_aberto',h.fim is null,
   'inicio',greatest(h.inicio,inicio_periodo),'fim',case when h.fim is not null then least(h.fim,fim_periodo) end,
   'minutos',case when h.fim is not null then extract(epoch from(least(h.fim,fim_periodo)-greatest(h.inicio,inicio_periodo)))/60 end,
   'cancelado_em',h.cancelado_em) order by h.inicio,h.origem,h.id),'[]')
   from private.horas_exportacao_equipe h where oficina_id=p_oficina and inicio<fim_periodo and coalesce(fim,'infinity')>inicio_periodo),
  'comissoes',(select coalesce(jsonb_agg(to_jsonb(c) order by c.data,c.nome,c.id),'[]') from private.comissoes_exportacao_equipe c
   where c.oficina_id=p_oficina and c.data between p_inicio and p_fim and c.valor_centavos>0),
  'pendencias',jsonb_build_array('Conferir salário e vigência das alterações com o contador.',
   'Definir rubricas, encargos, convenção coletiva e regras do provedor.',
   'Horas produtivas não equivalem a jornada ou ponto legal. Registros em aberto não têm duração final.',
   'Conferir horas sem funcionário identificado e comissões sem vínculo com o cadastro de pessoal.',
   'Vales e empréstimos são informativos: nenhum desconto automático foi feito.',
   'Conectar e homologar provedor de folha/eSocial/ponto; nenhuma transmissão realizada.'),
  'exportacoes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select id,inicio,fim,hash,criado_em from public.exportacoes_departamento_pessoal where oficina_id=p_oficina order by criado_em desc,id limit 20)x)
 );
end $$;

-- Uma resposta de rede perdida não deve criar outro certificado na repetição.
-- Só aceita a criação repetida quando TODOS os dados persistidos são iguais.
do $$declare s text; alvo text:='if q.revisao is distinct from p_revisao then'; begin
 s:=pg_get_functiondef('public.salvar_qualificacao_equipe(uuid,uuid,jsonb,integer)'::regprocedure);
 if position(alvo in s)=0 then raise exception 'Contrato de qualificação mudou.';end if;
 s:=replace(s,alvo,$sql$
 if p_revisao is null and q.revisao=1 and q.oficina_id=p_oficina and q.funcionario_id=fid
  and q.habilidade=k and q.nivel=(p_dados->>'nivel')::integer and q.realizada_em=r
  and q.valida_ate is not distinct from v and q.comprovante=coalesce(p_dados->>'comprovante','')
  and q.situacao=p_dados->>'situacao' and q.observacoes=coalesce(p_dados->>'observacoes','') then return;end if;
 if q.revisao is distinct from p_revisao then$sql$);
 execute s;
 s:=pg_get_functiondef('public.registrar_horas_equipe(uuid,uuid,uuid,uuid,timestamptz,timestamptz,bigint,text)'::regprocedure);
 execute replace(s,'Já apá tempo da OS','Já há tempo da OS');
end $$;

notify pgrst,'reload schema';
commit;
