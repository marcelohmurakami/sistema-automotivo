-- PostgreSQL 17: funções SQL não incorporadas refazem o plano por consulta externa.
-- Mantém corpo, volatilidade, SECURITY DEFINER/INVOKER, search_path e ACLs.
-- Somente planos são reutilizados; permissões, MFA, assinatura e valores são lidos a cada chamada.
begin;
CREATE OR REPLACE FUNCTION private.acesso_area(w uuid, area text, escrita boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin return (select private.segundo_fator_ok() and (exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=auth.uid() and ativo and perfil='owner')
 or coalesce((select case when escrita then regras->>area not in ('nenhum','leitura') else regras->>area<>'nenhum' end from public.restricoes_acesso where oficina_id=w and usuario_id=auth.uid()),true))); end;
$function$
;

CREATE OR REPLACE FUNCTION private.has_feature(p_workshop_id uuid, p_feature text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin return (select exists(select 1 from public.assinaturas_oficina s
    join public.recursos_plano f on f.codigo_plano=s.codigo_plano
    join public.planos p on p.codigo=s.codigo_plano
    join public.oficinas o on o.id=s.oficina_id and o.arquivado_em is null
    where s.oficina_id=p_workshop_id and s.situacao in ('active','trialing')
      and (s.valido_ate is null or s.valido_ate>now()) and p.ativo
      and f.codigo_recurso=p_feature and f.habilitado)); end;
$function$
;

CREATE OR REPLACE FUNCTION private.segundo_fator_ok()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin return (select auth.uid() is null or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
 or coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','')='aal2'); end;
$function$
;

CREATE OR REPLACE FUNCTION public.consultar_meu_acesso()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin return (select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'ramo',o.ramo,'especialidade',o.especialidade,'perfil',m.perfil,'padrao',m.empresa_padrao,
 'codigo_plano',s.codigo_plano,'nome_plano',p.nome,'situacao',s.situacao,'valido_ate',s.valido_ate,
 'recursos',(select coalesce(jsonb_agg(r.codigo order by r.codigo),'[]'::jsonb) from public.recursos r where private.has_feature(o.id,r.codigo) and private.acesso_area(o.id,case r.codigo when 'customers' then 'clientes' when 'catalog' then 'catalogo' when 'quotes' then 'orcamentos' when 'finance' then 'financeiro' when 'inventory' then 'estoque' when 'reports' then 'relatorios' when 'employee_reports' then 'equipe' when 'service_media' then 'arquivos' when 'website' then 'site' when 'automations' then 'integracoes' when 'ai' then 'integracoes' else 'atendimentos' end,false))) order by m.empresa_padrao desc,o.nome,o.id),'[]'::jsonb)
 from public.membros_oficina m join public.oficinas o on o.id=m.oficina_id
 left join public.assinaturas_oficina s on s.oficina_id=o.id left join public.planos p on p.codigo=s.codigo_plano
 where m.usuario_id=auth.uid() and m.ativo and o.arquivado_em is null); end;
$function$
;

CREATE OR REPLACE FUNCTION private.candidatos_retorno(p_oficina uuid)
 RETURNS TABLE(origem text, origem_id uuid, cliente_id uuid, veiculo_id uuid, descricao text, valor_centavos bigint, data_referencia date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin return query
select 'orcamento',q.id,q.cliente_id,q.veiculo_id,'Orçamento #'||q.numero,v.total_centavos,coalesce(v.expira_em,v.publicado_em)::date from public.orcamentos q join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id where q.oficina_id=p_oficina and (q.situacao in ('declined','expired') or (q.situacao='awaiting_approval' and v.publicado_em<now()-interval '1 day'))
 union all
 select 'adiados',q.id,q.cliente_id,q.veiculo_id,'Serviços adiados · orçamento #'||q.numero,v.total_centavos-a.total_aprovado_centavos,a.confirmado_em::date from public.orcamentos q join public.versoes_orcamento v on v.id=q.versao_atual_id and v.oficina_id=q.oficina_id join public.aprovacoes_orcamento a on a.oficina_id=q.oficina_id and a.versao_orcamento_id=v.id where q.oficina_id=p_oficina and q.situacao='approved' and a.grupos_aprovados is not null and exists(select 1 from public.itens_orcamento i where i.oficina_id=q.oficina_id and i.versao_orcamento_id=v.id and not i.grupo_servico=any(a.grupos_aprovados))
 union all
 select 'manutencao',m.id,o.cliente_id,o.veiculo_id,m.descricao,0::bigint,m.data_prevista from public.manutencoes_programadas m join public.ordens_servico o on o.oficina_id=m.oficina_id and o.id=m.ordem_servico_id where m.oficina_id=p_oficina and m.concluida_em is null and (m.data_prevista<=current_date+30 or m.data_prevista is null)
 union all
 select 'retirada',o.id,o.cliente_id,o.veiculo_id,'Serviço pronto — combinar retirada · OS #'||o.numero,o.total_centavos,(o.concluido_em at time zone 'America/Sao_Paulo')::date from public.ordens_servico o where o.oficina_id=p_oficina and o.situacao='ready';
end;
$function$
;

CREATE OR REPLACE FUNCTION private.detalhes_atendimento_json(a public.atendimentos_servicos, gerente boolean, equipe boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin return (select jsonb_build_object('atendimento',to_jsonb(a),'cliente',(select jsonb_build_object('nome',nome,'telefone',telefone_e164) from public.clientes where id=a.cliente_id),'objeto',(select to_jsonb(o) from public.objetos_atendimento o where id=a.objeto_id),
 'itens',(select coalesce(jsonb_agg(case when gerente then to_jsonb(i) else to_jsonb(i)-'custo_centavos' end order by i.tipo,i.descricao,i.id),'[]') from public.itens_atendimento_servico i where atendimento_id=a.id),
 'comercial',case when gerente then coalesce((select to_jsonb(c) from public.comercial_atendimento c where atendimento_id=a.id),'{}')||jsonb_build_object('comissao_total_centavos',(select coalesce(sum(comissao_centavos),0) from public.equipe_atendimento where atendimento_id=a.id)) else jsonb_build_object('desconto_centavos',(select desconto_centavos from public.comercial_atendimento where atendimento_id=a.id)) end,
 'equipe',(select coalesce(jsonb_agg((case when equipe then to_jsonb(e) else to_jsonb(e)-'percentual'-'comissao_centavos'-'titulo_id' end || jsonb_build_object('nome',f.nome)) - case when gerente then 'campo_inexistente' else 'custo_hora_centavos' end order by f.nome),'[]') from public.equipe_atendimento e join public.funcionarios f on f.id=e.funcionario_id where atendimento_id=a.id),
 'horas',(select coalesce(jsonb_agg(to_jsonb(h) order by inicio desc),'[]') from public.horas_atendimento h where atendimento_id=a.id),
 'qualidade',case when gerente then (select coalesce(jsonb_agg(to_jsonb(q) order by aberto_em desc),'[]') from public.qualidade_atendimento q where atendimento_id=a.id) else '[]'::jsonb end,
 'eventos',(select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') from (select tipo,antes,depois,criado_em,id from public.eventos_atendimento where atendimento_id=a.id and (gerente or tipo in ('situacao','etapa')) order by id desc limit 100)x))); end;
$function$
;
commit;

