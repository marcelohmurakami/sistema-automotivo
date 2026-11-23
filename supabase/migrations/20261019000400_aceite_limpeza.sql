begin;
-- Os nomes das funções são preservados para manter os gatilhos existentes.
-- A conferência e a auditoria agora atendem também aos seis perfis de limpeza.
-- A conclusão comercial não aprova testes nem registra aceite automaticamente.
-- Na reabertura a conferência anterior permanece no histórico da alteração.
create or replace function private.validar_aceite_manutencao() returns trigger
language plpgsql set search_path='' as $$
declare campos jsonb := new.ficha_especialidade->'campos'; etapa text;
begin
 if coalesce(new.ficha_especialidade->>'especialidade','') not in ('manutencao_geral','manutencao_climatizacao','manutencao_eletrica','manutencao_hidraulica','manutencao_equipamentos','limpeza_geral','limpeza_residencial','limpeza_comercial','limpeza_pos_obra','limpeza_estofados','limpeza_vidros') then return new; end if;
 if tg_op='UPDATE' and old.situacao='concluido' and new.situacao='em_execucao' then
  etapa := case new.ficha_especialidade->>'especialidade'
   when 'manutencao_climatizacao' then 'Limpeza e manutenção'
   when 'manutencao_eletrica' then 'Intervenção'
   when 'manutencao_hidraulica' then 'Reparo / instalação'
   when 'manutencao_equipamentos' then 'Manutenção'
   when 'limpeza_residencial' then 'Limpeza por cômodo' when 'limpeza_comercial' then 'Execução por área'
   when 'limpeza_pos_obra' then 'Limpeza fina' when 'limpeza_estofados' then 'Higienização'
   when 'limpeza_vidros' then 'Limpeza' when 'limpeza_geral' then 'Limpeza por ambiente' else 'Execução' end;
  campos := campos || case when new.ficha_especialidade->>'especialidade' like 'limpeza_%' then '{"liberacao_uso":"Não liberado","resultado_vistoria":""}'::jsonb else '{"condicao_uso":"Não avaliado"}'::jsonb end;
  campos := campos || '{"situacao_aceite":"Pendente","aceite":"","data_aceite":"","ressalvas_aceite":""}'::jsonb;
  new.ficha_especialidade := jsonb_set(jsonb_set(new.ficha_especialidade,'{campos}',campos),'{etapa}',to_jsonb(etapa));
 end if;
 if coalesce(campos->>'situacao_aceite','') not in ('','Pendente') then
  if new.situacao <> 'concluido' then
   raise exception 'Conclua o serviço antes de registrar a conferência do cliente.' using errcode='22023';
  end if;
  if nullif(btrim(campos->>'aceite'),'') is null or nullif(campos->>'data_aceite','') is null then
   raise exception 'Informe quem conferiu o serviço e a data da conferência.' using errcode='22023';
  end if;
  if campos->>'situacao_aceite' in ('Aceito com ressalvas','Não aceito') and nullif(btrim(campos->>'ressalvas_aceite'),'') is null then
   raise exception 'Descreva as ressalvas ou o motivo da recusa.' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.validar_aceite_manutencao() from public,anon,authenticated;

create or replace function private.resumo_aceite_manutencao(f jsonb) returns text
language sql immutable set search_path='' as $$
 select concat_ws(' · ', 'Conferência: ' || coalesce(nullif(f->'campos'->>'situacao_aceite',''),'Pendente'),
 nullif(f->'campos'->>'aceite',''), nullif(f->'campos'->>'data_aceite',''), nullif(f->'campos'->>'ressalvas_aceite',''));
$$;
create or replace function private.auditar_aceite_manutencao() returns trigger
language plpgsql security definer set search_path='' as $$
declare antes text; depois text;
begin
 if coalesce(new.ficha_especialidade->>'especialidade','') not like 'manutencao_%' and coalesce(new.ficha_especialidade->>'especialidade','') not like 'limpeza_%' then return new; end if;
 antes := case when tg_op='UPDATE' then private.resumo_aceite_manutencao(old.ficha_especialidade) else 'Conferência: Pendente' end;
 depois := private.resumo_aceite_manutencao(new.ficha_especialidade);
 if antes is distinct from depois then
  insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,antes,depois,autor)
  values(new.oficina_id,new.id,'aceite',antes,depois,auth.uid());
 end if;
 return new;
end $$;
revoke all on function private.resumo_aceite_manutencao(jsonb),private.auditar_aceite_manutencao() from public,anon,authenticated;

create function private.validar_operacao_limpeza() returns trigger language plpgsql set search_path='' as $$
declare c jsonb := new.ficha_especialidade->'campos'; k text; v numeric;
begin
 if coalesce(new.ficha_especialidade->>'especialidade','') not like 'limpeza_%' then return new; end if;
 foreach k in array array['pessoas_previstas','quantidade_lugares'] loop
  if nullif(c->>k,'') is not null then
   v := (c->>k)::numeric;
   if v<1 or trunc(v)<>v then raise exception 'Informe uma quantidade inteira, a partir de 1, para pessoas ou lugares.' using errcode='22023'; end if;
  end if;
 end loop;
 if new.situacao='concluido' and c->>'condicao_execucao' in ('Suspensa','Aguardando avaliação') then
  raise exception 'O trabalho está suspenso ou aguardando avaliação. Revise a liberação antes de concluir.' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function private.validar_operacao_limpeza() from public,anon,authenticated;
create trigger z_validar_operacao_limpeza before insert or update on public.atendimentos_servicos for each row execute function private.validar_operacao_limpeza();
commit;
