-- Reabrir um reparo não pode deixá-lo nas filas de pronto/entregue.
-- O gatilho existente continua auditando a alteração da etapa. Preserva medições,
-- recebedor anterior, custos e a rotina transacional de estorno do estoque.
begin;
create function private.etapa_reabertura_reparo() returns trigger
language plpgsql set search_path='' as $$
declare etapa text;
begin
 if old.situacao='concluido' and new.situacao='em_execucao'
    and new.ficha_especialidade->>'especialidade' like 'assistencia_%' then
   select value into etapa from jsonb_array_elements_text(
     private.perfis_atendimento()->(new.ficha_especialidade->>'especialidade')->'etapas'
   ) with ordinality e(value,pos) where value like 'Reparo%' order by pos limit 1;
   new.ficha_especialidade=jsonb_set(new.ficha_especialidade,'{etapa}',to_jsonb(coalesce(etapa,'')));
 end if;
 return new;
end $$;
revoke all on function private.etapa_reabertura_reparo() from public,anon,authenticated;
create trigger etapa_reabertura_reparo before update on public.atendimentos_servicos
for each row execute function private.etapa_reabertura_reparo();
commit;
