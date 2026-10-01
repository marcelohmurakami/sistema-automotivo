begin;
alter table public.avisos_automaticos add column situacao_os text;
create or replace function private.aviso_andamento() returns trigger language plpgsql security definer set search_path='' as $$
declare msg text;begin if new.situacao=old.situacao then return new;end if;
 if private.has_feature(new.oficina_id,'automations') then
 msg:=case new.situacao when 'in_progress' then 'Seu veículo está em serviço.' when 'ready' then 'Seu veículo está pronto. Entre em contato para combinar a retirada.' when 'delivered' then 'Seu veículo foi entregue. Obrigado pela confiança!' else null end;
 if msg is not null then insert into public.avisos_automaticos(oficina_id,cliente_id,ordem_servico_id,situacao_os,chave,mensagem) values(new.oficina_id,new.cliente_id,new.id,new.situacao,'os:'||new.id||':'||new.situacao||':'||gen_random_uuid(),msg||' OS #'||new.numero) on conflict do nothing;end if;end if;
 insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,descricao,visivel_ao_cliente,usuario_autor_id) values(new.oficina_id,new.id,'status_changed',case new.situacao when 'received' then 'Veículo recebido' when 'in_progress' then 'Serviço em andamento' when 'waiting' then 'Aguardando continuidade' when 'ready' then 'Pronto para entrega' when 'delivered' then 'Veículo entregue' when 'cancelled' then 'Atendimento cancelado' else 'Situação do atendimento atualizada' end,true,auth.uid());return new;end $$;

create or replace function public.reservar_aviso_automatico(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.avisos_automaticos;c public.clientes;begin
 if not private.has_feature(p_oficina,'automations') then return null;end if;
 select * into a from public.avisos_automaticos where oficina_id=p_oficina and situacao='aprovado' order by criado_em for update skip locked limit 1;if not found then return null;end if;
 select * into c from public.clientes where oficina_id=p_oficina and id=a.cliente_id and arquivado_em is null;
 if (a.ordem_servico_id is not null and not exists(select 1 from public.ordens_servico o where o.oficina_id=p_oficina and o.id=a.ordem_servico_id and o.situacao=a.situacao_os)) or c.id is null or c.telefone_e164 is distinct from a.telefone_aprovado or not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=a.aprovado_por and ativo and perfil in('owner','manager')) or (a.versao_orcamento_id is not null and not exists(select 1 from public.versoes_orcamento v join public.orcamentos q on q.id=v.orcamento_id and q.oficina_id=v.oficina_id where v.id=a.versao_orcamento_id and v.oficina_id=p_oficina and q.versao_atual_id=v.id and q.situacao='awaiting_approval' and v.expira_em>now())) then update public.avisos_automaticos set situacao='cancelado' where id=a.id;return null;end if;
 update public.avisos_automaticos set situacao='enviando',tentativa=gen_random_uuid(),iniciado_em=now() where id=a.id returning * into a;return jsonb_build_object('id',a.id,'tentativa',a.tentativa,'telefone',a.telefone_aprovado,'mensagem',a.mensagem);end $$;

notify pgrst,'reload schema';commit;
