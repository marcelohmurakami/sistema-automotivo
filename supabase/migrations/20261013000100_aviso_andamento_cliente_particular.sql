begin;

create or replace function private.aviso_andamento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  msg text;
begin
  if new.situacao = old.situacao then
    return new;
  end if;

  -- A fila de automações usa um cliente cadastrado para revisar destinatário e
  -- telefone antes de enviar. OS particulares guardam os dados na própria OS;
  -- não devem criar um aviso sem destinatário nem impedir a mudança de etapa.
  -- O convite para abrir o WhatsApp ao concluir continua no fluxo da OS.
  if new.cliente_id is not null and private.has_feature(new.oficina_id, 'automations') then
    msg := case new.situacao
      when 'in_progress' then 'Seu veículo está em serviço.'
      when 'ready' then 'Seu veículo está pronto. Entre em contato para combinar a retirada.'
      when 'delivered' then 'Seu veículo foi entregue. Obrigado pela confiança!'
      else null
    end;
    if msg is not null then
      insert into public.avisos_automaticos(
        oficina_id, cliente_id, ordem_servico_id, situacao_os, chave, mensagem
      ) values (
        new.oficina_id, new.cliente_id, new.id, new.situacao,
        'os:' || new.id || ':' || new.situacao || ':' || gen_random_uuid(),
        msg || ' OS #' || new.numero
      ) on conflict do nothing;
    end if;
  end if;

  -- O histórico é registrado também para os atendimentos sem cadastro de cliente.
  insert into public.historico_ordem_servico(
    oficina_id, ordem_servico_id, tipo_evento, descricao, visivel_ao_cliente, usuario_autor_id
  ) values (
    new.oficina_id, new.id, 'status_changed',
    case new.situacao
      when 'received' then 'Veículo recebido'
      when 'in_progress' then 'Serviço em andamento'
      when 'waiting' then 'Aguardando continuidade'
      when 'ready' then 'Pronto para entrega'
      when 'delivered' then 'Veículo entregue'
      when 'cancelled' then 'Atendimento cancelado'
      else 'Situação do atendimento atualizada'
    end,
    true, auth.uid()
  );
  return new;
end;
$$;

revoke all on function private.aviso_andamento() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
