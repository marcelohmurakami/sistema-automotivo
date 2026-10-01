-- Read-only: compare an existing foundation with the first migration before baselining.
with definitions as (
  select 'columns' as kind, table_name || '.' || column_name as name,
    concat_ws('|',ordinal_position,data_type,udt_name,is_nullable,column_default,is_generated,generation_expression) as definition
  from information_schema.columns where table_schema='public'
  union all
  select 'constraints', c.relname || '.' || k.conname, pg_get_constraintdef(k.oid)
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and k.contype <> 'n'
  union all
  select 'indexes', indexname, indexdef from pg_indexes where schemaname='public'
  union all
  select 'policies', tablename || '.' || policyname, concat_ws('|',permissive,roles::text,cmd,qual,with_check) from pg_policies where schemaname='public'
  union all
  select 'functions', p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
  union all
  select 'triggers', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
)
select kind,count(*) as objects,md5(string_agg(name || ':' || regexp_replace(definition,'\s+',' ','g'),chr(10) order by name collate "C")) as fingerprint from definitions group by kind order by kind;
