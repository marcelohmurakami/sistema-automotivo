begin;

-- Restrições complementares: nunca ampliam o papel ou o plano existente.
create table public.restricoes_acesso (
 oficina_id uuid not null references public.oficinas(id), usuario_id uuid not null references auth.users(id),
 regras jsonb not null default '{}', revisao integer not null default 1,
 atualizado_em timestamptz not null default now(), autor uuid not null references auth.users(id),
 primary key(oficina_id,usuario_id), check(jsonb_typeof(regras)='object')
);
alter table public.restricoes_acesso enable row level security;
revoke all on public.restricoes_acesso from public,anon,authenticated;

create function private.segundo_fator_ok() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is null or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
 or coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','')='aal2';
$$;
create function private.exigir_segundo_fator() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not private.segundo_fator_ok() then raise exception 'Confirme o código do seu autenticador para continuar.' using errcode='PT403';end if;
end $$;

create function private.modulo_operacao(nome text) returns text language sql immutable set search_path='' as $$
select case
 when nome ~ '(lucro|custo|financeir|cobranca|pagamento|baixar_titulo|estornar|concili|apuracao|comiss|contrato)' then 'financeiro'
 when nome ~ '(relatorio|analitico|indicador)' then 'relatorios'
 when nome ~ '(compra|estoque|fornecedor|suprimento|cotacao|deposito)' then 'estoque'
 when nome ~ '(funcionario|equipe|qualificacao|escala|departamento|atribuicao|horas_)' then 'equipe'
 when nome ~ '(cliente|veiculo|objeto)' then 'clientes'
 when nome ~ '(catalogo)' then 'catalogo'
 when nome ~ '(orcamento|proposta)' then 'orcamentos'
 when nome ~ '(agenda|produtividade|recorrencia|trajeto|recurso)' then 'agenda'
 when nome ~ '(arquivo|foto|anexo|vistoria)' then 'arquivos'
 when nome ~ '(site|portal|pedido_pecas)' then 'site'
 when nome ~ '(integrac|automac|assistente|whatsapp)' then 'integracoes'
 when nome ~ '(atendimento|ordem_servico|_os|qualidade|localiza|item_fisico|execucao)' then 'atendimentos'
 else 'administracao' end;
$$;
create function private.conferir_operacao(w uuid,nome text) returns void language plpgsql stable security definer set search_path='' as $$
declare nivel text; modulo text:=private.modulo_operacao(nome);leitura boolean;regras_usuario jsonb;
begin
 perform private.exigir_segundo_fator();
 if exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=auth.uid() and ativo and perfil='owner') then return;end if;
 select regras into regras_usuario from public.restricoes_acesso where oficina_id=w and usuario_id=auth.uid();
 nivel:=regras_usuario->>modulo;
 if nome ~ '(relatorio|analitico|indicador)' and (regras_usuario->>'relatorios'='nenhum' or regras_usuario->>'financeiro'='nenhum') then
  raise exception 'Este relatório exige acesso aos relatórios e aos valores financeiros usados na análise.' using errcode='42501';
 end if;
 leitura:=nome ~ '^(consultar_|listar_|buscar_|obter_|prever_|sugerir_|simular_preco_|preparar_execucao_)';
 if nivel='nenhum' or (nivel='leitura' and not leitura) then
  raise exception 'Seu acesso permite apenas as operações liberadas pelo proprietário.' using errcode='42501';
 end if;
end $$;
create function private.acesso_area(w uuid,area text,escrita boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.segundo_fator_ok() and (exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=auth.uid() and ativo and perfil='owner')
 or coalesce((select case when escrita then regras->>area not in ('nenhum','leitura') else regras->>area<>'nenhum' end from public.restricoes_acesso where oficina_id=w and usuario_id=auth.uid()),true));
$$;

create function public.consultar_restricoes_acesso(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 return (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.restricoes_acesso r where oficina_id=p_oficina);
end $$;
create function public.salvar_restricoes_acesso(p_oficina uuid,p_usuario uuid,p_regras jsonb,p_revisao integer) returns void language plpgsql security definer set search_path='' as $$
declare atual integer;
begin
 perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 perform 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=p_usuario and perfil<>'owner' for update;
 if not found then raise exception 'Escolha um gerente ou funcionário desta empresa.' using errcode='42501';end if;
 if p_regras is null or jsonb_typeof(p_regras)<>'object' or exists(select 1 from jsonb_each_text(p_regras) e where e.key not in ('financeiro','relatorios','estoque','equipe','clientes','catalogo','orcamentos','agenda','arquivos','site','integracoes','atendimentos','administracao') or e.value not in ('padrao','leitura','nenhum')) then raise exception 'Permissões inválidas.' using errcode='22023';end if;
 select revisao into atual from public.restricoes_acesso where oficina_id=p_oficina and usuario_id=p_usuario;
 if coalesce(atual,0) is distinct from p_revisao then raise exception 'As permissões mudaram. Atualize a lista.' using errcode='PT409';end if;
 insert into public.restricoes_acesso values(p_oficina,p_usuario,p_regras,1,now(),auth.uid())
 on conflict(oficina_id,usuario_id) do update set regras=excluded.regras,revisao=restricoes_acesso.revisao+1,atualizado_em=now(),autor=auth.uid();
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
 values(p_oficina,auth.uid(),'user','permissoes.atualizadas','membro',p_usuario,gen_random_uuid());
end $$;

-- Todas as RPCs operacionais existentes com empresa explícita conservam suas
-- validações originais e recebem a restrição adicional antes de executar.
do $patch$
declare f record; novo text;
begin
 for f in select p.oid,p.proname,p.prosrc,pg_get_functiondef(p.oid) def
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and l.lanname='plpgsql' and p.prokind='f'
 and 'p_oficina'=any(p.proargnames) and has_function_privilege('authenticated',p.oid,'EXECUTE')
 and p.proname not in ('salvar_restricoes_acesso','consultar_restricoes_acesso') loop
  novo:=regexp_replace(f.prosrc,'\mbegin\M',format('begin perform private.conferir_operacao(p_oficina,%L);',f.proname),'i');
  if novo=f.prosrc then raise exception 'RPC sem corpo reconhecido: %',f.proname;end if;
  execute replace(f.def,f.prosrc,novo);
 end loop;
end $patch$;

-- O pre-request protege também as RPCs sem argumento de empresa.
create function public.verificar_sessao_api() returns void language plpgsql stable security definer set search_path='' as $$
begin perform private.exigir_segundo_fator();end $$;
do $$declare anterior text;begin
 if exists(select 1 from pg_roles where rolname='authenticator') then
  select split_part(s,'=',2) into anterior from pg_roles r cross join lateral unnest(r.rolconfig) s where r.rolname='authenticator' and s like 'pgrst.db_pre_request=%';
  if coalesce(anterior,'') not in ('','public.verificar_sessao_api') then raise exception 'Há um pre-request existente. Integre-o antes de aplicar.';end if;
  execute 'alter role authenticator set pgrst.db_pre_request=''public.verificar_sessao_api''';
 end if;
end $$;

-- Storage/Realtime não passam pelo pre-request; mantenha o MFA na RLS.
do $$declare t record;begin
 -- As demais tabelas de Storage são internas e administradas pelo provedor.
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
  execute format('create policy segundo_fator on %I.%I as restrictive to authenticated using ((select private.segundo_fator_ok())) with check ((select private.segundo_fator_ok()))',t.nspname,t.relname);
 end loop;
end $$;
do $$declare t record;area text;begin
 for t in select c.table_name from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace where c.table_schema='public' and c.column_name='oficina_id' and n.nspname='public' and p.relkind='r' and p.relrowsecurity loop
  area:=private.modulo_operacao(t.table_name);
  execute format('create policy area_consulta on public.%I as restrictive for select to authenticated using (private.acesso_area(oficina_id,%L,false))',t.table_name,area);
  execute format('create policy area_insercao on public.%I as restrictive for insert to authenticated with check (private.acesso_area(oficina_id,%L,true))',t.table_name,area);
  execute format('create policy area_edicao on public.%I as restrictive for update to authenticated using (private.acesso_area(oficina_id,%L,true)) with check (private.acesso_area(oficina_id,%L,true))',t.table_name,area,area);
  execute format('create policy area_exclusao on public.%I as restrictive for delete to authenticated using (private.acesso_area(oficina_id,%L,true))',t.table_name,area);
 end loop;
end $$;
-- A consulta de acesso também reduz os atalhos exibidos, preservando as regras de plano.
do $$declare s text;begin
 s:=pg_get_functiondef('public.consultar_meu_acesso()'::regprocedure);
 s:=replace(s,'where private.has_feature(o.id,r.codigo)', $x$where private.has_feature(o.id,r.codigo) and private.acesso_area(o.id,case r.codigo when 'customers' then 'clientes' when 'catalog' then 'catalogo' when 'quotes' then 'orcamentos' when 'finance' then 'financeiro' when 'inventory' then 'estoque' when 'reports' then 'relatorios' when 'employee_reports' then 'equipe' when 'service_media' then 'arquivos' when 'website' then 'site' when 'automations' then 'integracoes' when 'ai' then 'integracoes' else 'atendimentos' end,false)$x$);
 execute s;
end $$;
revoke all on function private.segundo_fator_ok(),private.exigir_segundo_fator(),private.modulo_operacao(text),private.conferir_operacao(uuid,text),public.verificar_sessao_api(),public.consultar_restricoes_acesso(uuid),public.salvar_restricoes_acesso(uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function private.segundo_fator_ok() to authenticated;
revoke all on function private.acesso_area(uuid,text,boolean) from public,anon,authenticated;
grant execute on function private.acesso_area(uuid,text,boolean) to authenticated;
grant execute on function public.verificar_sessao_api() to anon,authenticated,service_role;
grant execute on function public.consultar_restricoes_acesso(uuid),public.salvar_restricoes_acesso(uuid,uuid,jsonb,integer) to authenticated;
-- A guarda central cobre chamadas novas e funções SQL, além das RPCs existentes.
do $$declare r record;s text;parametro text;begin
 for r in select oid,proname,prosrc,proargnames from pg_proc where pronamespace='private'::regnamespace and proname in ('require_staff','exigir_proprietario','exigir_servicos') loop
  parametro:=r.proargnames[1];
  s:=pg_get_functiondef(r.oid);
  s:=replace(s,r.prosrc,regexp_replace(r.prosrc,'\mbegin\M','begin perform private.exigir_segundo_fator(); if current_setting(''request.path'',true) like ''/rpc/%'' then perform private.conferir_operacao('||parametro||',substring(current_setting(''request.path'',true) from 6)); end if;','i'));
  execute s;
 end loop;
end $$;
create function private.area_arquivo(bucket text,caminho text,escrita boolean) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select private.acesso_area(f.oficina_id,'arquivos',escrita) from public.arquivos f where f.recipiente=bucket and f.caminho_arquivo=caminho limit 1),true);
$$;
revoke all on function private.area_arquivo(text,text,boolean) from public,anon;
grant execute on function private.area_arquivo(text,text,boolean) to authenticated;
create policy area_arquivo_leitura on storage.objects as restrictive for select to authenticated using(private.area_arquivo(bucket_id,name,false));
create policy area_arquivo_gravacao on storage.objects as restrictive for insert to authenticated with check(private.area_arquivo(bucket_id,name,true));
create policy area_arquivo_edicao on storage.objects as restrictive for update to authenticated using(private.area_arquivo(bucket_id,name,true)) with check(private.area_arquivo(bucket_id,name,true));
create policy area_arquivo_exclusao on storage.objects as restrictive for delete to authenticated using(private.area_arquivo(bucket_id,name,true));
alter function private.operacao_servico(public.atendimentos_servicos,date) set search_path='';
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
