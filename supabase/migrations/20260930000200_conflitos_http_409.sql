begin;
-- Conflitos de revisão são erros de negócio, não serialization_failure.
-- Preserva as definições implantadas, assinaturas, permissões e validações.
-- Substitui somente os RAISE explícitos das funções públicas da aplicação.
do $$
declare f record; definicao text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.prosrc ~ 'errcode\s*=\s*''40001'''
  loop
    definicao := pg_get_functiondef(f.oid);
    definicao := regexp_replace(definicao, 'errcode\s*=\s*''40001''', 'errcode=''PT409''', 'g');
    execute definicao;
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
