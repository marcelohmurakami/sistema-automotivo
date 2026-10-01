import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
if (!process.env.DB_VALIDATION_RUNTIME) throw new Error('Set DB_VALIDATION_RUNTIME')
const { PGlite } = await import(pathToFileURL(process.env.DB_VALIDATION_RUNTIME).href)
const db = new PGlite()
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`)
  await db.exec(await readFile(new URL('../migrations/20260928000100_quote_foundation.sql',import.meta.url),'utf8'))
  console.log(JSON.stringify((await db.query(await readFile(new URL('./foundation-fingerprint.sql',import.meta.url),'utf8'))).rows,null,2))
} finally { await db.close() }
