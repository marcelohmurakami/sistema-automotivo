begin;
create function public.criar_os_pronta(p_oficina uuid,p_dados jsonb,p_chave uuid,p_os uuid default null,p_revisao integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; o public.ordens_servico; estado text;
begin
 perform private.exigir_os(p_oficina);
 if p_os is not null or p_chave is null then raise exception 'Esta opção é exclusiva para criar uma nova OS.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
 select * into o from public.ordens_servico where oficina_id=p_oficina and chave_criacao=p_chave;
 if found then return public.consultar_ordem_servico(p_oficina,o.id);end if;
 if jsonb_typeof(p_dados->'itens') is distinct from 'array' or jsonb_array_length(p_dados->'itens')=0 then raise exception 'Inclua os serviços realizados antes de marcar como pronto.';end if;
 d:=public.salvar_os_com_itens(p_oficina,p_dados,p_chave,null,null);
 select * into o from public.ordens_servico where oficina_id=p_oficina and id=(d->>'id')::uuid for update;
 if not exists(select 1 from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=o.id and situacao<>'cancelled' and removido_em is null) then raise exception 'Inclua ao menos um item realizado.';end if;
 foreach estado in array array['in_progress','quality_check'] loop
  perform public.atualizar_mapa_ordem_servico(p_oficina,o.id,o.revisao,estado,o.etapa_id,o.local_id,o.entrega_prevista_em,o.recebido_em,null);
  select * into o from public.ordens_servico where oficina_id=p_oficina and id=o.id;
 end loop;
 perform public.operar_mapa_rapido(p_oficina,o.id,o.revisao,'concluir');
 return public.consultar_ordem_servico(p_oficina,o.id);
end $$;
revoke all on function public.criar_os_pronta(uuid,jsonb,uuid,uuid,integer) from public,anon;
grant execute on function public.criar_os_pronta(uuid,jsonb,uuid,uuid,integer) to authenticated;
commit;
