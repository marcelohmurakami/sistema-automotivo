import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function criarBancoLocal(limite = '20260928000400') {
  limite = process.env.DB_VALIDATION_MIGRATION_LIMIT || limite
  if (!process.env.DB_VALIDATION_RUNTIME) throw new Error('Defina DB_VALIDATION_RUNTIME com o caminho do PGlite.')
  const { PGlite } = await import(pathToFileURL(process.env.DB_VALIDATION_RUNTIME).href)
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select on storage.objects to authenticated,anon;`)
  const pasta = new URL('../migrations/', import.meta.url)
  for (const arquivo of (await readdir(pasta)).filter(x => x.endsWith('.sql') && x.slice(0,14) <= limite).sort()) {
    await db.exec(await readFile(new URL(arquivo,pasta),'utf8'))
  }
  return db
}
