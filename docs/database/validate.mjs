// Local structural checks only. No remote database, provider or n8n is contacted.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.DB_VALIDATION_RUNTIME) {
  throw new Error('Set DB_VALIDATION_RUNTIME to the installed PGlite dist/index.js; see database.md.')
}
const { PGlite } = await import(pathToFileURL(process.env.DB_VALIDATION_RUNTIME).href)
const db = new PGlite()
let checks = 0
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [userA, userB, workshopA, workshopB, customerA, customerB, vehicleA, quoteA, quoteB, versionA, versionB] =
  Array.from({ length: 11 }, (_, i) => id(i + 1))
const exec = (sql) => db.exec(sql)
const query = (sql) => db.query(sql)
function ok(condition, name) {
  assert.ok(condition, name)
  checks++
  console.log(`PASS ${name}`)
}
async function rejects(sql, code, name) {
  await assert.rejects(() => exec(sql), (error) => error.code === code, name)
  checks++
  console.log(`PASS ${name}`)
}

try {
  // Minimal Supabase-specific prerequisites; NOT an Auth/JWT integration test.
  await exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
  `)
  await exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
  const tables = await query(`select count(*)::int as count from pg_tables where schemaname = 'public'`)
  ok(tables.rows[0].count === 27, '27 application tables created')
  const policies = await query(`select count(*)::int as count from pg_tables where schemaname = 'public' and rowsecurity`)
  ok(policies.rows[0].count === 27, 'RLS enabled on every application table')

  await exec(`
    insert into auth.users values ('${userA}'), ('${userB}');
    insert into public.workshops(id, name) values ('${workshopA}', 'A'), ('${workshopB}', 'B');
    insert into public.workshop_members(workshop_id, user_id, role) values
      ('${workshopA}', '${userA}', 'owner'), ('${workshopB}', '${userB}', 'owner');
    insert into public.customers(id, workshop_id, name, phone_e164) values
      ('${customerA}', '${workshopA}', 'Cliente A', '+5516999999999'),
      ('${customerB}', '${workshopB}', 'Cliente B', '+5516999999999');
    insert into public.vehicles(id, workshop_id, plate, model) values
      ('${vehicleA}', '${workshopA}', 'ABC1D23', 'Gol 1.0');
    insert into public.quotes(id, workshop_id, number, customer_id, created_by) values
      ('${quoteA}', '${workshopA}', 1, '${customerA}', '${userA}'),
      ('${quoteB}', '${workshopB}', 1, '${customerB}', '${userB}');
    insert into public.quote_versions(id, workshop_id, quote_id, version_number, created_by) values
      ('${versionA}', '${workshopA}', '${quoteA}', 1, '${userA}'),
      ('${versionB}', '${workshopB}', '${quoteB}', 1, '${userB}');
  `)
  await rejects(`insert into public.quotes(workshop_id, number, customer_id, created_by)
    values ('${workshopA}', 2, '${customerB}', '${userA}')`, '23503', 'cross-workshop customer FK rejected')
  await rejects(`insert into public.customer_vehicles(workshop_id, customer_id, vehicle_id)
    values ('${workshopB}', '${customerB}', '${vehicleA}')`, '23503', 'cross-workshop vehicle relationship rejected')
  await rejects(`update public.quotes set current_version_id = '${versionB}' where id = '${quoteA}'`,
    '23503', 'current version cannot belong to another workshop')
  await rejects(`insert into public.quote_versions(workshop_id, quote_id, version_number, created_by)
    values ('${workshopA}', '${quoteA}', 2, '${userA}')`, '23505', 'only one draft per quote')
  await rejects(`insert into public.quotes(workshop_id, number, created_by)
    values ('${workshopA}', 1, '${userA}')`, '23505', 'quote number unique within workshop')

  await exec(`insert into public.quote_items(workshop_id, quote_version_id, position, kind, description, quantity, unit_price_cents)
    values ('${workshopA}', '${versionA}', 1, 'part', 'Oleo', 1.125, 100)`)
  const amount = await query(`select line_total_cents::text as amount from public.quote_items where quote_version_id = '${versionA}'`)
  ok(amount.rows[0].amount === '113', 'fractional quantity rounded exactly in database')
  await rejects(`insert into public.quote_items(workshop_id, quote_version_id, position, kind, description, quantity, unit_price_cents)
    values ('${workshopA}', '${versionA}', 2, 'part', 'Invalido', 0, 100)`, '23514', 'zero quantity rejected')
  await exec(`
    update public.quote_versions set subtotal_cents = 113, discount_cents = 13,
      expires_at = now() + interval '7 days', published_at = now() where id = '${versionA}';
    update public.quotes set current_version_id = '${versionA}', status = 'awaiting_approval' where id = '${quoteA}';
  `)
  const total = await query(`select total_cents::text as total from public.quote_versions where id = '${versionA}'`)
  ok(total.rows[0].total === '100', 'version total generated from subtotal minus discount')
  await rejects(`update public.quote_versions set subtotal_cents = 200 where id = '${versionA}'`,
    '23514', 'published version cannot be modified')
  await rejects(`delete from public.quote_versions where id = '${versionA}'`, '23514', 'published version cannot be deleted')
  await rejects(`update public.quote_items set unit_price_cents = 200 where quote_version_id = '${versionA}'`,
    '23514', 'published item cannot be modified')
  await rejects(`delete from public.quote_items where quote_version_id = '${versionA}'`, '23514', 'published item cannot be deleted')
  await rejects(`insert into public.quote_items(workshop_id, quote_version_id, position, kind, description, quantity, unit_price_cents)
    values ('${workshopA}', '${versionA}', 2, 'part', 'Extra', 1, 100)`, '23514', 'cannot append item to published version')

  const asset = id(12), tokenA = id(13), tokenB = id(14), eventA = id(15), connectionA = id(16), delivery = id(17)
  await exec(`
    insert into public.file_assets(id, workshop_id, bucket, object_path, original_name, mime_type, size_bytes)
      values ('${asset}', '${workshopA}', 'private', 'a/photo.jpg', 'photo.jpg', 'image/jpeg', 10);
    insert into public.quote_access_tokens(id, workshop_id, quote_version_id, token_hash, expires_at) values
      ('${tokenA}', '${workshopA}', '${versionA}', repeat('a', 64), now() + interval '1 day'),
      ('${tokenB}', '${workshopB}', '${versionB}', repeat('b', 64), now() + interval '1 day');
  `)
  await rejects(`insert into public.quote_attachments(workshop_id, quote_version_id, file_asset_id)
    values ('${workshopA}', '${versionA}', '${asset}')`, '23514', 'cannot append photo to published version')
  await rejects(`insert into public.quote_approvals(workshop_id, quote_version_id, access_token_id, decision, declared_name, confirmation_text)
    values ('${workshopA}', '${versionA}', '${tokenB}', 'approved', 'Teste', 'Confirmo')`,
    '23503', 'approval token must belong to same version and workshop')
  await exec(`insert into public.quote_approvals(workshop_id, quote_version_id, access_token_id, decision, declared_name, confirmation_text)
    values ('${workshopA}', '${versionA}', '${tokenA}', 'approved', 'Teste', 'Confirmo')`)
  await rejects(`insert into public.quote_approvals(workshop_id, quote_version_id, access_token_id, decision, declared_name, confirmation_text)
    values ('${workshopA}', '${versionA}', '${tokenA}', 'approved', 'Teste', 'Confirmo')`,
    '23505', 'duplicate approval rejected')
  await rejects(`update public.quote_approvals set decision = 'declined' where quote_version_id = '${versionA}'`,
    '23514', 'decision is append-only')

  await exec(`
    insert into public.domain_events(id, workshop_id, event_type, aggregate_type, aggregate_id, aggregate_version, deduplication_key)
      values ('${eventA}', '${workshopA}', 'quote.approved', 'quote', '${quoteA}', 2, 'approval:1');
    insert into public.integration_connections(id, workshop_id, name, kind, endpoint_url, credentials_ref)
      values ('${connectionA}', '${workshopA}', 'n8n', 'n8n', 'https://example.invalid/webhook', 'vault:example');
    insert into public.event_deliveries(id, workshop_id, event_id, connection_id)
      values ('${delivery}', '${workshopA}', '${eventA}', '${connectionA}');
  `)
  await rejects(`insert into public.domain_events(workshop_id, event_type, aggregate_type, aggregate_id, aggregate_version, deduplication_key)
    values ('${workshopA}', 'quote.approved', 'quote', '${quoteA}', 2, 'approval:1')`, '23505', 'duplicate domain event rejected')
  await rejects(`update public.domain_events set payload = '{}' where id = '${eventA}'`, '23514', 'event content immutable')
  await rejects(`insert into public.event_deliveries(workshop_id, event_id, connection_id)
    values ('${workshopA}', '${eventA}', '${connectionA}')`, '23505', 'one delivery per event and destination')
  await rejects(`update public.event_deliveries set workshop_id = '${workshopB}' where id = '${delivery}'`,
    '23503', 'cross-workshop event delivery rejected')
  await rejects(`update public.event_deliveries set lease_token = '${id(18)}' where id = '${delivery}'`,
    '23514', 'lease token requires expiration')

  await exec(`select set_config('request.jwt.claim.sub', '${userA}', false); set role authenticated;`)
  let rows = await query('select id from public.customers')
  ok(rows.rows.length === 1 && rows.rows[0].id === customerA, 'user A reads only workshop A')
  rows = await query('select id from public.workshops')
  ok(rows.rows.length === 1 && rows.rows[0].id === workshopA, 'workshop RLS has no membership recursion')
  await rejects(`insert into public.customers(workshop_id, name) values ('${workshopA}', 'Bypass')`,
    '42501', 'client direct mutation denied')
  await rejects('select * from public.integration_api_keys', '42501', 'client cannot read integration credentials')
  await rejects('select * from public.quote_access_tokens', '42501', 'client cannot read public-link tokens')
  await exec(`reset role; select set_config('request.jwt.claim.sub', '${userB}', false); set role authenticated;`)
  rows = await query('select id from public.customers')
  ok(rows.rows.length === 1 && rows.rows[0].id === customerB, 'user B reads only workshop B')
  await exec(`reset role; update public.workshop_members set active = false where user_id = '${userB}'; set role authenticated;`)
  rows = await query('select id from public.customers')
  ok(rows.rows.length === 0, 'inactive member loses data access')
  await exec('reset role; set role anon;')
  await rejects('select * from public.quotes', '42501', 'anonymous cannot read quotes directly')
  await exec('reset role; set role service_role;')
  rows = await query('select id from public.customers')
  ok(rows.rows.length === 2, 'trusted service role bypasses RLS: backend authorization is required')
  console.log(`\n${checks} structural checks passed. No Supabase services or RPCs were tested.`)
} finally {
  await db.close()
}
