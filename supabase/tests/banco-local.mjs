import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const codigoConflitoRevisao = (process.env.DB_VALIDATION_MIGRATION_LIMIT || '') >= '20261019001200' ? 'PT409' : '40001'

export async function criarBancoLocal(limite = '20260928000400') {
  limite = process.env.DB_VALIDATION_MIGRATION_LIMIT || limite
  if (!process.env.DB_VALIDATION_RUNTIME) throw new Error('Defina DB_VALIDATION_RUNTIME com o caminho do PGlite.')
  let db;
  if(process.env.DB_VALIDATION_PG_PORT){
    const {conectarPostgresLocal}=await import('./postgres-local.mjs');db=await conectarPostgresLocal();
  }else{
    const runtime = pathToFileURL(process.env.DB_VALIDATION_RUNTIME)
    const { PGlite } = await import(runtime.href)
    const { pg_trgm } = await import(new URL('./contrib/pg_trgm.js',runtime).href)
    db = new PGlite({extensions:{pg_trgm}})
  }
  await db.exec(`do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;
    end $$;
    create schema auth; create table auth.users(id uuid primary key);
    create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),status text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    create table storage.migrations(id integer primary key);
    alter table storage.migrations enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select on storage.objects to authenticated,anon;`)
  const pasta = new URL('../migrations/', import.meta.url)
  for (const arquivo of (await readdir(pasta)).filter(x => x.endsWith('.sql') && x.slice(0,14) <= limite).sort()) {
    await db.exec(await readFile(new URL(arquivo,pasta),'utf8'))
  }
  return db
}
