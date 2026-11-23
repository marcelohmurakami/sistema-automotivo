-- Etapas de entrega exigem conclusão e identificação de quem recebeu.
-- Executa depois do gatilho de reabertura, que volta a etapa para Reparo.
begin;
create function private.validar_etapa_encerramento_reparo() returns trigger
language plpgsql set search_path='' as $$
declare etapa text := new.ficha_especialidade->>'etapa';
begin
 if new.ficha_especialidade->>'especialidade' like 'assistencia_%' then
  if new.situacao <> 'concluido' and etapa in (
   'Pronto para retirada','Pronto para entrega','Disponível para retirada',
   'Serviço concluído no local','Aceite registrado','Entregue'
  ) then
   raise exception 'Conclua o reparo antes de marcar como pronto ou entregue.' using errcode='22023';
  end if;
  if etapa in ('Entregue','Aceite registrado') and
     nullif(btrim(new.ficha_especialidade->'campos'->>'recebedor'),'') is null then
   raise exception 'Informe quem recebeu ou conferiu o equipamento.' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.validar_etapa_encerramento_reparo() from public,anon,authenticated;
create trigger z_validar_etapa_encerramento_reparo
before insert or update on public.atendimentos_servicos
for each row execute function private.validar_etapa_encerramento_reparo();
commit;
