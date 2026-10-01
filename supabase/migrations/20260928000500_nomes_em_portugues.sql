-- Tradução dos nomes da aplicação. Preserva dados, IDs, documentos, códigos e permissões.
-- Gerada por supabase/tests/gerar-migracao-portugues.mjs. Não editar migrações já aplicadas.
begin;
set local lock_timeout = '10s';
alter table public.ai_runs rename to execucoes_ia;
comment on column public.execucoes_ia.id is 'id. Nome anterior: id.';
alter table public.execucoes_ia rename column workshop_id to oficina_id;
comment on column public.execucoes_ia.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.execucoes_ia rename column requested_by to solicitado_por;
comment on column public.execucoes_ia.solicitado_por is 'solicitado por. Nome anterior: requested_by.';
alter table public.execucoes_ia rename column work_order_id to ordem_servico_id;
comment on column public.execucoes_ia.ordem_servico_id is 'ordem servico id. Nome anterior: work_order_id.';
alter table public.execucoes_ia rename column task_type to tipo_tarefa;
comment on column public.execucoes_ia.tipo_tarefa is 'tipo tarefa. Nome anterior: task_type.';
alter table public.execucoes_ia rename column model to modelo;
comment on column public.execucoes_ia.modelo is 'modelo. Nome anterior: model.';
alter table public.execucoes_ia rename column prompt_template_version to versao_instrucao_ia;
comment on column public.execucoes_ia.versao_instrucao_ia is 'versao instrucao ia. Nome anterior: prompt_template_version.';
alter table public.execucoes_ia rename column idempotency_key to chave_idempotencia;
comment on column public.execucoes_ia.chave_idempotencia is 'chave idempotencia. Nome anterior: idempotency_key.';
alter table public.execucoes_ia rename column status to situacao;
comment on column public.execucoes_ia.situacao is 'situacao. Nome anterior: status.';
alter table public.execucoes_ia rename column input_tokens to tokens_entrada;
comment on column public.execucoes_ia.tokens_entrada is 'tokens entrada. Nome anterior: input_tokens.';
alter table public.execucoes_ia rename column output_tokens to tokens_saida;
comment on column public.execucoes_ia.tokens_saida is 'tokens saida. Nome anterior: output_tokens.';
alter table public.execucoes_ia rename column result to resultado;
comment on column public.execucoes_ia.resultado is 'resultado. Nome anterior: result.';
alter table public.execucoes_ia rename column reviewed_by to revisado_por;
comment on column public.execucoes_ia.revisado_por is 'revisado por. Nome anterior: reviewed_by.';
alter table public.execucoes_ia rename column reviewed_at to revisado_em;
comment on column public.execucoes_ia.revisado_em is 'revisado em. Nome anterior: reviewed_at.';
alter table public.execucoes_ia rename column created_at to criado_em;
comment on column public.execucoes_ia.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.execucoes_ia rename column finished_at to finalizado_em;
comment on column public.execucoes_ia.finalizado_em is 'finalizado em. Nome anterior: finished_at.';
comment on table public.execucoes_ia is 'execucoes ia. Nome anterior: ai_runs.';
alter table public.audit_logs rename to registros_auditoria;
comment on column public.registros_auditoria.id is 'id. Nome anterior: id.';
alter table public.registros_auditoria rename column workshop_id to oficina_id;
comment on column public.registros_auditoria.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.registros_auditoria rename column actor_user_id to usuario_autor_id;
comment on column public.registros_auditoria.usuario_autor_id is 'usuario autor id. Nome anterior: actor_user_id.';
alter table public.registros_auditoria rename column actor_connection_id to conexao_autor_id;
comment on column public.registros_auditoria.conexao_autor_id is 'conexao autor id. Nome anterior: actor_connection_id.';
alter table public.registros_auditoria rename column actor_type to tipo_autor;
comment on column public.registros_auditoria.tipo_autor is 'tipo autor. Nome anterior: actor_type.';
alter table public.registros_auditoria rename column action to acao;
comment on column public.registros_auditoria.acao is 'acao. Nome anterior: action.';
alter table public.registros_auditoria rename column entity_type to tipo_entidade;
comment on column public.registros_auditoria.tipo_entidade is 'tipo entidade. Nome anterior: entity_type.';
alter table public.registros_auditoria rename column entity_id to entidade_id;
comment on column public.registros_auditoria.entidade_id is 'entidade id. Nome anterior: entity_id.';
alter table public.registros_auditoria rename column correlation_id to correlacao_id;
comment on column public.registros_auditoria.correlacao_id is 'correlacao id. Nome anterior: correlation_id.';
alter table public.registros_auditoria rename column metadata to metadados;
comment on column public.registros_auditoria.metadados is 'metadados. Nome anterior: metadata.';
alter table public.registros_auditoria rename column created_at to criado_em;
comment on column public.registros_auditoria.criado_em is 'criado em. Nome anterior: created_at.';
comment on table public.registros_auditoria is 'registros auditoria. Nome anterior: audit_logs.';
alter table public.automation_runs rename to execucoes_automacao;
comment on column public.execucoes_automacao.id is 'id. Nome anterior: id.';
alter table public.execucoes_automacao rename column workshop_id to oficina_id;
comment on column public.execucoes_automacao.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.execucoes_automacao rename column connection_id to conexao_id;
comment on column public.execucoes_automacao.conexao_id is 'conexao id. Nome anterior: connection_id.';
alter table public.execucoes_automacao rename column source_event_id to evento_origem_id;
comment on column public.execucoes_automacao.evento_origem_id is 'evento origem id. Nome anterior: source_event_id.';
alter table public.execucoes_automacao rename column workflow_key to chave_fluxo;
comment on column public.execucoes_automacao.chave_fluxo is 'chave fluxo. Nome anterior: workflow_key.';
alter table public.execucoes_automacao rename column workflow_version to versao_fluxo;
comment on column public.execucoes_automacao.versao_fluxo is 'versao fluxo. Nome anterior: workflow_version.';
alter table public.execucoes_automacao rename column idempotency_key to chave_idempotencia;
comment on column public.execucoes_automacao.chave_idempotencia is 'chave idempotencia. Nome anterior: idempotency_key.';
alter table public.execucoes_automacao rename column request_hash to hash_solicitacao;
comment on column public.execucoes_automacao.hash_solicitacao is 'hash solicitacao. Nome anterior: request_hash.';
alter table public.execucoes_automacao rename column external_execution_id to execucao_externa_id;
comment on column public.execucoes_automacao.execucao_externa_id is 'execucao externa id. Nome anterior: external_execution_id.';
alter table public.execucoes_automacao rename column status to situacao;
comment on column public.execucoes_automacao.situacao is 'situacao. Nome anterior: status.';
alter table public.execucoes_automacao rename column result_reference to referencia_resultado;
comment on column public.execucoes_automacao.referencia_resultado is 'referencia resultado. Nome anterior: result_reference.';
alter table public.execucoes_automacao rename column started_at to iniciado_em;
comment on column public.execucoes_automacao.iniciado_em is 'iniciado em. Nome anterior: started_at.';
alter table public.execucoes_automacao rename column finished_at to finalizado_em;
comment on column public.execucoes_automacao.finalizado_em is 'finalizado em. Nome anterior: finished_at.';
alter table public.execucoes_automacao rename column error_code to codigo_erro;
comment on column public.execucoes_automacao.codigo_erro is 'codigo erro. Nome anterior: error_code.';
alter table public.execucoes_automacao rename column created_at to criado_em;
comment on column public.execucoes_automacao.criado_em is 'criado em. Nome anterior: created_at.';
comment on table public.execucoes_automacao is 'execucoes automacao. Nome anterior: automation_runs.';
alter table public.catalog_items rename to itens_catalogo;
comment on column public.itens_catalogo.id is 'id. Nome anterior: id.';
alter table public.itens_catalogo rename column workshop_id to oficina_id;
comment on column public.itens_catalogo.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.itens_catalogo rename column kind to tipo;
comment on column public.itens_catalogo.tipo is 'tipo. Nome anterior: kind.';
alter table public.itens_catalogo rename column description to descricao;
comment on column public.itens_catalogo.descricao is 'descricao. Nome anterior: description.';
alter table public.itens_catalogo rename column unit to unidade;
comment on column public.itens_catalogo.unidade is 'unidade. Nome anterior: unit.';
alter table public.itens_catalogo rename column default_unit_price_cents to preco_padrao_centavos;
comment on column public.itens_catalogo.preco_padrao_centavos is 'preco padrao centavos. Nome anterior: default_unit_price_cents.';
alter table public.itens_catalogo rename column favorite to favorito;
comment on column public.itens_catalogo.favorito is 'favorito. Nome anterior: favorite.';
alter table public.itens_catalogo rename column created_at to criado_em;
comment on column public.itens_catalogo.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.itens_catalogo rename column updated_at to atualizado_em;
comment on column public.itens_catalogo.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
alter table public.itens_catalogo rename column archived_at to arquivado_em;
comment on column public.itens_catalogo.arquivado_em is 'arquivado em. Nome anterior: archived_at.';
comment on table public.itens_catalogo is 'itens catalogo. Nome anterior: catalog_items.';
alter table public.customer_portal_access rename to acessos_portal_cliente;
alter table public.acessos_portal_cliente rename column workshop_id to oficina_id;
comment on column public.acessos_portal_cliente.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.acessos_portal_cliente rename column customer_id to cliente_id;
comment on column public.acessos_portal_cliente.cliente_id is 'cliente id. Nome anterior: customer_id.';
alter table public.acessos_portal_cliente rename column user_id to usuario_id;
comment on column public.acessos_portal_cliente.usuario_id is 'usuario id. Nome anterior: user_id.';
alter table public.acessos_portal_cliente rename column verified_at to verificado_em;
comment on column public.acessos_portal_cliente.verificado_em is 'verificado em. Nome anterior: verified_at.';
alter table public.acessos_portal_cliente rename column granted_by to concedido_por;
comment on column public.acessos_portal_cliente.concedido_por is 'concedido por. Nome anterior: granted_by.';
alter table public.acessos_portal_cliente rename column revoked_at to revogado_em;
comment on column public.acessos_portal_cliente.revogado_em is 'revogado em. Nome anterior: revoked_at.';
comment on table public.acessos_portal_cliente is 'acessos portal cliente. Nome anterior: customer_portal_access.';
alter table public.customer_vehicles rename to clientes_veiculos;
alter table public.clientes_veiculos rename column workshop_id to oficina_id;
comment on column public.clientes_veiculos.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.clientes_veiculos rename column customer_id to cliente_id;
comment on column public.clientes_veiculos.cliente_id is 'cliente id. Nome anterior: customer_id.';
alter table public.clientes_veiculos rename column vehicle_id to veiculo_id;
comment on column public.clientes_veiculos.veiculo_id is 'veiculo id. Nome anterior: vehicle_id.';
alter table public.clientes_veiculos rename column relationship to vinculo;
comment on column public.clientes_veiculos.vinculo is 'vinculo. Nome anterior: relationship.';
alter table public.clientes_veiculos rename column created_at to criado_em;
comment on column public.clientes_veiculos.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.clientes_veiculos rename column ended_at to encerrado_em;
comment on column public.clientes_veiculos.encerrado_em is 'encerrado em. Nome anterior: ended_at.';
comment on table public.clientes_veiculos is 'clientes veiculos. Nome anterior: customer_vehicles.';
alter table public.customers rename to clientes;
comment on column public.clientes.id is 'id. Nome anterior: id.';
alter table public.clientes rename column workshop_id to oficina_id;
comment on column public.clientes.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.clientes rename column name to nome;
comment on column public.clientes.nome is 'nome. Nome anterior: name.';
alter table public.clientes rename column phone_e164 to telefone_e164;
comment on column public.clientes.telefone_e164 is 'telefone e164. Nome anterior: phone_e164.';
comment on column public.clientes.email is 'email. Nome anterior: email.';
alter table public.clientes rename column created_at to criado_em;
comment on column public.clientes.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.clientes rename column updated_at to atualizado_em;
comment on column public.clientes.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
alter table public.clientes rename column archived_at to arquivado_em;
comment on column public.clientes.arquivado_em is 'arquivado em. Nome anterior: archived_at.';
comment on table public.clientes is 'clientes. Nome anterior: customers.';
alter table public.domain_events rename to eventos_negocio;
comment on column public.eventos_negocio.id is 'id. Nome anterior: id.';
alter table public.eventos_negocio rename column workshop_id to oficina_id;
comment on column public.eventos_negocio.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.eventos_negocio rename column event_type to tipo_evento;
comment on column public.eventos_negocio.tipo_evento is 'tipo evento. Nome anterior: event_type.';
alter table public.eventos_negocio rename column schema_version to versao_estrutura;
comment on column public.eventos_negocio.versao_estrutura is 'versao estrutura. Nome anterior: schema_version.';
alter table public.eventos_negocio rename column aggregate_type to tipo_agregado;
comment on column public.eventos_negocio.tipo_agregado is 'tipo agregado. Nome anterior: aggregate_type.';
alter table public.eventos_negocio rename column aggregate_id to agregado_id;
comment on column public.eventos_negocio.agregado_id is 'agregado id. Nome anterior: aggregate_id.';
alter table public.eventos_negocio rename column aggregate_version to versao_agregado;
comment on column public.eventos_negocio.versao_agregado is 'versao agregado. Nome anterior: aggregate_version.';
alter table public.eventos_negocio rename column correlation_id to correlacao_id;
comment on column public.eventos_negocio.correlacao_id is 'correlacao id. Nome anterior: correlation_id.';
alter table public.eventos_negocio rename column causation_id to causa_id;
comment on column public.eventos_negocio.causa_id is 'causa id. Nome anterior: causation_id.';
alter table public.eventos_negocio rename column deduplication_key to chave_deduplicacao;
comment on column public.eventos_negocio.chave_deduplicacao is 'chave deduplicacao. Nome anterior: deduplication_key.';
alter table public.eventos_negocio rename column payload to dados;
comment on column public.eventos_negocio.dados is 'dados. Nome anterior: payload.';
alter table public.eventos_negocio rename column occurred_at to ocorrido_em;
comment on column public.eventos_negocio.ocorrido_em is 'ocorrido em. Nome anterior: occurred_at.';
comment on table public.eventos_negocio is 'eventos negocio. Nome anterior: domain_events.';
alter table public.event_deliveries rename to entregas_evento;
comment on column public.entregas_evento.id is 'id. Nome anterior: id.';
alter table public.entregas_evento rename column workshop_id to oficina_id;
comment on column public.entregas_evento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.entregas_evento rename column event_id to evento_id;
comment on column public.entregas_evento.evento_id is 'evento id. Nome anterior: event_id.';
alter table public.entregas_evento rename column connection_id to conexao_id;
comment on column public.entregas_evento.conexao_id is 'conexao id. Nome anterior: connection_id.';
alter table public.entregas_evento rename column status to situacao;
comment on column public.entregas_evento.situacao is 'situacao. Nome anterior: status.';
alter table public.entregas_evento rename column attempts to tentativas;
comment on column public.entregas_evento.tentativas is 'tentativas. Nome anterior: attempts.';
alter table public.entregas_evento rename column max_attempts to maximo_tentativas;
comment on column public.entregas_evento.maximo_tentativas is 'maximo tentativas. Nome anterior: max_attempts.';
alter table public.entregas_evento rename column next_attempt_at to proxima_tentativa_em;
comment on column public.entregas_evento.proxima_tentativa_em is 'proxima tentativa em. Nome anterior: next_attempt_at.';
alter table public.entregas_evento rename column lease_token to token_reserva;
comment on column public.entregas_evento.token_reserva is 'token reserva. Nome anterior: lease_token.';
alter table public.entregas_evento rename column locked_until to reservado_ate;
comment on column public.entregas_evento.reservado_ate is 'reservado ate. Nome anterior: locked_until.';
alter table public.entregas_evento rename column last_http_status to ultimo_codigo_http;
comment on column public.entregas_evento.ultimo_codigo_http is 'ultimo codigo http. Nome anterior: last_http_status.';
alter table public.entregas_evento rename column last_error_code to ultimo_codigo_erro;
comment on column public.entregas_evento.ultimo_codigo_erro is 'ultimo codigo erro. Nome anterior: last_error_code.';
alter table public.entregas_evento rename column accepted_at to aceito_em;
comment on column public.entregas_evento.aceito_em is 'aceito em. Nome anterior: accepted_at.';
alter table public.entregas_evento rename column created_at to criado_em;
comment on column public.entregas_evento.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.entregas_evento rename column updated_at to atualizado_em;
comment on column public.entregas_evento.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.entregas_evento is 'entregas evento. Nome anterior: event_deliveries.';
alter table public.event_delivery_attempts rename to tentativas_entrega_evento;
comment on column public.tentativas_entrega_evento.id is 'id. Nome anterior: id.';
alter table public.tentativas_entrega_evento rename column workshop_id to oficina_id;
comment on column public.tentativas_entrega_evento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.tentativas_entrega_evento rename column delivery_id to entrega_id;
comment on column public.tentativas_entrega_evento.entrega_id is 'entrega id. Nome anterior: delivery_id.';
alter table public.tentativas_entrega_evento rename column attempt_number to numero_tentativa;
comment on column public.tentativas_entrega_evento.numero_tentativa is 'numero tentativa. Nome anterior: attempt_number.';
alter table public.tentativas_entrega_evento rename column started_at to iniciado_em;
comment on column public.tentativas_entrega_evento.iniciado_em is 'iniciado em. Nome anterior: started_at.';
alter table public.tentativas_entrega_evento rename column finished_at to finalizado_em;
comment on column public.tentativas_entrega_evento.finalizado_em is 'finalizado em. Nome anterior: finished_at.';
alter table public.tentativas_entrega_evento rename column http_status to codigo_http;
comment on column public.tentativas_entrega_evento.codigo_http is 'codigo http. Nome anterior: http_status.';
alter table public.tentativas_entrega_evento rename column error_code to codigo_erro;
comment on column public.tentativas_entrega_evento.codigo_erro is 'codigo erro. Nome anterior: error_code.';
comment on table public.tentativas_entrega_evento is 'tentativas entrega evento. Nome anterior: event_delivery_attempts.';
alter table public.file_assets rename to arquivos;
comment on column public.arquivos.id is 'id. Nome anterior: id.';
alter table public.arquivos rename column workshop_id to oficina_id;
comment on column public.arquivos.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.arquivos rename column bucket to recipiente;
comment on column public.arquivos.recipiente is 'recipiente. Nome anterior: bucket.';
alter table public.arquivos rename column object_path to caminho_arquivo;
comment on column public.arquivos.caminho_arquivo is 'caminho arquivo. Nome anterior: object_path.';
alter table public.arquivos rename column original_name to nome_original;
comment on column public.arquivos.nome_original is 'nome original. Nome anterior: original_name.';
alter table public.arquivos rename column mime_type to tipo_mime;
comment on column public.arquivos.tipo_mime is 'tipo mime. Nome anterior: mime_type.';
alter table public.arquivos rename column size_bytes to tamanho_bytes;
comment on column public.arquivos.tamanho_bytes is 'tamanho bytes. Nome anterior: size_bytes.';
comment on column public.arquivos.sha256 is 'sha256. Nome anterior: sha256.';
alter table public.arquivos rename column status to situacao;
comment on column public.arquivos.situacao is 'situacao. Nome anterior: status.';
alter table public.arquivos rename column created_by to criado_por;
comment on column public.arquivos.criado_por is 'criado por. Nome anterior: created_by.';
alter table public.arquivos rename column created_at to criado_em;
comment on column public.arquivos.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.arquivos rename column updated_at to atualizado_em;
comment on column public.arquivos.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.arquivos is 'arquivos. Nome anterior: file_assets.';
alter table public.integration_api_keys rename to chaves_api_integracao;
comment on column public.chaves_api_integracao.id is 'id. Nome anterior: id.';
alter table public.chaves_api_integracao rename column workshop_id to oficina_id;
comment on column public.chaves_api_integracao.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.chaves_api_integracao rename column connection_id to conexao_id;
comment on column public.chaves_api_integracao.conexao_id is 'conexao id. Nome anterior: connection_id.';
alter table public.chaves_api_integracao rename column key_hash to hash_chave;
comment on column public.chaves_api_integracao.hash_chave is 'hash chave. Nome anterior: key_hash.';
alter table public.chaves_api_integracao rename column scopes to escopos;
comment on column public.chaves_api_integracao.escopos is 'escopos. Nome anterior: scopes.';
alter table public.chaves_api_integracao rename column expires_at to expira_em;
comment on column public.chaves_api_integracao.expira_em is 'expira em. Nome anterior: expires_at.';
alter table public.chaves_api_integracao rename column revoked_at to revogado_em;
comment on column public.chaves_api_integracao.revogado_em is 'revogado em. Nome anterior: revoked_at.';
alter table public.chaves_api_integracao rename column created_at to criado_em;
comment on column public.chaves_api_integracao.criado_em is 'criado em. Nome anterior: created_at.';
comment on table public.chaves_api_integracao is 'chaves api integracao. Nome anterior: integration_api_keys.';
alter table public.integration_connections rename to conexoes_integracao;
comment on column public.conexoes_integracao.id is 'id. Nome anterior: id.';
alter table public.conexoes_integracao rename column workshop_id to oficina_id;
comment on column public.conexoes_integracao.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.conexoes_integracao rename column name to nome;
comment on column public.conexoes_integracao.nome is 'nome. Nome anterior: name.';
alter table public.conexoes_integracao rename column kind to tipo;
comment on column public.conexoes_integracao.tipo is 'tipo. Nome anterior: kind.';
alter table public.conexoes_integracao rename column endpoint_url to url_destino;
comment on column public.conexoes_integracao.url_destino is 'url destino. Nome anterior: endpoint_url.';
alter table public.conexoes_integracao rename column credentials_ref to referencia_credenciais;
comment on column public.conexoes_integracao.referencia_credenciais is 'referencia credenciais. Nome anterior: credentials_ref.';
alter table public.conexoes_integracao rename column enabled to habilitado;
comment on column public.conexoes_integracao.habilitado is 'habilitado. Nome anterior: enabled.';
alter table public.conexoes_integracao rename column created_at to criado_em;
comment on column public.conexoes_integracao.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.conexoes_integracao rename column updated_at to atualizado_em;
comment on column public.conexoes_integracao.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.conexoes_integracao is 'conexoes integracao. Nome anterior: integration_connections.';
alter table public.integration_subscriptions rename to assinaturas_eventos;
alter table public.assinaturas_eventos rename column workshop_id to oficina_id;
comment on column public.assinaturas_eventos.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.assinaturas_eventos rename column connection_id to conexao_id;
comment on column public.assinaturas_eventos.conexao_id is 'conexao id. Nome anterior: connection_id.';
alter table public.assinaturas_eventos rename column event_type to tipo_evento;
comment on column public.assinaturas_eventos.tipo_evento is 'tipo evento. Nome anterior: event_type.';
alter table public.assinaturas_eventos rename column enabled to habilitado;
comment on column public.assinaturas_eventos.habilitado is 'habilitado. Nome anterior: enabled.';
alter table public.assinaturas_eventos rename column subscribed_at to assinado_em;
comment on column public.assinaturas_eventos.assinado_em is 'assinado em. Nome anterior: subscribed_at.';
comment on table public.assinaturas_eventos is 'assinaturas eventos. Nome anterior: integration_subscriptions.';
alter table public.message_attempts rename to tentativas_mensagem;
comment on column public.tentativas_mensagem.id is 'id. Nome anterior: id.';
alter table public.tentativas_mensagem rename column workshop_id to oficina_id;
comment on column public.tentativas_mensagem.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.tentativas_mensagem rename column message_job_id to mensagem_id;
comment on column public.tentativas_mensagem.mensagem_id is 'mensagem id. Nome anterior: message_job_id.';
alter table public.tentativas_mensagem rename column attempt_number to numero_tentativa;
comment on column public.tentativas_mensagem.numero_tentativa is 'numero tentativa. Nome anterior: attempt_number.';
alter table public.tentativas_mensagem rename column started_at to iniciado_em;
comment on column public.tentativas_mensagem.iniciado_em is 'iniciado em. Nome anterior: started_at.';
alter table public.tentativas_mensagem rename column finished_at to finalizado_em;
comment on column public.tentativas_mensagem.finalizado_em is 'finalizado em. Nome anterior: finished_at.';
alter table public.tentativas_mensagem rename column result to resultado;
comment on column public.tentativas_mensagem.resultado is 'resultado. Nome anterior: result.';
alter table public.tentativas_mensagem rename column http_status to codigo_http;
comment on column public.tentativas_mensagem.codigo_http is 'codigo http. Nome anterior: http_status.';
alter table public.tentativas_mensagem rename column error_code to codigo_erro;
comment on column public.tentativas_mensagem.codigo_erro is 'codigo erro. Nome anterior: error_code.';
comment on table public.tentativas_mensagem is 'tentativas mensagem. Nome anterior: message_attempts.';
alter table public.message_events rename to eventos_mensagem;
comment on column public.eventos_mensagem.id is 'id. Nome anterior: id.';
alter table public.eventos_mensagem rename column workshop_id to oficina_id;
comment on column public.eventos_mensagem.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.eventos_mensagem rename column connection_id to conexao_id;
comment on column public.eventos_mensagem.conexao_id is 'conexao id. Nome anterior: connection_id.';
alter table public.eventos_mensagem rename column message_job_id to mensagem_id;
comment on column public.eventos_mensagem.mensagem_id is 'mensagem id. Nome anterior: message_job_id.';
alter table public.eventos_mensagem rename column provider_message_id to mensagem_provedor_id;
comment on column public.eventos_mensagem.mensagem_provedor_id is 'mensagem provedor id. Nome anterior: provider_message_id.';
alter table public.eventos_mensagem rename column provider_event_key to chave_evento_provedor;
comment on column public.eventos_mensagem.chave_evento_provedor is 'chave evento provedor. Nome anterior: provider_event_key.';
alter table public.eventos_mensagem rename column event_type to tipo_evento;
comment on column public.eventos_mensagem.tipo_evento is 'tipo evento. Nome anterior: event_type.';
alter table public.eventos_mensagem rename column provider_occurred_at to ocorrido_no_provedor_em;
comment on column public.eventos_mensagem.ocorrido_no_provedor_em is 'ocorrido no provedor em. Nome anterior: provider_occurred_at.';
alter table public.eventos_mensagem rename column received_at to recebido_em;
comment on column public.eventos_mensagem.recebido_em is 'recebido em. Nome anterior: received_at.';
alter table public.eventos_mensagem rename column processed_at to processado_em;
comment on column public.eventos_mensagem.processado_em is 'processado em. Nome anterior: processed_at.';
alter table public.eventos_mensagem rename column processing_error_code to codigo_erro_processamento;
comment on column public.eventos_mensagem.codigo_erro_processamento is 'codigo erro processamento. Nome anterior: processing_error_code.';
alter table public.eventos_mensagem rename column payload to dados;
comment on column public.eventos_mensagem.dados is 'dados. Nome anterior: payload.';
comment on table public.eventos_mensagem is 'eventos mensagem. Nome anterior: message_events.';
alter table public.message_jobs rename to fila_mensagens;
comment on column public.fila_mensagens.id is 'id. Nome anterior: id.';
alter table public.fila_mensagens rename column workshop_id to oficina_id;
comment on column public.fila_mensagens.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.fila_mensagens rename column quote_version_id to versao_orcamento_id;
comment on column public.fila_mensagens.versao_orcamento_id is 'versao orcamento id. Nome anterior: quote_version_id.';
alter table public.fila_mensagens rename column connection_id to conexao_id;
comment on column public.fila_mensagens.conexao_id is 'conexao id. Nome anterior: connection_id.';
alter table public.fila_mensagens rename column document_id to documento_id;
comment on column public.fila_mensagens.documento_id is 'documento id. Nome anterior: document_id.';
alter table public.fila_mensagens rename column source_event_id to evento_origem_id;
comment on column public.fila_mensagens.evento_origem_id is 'evento origem id. Nome anterior: source_event_id.';
alter table public.fila_mensagens rename column recipient_e164 to destinatario_e164;
comment on column public.fila_mensagens.destinatario_e164 is 'destinatario e164. Nome anterior: recipient_e164.';
alter table public.fila_mensagens rename column purpose to finalidade;
comment on column public.fila_mensagens.finalidade is 'finalidade. Nome anterior: purpose.';
alter table public.fila_mensagens rename column idempotency_key to chave_idempotencia;
comment on column public.fila_mensagens.chave_idempotencia is 'chave idempotencia. Nome anterior: idempotency_key.';
alter table public.fila_mensagens rename column provider_template_name to nome_modelo_provedor;
comment on column public.fila_mensagens.nome_modelo_provedor is 'nome modelo provedor. Nome anterior: provider_template_name.';
alter table public.fila_mensagens rename column status to situacao;
comment on column public.fila_mensagens.situacao is 'situacao. Nome anterior: status.';
alter table public.fila_mensagens rename column provider_message_id to mensagem_provedor_id;
comment on column public.fila_mensagens.mensagem_provedor_id is 'mensagem provedor id. Nome anterior: provider_message_id.';
alter table public.fila_mensagens rename column attempts to tentativas;
comment on column public.fila_mensagens.tentativas is 'tentativas. Nome anterior: attempts.';
alter table public.fila_mensagens rename column max_attempts to maximo_tentativas;
comment on column public.fila_mensagens.maximo_tentativas is 'maximo tentativas. Nome anterior: max_attempts.';
alter table public.fila_mensagens rename column next_attempt_at to proxima_tentativa_em;
comment on column public.fila_mensagens.proxima_tentativa_em is 'proxima tentativa em. Nome anterior: next_attempt_at.';
alter table public.fila_mensagens rename column lease_token to token_reserva;
comment on column public.fila_mensagens.token_reserva is 'token reserva. Nome anterior: lease_token.';
alter table public.fila_mensagens rename column locked_until to reservado_ate;
comment on column public.fila_mensagens.reservado_ate is 'reservado ate. Nome anterior: locked_until.';
alter table public.fila_mensagens rename column last_error_code to ultimo_codigo_erro;
comment on column public.fila_mensagens.ultimo_codigo_erro is 'ultimo codigo erro. Nome anterior: last_error_code.';
alter table public.fila_mensagens rename column accepted_at to aceito_em;
comment on column public.fila_mensagens.aceito_em is 'aceito em. Nome anterior: accepted_at.';
alter table public.fila_mensagens rename column delivered_at to entregue_em;
comment on column public.fila_mensagens.entregue_em is 'entregue em. Nome anterior: delivered_at.';
alter table public.fila_mensagens rename column read_at to lido_em;
comment on column public.fila_mensagens.lido_em is 'lido em. Nome anterior: read_at.';
alter table public.fila_mensagens rename column created_at to criado_em;
comment on column public.fila_mensagens.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.fila_mensagens rename column updated_at to atualizado_em;
comment on column public.fila_mensagens.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.fila_mensagens is 'fila mensagens. Nome anterior: message_jobs.';
alter table public.part_request_items rename to itens_pedido_pecas;
comment on column public.itens_pedido_pecas.id is 'id. Nome anterior: id.';
alter table public.itens_pedido_pecas rename column workshop_id to oficina_id;
comment on column public.itens_pedido_pecas.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.itens_pedido_pecas rename column request_id to pedido_id;
comment on column public.itens_pedido_pecas.pedido_id is 'pedido id. Nome anterior: request_id.';
alter table public.itens_pedido_pecas rename column site_product_id to produto_site_id;
comment on column public.itens_pedido_pecas.produto_site_id is 'produto site id. Nome anterior: site_product_id.';
alter table public.itens_pedido_pecas rename column description to descricao;
comment on column public.itens_pedido_pecas.descricao is 'descricao. Nome anterior: description.';
alter table public.itens_pedido_pecas rename column quantity to quantidade;
comment on column public.itens_pedido_pecas.quantidade is 'quantidade. Nome anterior: quantity.';
alter table public.itens_pedido_pecas rename column quoted_unit_price_cents to preco_cotado_centavos;
comment on column public.itens_pedido_pecas.preco_cotado_centavos is 'preco cotado centavos. Nome anterior: quoted_unit_price_cents.';
comment on table public.itens_pedido_pecas is 'itens pedido pecas. Nome anterior: part_request_items.';
alter table public.part_requests rename to pedidos_pecas;
comment on column public.pedidos_pecas.id is 'id. Nome anterior: id.';
alter table public.pedidos_pecas rename column workshop_id to oficina_id;
comment on column public.pedidos_pecas.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.pedidos_pecas rename column customer_id to cliente_id;
comment on column public.pedidos_pecas.cliente_id is 'cliente id. Nome anterior: customer_id.';
alter table public.pedidos_pecas rename column requested_by to solicitado_por;
comment on column public.pedidos_pecas.solicitado_por is 'solicitado por. Nome anterior: requested_by.';
alter table public.pedidos_pecas rename column idempotency_key to chave_idempotencia;
comment on column public.pedidos_pecas.chave_idempotencia is 'chave idempotencia. Nome anterior: idempotency_key.';
alter table public.pedidos_pecas rename column status to situacao;
comment on column public.pedidos_pecas.situacao is 'situacao. Nome anterior: status.';
alter table public.pedidos_pecas rename column customer_notes to observacoes_cliente;
comment on column public.pedidos_pecas.observacoes_cliente is 'observacoes cliente. Nome anterior: customer_notes.';
alter table public.pedidos_pecas rename column internal_notes to observacoes_internas;
comment on column public.pedidos_pecas.observacoes_internas is 'observacoes internas. Nome anterior: internal_notes.';
alter table public.pedidos_pecas rename column created_at to criado_em;
comment on column public.pedidos_pecas.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.pedidos_pecas rename column updated_at to atualizado_em;
comment on column public.pedidos_pecas.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
alter table public.pedidos_pecas rename column request_hash to hash_solicitacao;
comment on column public.pedidos_pecas.hash_solicitacao is 'hash solicitacao. Nome anterior: request_hash.';
comment on table public.pedidos_pecas is 'pedidos pecas. Nome anterior: part_requests.';
alter table public.production_stages rename to etapas_producao;
comment on column public.etapas_producao.id is 'id. Nome anterior: id.';
alter table public.etapas_producao rename column workshop_id to oficina_id;
comment on column public.etapas_producao.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.etapas_producao rename column name to nome;
comment on column public.etapas_producao.nome is 'nome. Nome anterior: name.';
alter table public.etapas_producao rename column position to posicao;
comment on column public.etapas_producao.posicao is 'posicao. Nome anterior: position.';
alter table public.etapas_producao rename column color to cor;
comment on column public.etapas_producao.cor is 'cor. Nome anterior: color.';
alter table public.etapas_producao rename column active to ativo;
comment on column public.etapas_producao.ativo is 'ativo. Nome anterior: active.';
comment on table public.etapas_producao is 'etapas producao. Nome anterior: production_stages.';
alter table public.quote_access_tokens rename to tokens_acesso_orcamento;
comment on column public.tokens_acesso_orcamento.id is 'id. Nome anterior: id.';
alter table public.tokens_acesso_orcamento rename column workshop_id to oficina_id;
comment on column public.tokens_acesso_orcamento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.tokens_acesso_orcamento rename column quote_version_id to versao_orcamento_id;
comment on column public.tokens_acesso_orcamento.versao_orcamento_id is 'versao orcamento id. Nome anterior: quote_version_id.';
alter table public.tokens_acesso_orcamento rename column token_hash to hash_token;
comment on column public.tokens_acesso_orcamento.hash_token is 'hash token. Nome anterior: token_hash.';
alter table public.tokens_acesso_orcamento rename column secret_ref to referencia_segredo;
comment on column public.tokens_acesso_orcamento.referencia_segredo is 'referencia segredo. Nome anterior: secret_ref.';
alter table public.tokens_acesso_orcamento rename column expires_at to expira_em;
comment on column public.tokens_acesso_orcamento.expira_em is 'expira em. Nome anterior: expires_at.';
alter table public.tokens_acesso_orcamento rename column revoked_at to revogado_em;
comment on column public.tokens_acesso_orcamento.revogado_em is 'revogado em. Nome anterior: revoked_at.';
alter table public.tokens_acesso_orcamento rename column created_at to criado_em;
comment on column public.tokens_acesso_orcamento.criado_em is 'criado em. Nome anterior: created_at.';
comment on table public.tokens_acesso_orcamento is 'tokens acesso orcamento. Nome anterior: quote_access_tokens.';
alter table public.quote_approvals rename to aprovacoes_orcamento;
comment on column public.aprovacoes_orcamento.id is 'id. Nome anterior: id.';
alter table public.aprovacoes_orcamento rename column workshop_id to oficina_id;
comment on column public.aprovacoes_orcamento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.aprovacoes_orcamento rename column quote_version_id to versao_orcamento_id;
comment on column public.aprovacoes_orcamento.versao_orcamento_id is 'versao orcamento id. Nome anterior: quote_version_id.';
alter table public.aprovacoes_orcamento rename column access_token_id to token_acesso_id;
comment on column public.aprovacoes_orcamento.token_acesso_id is 'token acesso id. Nome anterior: access_token_id.';
alter table public.aprovacoes_orcamento rename column decision to decisao;
comment on column public.aprovacoes_orcamento.decisao is 'decisao. Nome anterior: decision.';
alter table public.aprovacoes_orcamento rename column declared_name to nome_informado;
comment on column public.aprovacoes_orcamento.nome_informado is 'nome informado. Nome anterior: declared_name.';
alter table public.aprovacoes_orcamento rename column verification_method to metodo_verificacao;
comment on column public.aprovacoes_orcamento.metodo_verificacao is 'metodo verificacao. Nome anterior: verification_method.';
alter table public.aprovacoes_orcamento rename column confirmation_text to texto_confirmacao;
comment on column public.aprovacoes_orcamento.texto_confirmacao is 'texto confirmacao. Nome anterior: confirmation_text.';
alter table public.aprovacoes_orcamento rename column confirmed_at to confirmado_em;
comment on column public.aprovacoes_orcamento.confirmado_em is 'confirmado em. Nome anterior: confirmed_at.';
comment on table public.aprovacoes_orcamento is 'aprovacoes orcamento. Nome anterior: quote_approvals.';
alter table public.quote_attachments rename to anexos_orcamento;
comment on column public.anexos_orcamento.id is 'id. Nome anterior: id.';
alter table public.anexos_orcamento rename column workshop_id to oficina_id;
comment on column public.anexos_orcamento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.anexos_orcamento rename column quote_version_id to versao_orcamento_id;
comment on column public.anexos_orcamento.versao_orcamento_id is 'versao orcamento id. Nome anterior: quote_version_id.';
alter table public.anexos_orcamento rename column file_asset_id to arquivo_id;
comment on column public.anexos_orcamento.arquivo_id is 'arquivo id. Nome anterior: file_asset_id.';
alter table public.anexos_orcamento rename column caption to legenda;
comment on column public.anexos_orcamento.legenda is 'legenda. Nome anterior: caption.';
alter table public.anexos_orcamento rename column visible_to_customer to visivel_ao_cliente;
comment on column public.anexos_orcamento.visivel_ao_cliente is 'visivel ao cliente. Nome anterior: visible_to_customer.';
alter table public.anexos_orcamento rename column created_at to criado_em;
comment on column public.anexos_orcamento.criado_em is 'criado em. Nome anterior: created_at.';
comment on table public.anexos_orcamento is 'anexos orcamento. Nome anterior: quote_attachments.';
alter table public.quote_documents rename to documentos_orcamento;
comment on column public.documentos_orcamento.id is 'id. Nome anterior: id.';
alter table public.documentos_orcamento rename column workshop_id to oficina_id;
comment on column public.documentos_orcamento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.documentos_orcamento rename column quote_version_id to versao_orcamento_id;
comment on column public.documentos_orcamento.versao_orcamento_id is 'versao orcamento id. Nome anterior: quote_version_id.';
alter table public.documentos_orcamento rename column file_asset_id to arquivo_id;
comment on column public.documentos_orcamento.arquivo_id is 'arquivo id. Nome anterior: file_asset_id.';
alter table public.documentos_orcamento rename column template_version to versao_modelo;
comment on column public.documentos_orcamento.versao_modelo is 'versao modelo. Nome anterior: template_version.';
alter table public.documentos_orcamento rename column generated_at to gerado_em;
comment on column public.documentos_orcamento.gerado_em is 'gerado em. Nome anterior: generated_at.';
comment on table public.documentos_orcamento is 'documentos orcamento. Nome anterior: quote_documents.';
alter table public.quote_items rename to itens_orcamento;
comment on column public.itens_orcamento.id is 'id. Nome anterior: id.';
alter table public.itens_orcamento rename column workshop_id to oficina_id;
comment on column public.itens_orcamento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.itens_orcamento rename column quote_version_id to versao_orcamento_id;
comment on column public.itens_orcamento.versao_orcamento_id is 'versao orcamento id. Nome anterior: quote_version_id.';
alter table public.itens_orcamento rename column catalog_item_id to item_catalogo_id;
comment on column public.itens_orcamento.item_catalogo_id is 'item catalogo id. Nome anterior: catalog_item_id.';
alter table public.itens_orcamento rename column position to posicao;
comment on column public.itens_orcamento.posicao is 'posicao. Nome anterior: position.';
alter table public.itens_orcamento rename column kind to tipo;
comment on column public.itens_orcamento.tipo is 'tipo. Nome anterior: kind.';
alter table public.itens_orcamento rename column description to descricao;
comment on column public.itens_orcamento.descricao is 'descricao. Nome anterior: description.';
alter table public.itens_orcamento rename column unit to unidade;
comment on column public.itens_orcamento.unidade is 'unidade. Nome anterior: unit.';
alter table public.itens_orcamento rename column quantity to quantidade;
comment on column public.itens_orcamento.quantidade is 'quantidade. Nome anterior: quantity.';
alter table public.itens_orcamento rename column unit_price_cents to preco_unitario_centavos;
comment on column public.itens_orcamento.preco_unitario_centavos is 'preco unitario centavos. Nome anterior: unit_price_cents.';
alter table public.itens_orcamento rename column line_total_cents to total_item_centavos;
comment on column public.itens_orcamento.total_item_centavos is 'total item centavos. Nome anterior: line_total_cents.';
alter table public.itens_orcamento rename column created_at to criado_em;
comment on column public.itens_orcamento.criado_em is 'criado em. Nome anterior: created_at.';
comment on table public.itens_orcamento is 'itens orcamento. Nome anterior: quote_items.';
alter table public.quote_versions rename to versoes_orcamento;
comment on column public.versoes_orcamento.id is 'id. Nome anterior: id.';
alter table public.versoes_orcamento rename column workshop_id to oficina_id;
comment on column public.versoes_orcamento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.versoes_orcamento rename column quote_id to orcamento_id;
comment on column public.versoes_orcamento.orcamento_id is 'orcamento id. Nome anterior: quote_id.';
alter table public.versoes_orcamento rename column version_number to numero_versao;
comment on column public.versoes_orcamento.numero_versao is 'numero versao. Nome anterior: version_number.';
alter table public.versoes_orcamento rename column snapshot_schema_version to versao_estrutura_dados;
comment on column public.versoes_orcamento.versao_estrutura_dados is 'versao estrutura dados. Nome anterior: snapshot_schema_version.';
alter table public.versoes_orcamento rename column workshop_snapshot to dados_oficina;
comment on column public.versoes_orcamento.dados_oficina is 'dados oficina. Nome anterior: workshop_snapshot.';
alter table public.versoes_orcamento rename column customer_snapshot to dados_cliente;
comment on column public.versoes_orcamento.dados_cliente is 'dados cliente. Nome anterior: customer_snapshot.';
alter table public.versoes_orcamento rename column vehicle_snapshot to dados_veiculo;
comment on column public.versoes_orcamento.dados_veiculo is 'dados veiculo. Nome anterior: vehicle_snapshot.';
alter table public.versoes_orcamento rename column notes to observacoes;
comment on column public.versoes_orcamento.observacoes is 'observacoes. Nome anterior: notes.';
alter table public.versoes_orcamento rename column terms to condicoes;
comment on column public.versoes_orcamento.condicoes is 'condicoes. Nome anterior: terms.';
alter table public.versoes_orcamento rename column currency to moeda;
comment on column public.versoes_orcamento.moeda is 'moeda. Nome anterior: currency.';
alter table public.versoes_orcamento rename column subtotal_cents to subtotal_centavos;
comment on column public.versoes_orcamento.subtotal_centavos is 'subtotal centavos. Nome anterior: subtotal_cents.';
alter table public.versoes_orcamento rename column discount_cents to desconto_centavos;
comment on column public.versoes_orcamento.desconto_centavos is 'desconto centavos. Nome anterior: discount_cents.';
alter table public.versoes_orcamento rename column total_cents to total_centavos;
comment on column public.versoes_orcamento.total_centavos is 'total centavos. Nome anterior: total_cents.';
alter table public.versoes_orcamento rename column expires_at to expira_em;
comment on column public.versoes_orcamento.expira_em is 'expira em. Nome anterior: expires_at.';
alter table public.versoes_orcamento rename column published_at to publicado_em;
comment on column public.versoes_orcamento.publicado_em is 'publicado em. Nome anterior: published_at.';
alter table public.versoes_orcamento rename column created_by to criado_por;
comment on column public.versoes_orcamento.criado_por is 'criado por. Nome anterior: created_by.';
alter table public.versoes_orcamento rename column created_at to criado_em;
comment on column public.versoes_orcamento.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.versoes_orcamento rename column updated_at to atualizado_em;
comment on column public.versoes_orcamento.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.versoes_orcamento is 'versoes orcamento. Nome anterior: quote_versions.';
alter table public.quotes rename to orcamentos;
comment on column public.orcamentos.id is 'id. Nome anterior: id.';
alter table public.orcamentos rename column workshop_id to oficina_id;
comment on column public.orcamentos.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.orcamentos rename column number to numero;
comment on column public.orcamentos.numero is 'numero. Nome anterior: number.';
alter table public.orcamentos rename column customer_id to cliente_id;
comment on column public.orcamentos.cliente_id is 'cliente id. Nome anterior: customer_id.';
alter table public.orcamentos rename column vehicle_id to veiculo_id;
comment on column public.orcamentos.veiculo_id is 'veiculo id. Nome anterior: vehicle_id.';
alter table public.orcamentos rename column status to situacao;
comment on column public.orcamentos.situacao is 'situacao. Nome anterior: status.';
alter table public.orcamentos rename column current_version_id to versao_atual_id;
comment on column public.orcamentos.versao_atual_id is 'versao atual id. Nome anterior: current_version_id.';
alter table public.orcamentos rename column lock_version to revisao;
comment on column public.orcamentos.revisao is 'revisao. Nome anterior: lock_version.';
alter table public.orcamentos rename column created_by to criado_por;
comment on column public.orcamentos.criado_por is 'criado por. Nome anterior: created_by.';
alter table public.orcamentos rename column created_at to criado_em;
comment on column public.orcamentos.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.orcamentos rename column updated_at to atualizado_em;
comment on column public.orcamentos.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
alter table public.orcamentos rename column archived_at to arquivado_em;
comment on column public.orcamentos.arquivado_em is 'arquivado em. Nome anterior: archived_at.';
comment on table public.orcamentos is 'orcamentos. Nome anterior: quotes.';
alter table public.saas_features rename to recursos;
alter table public.recursos rename column code to codigo;
comment on column public.recursos.codigo is 'codigo. Nome anterior: code.';
alter table public.recursos rename column description to descricao;
comment on column public.recursos.descricao is 'descricao. Nome anterior: description.';
comment on table public.recursos is 'recursos. Nome anterior: saas_features.';
alter table public.saas_plan_features rename to recursos_plano;
alter table public.recursos_plano rename column plan_code to codigo_plano;
comment on column public.recursos_plano.codigo_plano is 'codigo plano. Nome anterior: plan_code.';
alter table public.recursos_plano rename column feature_code to codigo_recurso;
comment on column public.recursos_plano.codigo_recurso is 'codigo recurso. Nome anterior: feature_code.';
alter table public.recursos_plano rename column enabled to habilitado;
comment on column public.recursos_plano.habilitado is 'habilitado. Nome anterior: enabled.';
comment on table public.recursos_plano is 'recursos plano. Nome anterior: saas_plan_features.';
alter table public.saas_plans rename to planos;
alter table public.planos rename column code to codigo;
comment on column public.planos.codigo is 'codigo. Nome anterior: code.';
alter table public.planos rename column name to nome;
comment on column public.planos.nome is 'nome. Nome anterior: name.';
alter table public.planos rename column active to ativo;
comment on column public.planos.ativo is 'ativo. Nome anterior: active.';
comment on table public.planos is 'planos. Nome anterior: saas_plans.';
alter table public.scheduled_actions rename to acoes_agendadas;
comment on column public.acoes_agendadas.id is 'id. Nome anterior: id.';
alter table public.acoes_agendadas rename column workshop_id to oficina_id;
comment on column public.acoes_agendadas.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.acoes_agendadas rename column quote_version_id to versao_orcamento_id;
comment on column public.acoes_agendadas.versao_orcamento_id is 'versao orcamento id. Nome anterior: quote_version_id.';
alter table public.acoes_agendadas rename column action_type to tipo_acao;
comment on column public.acoes_agendadas.tipo_acao is 'tipo acao. Nome anterior: action_type.';
alter table public.acoes_agendadas rename column idempotency_key to chave_idempotencia;
comment on column public.acoes_agendadas.chave_idempotencia is 'chave idempotencia. Nome anterior: idempotency_key.';
alter table public.acoes_agendadas rename column due_at to agendado_para;
comment on column public.acoes_agendadas.agendado_para is 'agendado para. Nome anterior: due_at.';
alter table public.acoes_agendadas rename column status to situacao;
comment on column public.acoes_agendadas.situacao is 'situacao. Nome anterior: status.';
alter table public.acoes_agendadas rename column attempts to tentativas;
comment on column public.acoes_agendadas.tentativas is 'tentativas. Nome anterior: attempts.';
alter table public.acoes_agendadas rename column max_attempts to maximo_tentativas;
comment on column public.acoes_agendadas.maximo_tentativas is 'maximo tentativas. Nome anterior: max_attempts.';
alter table public.acoes_agendadas rename column next_attempt_at to proxima_tentativa_em;
comment on column public.acoes_agendadas.proxima_tentativa_em is 'proxima tentativa em. Nome anterior: next_attempt_at.';
alter table public.acoes_agendadas rename column lease_token to token_reserva;
comment on column public.acoes_agendadas.token_reserva is 'token reserva. Nome anterior: lease_token.';
alter table public.acoes_agendadas rename column locked_until to reservado_ate;
comment on column public.acoes_agendadas.reservado_ate is 'reservado ate. Nome anterior: locked_until.';
alter table public.acoes_agendadas rename column error_code to codigo_erro;
comment on column public.acoes_agendadas.codigo_erro is 'codigo erro. Nome anterior: error_code.';
alter table public.acoes_agendadas rename column created_at to criado_em;
comment on column public.acoes_agendadas.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.acoes_agendadas rename column updated_at to atualizado_em;
comment on column public.acoes_agendadas.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.acoes_agendadas is 'acoes agendadas. Nome anterior: scheduled_actions.';
alter table public.service_note_items rename to itens_nota_atendimento;
comment on column public.itens_nota_atendimento.id is 'id. Nome anterior: id.';
alter table public.itens_nota_atendimento rename column workshop_id to oficina_id;
comment on column public.itens_nota_atendimento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.itens_nota_atendimento rename column note_id to nota_id;
comment on column public.itens_nota_atendimento.nota_id is 'nota id. Nome anterior: note_id.';
alter table public.itens_nota_atendimento rename column catalog_item_id to item_catalogo_id;
comment on column public.itens_nota_atendimento.item_catalogo_id is 'item catalogo id. Nome anterior: catalog_item_id.';
alter table public.itens_nota_atendimento rename column position to posicao;
comment on column public.itens_nota_atendimento.posicao is 'posicao. Nome anterior: position.';
alter table public.itens_nota_atendimento rename column kind to tipo;
comment on column public.itens_nota_atendimento.tipo is 'tipo. Nome anterior: kind.';
alter table public.itens_nota_atendimento rename column description to descricao;
comment on column public.itens_nota_atendimento.descricao is 'descricao. Nome anterior: description.';
alter table public.itens_nota_atendimento rename column quantity to quantidade;
comment on column public.itens_nota_atendimento.quantidade is 'quantidade. Nome anterior: quantity.';
alter table public.itens_nota_atendimento rename column unit to unidade;
comment on column public.itens_nota_atendimento.unidade is 'unidade. Nome anterior: unit.';
alter table public.itens_nota_atendimento rename column unit_price_cents to preco_unitario_centavos;
comment on column public.itens_nota_atendimento.preco_unitario_centavos is 'preco unitario centavos. Nome anterior: unit_price_cents.';
alter table public.itens_nota_atendimento rename column line_total_cents to total_item_centavos;
comment on column public.itens_nota_atendimento.total_item_centavos is 'total item centavos. Nome anterior: line_total_cents.';
comment on table public.itens_nota_atendimento is 'itens nota atendimento. Nome anterior: service_note_items.';
alter table public.service_notes rename to notas_atendimento;
comment on column public.notas_atendimento.id is 'id. Nome anterior: id.';
alter table public.notas_atendimento rename column workshop_id to oficina_id;
comment on column public.notas_atendimento.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.notas_atendimento rename column number to numero;
comment on column public.notas_atendimento.numero is 'numero. Nome anterior: number.';
alter table public.notas_atendimento rename column customer_id to cliente_id;
comment on column public.notas_atendimento.cliente_id is 'cliente id. Nome anterior: customer_id.';
alter table public.notas_atendimento rename column vehicle_id to veiculo_id;
comment on column public.notas_atendimento.veiculo_id is 'veiculo id. Nome anterior: vehicle_id.';
alter table public.notas_atendimento rename column status to situacao;
comment on column public.notas_atendimento.situacao is 'situacao. Nome anterior: status.';
alter table public.notas_atendimento rename column customer_snapshot to dados_cliente;
comment on column public.notas_atendimento.dados_cliente is 'dados cliente. Nome anterior: customer_snapshot.';
alter table public.notas_atendimento rename column vehicle_snapshot to dados_veiculo;
comment on column public.notas_atendimento.dados_veiculo is 'dados veiculo. Nome anterior: vehicle_snapshot.';
alter table public.notas_atendimento rename column workshop_snapshot to dados_oficina;
comment on column public.notas_atendimento.dados_oficina is 'dados oficina. Nome anterior: workshop_snapshot.';
alter table public.notas_atendimento rename column notes to observacoes;
comment on column public.notas_atendimento.observacoes is 'observacoes. Nome anterior: notes.';
alter table public.notas_atendimento rename column subtotal_cents to subtotal_centavos;
comment on column public.notas_atendimento.subtotal_centavos is 'subtotal centavos. Nome anterior: subtotal_cents.';
alter table public.notas_atendimento rename column discount_cents to desconto_centavos;
comment on column public.notas_atendimento.desconto_centavos is 'desconto centavos. Nome anterior: discount_cents.';
alter table public.notas_atendimento rename column total_cents to total_centavos;
comment on column public.notas_atendimento.total_centavos is 'total centavos. Nome anterior: total_cents.';
alter table public.notas_atendimento rename column issued_at to emitido_em;
comment on column public.notas_atendimento.emitido_em is 'emitido em. Nome anterior: issued_at.';
alter table public.notas_atendimento rename column created_by to criado_por;
comment on column public.notas_atendimento.criado_por is 'criado por. Nome anterior: created_by.';
alter table public.notas_atendimento rename column created_at to criado_em;
comment on column public.notas_atendimento.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.notas_atendimento rename column updated_at to atualizado_em;
comment on column public.notas_atendimento.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.notas_atendimento is 'notas atendimento. Nome anterior: service_notes.';
alter table public.site_products rename to produtos_site;
comment on column public.produtos_site.id is 'id. Nome anterior: id.';
alter table public.produtos_site rename column workshop_id to oficina_id;
comment on column public.produtos_site.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.produtos_site rename column catalog_item_id to item_catalogo_id;
comment on column public.produtos_site.item_catalogo_id is 'item catalogo id. Nome anterior: catalog_item_id.';
alter table public.produtos_site rename column title to titulo;
comment on column public.produtos_site.titulo is 'titulo. Nome anterior: title.';
alter table public.produtos_site rename column description to descricao;
comment on column public.produtos_site.descricao is 'descricao. Nome anterior: description.';
alter table public.produtos_site rename column visible to visivel;
comment on column public.produtos_site.visivel is 'visivel. Nome anterior: visible.';
alter table public.produtos_site rename column displayed_price_cents to preco_exibido_centavos;
comment on column public.produtos_site.preco_exibido_centavos is 'preco exibido centavos. Nome anterior: displayed_price_cents.';
alter table public.produtos_site rename column image_asset_id to imagem_id;
comment on column public.produtos_site.imagem_id is 'imagem id. Nome anterior: image_asset_id.';
comment on table public.produtos_site is 'produtos site. Nome anterior: site_products.';
alter table public.vehicles rename to veiculos;
comment on column public.veiculos.id is 'id. Nome anterior: id.';
alter table public.veiculos rename column workshop_id to oficina_id;
comment on column public.veiculos.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.veiculos rename column plate to placa;
comment on column public.veiculos.placa is 'placa. Nome anterior: plate.';
alter table public.veiculos rename column brand to marca;
comment on column public.veiculos.marca is 'marca. Nome anterior: brand.';
alter table public.veiculos rename column model to modelo;
comment on column public.veiculos.modelo is 'modelo. Nome anterior: model.';
alter table public.veiculos rename column model_year to ano_modelo;
comment on column public.veiculos.ano_modelo is 'ano modelo. Nome anterior: model_year.';
alter table public.veiculos rename column source to origem;
comment on column public.veiculos.origem is 'origem. Nome anterior: source.';
alter table public.veiculos rename column source_provider to provedor_origem;
comment on column public.veiculos.provedor_origem is 'provedor origem. Nome anterior: source_provider.';
alter table public.veiculos rename column source_checked_at to origem_consultada_em;
comment on column public.veiculos.origem_consultada_em is 'origem consultada em. Nome anterior: source_checked_at.';
alter table public.veiculos rename column created_at to criado_em;
comment on column public.veiculos.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.veiculos rename column updated_at to atualizado_em;
comment on column public.veiculos.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
alter table public.veiculos rename column archived_at to arquivado_em;
comment on column public.veiculos.arquivado_em is 'arquivado em. Nome anterior: archived_at.';
comment on table public.veiculos is 'veiculos. Nome anterior: vehicles.';
alter table public.whatsapp_connections rename to conexoes_whatsapp;
comment on column public.conexoes_whatsapp.id is 'id. Nome anterior: id.';
alter table public.conexoes_whatsapp rename column workshop_id to oficina_id;
comment on column public.conexoes_whatsapp.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.conexoes_whatsapp rename column provider to provedor;
comment on column public.conexoes_whatsapp.provedor is 'provedor. Nome anterior: provider.';
alter table public.conexoes_whatsapp rename column provider_account_id to conta_provedor_id;
comment on column public.conexoes_whatsapp.conta_provedor_id is 'conta provedor id. Nome anterior: provider_account_id.';
alter table public.conexoes_whatsapp rename column provider_phone_id to telefone_provedor_id;
comment on column public.conexoes_whatsapp.telefone_provedor_id is 'telefone provedor id. Nome anterior: provider_phone_id.';
alter table public.conexoes_whatsapp rename column phone_e164 to telefone_e164;
comment on column public.conexoes_whatsapp.telefone_e164 is 'telefone e164. Nome anterior: phone_e164.';
alter table public.conexoes_whatsapp rename column credentials_ref to referencia_credenciais;
comment on column public.conexoes_whatsapp.referencia_credenciais is 'referencia credenciais. Nome anterior: credentials_ref.';
alter table public.conexoes_whatsapp rename column status to situacao;
comment on column public.conexoes_whatsapp.situacao is 'situacao. Nome anterior: status.';
alter table public.conexoes_whatsapp rename column created_at to criado_em;
comment on column public.conexoes_whatsapp.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.conexoes_whatsapp rename column updated_at to atualizado_em;
comment on column public.conexoes_whatsapp.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.conexoes_whatsapp is 'conexoes whatsapp. Nome anterior: whatsapp_connections.';
alter table public.work_order_assignments rename to responsaveis_ordem_servico;
alter table public.responsaveis_ordem_servico rename column workshop_id to oficina_id;
comment on column public.responsaveis_ordem_servico.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.responsaveis_ordem_servico rename column work_order_id to ordem_servico_id;
comment on column public.responsaveis_ordem_servico.ordem_servico_id is 'ordem servico id. Nome anterior: work_order_id.';
alter table public.responsaveis_ordem_servico rename column user_id to usuario_id;
comment on column public.responsaveis_ordem_servico.usuario_id is 'usuario id. Nome anterior: user_id.';
alter table public.responsaveis_ordem_servico rename column is_lead to principal;
comment on column public.responsaveis_ordem_servico.principal is 'principal. Nome anterior: is_lead.';
alter table public.responsaveis_ordem_servico rename column assigned_at to atribuido_em;
comment on column public.responsaveis_ordem_servico.atribuido_em is 'atribuido em. Nome anterior: assigned_at.';
comment on table public.responsaveis_ordem_servico is 'responsaveis ordem servico. Nome anterior: work_order_assignments.';
alter table public.work_order_attachments rename to anexos_ordem_servico;
comment on column public.anexos_ordem_servico.id is 'id. Nome anterior: id.';
alter table public.anexos_ordem_servico rename column workshop_id to oficina_id;
comment on column public.anexos_ordem_servico.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.anexos_ordem_servico rename column work_order_id to ordem_servico_id;
comment on column public.anexos_ordem_servico.ordem_servico_id is 'ordem servico id. Nome anterior: work_order_id.';
alter table public.anexos_ordem_servico rename column file_asset_id to arquivo_id;
comment on column public.anexos_ordem_servico.arquivo_id is 'arquivo id. Nome anterior: file_asset_id.';
alter table public.anexos_ordem_servico rename column phase to fase;
comment on column public.anexos_ordem_servico.fase is 'fase. Nome anterior: phase.';
alter table public.anexos_ordem_servico rename column caption to legenda;
comment on column public.anexos_ordem_servico.legenda is 'legenda. Nome anterior: caption.';
alter table public.anexos_ordem_servico rename column visible_to_customer to visivel_ao_cliente;
comment on column public.anexos_ordem_servico.visivel_ao_cliente is 'visivel ao cliente. Nome anterior: visible_to_customer.';
alter table public.anexos_ordem_servico rename column captured_at to capturado_em;
comment on column public.anexos_ordem_servico.capturado_em is 'capturado em. Nome anterior: captured_at.';
alter table public.anexos_ordem_servico rename column uploaded_by to enviado_por;
comment on column public.anexos_ordem_servico.enviado_por is 'enviado por. Nome anterior: uploaded_by.';
comment on table public.anexos_ordem_servico is 'anexos ordem servico. Nome anterior: work_order_attachments.';
alter table public.work_order_blocks rename to paradas_ordem_servico;
comment on column public.paradas_ordem_servico.id is 'id. Nome anterior: id.';
alter table public.paradas_ordem_servico rename column workshop_id to oficina_id;
comment on column public.paradas_ordem_servico.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.paradas_ordem_servico rename column work_order_id to ordem_servico_id;
comment on column public.paradas_ordem_servico.ordem_servico_id is 'ordem servico id. Nome anterior: work_order_id.';
alter table public.paradas_ordem_servico rename column reason to motivo;
comment on column public.paradas_ordem_servico.motivo is 'motivo. Nome anterior: reason.';
alter table public.paradas_ordem_servico rename column details to detalhes;
comment on column public.paradas_ordem_servico.detalhes is 'detalhes. Nome anterior: details.';
alter table public.paradas_ordem_servico rename column expected_resolution_at to previsao_resolucao_em;
comment on column public.paradas_ordem_servico.previsao_resolucao_em is 'previsao resolucao em. Nome anterior: expected_resolution_at.';
alter table public.paradas_ordem_servico rename column started_at to iniciado_em;
comment on column public.paradas_ordem_servico.iniciado_em is 'iniciado em. Nome anterior: started_at.';
alter table public.paradas_ordem_servico rename column ended_at to encerrado_em;
comment on column public.paradas_ordem_servico.encerrado_em is 'encerrado em. Nome anterior: ended_at.';
alter table public.paradas_ordem_servico rename column created_by to criado_por;
comment on column public.paradas_ordem_servico.criado_por is 'criado por. Nome anterior: created_by.';
alter table public.paradas_ordem_servico rename column resolved_by to resolvido_por;
comment on column public.paradas_ordem_servico.resolvido_por is 'resolvido por. Nome anterior: resolved_by.';
comment on table public.paradas_ordem_servico is 'paradas ordem servico. Nome anterior: work_order_blocks.';
alter table public.work_order_checklist_items rename to verificacoes_ordem_servico;
comment on column public.verificacoes_ordem_servico.id is 'id. Nome anterior: id.';
alter table public.verificacoes_ordem_servico rename column workshop_id to oficina_id;
comment on column public.verificacoes_ordem_servico.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.verificacoes_ordem_servico rename column work_order_id to ordem_servico_id;
comment on column public.verificacoes_ordem_servico.ordem_servico_id is 'ordem servico id. Nome anterior: work_order_id.';
alter table public.verificacoes_ordem_servico rename column phase to fase;
comment on column public.verificacoes_ordem_servico.fase is 'fase. Nome anterior: phase.';
alter table public.verificacoes_ordem_servico rename column label to rotulo;
comment on column public.verificacoes_ordem_servico.rotulo is 'rotulo. Nome anterior: label.';
alter table public.verificacoes_ordem_servico rename column position to posicao;
comment on column public.verificacoes_ordem_servico.posicao is 'posicao. Nome anterior: position.';
alter table public.verificacoes_ordem_servico rename column result to resultado;
comment on column public.verificacoes_ordem_servico.resultado is 'resultado. Nome anterior: result.';
alter table public.verificacoes_ordem_servico rename column notes to observacoes;
comment on column public.verificacoes_ordem_servico.observacoes is 'observacoes. Nome anterior: notes.';
alter table public.verificacoes_ordem_servico rename column checked_by to verificado_por;
comment on column public.verificacoes_ordem_servico.verificado_por is 'verificado por. Nome anterior: checked_by.';
alter table public.verificacoes_ordem_servico rename column checked_at to verificado_em;
comment on column public.verificacoes_ordem_servico.verificado_em is 'verificado em. Nome anterior: checked_at.';
comment on table public.verificacoes_ordem_servico is 'verificacoes ordem servico. Nome anterior: work_order_checklist_items.';
alter table public.work_order_events rename to historico_ordem_servico;
comment on column public.historico_ordem_servico.id is 'id. Nome anterior: id.';
alter table public.historico_ordem_servico rename column workshop_id to oficina_id;
comment on column public.historico_ordem_servico.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.historico_ordem_servico rename column work_order_id to ordem_servico_id;
comment on column public.historico_ordem_servico.ordem_servico_id is 'ordem servico id. Nome anterior: work_order_id.';
alter table public.historico_ordem_servico rename column event_type to tipo_evento;
comment on column public.historico_ordem_servico.tipo_evento is 'tipo evento. Nome anterior: event_type.';
alter table public.historico_ordem_servico rename column actor_user_id to usuario_autor_id;
comment on column public.historico_ordem_servico.usuario_autor_id is 'usuario autor id. Nome anterior: actor_user_id.';
alter table public.historico_ordem_servico rename column actor_kind to tipo_autor;
comment on column public.historico_ordem_servico.tipo_autor is 'tipo autor. Nome anterior: actor_kind.';
alter table public.historico_ordem_servico rename column description to descricao;
comment on column public.historico_ordem_servico.descricao is 'descricao. Nome anterior: description.';
alter table public.historico_ordem_servico rename column visible_to_customer to visivel_ao_cliente;
comment on column public.historico_ordem_servico.visivel_ao_cliente is 'visivel ao cliente. Nome anterior: visible_to_customer.';
alter table public.historico_ordem_servico rename column metadata to metadados;
comment on column public.historico_ordem_servico.metadados is 'metadados. Nome anterior: metadata.';
alter table public.historico_ordem_servico rename column occurred_at to ocorrido_em;
comment on column public.historico_ordem_servico.ocorrido_em is 'ocorrido em. Nome anterior: occurred_at.';
comment on table public.historico_ordem_servico is 'historico ordem servico. Nome anterior: work_order_events.';
alter table public.work_order_items rename to itens_ordem_servico;
comment on column public.itens_ordem_servico.id is 'id. Nome anterior: id.';
alter table public.itens_ordem_servico rename column workshop_id to oficina_id;
comment on column public.itens_ordem_servico.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.itens_ordem_servico rename column work_order_id to ordem_servico_id;
comment on column public.itens_ordem_servico.ordem_servico_id is 'ordem servico id. Nome anterior: work_order_id.';
alter table public.itens_ordem_servico rename column catalog_item_id to item_catalogo_id;
comment on column public.itens_ordem_servico.item_catalogo_id is 'item catalogo id. Nome anterior: catalog_item_id.';
alter table public.itens_ordem_servico rename column source_quote_item_id to item_orcamento_origem_id;
comment on column public.itens_ordem_servico.item_orcamento_origem_id is 'item orcamento origem id. Nome anterior: source_quote_item_id.';
alter table public.itens_ordem_servico rename column position to posicao;
comment on column public.itens_ordem_servico.posicao is 'posicao. Nome anterior: position.';
alter table public.itens_ordem_servico rename column kind to tipo;
comment on column public.itens_ordem_servico.tipo is 'tipo. Nome anterior: kind.';
alter table public.itens_ordem_servico rename column description to descricao;
comment on column public.itens_ordem_servico.descricao is 'descricao. Nome anterior: description.';
alter table public.itens_ordem_servico rename column unit to unidade;
comment on column public.itens_ordem_servico.unidade is 'unidade. Nome anterior: unit.';
alter table public.itens_ordem_servico rename column quantity to quantidade;
comment on column public.itens_ordem_servico.quantidade is 'quantidade. Nome anterior: quantity.';
alter table public.itens_ordem_servico rename column unit_price_cents to preco_unitario_centavos;
comment on column public.itens_ordem_servico.preco_unitario_centavos is 'preco unitario centavos. Nome anterior: unit_price_cents.';
alter table public.itens_ordem_servico rename column line_total_cents to total_item_centavos;
comment on column public.itens_ordem_servico.total_item_centavos is 'total item centavos. Nome anterior: line_total_cents.';
alter table public.itens_ordem_servico rename column status to situacao;
comment on column public.itens_ordem_servico.situacao is 'situacao. Nome anterior: status.';
alter table public.itens_ordem_servico rename column completed_at to concluido_em;
comment on column public.itens_ordem_servico.concluido_em is 'concluido em. Nome anterior: completed_at.';
comment on table public.itens_ordem_servico is 'itens ordem servico. Nome anterior: work_order_items.';
alter table public.work_orders rename to ordens_servico;
comment on column public.ordens_servico.id is 'id. Nome anterior: id.';
alter table public.ordens_servico rename column workshop_id to oficina_id;
comment on column public.ordens_servico.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.ordens_servico rename column number to numero;
comment on column public.ordens_servico.numero is 'numero. Nome anterior: number.';
alter table public.ordens_servico rename column customer_id to cliente_id;
comment on column public.ordens_servico.cliente_id is 'cliente id. Nome anterior: customer_id.';
alter table public.ordens_servico rename column vehicle_id to veiculo_id;
comment on column public.ordens_servico.veiculo_id is 'veiculo id. Nome anterior: vehicle_id.';
alter table public.ordens_servico rename column source_quote_id to orcamento_origem_id;
comment on column public.ordens_servico.orcamento_origem_id is 'orcamento origem id. Nome anterior: source_quote_id.';
alter table public.ordens_servico rename column source_quote_version_id to versao_orcamento_origem_id;
comment on column public.ordens_servico.versao_orcamento_origem_id is 'versao orcamento origem id. Nome anterior: source_quote_version_id.';
alter table public.ordens_servico rename column status to situacao;
comment on column public.ordens_servico.situacao is 'situacao. Nome anterior: status.';
alter table public.ordens_servico rename column priority to prioridade;
comment on column public.ordens_servico.prioridade is 'prioridade. Nome anterior: priority.';
alter table public.ordens_servico rename column stage_id to etapa_id;
comment on column public.ordens_servico.etapa_id is 'etapa id. Nome anterior: stage_id.';
alter table public.ordens_servico rename column bay_id to local_id;
comment on column public.ordens_servico.local_id is 'local id. Nome anterior: bay_id.';
alter table public.ordens_servico rename column customer_snapshot to dados_cliente;
comment on column public.ordens_servico.dados_cliente is 'dados cliente. Nome anterior: customer_snapshot.';
alter table public.ordens_servico rename column vehicle_snapshot to dados_veiculo;
comment on column public.ordens_servico.dados_veiculo is 'dados veiculo. Nome anterior: vehicle_snapshot.';
alter table public.ordens_servico rename column complaint to queixa_cliente;
comment on column public.ordens_servico.queixa_cliente is 'queixa cliente. Nome anterior: complaint.';
alter table public.ordens_servico rename column diagnosis to diagnostico;
comment on column public.ordens_servico.diagnostico is 'diagnostico. Nome anterior: diagnosis.';
alter table public.ordens_servico rename column internal_notes to observacoes_internas;
comment on column public.ordens_servico.observacoes_internas is 'observacoes internas. Nome anterior: internal_notes.';
alter table public.ordens_servico rename column customer_summary to resumo_cliente;
comment on column public.ordens_servico.resumo_cliente is 'resumo cliente. Nome anterior: customer_summary.';
alter table public.ordens_servico rename column mileage_in to quilometragem_entrada;
comment on column public.ordens_servico.quilometragem_entrada is 'quilometragem entrada. Nome anterior: mileage_in.';
alter table public.ordens_servico rename column mileage_out to quilometragem_saida;
comment on column public.ordens_servico.quilometragem_saida is 'quilometragem saida. Nome anterior: mileage_out.';
alter table public.ordens_servico rename column fuel_percent to combustivel_percentual;
comment on column public.ordens_servico.combustivel_percentual is 'combustivel percentual. Nome anterior: fuel_percent.';
alter table public.ordens_servico rename column belongings to pertences;
comment on column public.ordens_servico.pertences is 'pertences. Nome anterior: belongings.';
alter table public.ordens_servico rename column received_at to recebido_em;
comment on column public.ordens_servico.recebido_em is 'recebido em. Nome anterior: received_at.';
alter table public.ordens_servico rename column promised_at to entrega_prevista_em;
comment on column public.ordens_servico.entrega_prevista_em is 'entrega prevista em. Nome anterior: promised_at.';
alter table public.ordens_servico rename column started_at to iniciado_em;
comment on column public.ordens_servico.iniciado_em is 'iniciado em. Nome anterior: started_at.';
alter table public.ordens_servico rename column completed_at to concluido_em;
comment on column public.ordens_servico.concluido_em is 'concluido em. Nome anterior: completed_at.';
alter table public.ordens_servico rename column delivered_at to entregue_em;
comment on column public.ordens_servico.entregue_em is 'entregue em. Nome anterior: delivered_at.';
alter table public.ordens_servico rename column cancelled_at to cancelado_em;
comment on column public.ordens_servico.cancelado_em is 'cancelado em. Nome anterior: cancelled_at.';
alter table public.ordens_servico rename column cancellation_reason to motivo_cancelamento;
comment on column public.ordens_servico.motivo_cancelamento is 'motivo cancelamento. Nome anterior: cancellation_reason.';
alter table public.ordens_servico rename column warranty_terms to condicoes_garantia;
comment on column public.ordens_servico.condicoes_garantia is 'condicoes garantia. Nome anterior: warranty_terms.';
alter table public.ordens_servico rename column warranty_until to garantia_ate;
comment on column public.ordens_servico.garantia_ate is 'garantia ate. Nome anterior: warranty_until.';
alter table public.ordens_servico rename column subtotal_cents to subtotal_centavos;
comment on column public.ordens_servico.subtotal_centavos is 'subtotal centavos. Nome anterior: subtotal_cents.';
alter table public.ordens_servico rename column discount_cents to desconto_centavos;
comment on column public.ordens_servico.desconto_centavos is 'desconto centavos. Nome anterior: discount_cents.';
alter table public.ordens_servico rename column total_cents to total_centavos;
comment on column public.ordens_servico.total_centavos is 'total centavos. Nome anterior: total_cents.';
alter table public.ordens_servico rename column lock_version to revisao;
comment on column public.ordens_servico.revisao is 'revisao. Nome anterior: lock_version.';
alter table public.ordens_servico rename column created_by to criado_por;
comment on column public.ordens_servico.criado_por is 'criado por. Nome anterior: created_by.';
alter table public.ordens_servico rename column created_at to criado_em;
comment on column public.ordens_servico.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.ordens_servico rename column updated_at to atualizado_em;
comment on column public.ordens_servico.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.ordens_servico is 'ordens servico. Nome anterior: work_orders.';
alter table public.workshop_bays rename to locais_oficina;
comment on column public.locais_oficina.id is 'id. Nome anterior: id.';
alter table public.locais_oficina rename column workshop_id to oficina_id;
comment on column public.locais_oficina.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.locais_oficina rename column name to nome;
comment on column public.locais_oficina.nome is 'nome. Nome anterior: name.';
alter table public.locais_oficina rename column kind to tipo;
comment on column public.locais_oficina.tipo is 'tipo. Nome anterior: kind.';
alter table public.locais_oficina rename column map_x to posicao_x;
comment on column public.locais_oficina.posicao_x is 'posicao x. Nome anterior: map_x.';
alter table public.locais_oficina rename column map_y to posicao_y;
comment on column public.locais_oficina.posicao_y is 'posicao y. Nome anterior: map_y.';
alter table public.locais_oficina rename column active to ativo;
comment on column public.locais_oficina.ativo is 'ativo. Nome anterior: active.';
comment on table public.locais_oficina is 'locais oficina. Nome anterior: workshop_bays.';
alter view public.workshop_board rename to mapa_oficina;
comment on column public.mapa_oficina.id is 'id. Nome anterior: id.';
alter view public.mapa_oficina rename column workshop_id to oficina_id;
comment on column public.mapa_oficina.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter view public.mapa_oficina rename column number to numero;
comment on column public.mapa_oficina.numero is 'numero. Nome anterior: number.';
alter view public.mapa_oficina rename column status to situacao;
comment on column public.mapa_oficina.situacao is 'situacao. Nome anterior: status.';
alter view public.mapa_oficina rename column priority to prioridade;
comment on column public.mapa_oficina.prioridade is 'prioridade. Nome anterior: priority.';
alter view public.mapa_oficina rename column stage_id to etapa_id;
comment on column public.mapa_oficina.etapa_id is 'etapa id. Nome anterior: stage_id.';
alter view public.mapa_oficina rename column stage_name to nome_etapa;
comment on column public.mapa_oficina.nome_etapa is 'nome etapa. Nome anterior: stage_name.';
alter view public.mapa_oficina rename column bay_id to local_id;
comment on column public.mapa_oficina.local_id is 'local id. Nome anterior: bay_id.';
alter view public.mapa_oficina rename column bay_name to nome_local;
comment on column public.mapa_oficina.nome_local is 'nome local. Nome anterior: bay_name.';
alter view public.mapa_oficina rename column customer_id to cliente_id;
comment on column public.mapa_oficina.cliente_id is 'cliente id. Nome anterior: customer_id.';
alter view public.mapa_oficina rename column vehicle_id to veiculo_id;
comment on column public.mapa_oficina.veiculo_id is 'veiculo id. Nome anterior: vehicle_id.';
alter view public.mapa_oficina rename column plate to placa;
comment on column public.mapa_oficina.placa is 'placa. Nome anterior: plate.';
alter view public.mapa_oficina rename column vehicle_model to modelo_veiculo;
comment on column public.mapa_oficina.modelo_veiculo is 'modelo veiculo. Nome anterior: vehicle_model.';
alter view public.mapa_oficina rename column received_at to recebido_em;
comment on column public.mapa_oficina.recebido_em is 'recebido em. Nome anterior: received_at.';
alter view public.mapa_oficina rename column promised_at to entrega_prevista_em;
comment on column public.mapa_oficina.entrega_prevista_em is 'entrega prevista em. Nome anterior: promised_at.';
alter view public.mapa_oficina rename column customer_summary to resumo_cliente;
comment on column public.mapa_oficina.resumo_cliente is 'resumo cliente. Nome anterior: customer_summary.';
alter view public.mapa_oficina rename column lock_version to revisao;
comment on column public.mapa_oficina.revisao is 'revisao. Nome anterior: lock_version.';
alter view public.mapa_oficina rename column overdue to atrasado;
comment on column public.mapa_oficina.atrasado is 'atrasado. Nome anterior: overdue.';
alter view public.mapa_oficina rename column physically_in_shop to presente_na_oficina;
comment on column public.mapa_oficina.presente_na_oficina is 'presente na oficina. Nome anterior: physically_in_shop.';
alter view public.mapa_oficina rename column open_blocks to paradas_abertas;
comment on column public.mapa_oficina.paradas_abertas is 'paradas abertas. Nome anterior: open_blocks.';
alter view public.mapa_oficina rename column block_count to quantidade_paradas;
comment on column public.mapa_oficina.quantidade_paradas is 'quantidade paradas. Nome anterior: block_count.';
alter view public.mapa_oficina rename column assigned_members to membros_responsaveis;
comment on column public.mapa_oficina.membros_responsaveis is 'membros responsaveis. Nome anterior: assigned_members.';
comment on view public.mapa_oficina is 'mapa oficina. Nome anterior: workshop_board.';
alter table public.workshop_members rename to membros_oficina;
alter table public.membros_oficina rename column workshop_id to oficina_id;
comment on column public.membros_oficina.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.membros_oficina rename column user_id to usuario_id;
comment on column public.membros_oficina.usuario_id is 'usuario id. Nome anterior: user_id.';
alter table public.membros_oficina rename column role to perfil;
comment on column public.membros_oficina.perfil is 'perfil. Nome anterior: role.';
alter table public.membros_oficina rename column active to ativo;
comment on column public.membros_oficina.ativo is 'ativo. Nome anterior: active.';
alter table public.membros_oficina rename column created_at to criado_em;
comment on column public.membros_oficina.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.membros_oficina rename column updated_at to atualizado_em;
comment on column public.membros_oficina.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.membros_oficina is 'membros oficina. Nome anterior: workshop_members.';
alter table public.workshop_sites rename to sites_oficina;
alter table public.sites_oficina rename column workshop_id to oficina_id;
comment on column public.sites_oficina.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.sites_oficina rename column slug to identificador_url;
comment on column public.sites_oficina.identificador_url is 'identificador url. Nome anterior: slug.';
alter table public.sites_oficina rename column custom_domain to dominio_personalizado;
comment on column public.sites_oficina.dominio_personalizado is 'dominio personalizado. Nome anterior: custom_domain.';
alter table public.sites_oficina rename column domain_verified_at to dominio_verificado_em;
comment on column public.sites_oficina.dominio_verificado_em is 'dominio verificado em. Nome anterior: domain_verified_at.';
alter table public.sites_oficina rename column title to titulo;
comment on column public.sites_oficina.titulo is 'titulo. Nome anterior: title.';
alter table public.sites_oficina rename column description to descricao;
comment on column public.sites_oficina.descricao is 'descricao. Nome anterior: description.';
alter table public.sites_oficina rename column published to publicado;
comment on column public.sites_oficina.publicado is 'publicado. Nome anterior: published.';
alter table public.sites_oficina rename column portal_enabled to portal_habilitado;
comment on column public.sites_oficina.portal_habilitado is 'portal habilitado. Nome anterior: portal_enabled.';
alter table public.sites_oficina rename column parts_requests_enabled to pedidos_pecas_habilitados;
comment on column public.sites_oficina.pedidos_pecas_habilitados is 'pedidos pecas habilitados. Nome anterior: parts_requests_enabled.';
alter table public.sites_oficina rename column theme to tema;
comment on column public.sites_oficina.tema is 'tema. Nome anterior: theme.';
alter table public.sites_oficina rename column created_at to criado_em;
comment on column public.sites_oficina.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.sites_oficina rename column updated_at to atualizado_em;
comment on column public.sites_oficina.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.sites_oficina is 'sites oficina. Nome anterior: workshop_sites.';
alter table public.workshop_subscriptions rename to assinaturas_oficina;
alter table public.assinaturas_oficina rename column workshop_id to oficina_id;
comment on column public.assinaturas_oficina.oficina_id is 'oficina id. Nome anterior: workshop_id.';
alter table public.assinaturas_oficina rename column plan_code to codigo_plano;
comment on column public.assinaturas_oficina.codigo_plano is 'codigo plano. Nome anterior: plan_code.';
alter table public.assinaturas_oficina rename column status to situacao;
comment on column public.assinaturas_oficina.situacao is 'situacao. Nome anterior: status.';
alter table public.assinaturas_oficina rename column valid_until to valido_ate;
comment on column public.assinaturas_oficina.valido_ate is 'valido ate. Nome anterior: valid_until.';
alter table public.assinaturas_oficina rename column billing_provider to provedor_cobranca;
comment on column public.assinaturas_oficina.provedor_cobranca is 'provedor cobranca. Nome anterior: billing_provider.';
alter table public.assinaturas_oficina rename column provider_subscription_id to assinatura_provedor_id;
comment on column public.assinaturas_oficina.assinatura_provedor_id is 'assinatura provedor id. Nome anterior: provider_subscription_id.';
alter table public.assinaturas_oficina rename column created_at to criado_em;
comment on column public.assinaturas_oficina.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.assinaturas_oficina rename column updated_at to atualizado_em;
comment on column public.assinaturas_oficina.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
comment on table public.assinaturas_oficina is 'assinaturas oficina. Nome anterior: workshop_subscriptions.';
alter table public.workshops rename to oficinas;
comment on column public.oficinas.id is 'id. Nome anterior: id.';
alter table public.oficinas rename column name to nome;
comment on column public.oficinas.nome is 'nome. Nome anterior: name.';
alter table public.oficinas rename column phone_e164 to telefone_e164;
comment on column public.oficinas.telefone_e164 is 'telefone e164. Nome anterior: phone_e164.';
alter table public.oficinas rename column timezone to fuso_horario;
comment on column public.oficinas.fuso_horario is 'fuso horario. Nome anterior: timezone.';
alter table public.oficinas rename column currency to moeda;
comment on column public.oficinas.moeda is 'moeda. Nome anterior: currency.';
alter table public.oficinas rename column next_quote_number to proximo_numero_orcamento;
comment on column public.oficinas.proximo_numero_orcamento is 'proximo numero orcamento. Nome anterior: next_quote_number.';
alter table public.oficinas rename column created_at to criado_em;
comment on column public.oficinas.criado_em is 'criado em. Nome anterior: created_at.';
alter table public.oficinas rename column updated_at to atualizado_em;
comment on column public.oficinas.atualizado_em is 'atualizado em. Nome anterior: updated_at.';
alter table public.oficinas rename column archived_at to arquivado_em;
comment on column public.oficinas.arquivado_em is 'arquivado em. Nome anterior: archived_at.';
alter table public.oficinas rename column logo_asset_id to logo_id;
comment on column public.oficinas.logo_id is 'logo id. Nome anterior: logo_asset_id.';
alter table public.oficinas rename column next_work_order_number to proximo_numero_os;
comment on column public.oficinas.proximo_numero_os is 'proximo numero os. Nome anterior: next_work_order_number.';
alter table public.oficinas rename column next_note_number to proximo_numero_nota;
comment on column public.oficinas.proximo_numero_nota is 'proximo numero nota. Nome anterior: next_note_number.';
alter table public.oficinas rename column address to endereco;
comment on column public.oficinas.endereco is 'endereco. Nome anterior: address.';
comment on table public.oficinas is 'oficinas. Nome anterior: workshops.';
-- Recompõe os corpos SQL/PLpgSQL; ALTER TABLE não reescreve referências textuais de funções.
CREATE OR REPLACE FUNCTION private.can_read_workshop_object(p_bucket text, p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.arquivos f
    where f.recipiente=p_bucket and f.caminho_arquivo=p_path and f.situacao='ready'
      and private.is_workshop_member(f.oficina_id));
$function$;
CREATE OR REPLACE FUNCTION private.guard_note_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare issued timestamptz;
begin
  if tg_op<>'INSERT' then
    select emitido_em into issued from public.notas_atendimento where oficina_id=old.oficina_id and id=old.nota_id for update;
    if issued is not null then raise exception 'Um item de nota emitida não pode ser alterado' using errcode='23514'; end if;
  end if;
  if tg_op<>'DELETE' then
    select emitido_em into issued from public.notas_atendimento where oficina_id=new.oficina_id and id=new.nota_id for update;
    if issued is not null then raise exception 'Um item de nota emitida não pode ser alterado' using errcode='23514'; end if;
    return new;
  end if;
  return old;
end;
$function$;
CREATE OR REPLACE FUNCTION private.guard_service_note()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.emitido_em is not null then
    if tg_op='DELETE' then raise exception 'Uma nota emitida não pode ser excluída' using errcode='23514'; end if;
    if (to_jsonb(new)-'situacao'-'atualizado_em'-'total_centavos') is distinct from (to_jsonb(old)-'situacao'-'atualizado_em'-'total_centavos')
      or new.situacao not in ('issued','cancelled') or (old.situacao='cancelled' and new.situacao<>'cancelled') then
      raise exception 'O conteúdo de uma nota emitida não pode ser alterado' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.guard_version_children()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_published timestamptz;
begin
  -- Travar a versao serializa edicao de itens/anexos com publicacao.
  if tg_op <> 'INSERT' then
    select publicado_em into v_published from public.versoes_orcamento
      where oficina_id = old.oficina_id and id = old.versao_orcamento_id for update;
    if v_published is not null then
      raise exception 'O conteúdo de um orçamento publicado não pode ser alterado' using errcode = '23514';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select publicado_em into v_published from public.versoes_orcamento
      where oficina_id = new.oficina_id and id = new.versao_orcamento_id for update;
    if v_published is not null then
      raise exception 'Não é possível acrescentar ou alterar conteúdo de um orçamento publicado' using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end;
$function$;
CREATE OR REPLACE FUNCTION private.has_feature(p_workshop_id uuid, p_feature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.assinaturas_oficina s
    join public.recursos_plano f on f.codigo_plano=s.codigo_plano
    join public.planos p on p.codigo=s.codigo_plano
    where s.oficina_id=p_workshop_id and s.situacao in ('active','trialing')
      and (s.valido_ate is null or s.valido_ate>now()) and p.ativo
      and f.codigo_recurso=p_feature and f.habilitado);
$function$;
CREATE OR REPLACE FUNCTION private.has_portal_access(p_workshop uuid, p_customer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.has_feature(p_workshop,'customer_portal') and exists (
    select 1 from public.acessos_portal_cliente a join public.sites_oficina s on s.oficina_id=a.oficina_id
    where a.oficina_id=p_workshop and a.cliente_id=p_customer and a.usuario_id=(select auth.uid())
      and a.revogado_em is null and s.publicado and s.portal_habilitado);
$function$;
CREATE OR REPLACE FUNCTION private.initialize_workshop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.assinaturas_oficina(oficina_id,codigo_plano) values (new.id,'basic');
  insert into public.etapas_producao(oficina_id,nome,posicao) values
    (new.id,'Recepcao',0),(new.id,'Diagnostico',1),(new.id,'Execucao',2),
    (new.id,'Conferencia',3),(new.id,'Pronto para entrega',4);
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.is_workshop_member(p_workshop_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.membros_oficina m
    where m.oficina_id = p_workshop_id and m.usuario_id = (select auth.uid()) and m.ativo
  );
$function$;
CREATE OR REPLACE FUNCTION private.prevent_published_version_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.publicado_em is not null then
    raise exception 'Versões publicadas do orçamento não podem ser alteradas' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.reject_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin raise exception 'Este registro só permite inclusão; alterações e exclusões são bloqueadas' using errcode = '23514'; end;
$function$;
CREATE OR REPLACE FUNCTION private.require_staff(p_workshop uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := auth.uid();
begin
  if u is null or not private.is_workshop_member(p_workshop) then
    raise exception 'Acesso à oficina negado' using errcode='42501';
  end if;
  return u;
end;
$function$;
CREATE OR REPLACE FUNCTION private.require_table_feature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.has_feature(new.oficina_id,tg_argv[0]) then
    raise exception 'Recurso % indisponível para esta oficina',tg_argv[0] using errcode='42501';
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin new.atualizado_em := now(); return new; end;
$function$;
CREATE OR REPLACE FUNCTION private.validate_site_product()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from public.itens_catalogo where oficina_id=new.oficina_id
    and id=new.item_catalogo_id and tipo='part' and arquivado_em is null) then
    raise exception 'O produto do site deve corresponder a uma peça ativa' using errcode='23514';
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.validate_work_order_item_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare source_version uuid;
begin
  if new.item_orcamento_origem_id is not null then
    select versao_orcamento_origem_id into source_version from public.ordens_servico
      where oficina_id=new.oficina_id and id=new.ordem_servico_id;
    if source_version is null or not exists(select 1 from public.itens_orcamento
      where oficina_id=new.oficina_id and id=new.item_orcamento_origem_id and versao_orcamento_id=source_version) then
      raise exception 'O item não pertence à versão do orçamento de origem' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.converter_orcamento_em_os(p_oficina uuid, p_orcamento uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid; q public.orcamentos%rowtype; v public.versoes_orcamento%rowtype;
  result_id uuid; next_number bigint; first_stage uuid; copied_total bigint; corr uuid:=gen_random_uuid();
begin
  u:=private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'work_orders') then
    raise exception 'Ordens de serviço indisponíveis no plano atual' using errcode='42501';
  end if;
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado' using errcode='P0002'; end if;
  select id into result_id from public.ordens_servico where oficina_id=p_oficina and orcamento_origem_id=q.id;
  if found then return result_id; end if;
  select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id for update;
  if not found or v.publicado_em is null or q.situacao<>'approved' or q.cliente_id is null or q.veiculo_id is null then
    raise exception 'É necessário um orçamento publicado e aprovado, com cliente e veículo' using errcode='23514';
  end if;
  if not exists(select 1 from public.aprovacoes_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and decisao='approved') then
    raise exception 'A versão atual ainda não foi aprovada' using errcode='23514';
  end if;
  select sum(total_item_centavos) into copied_total from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
  if copied_total is null or copied_total<>v.subtotal_centavos then
    raise exception 'O total do orçamento não corresponde aos itens' using errcode='23514';
  end if;
  update public.oficinas set proximo_numero_os=proximo_numero_os+1 where id=p_oficina
    returning proximo_numero_os-1 into next_number;
  select id into first_stage from public.etapas_producao where oficina_id=p_oficina and ativo order by posicao,id limit 1;
  insert into public.ordens_servico(oficina_id,numero,cliente_id,veiculo_id,orcamento_origem_id,versao_orcamento_origem_id,
    etapa_id,dados_cliente,dados_veiculo,subtotal_centavos,desconto_centavos,criado_por)
  values(p_oficina,next_number,q.cliente_id,q.veiculo_id,q.id,v.id,first_stage,
    v.dados_cliente,v.dados_veiculo,v.subtotal_centavos,v.desconto_centavos,u) returning id into result_id;
  insert into public.itens_ordem_servico(oficina_id,ordem_servico_id,item_catalogo_id,item_orcamento_origem_id,posicao,
    tipo,descricao,unidade,quantidade,preco_unitario_centavos)
  select oficina_id,result_id,item_catalogo_id,id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos
    from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
  insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,visivel_ao_cliente)
    values(p_oficina,result_id,'created',u,'Ordem de servico criada a partir do orcamento aprovado.',true);
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,
    correlacao_id,chave_deduplicacao,dados)
  values(p_oficina,'work_order.created','work_order',result_id,1,corr,'work_order:'||result_id||':created',
    jsonb_build_object('work_order_id',result_id,'quote_version_id',v.id));
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
    values(p_oficina,u,'user','convert_quote','work_order',result_id,corr);
  return result_id;
end;
$function$;
revoke all on function public.converter_orcamento_em_os(p_oficina uuid, p_orcamento uuid) from public,anon,authenticated;
grant execute on function public.converter_orcamento_em_os(p_oficina uuid, p_orcamento uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.criar_oficina(p_nome text, p_telefone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); w uuid;
begin
  if u is null then raise exception 'É necessário entrar na conta' using errcode='42501'; end if;
  if length(trim(p_nome)) not between 1 and 120 then raise exception 'Nome da oficina inválido'; end if;
  insert into public.oficinas(nome,telefone_e164) values(trim(p_nome),p_telefone) returning id into w;
  insert into public.membros_oficina(oficina_id,usuario_id,perfil) values(w,u,'owner');
  return w;
end;
$function$;
revoke all on function public.criar_oficina(p_nome text, p_telefone text) from public,anon,authenticated;
grant execute on function public.criar_oficina(p_nome text, p_telefone text) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.consultar_meu_historico_os(p_oficina uuid, p_ordem_servico uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'description',e.descricao,'occurred_at',e.ocorrido_em)
    order by e.ocorrido_em),'[]'::jsonb)
  from public.historico_ordem_servico e join public.ordens_servico w on w.oficina_id=e.oficina_id and w.id=e.ordem_servico_id
  where w.oficina_id=p_oficina and w.id=p_ordem_servico and e.visivel_ao_cliente
    and private.has_portal_access(w.oficina_id,w.cliente_id);
$function$;
revoke all on function public.consultar_meu_historico_os(p_oficina uuid, p_ordem_servico uuid) from public,anon,authenticated;
grant execute on function public.consultar_meu_historico_os(p_oficina uuid, p_ordem_servico uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.consultar_minhas_ordens_servico(p_oficina uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'number',w.numero,'status',w.situacao,
    'vehicle',jsonb_build_object('plate',w.dados_veiculo->>'plate','model',w.dados_veiculo->>'model',
      'model_year',w.dados_veiculo->>'model_year'),'promised_at',w.entrega_prevista_em,'summary',w.resumo_cliente,
    'received_at',w.recebido_em,'delivered_at',w.entregue_em) order by w.criado_em desc),'[]'::jsonb)
  from public.ordens_servico w where w.oficina_id=p_oficina and private.has_portal_access(w.oficina_id,w.cliente_id);
$function$;
revoke all on function public.consultar_minhas_ordens_servico(p_oficina uuid) from public,anon,authenticated;
grant execute on function public.consultar_minhas_ordens_servico(p_oficina uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.consultar_site_publicado(p_identificador_url text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('title',s.titulo,'description',s.descricao,'slug',s.identificador_url,'theme',s.tema,
    'phone',w.telefone_e164,'parts_requests_enabled',s.pedidos_pecas_habilitados,
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.titulo,'description',p.descricao,
      'price_cents',p.preco_exibido_centavos)) from public.produtos_site p where p.oficina_id=s.oficina_id and p.visivel),'[]'::jsonb))
  from public.sites_oficina s join public.oficinas w on w.id=s.oficina_id
  where s.identificador_url=p_identificador_url and s.publicado and private.has_feature(s.oficina_id,'website');
$function$;
revoke all on function public.consultar_site_publicado(p_identificador_url text) from public,anon,authenticated;
grant execute on function public.consultar_site_publicado(p_identificador_url text) to authenticated,service_role;
grant execute on function public.consultar_site_publicado(p_identificador_url text) to anon;
CREATE OR REPLACE FUNCTION public.solicitar_pecas(p_oficina uuid, p_cliente uuid, p_chave uuid, p_itens jsonb, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); item jsonb; product public.produtos_site%rowtype;
  existing public.pedidos_pecas%rowtype; r uuid; fingerprint text; qty numeric(12,3);
begin
  if not private.has_portal_access(p_oficina,p_cliente) or not private.has_feature(p_oficina,'parts_requests')
    or not exists(select 1 from public.sites_oficina where oficina_id=p_oficina and pedidos_pecas_habilitados) then
    raise exception 'Pedidos de peças indisponíveis' using errcode='42501'; end if;
  if p_chave is null or p_itens is null or jsonb_typeof(p_itens)<>'array' then raise exception 'Itens inválidos'; end if;
  if jsonb_array_length(p_itens) not between 1 and 30 or length(coalesce(p_observacoes,''))>2000 then raise exception 'Tamanho do pedido inválido'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('customer_id',p_cliente,'items',p_itens,'notes',p_observacoes)::text,'UTF8')),'hex');
  -- Serializa apenas reenvios da mesma chave. A constraint continua sendo a garantia final.
  perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||u::text||p_chave::text,0));
  select * into existing from public.pedidos_pecas where oficina_id=p_oficina and solicitado_por=u and chave_idempotencia=p_chave;
  if found then
    if existing.hash_solicitacao<>fingerprint then raise exception 'A chave de repetição já foi usada com outros dados' using errcode='23514'; end if;
    return existing.id;
  end if;
  insert into public.pedidos_pecas(oficina_id,cliente_id,solicitado_por,chave_idempotencia,observacoes_cliente,hash_solicitacao)
    values(p_oficina,p_cliente,u,p_chave,p_observacoes,fingerprint) returning id into r;
  for item in select value from jsonb_array_elements(p_itens) loop
    qty:=(item->>'quantity')::numeric;
    if qty is null or qty<=0 or qty>10000 then raise exception 'Quantidade inválida'; end if;
    select * into product from public.produtos_site where oficina_id=p_oficina and id=(item->>'product_id')::uuid and visivel;
    if not found then raise exception 'Produto indisponível' using errcode='23514'; end if;
    insert into public.itens_pedido_pecas(oficina_id,pedido_id,produto_site_id,descricao,quantidade)
      values(p_oficina,r,product.id,product.titulo,qty);
  end loop;
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados)
    values(p_oficina,'parts.requested','part_request',r,1,'part_request:'||r||':created',jsonb_build_object('request_id',r));
  return r;
end;
$function$;
revoke all on function public.solicitar_pecas(p_oficina uuid, p_cliente uuid, p_chave uuid, p_itens jsonb, p_observacoes text) from public,anon,authenticated;
grant execute on function public.solicitar_pecas(p_oficina uuid, p_cliente uuid, p_chave uuid, p_itens jsonb, p_observacoes text) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.resolver_parada_os(p_oficina uuid, p_ordem_servico uuid, p_parada uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; w public.ordens_servico%rowtype; rev integer;
begin
  u:=private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'production_board') then raise exception 'Recurso indisponível' using errcode='42501'; end if;
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_ordem_servico for update;
  if not found then raise exception 'Ordem de serviço não encontrada' using errcode='P0002'; end if;
  update public.paradas_ordem_servico set encerrado_em=now(),resolvido_por=u
    where oficina_id=p_oficina and ordem_servico_id=w.id and id=p_parada and encerrado_em is null;
  if not found then return; end if;
  update public.ordens_servico set revisao=revisao+1 where id=w.id returning revisao into rev;
  insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao)
    values(p_oficina,w.id,'unblocked',u,'Motivo de parada resolvido.');
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados)
    values(p_oficina,'work_order.unblocked','work_order',w.id,rev,'block:'||p_parada||':resolved',jsonb_build_object('work_order_id',w.id,'block_id',p_parada));
end;
$function$;
revoke all on function public.resolver_parada_os(p_oficina uuid, p_ordem_servico uuid, p_parada uuid) from public,anon,authenticated;
grant execute on function public.resolver_parada_os(p_oficina uuid, p_ordem_servico uuid, p_parada uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.registrar_parada_os(p_oficina uuid, p_ordem_servico uuid, p_motivo text, p_detalhes text, p_previsao_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; w public.ordens_servico%rowtype; block_id uuid; rev integer;
begin
  u:=private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'production_board') then raise exception 'Recurso indisponível' using errcode='42501'; end if;
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_ordem_servico for update;
  if not found or w.situacao in ('ready','delivered','cancelled') then raise exception 'Não é possível registrar uma parada nesta ordem de serviço' using errcode='23514'; end if;
  insert into public.paradas_ordem_servico(oficina_id,ordem_servico_id,motivo,detalhes,previsao_resolucao_em,criado_por)
    values(p_oficina,w.id,p_motivo,p_detalhes,p_previsao_em,u) returning id into block_id;
  update public.ordens_servico set revisao=revisao+1 where id=w.id returning revisao into rev;
  insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,metadados)
    values(p_oficina,w.id,'blocked',u,p_detalhes,jsonb_build_object('reason',p_motivo,'block_id',block_id));
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados)
    values(p_oficina,'work_order.blocked','work_order',w.id,rev,'block:'||block_id||':created',jsonb_build_object('work_order_id',w.id,'block_id',block_id));
  return block_id;
end;
$function$;
revoke all on function public.registrar_parada_os(p_oficina uuid, p_ordem_servico uuid, p_motivo text, p_detalhes text, p_previsao_em timestamp with time zone) from public,anon,authenticated;
grant execute on function public.registrar_parada_os(p_oficina uuid, p_ordem_servico uuid, p_motivo text, p_detalhes text, p_previsao_em timestamp with time zone) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.atualizar_mapa_ordem_servico(p_oficina uuid, p_ordem_servico uuid, p_revisao_esperada integer, p_situacao text, p_etapa uuid, p_local uuid, p_entrega_prevista_em timestamp with time zone, p_recebido_em timestamp with time zone, p_motivo_cancelamento text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; w public.ordens_servico%rowtype; next_revision integer; corr uuid:=gen_random_uuid();
begin
  u:=private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'production_board') then raise exception 'Recurso indisponível' using errcode='42501'; end if;
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_ordem_servico for update;
  if not found then raise exception 'Ordem de serviço não encontrada' using errcode='P0002'; end if;
  if p_revisao_esperada is null or w.revisao<>p_revisao_esperada then raise exception 'Este registro foi atualizado. Recarregue antes de salvar' using errcode='40001'; end if;
  if w.situacao in ('delivered','cancelled') then raise exception 'Ordem de serviço encerrada' using errcode='23514'; end if;
  if p_situacao is null or (p_situacao<>w.situacao and not (
    (w.situacao='open' and p_situacao in ('in_progress','cancelled')) or
    (w.situacao='in_progress' and p_situacao in ('quality_check','cancelled')) or
    (w.situacao='quality_check' and p_situacao in ('in_progress','ready','cancelled')) or
    (w.situacao='ready' and p_situacao in ('in_progress','delivered','cancelled'))
  )) then raise exception 'Mudança de situação inválida' using errcode='23514'; end if;
  if p_etapa is not null and not exists(select 1 from public.etapas_producao where oficina_id=p_oficina and id=p_etapa and ativo) then
    raise exception 'Etapa inválida' using errcode='23514'; end if;
  if p_local is not null and not exists(select 1 from public.locais_oficina where oficina_id=p_oficina and id=p_local and ativo) then
    raise exception 'Local inválido' using errcode='23514'; end if;
  if p_situacao in ('ready','delivered') and exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=w.id and encerrado_em is null) then
    raise exception 'Resolva as paradas abertas primeiro' using errcode='23514'; end if;
  if p_situacao='delivered' and p_recebido_em is null then raise exception 'A entrada do veículo ainda não foi registrada' using errcode='23514'; end if;
  update public.ordens_servico set situacao=p_situacao,etapa_id=p_etapa,local_id=p_local,entrega_prevista_em=p_entrega_prevista_em,
    recebido_em=p_recebido_em,revisao=revisao+1,
    iniciado_em=case when p_situacao='in_progress' then coalesce(iniciado_em,now()) else iniciado_em end,
    concluido_em=case when p_situacao='ready' then now() when p_situacao='in_progress' then null else concluido_em end,
    entregue_em=case when p_situacao='delivered' then now() else entregue_em end,
    cancelado_em=case when p_situacao='cancelled' then now() else cancelado_em end,
    motivo_cancelamento=case when p_situacao='cancelled' then p_motivo_cancelamento else motivo_cancelamento end
  where id=w.id returning revisao into next_revision;
  insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,visivel_ao_cliente,metadados)
    values(p_oficina,w.id,'board_updated',u,'Andamento do servico atualizado.',true,
      jsonb_build_object('old_status',w.situacao,'new_status',p_situacao,'old_stage_id',w.etapa_id,'new_stage_id',p_etapa,
        'old_bay_id',w.local_id,'new_bay_id',p_local,'old_promised_at',w.entrega_prevista_em,'new_promised_at',p_entrega_prevista_em));
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,correlacao_id,chave_deduplicacao,dados)
    values(p_oficina,'work_order.updated','work_order',w.id,next_revision,corr,'work_order:'||w.id||':revision:'||next_revision,
      jsonb_build_object('work_order_id',w.id,'status',p_situacao));
  return next_revision;
end;
$function$;
revoke all on function public.atualizar_mapa_ordem_servico(p_oficina uuid, p_ordem_servico uuid, p_revisao_esperada integer, p_situacao text, p_etapa uuid, p_local uuid, p_entrega_prevista_em timestamp with time zone, p_recebido_em timestamp with time zone, p_motivo_cancelamento text) from public,anon,authenticated;
grant execute on function public.atualizar_mapa_ordem_servico(p_oficina uuid, p_ordem_servico uuid, p_revisao_esperada integer, p_situacao text, p_etapa uuid, p_local uuid, p_entrega_prevista_em timestamp with time zone, p_recebido_em timestamp with time zone, p_motivo_cancelamento text) to authenticated,service_role;
-- Remove somente as nove assinaturas antigas, sem CASCADE e sem tocar em dados.
drop function public.convert_quote_to_work_order(p_workshop uuid, p_quote uuid);
drop function public.create_workshop(p_name text, p_phone text);
drop function public.get_my_work_order_history(p_workshop uuid, p_work_order uuid);
drop function public.get_my_work_orders(p_workshop uuid);
drop function public.get_published_workshop_site(p_slug text);
drop function public.request_parts(p_workshop uuid, p_customer uuid, p_key uuid, p_items jsonb, p_notes text);
drop function public.resolve_work_order_block(p_workshop uuid, p_work_order uuid, p_block uuid);
drop function public.set_work_order_block(p_workshop uuid, p_work_order uuid, p_reason text, p_details text, p_expected_at timestamp with time zone);
drop function public.update_work_order_board(p_workshop uuid, p_work_order uuid, p_expected_revision integer, p_status text, p_stage uuid, p_bay uuid, p_promised_at timestamp with time zone, p_received_at timestamp with time zone, p_cancellation_reason text);
update public.planos set nome=case codigo when 'basic' then 'Básico' when 'intermediate' then 'Intermediário' when 'complete' then 'Completo' else nome end;
notify pgrst, 'reload schema';
commit;
