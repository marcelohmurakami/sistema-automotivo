// PostgreSQL local via PGlite. Nao conecta ao Supabase remoto.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { tabelas, colunas, operacoes, traduzirSql } from './nomes-portugues.mjs'
if (!process.env.DB_VALIDATION_RUNTIME) throw new Error('Set DB_VALIDATION_RUNTIME to PGlite dist/index.js')
const { PGlite } = await import(pathToFileURL(process.env.DB_VALIDATION_RUNTIME).href)
const db = new PGlite()
let checks = 0
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let portugues = false
const testarUpgrade = process.env.DB_TESTAR_UPGRADE === '1'
const sqlAtual = sql => portugues ? traduzirSql(sql).replace(/\b(set|reset) perfil\b/gi,'$1 role') : sql
const run = sql => db.exec(sqlAtual(sql))
const rows = async sql => (await db.query(sqlAtual(sql))).rows
const scalar = async sql => Object.values((await rows(sql))[0])[0]
function ok(value, label) { assert.ok(value, label); checks++; console.log(`PASS ${label}`) }
async function fails(sql, code, label) {
  await assert.rejects(() => run(sql), error => error.code === code, label)
  checks++; console.log(`PASS ${label}`)
}
async function login(user, role = 'authenticated') {
  await run(`reset role; select set_config('request.jwt.claim.sub','${user || ''}',false); set role ${role};`)
}
const owner = id(1), other = id(2), client = id(3), stranger = id(4)
try {
  await run(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select on storage.objects to authenticated,anon;
  `)
  const root = new URL('../migrations/', import.meta.url)
  // Suíte histórica das migrações 1–5; a migração 6 tem sua própria suíte de acesso.
  for (const file of (await readdir(root)).filter(x => x.endsWith('.sql') && x.slice(0,14) <= '20260928000500').sort()) {
    if (testarUpgrade && file.startsWith('20260928000500')) continue
    await db.exec(await readFile(new URL(file, root), 'utf8'))
    if (file.startsWith('20260928000500')) portugues = true
    console.log(`APPLIED ${file}`)
  }
  ok(await scalar(`select count(*)::int from pg_tables where schemaname='public'`) === 48, '48 application tables')
  ok(await scalar(`select count(*)::int from pg_tables where schemaname='public' and rowsecurity`) === 48, 'RLS enabled on all 48 tables')
  ok(await scalar(`select count(*)::int from public.saas_plans`) === 3, 'three plans seeded')
  ok(await scalar(`select count(*)::int from public.saas_plan_features where plan_code='basic'`) === 3, 'basic has three feature groups')
  ok(await scalar(`select count(*)::int from public.saas_plan_features where plan_code='complete'`) === 12, 'complete has all feature groups')
  ok(await scalar(`select public from storage.buckets where id='workshop-files'`) === false, 'media bucket private')
  await run(`insert into auth.users values ('${owner}'),('${other}'),('${client}'),('${stranger}');`)
  await login(owner)
  const w = await scalar(`select public.create_workshop('Oficina A','+5516999999999')`)
  ok(await scalar(`select role from public.workshop_members where workshop_id='${w}'`) === 'owner', 'onboarding creates owner membership')
  ok(await scalar(`select plan_code from public.workshop_subscriptions where workshop_id='${w}'`) === 'basic', 'new workshop starts on basic configuration')
  ok(await scalar(`select count(*)::int from public.production_stages where workshop_id='${w}'`) === 5, 'default production stages created')
  await fails(`update public.workshop_subscriptions set plan_code='complete' where workshop_id='${w}'`, '42501', 'user cannot self-upgrade plan')
  await login(other)
  const w2 = await scalar(`select public.create_workshop('Oficina B',null)`)
  ok(await scalar(`select count(*)::int from public.workshops`) === 1, 'workshop isolation')
  await run('reset role')
  const c1 = id(10), c2 = id(11), v1 = id(12), v2 = id(13), q = id(14), qv = id(15), token = id(16)
  await run(`
    insert into public.customers(id,workshop_id,name) values ('${c1}','${w}','Cliente A'),('${c2}','${w2}','Cliente B');
    insert into public.vehicles(id,workshop_id,plate,model) values
      ('${v1}','${w}','ABC1D23','Gol'),('${v2}','${w2}','DEF4G56','Uno');
  `)
  await fails(`insert into public.quotes(workshop_id,number,created_by) values('${w}',1,'${owner}')`, '42501', 'basic cannot create advanced quotes')
  await run(`update public.workshop_subscriptions set plan_code='complete' where workshop_id='${w}';
    update public.workshop_subscriptions set plan_code='intermediate' where workshop_id='${w2}';`)
  await fails(`insert into public.workshop_sites(workshop_id,slug,title) values('${w2}','b','B')`, '42501', 'intermediate cannot create premium site')
  await run(`
    insert into public.quotes(id,workshop_id,number,customer_id,vehicle_id,created_by)
      values('${q}','${w}',1,'${c1}','${v1}','${owner}');
    insert into public.quote_versions(id,workshop_id,quote_id,version_number,created_by,vehicle_snapshot)
      values('${qv}','${w}','${q}',1,'${owner}','{"plate":"ABC1D23","model":"Gol","internal_secret":"HIDDEN"}');
    insert into public.quote_items(workshop_id,quote_version_id,position,kind,description,quantity,unit_price_cents)
      values('${w}','${qv}',0,'service','Troca de oleo',1,12000);
    update public.quote_versions set subtotal_cents=12000,discount_cents=1000,published_at=now(),expires_at=now()+interval '7 days' where id='${qv}';
    update public.quotes set current_version_id='${qv}',status='awaiting_approval' where id='${q}';
  `)
  await login(owner)
  await fails(`select public.convert_quote_to_work_order('${w}','${q}')`, '23514', 'unapproved quote conversion rejected')
  await run(`reset role;
    insert into public.quote_access_tokens(id,workshop_id,quote_version_id,token_hash,expires_at)
      values('${token}','${w}','${qv}',repeat('c',64),now()+interval '1 day');
    insert into public.quote_approvals(workshop_id,quote_version_id,access_token_id,decision,declared_name,confirmation_text)
      values('${w}','${qv}','${token}','approved','Cliente','Confirmo os itens');
    update public.quotes set status='approved' where id='${q}';`)
  await login(owner)
  const wo = await scalar(`select public.convert_quote_to_work_order('${w}','${q}')`)
  ok(await scalar(`select public.convert_quote_to_work_order('${w}','${q}')`) === wo, 'conversion idempotent')
  ok(await scalar(`select count(*)::int from public.work_orders`) === 1, 'conversion creates a single work order')
  ok(String(await scalar(`select total_cents from public.work_orders where id='${wo}'`)) === '11000', 'converted total preserves approved discount')
  ok(await scalar(`select count(*)::int from public.work_order_items where work_order_id='${wo}'`) === 1, 'approved items copied')
  await fails(`insert into public.work_orders(workshop_id,number,customer_id,vehicle_id,created_by) values('${w}',2,'${c1}','${v1}','${owner}')`, '42501', 'direct browser mutation denied')
  await login(other)
  await fails(`select public.convert_quote_to_work_order('${w}','${q}')`, '42501', 'other workshop cannot convert quote')
  ok(await scalar(`select count(*)::int from public.workshop_board`) === 0, 'board respects RLS')
  await run('reset role')
  ok(await scalar(`select count(*)::int from public.domain_events where event_type='work_order.created'`) === 1, 'conversion emits exactly one outbox fact')
  await fails(`insert into public.work_orders(workshop_id,number,customer_id,vehicle_id,created_by)
    values('${w}',2,'${c2}','${v1}','${owner}')`, '23503', 'OS cannot reference customer from other workshop')
  await run(`insert into public.workshop_bays(id,workshop_id,name) values('${id(20)}','${w}','Elevador 1'),('${id(21)}','${w2}','Box B')`)
  const stage = await scalar(`select id from public.production_stages where workshop_id='${w}' order by position limit 1`)
  await login(owner)
  await fails(`select public.update_work_order_board('${w}','${wo}',99,'in_progress','${stage}',null,now(),now())`, '40001', 'stale mobile revision rejected')
  await fails(`select public.update_work_order_board('${w}','${wo}',1,'in_progress','${stage}','${id(21)}',now(),now())`, '23514', 'foreign bay rejected')
  await fails(`select public.update_work_order_board('${w}','${wo}',1,'delivered','${stage}',null,now(),now())`, '23514', 'invalid status jump rejected')
  const rev = await scalar(`select public.update_work_order_board('${w}','${wo}',1,'in_progress','${stage}','${id(20)}',now()-interval '1 hour',now())`)
  ok(rev === 2, 'board update increments revision')
  ok(await scalar(`select physically_in_shop from public.workshop_board where id='${wo}'`), 'board marks vehicle physically present')
  ok(await scalar(`select overdue from public.workshop_board where id='${wo}'`), 'board derives overdue flag')
  const block = await scalar(`select public.set_work_order_block('${w}','${wo}','parts','Aguardando pastilha',now()+interval '1 day')`)
  ok(await scalar(`select block_count from public.workshop_board where id='${wo}'`) === 1, 'board shows reason for stopped work')
  await scalar(`select public.update_work_order_board('${w}','${wo}',3,'quality_check','${stage}','${id(20)}',now(),now())`)
  await fails(`select public.update_work_order_board('${w}','${wo}',4,'ready','${stage}','${id(20)}',now(),now())`, '23514', 'open block prevents ready status')
  await run(`select public.resolve_work_order_block('${w}','${wo}','${block}');`)
  ok(await scalar(`select block_count from public.workshop_board where id='${wo}'`) === 0, 'resolved block removed from active board')
  await run('reset role')
  ok(await scalar(`select count(*)::int from public.work_order_blocks where ended_at is not null`) === 1, 'resolved block history retained')
  await fails(`update public.work_order_events set description='rewrite' where work_order_id='${wo}'`, '23514', 'service timeline append-only')
  await fails(`insert into public.work_orders(workshop_id,number,customer_id,vehicle_id,bay_id,received_at,created_by)
    values('${w}',5,'${c1}','${v1}','${id(20)}',now(),'${owner}')`, '23505', 'occupied vehicle/bay cannot be double-booked')

  const asset = id(25)
  await run(`
    insert into public.file_assets(id,workshop_id,bucket,object_path,original_name,mime_type,size_bytes,status)
      values('${asset}','${w}','workshop-files','${w}/photo.jpg','photo.jpg','image/jpeg',100,'ready');
    insert into storage.objects(bucket_id,"name") values('workshop-files','${w}/photo.jpg');
    insert into public.work_order_attachments(workshop_id,work_order_id,file_asset_id,phase)
      values('${w}','${wo}','${asset}','before');
    insert into public.workshop_sites(workshop_id,slug,title,published,portal_enabled,parts_requests_enabled)
      values('${w}','oficina-a','Oficina A',true,true,true);
    insert into public.customer_portal_access(workshop_id,customer_id,user_id,granted_by)
      values('${w}','${c1}','${client}','${owner}');
    update public.work_orders set internal_notes='SEGREDO_INTERNO',customer_summary='Servico em andamento' where id='${wo}';
  `)
  await login(owner)
  ok(await scalar(`select count(*)::int from storage.objects`) === 1, 'staff can read own registered media')
  await login(other)
  ok(await scalar(`select count(*)::int from storage.objects`) === 0, 'other workshop cannot read media')
  await login(client)
  ok(await scalar(`select count(*)::int from public.work_orders`) === 0, 'portal customer cannot read internal OS table')
  const portal = await scalar(`select public.get_my_work_orders('${w}')`)
  ok(portal.length === 1, 'verified customer receives own service projection')
  ok(!JSON.stringify(portal).includes('SEGREDO_INTERNO') && !JSON.stringify(portal).includes('HIDDEN'), 'portal omits internal notes and unapproved snapshot fields')
  ok(await scalar(`select count(*)::int from storage.objects`) === 0, 'portal cannot enumerate private photos')
  const history = await scalar(`select public.get_my_work_order_history('${w}','${wo}')`)
  ok(history.every(x => !('metadata' in x)), 'portal timeline omits internal metadata')
  ok(!JSON.stringify(history).includes('Aguardando pastilha'), 'internal block description not exposed')
  await login(stranger)
  ok((await scalar(`select public.get_my_work_orders('${w}')`)).length === 0, 'unrelated authenticated user sees no service history')

  await run(`reset role;
    insert into public.catalog_items(id,workshop_id,kind,description,default_unit_price_cents)
      values('${id(30)}','${w}','part','Pastilha',15000);
    insert into public.site_products(id,workshop_id,catalog_item_id,title,visible,displayed_price_cents)
      values('${id(31)}','${w}','${id(30)}','Pastilha',true,15000);`)
  await login(client)
  const payload = `'[{"product_id":"${id(31)}","quantity":2}]'::jsonb`
  const request = await scalar(`select public.request_parts('${w}','${c1}','${id(32)}',${payload},'Preciso para o Gol')`)
  ok(await scalar(`select public.request_parts('${w}','${c1}','${id(32)}',${payload},'Preciso para o Gol')`) === request, 'parts request retry idempotent')
  await fails(`select public.request_parts('${w}','${c1}','${id(32)}',${payload},'Outro texto')`, '23514', 'idempotency key rejects changed payload')
  await fails(`select public.request_parts('${w}','${c2}','${id(33)}',${payload},null)`, '42501', 'portal cannot request on behalf of unrelated customer')
  await run(`reset role; update public.workshop_sites set parts_requests_enabled=false where workshop_id='${w}';`)
  await login(client)
  await fails(`select public.request_parts('${w}','${c1}','${id(34)}',${payload},null)`, '42501', 'shop opt-out blocks parts requests')
  await run(`reset role; update public.workshop_subscriptions set plan_code='intermediate' where workshop_id='${w}';`)
  await login(client)
  ok((await scalar(`select public.get_my_work_orders('${w}')`)).length === 0, 'downgrade disables portal')
  await login('', 'anon')
  ok(await scalar(`select public.get_published_workshop_site('oficina-a')`) === null, 'downgrade hides premium website projection')
  await fails('select * from public.work_orders', '42501', 'anonymous direct OS access denied')
  await fails(`select public.convert_quote_to_work_order('${w}','${q}')`, '42501', 'anonymous cannot call staff RPC')
  await run(`reset role; update public.workshop_subscriptions set plan_code='complete' where workshop_id='${w}';`)
  await login('', 'anon')
  const site = await scalar(`select public.get_published_workshop_site('oficina-a')`)
  ok(site.products.length === 1 && !('customers' in site), 'published site returns curated public fields')
  await run(`reset role; update public.customer_portal_access set revoked_at=now() where user_id='${client}';`)
  await login(client)
  ok((await scalar(`select public.get_my_work_orders('${w}')`)).length === 0, 'revoked portal access denied')

  await run(`reset role;
    insert into public.service_notes(id,workshop_id,number,created_by) values('${id(40)}','${w2}',1,'${other}');
    insert into public.service_note_items(workshop_id,note_id,position,kind,description,quantity,unit_price_cents)
      values('${w2}','${id(40)}',0,'service','Nota simples',1,100);
    update public.service_notes set subtotal_cents=100,status='issued',issued_at=now() where id='${id(40)}';`)
  await fails(`update public.service_note_items set unit_price_cents=500 where note_id='${id(40)}'`, '23514', 'issued simple note items frozen')
  await run(`update public.service_notes set status='cancelled' where id='${id(40)}';`)
  ok(await scalar(`select status from public.service_notes where id='${id(40)}'`) === 'cancelled', 'issued note can be cancelled without changing content')
  await fails(`update public.service_notes set status='issued' where id='${id(40)}'`, '23514', 'cancelled note cannot be silently reinstated')
  await fails(`insert into public.ai_runs(workshop_id,requested_by,task_type,model,prompt_template_version,idempotency_key)
    values('${w2}','${other}','summary','future-model','1','${id(50)}')`, '42501', 'AI creation blocked on intermediate plan')
  await login(owner)
  await fails('select * from public.integration_api_keys', '42501', 'integration secrets hidden even from staff session')
  await fails(`select private.require_staff('${w}')`, '42501', 'internal authorization helper not directly executable')
  if (testarUpgrade) {
    await db.exec('reset role')
    const anteriores = new Map()
    for (const [antiga,nova] of Object.entries(tabelas).filter(([x])=>x!=='workshop_board')) {
      const registros = (await db.query(`select * from public.${antiga}`)).rows
      anteriores.set(nova,registros.map(registro=>Object.fromEntries(Object.entries(registro).map(([campo,valor])=>[colunas[campo],valor]))))
    }
    await db.exec(await readFile(new URL('20260928000500_nomes_em_portugues.sql',root),'utf8'))
    portugues = true
    for (const [tabela,registros] of anteriores) {
      const atuais = (await db.query(`select * from public.${tabela}`)).rows
      // Somente a acentuação dos nomes de planos foi atualizada intencionalmente.
      if (tabela==='planos') for (const r of registros) r.nome = {basic:'Básico',intermediate:'Intermediário',complete:'Completo'}[r.codigo]
      const ordenar = xs=>xs.map(x=>JSON.stringify(x)).sort()
      assert.deepEqual(ordenar(atuais),ordenar(registros),`Preservar registros: ${tabela}`)
      checks++
    }
    await login(owner)
    ok(await scalar(`select public.convert_quote_to_work_order('${w}','${q}')`)===wo,'Conversão continua idempotente após renomear banco populado')
    await fails(`update public.quote_items set quantity=3 where quote_version_id='${qv}'`,'42501','Escrita direta continua bloqueada após migração')
    await run('reset role')
    await fails(`update public.quote_items set quantity=3 where quote_version_id='${qv}'`,'23514','Orçamento publicado continua congelado após migração')
    await fails(`update public.service_notes set status='issued' where id='${id(40)}'`,'23514','Nota cancelada continua protegida após migração')
  }
  await db.exec('reset role')
  for (const [antiga,nova] of Object.entries(tabelas)) {
    assert.equal((await db.query(`select to_regclass('public.${antiga}') as antigo,to_regclass('public.${nova}') as atual`)).rows[0].antigo,null)
    assert.ok((await db.query(`select to_regclass('public.${nova}') as atual`)).rows[0].atual)
  }
  ok(true,'48 tabelas e mapa usam os novos nomes; nomes antigos não existem')
  const nomes = (await db.query("select column_name from information_schema.columns where table_schema='public'")).rows
  ok(nomes.every(x=>Object.values(colunas).includes(x.column_name)),'Todos os 526 campos têm nome previsto em português')
  const funcoes = (await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows
  ok(funcoes.length===9 && funcoes.every(x=>Object.values(operacoes).includes(x.proname)),'Nove operações públicas em português, sem versões antigas')
  console.log(`\n${checks} verificações passaram. Auth/Storage simulados; integração real não testada.`)
} catch (erro) {
  console.error({mensagem:erro.message,codigo:erro.code,detalhe:erro.detail,contexto:erro.where,consultaInterna:erro.internalQuery,posicao:erro.position})
  process.exitCode = 1
} finally { await db.close() }
