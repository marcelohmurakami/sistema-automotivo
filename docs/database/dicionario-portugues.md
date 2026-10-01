# Dicionário do banco em português

Os nomes atuais das tabelas, colunas, mapa da oficina e operações públicas estão em português, sem acentos nos identificadores SQL.
As migrações 1 a 4 registram a versão original. A migração 5 renomeia a estrutura sem recriar tabelas ou apagar registros.

Os códigos armazenados (por exemplo, `approved`), chaves de documentos JSON já emitidos, nomes de eventos de integração e o recipiente `workshop-files` são contratos técnicos preservados. As descrições e a apresentação ao usuário devem ser em português. Os esquemas `auth` e `storage`, as funções internas e os nomes de índices e restrições pertencem à implementação técnica.

## Tabelas e campos

### execucoes_ia

Nome anterior: `ai_runs`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| solicitado_por | requested_by | uuid | Sim |
| ordem_servico_id | work_order_id | uuid | Não |
| tipo_tarefa | task_type | text | Sim |
| modelo | model | text | Sim |
| versao_instrucao_ia | prompt_template_version | text | Sim |
| chave_idempotencia | idempotency_key | uuid | Sim |
| situacao | status | text | Sim |
| tokens_entrada | input_tokens | integer | Não |
| tokens_saida | output_tokens | integer | Não |
| resultado | result | jsonb | Não |
| revisado_por | reviewed_by | uuid | Não |
| revisado_em | reviewed_at | timestamp with time zone | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| finalizado_em | finished_at | timestamp with time zone | Não |

### registros_auditoria

Nome anterior: `audit_logs`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| usuario_autor_id | actor_user_id | uuid | Não |
| conexao_autor_id | actor_connection_id | uuid | Não |
| tipo_autor | actor_type | text | Sim |
| acao | action | text | Sim |
| tipo_entidade | entity_type | text | Sim |
| entidade_id | entity_id | uuid | Sim |
| correlacao_id | correlation_id | uuid | Sim |
| metadados | metadata | jsonb | Sim |
| criado_em | created_at | timestamp with time zone | Sim |

### execucoes_automacao

Nome anterior: `automation_runs`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| conexao_id | connection_id | uuid | Sim |
| evento_origem_id | source_event_id | uuid | Não |
| chave_fluxo | workflow_key | text | Sim |
| versao_fluxo | workflow_version | text | Sim |
| chave_idempotencia | idempotency_key | text | Sim |
| hash_solicitacao | request_hash | text | Sim |
| execucao_externa_id | external_execution_id | text | Não |
| situacao | status | text | Sim |
| referencia_resultado | result_reference | jsonb | Sim |
| iniciado_em | started_at | timestamp with time zone | Não |
| finalizado_em | finished_at | timestamp with time zone | Não |
| codigo_erro | error_code | text | Não |
| criado_em | created_at | timestamp with time zone | Sim |

### itens_catalogo

Nome anterior: `catalog_items`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| tipo | kind | text | Sim |
| descricao | description | text | Sim |
| unidade | unit | text | Sim |
| preco_padrao_centavos | default_unit_price_cents | bigint | Sim |
| favorito | favorite | boolean | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |
| arquivado_em | archived_at | timestamp with time zone | Não |

### acessos_portal_cliente

Nome anterior: `customer_portal_access`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| oficina_id | workshop_id | uuid | Sim |
| cliente_id | customer_id | uuid | Sim |
| usuario_id | user_id | uuid | Sim |
| verificado_em | verified_at | timestamp with time zone | Sim |
| concedido_por | granted_by | uuid | Não |
| revogado_em | revoked_at | timestamp with time zone | Não |

### clientes_veiculos

Nome anterior: `customer_vehicles`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| oficina_id | workshop_id | uuid | Sim |
| cliente_id | customer_id | uuid | Sim |
| veiculo_id | vehicle_id | uuid | Sim |
| vinculo | relationship | text | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| encerrado_em | ended_at | timestamp with time zone | Não |

### clientes

Nome anterior: `customers`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| nome | name | text | Sim |
| telefone_e164 | phone_e164 | text | Não |
| email | email | text | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |
| arquivado_em | archived_at | timestamp with time zone | Não |

### eventos_negocio

Nome anterior: `domain_events`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| tipo_evento | event_type | text | Sim |
| versao_estrutura | schema_version | smallint | Sim |
| tipo_agregado | aggregate_type | text | Sim |
| agregado_id | aggregate_id | uuid | Sim |
| versao_agregado | aggregate_version | integer | Sim |
| correlacao_id | correlation_id | uuid | Sim |
| causa_id | causation_id | uuid | Não |
| chave_deduplicacao | deduplication_key | text | Sim |
| dados | payload | jsonb | Sim |
| ocorrido_em | occurred_at | timestamp with time zone | Sim |

### entregas_evento

Nome anterior: `event_deliveries`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| evento_id | event_id | uuid | Sim |
| conexao_id | connection_id | uuid | Sim |
| situacao | status | text | Sim |
| tentativas | attempts | integer | Sim |
| maximo_tentativas | max_attempts | integer | Sim |
| proxima_tentativa_em | next_attempt_at | timestamp with time zone | Sim |
| token_reserva | lease_token | uuid | Não |
| reservado_ate | locked_until | timestamp with time zone | Não |
| ultimo_codigo_http | last_http_status | smallint | Não |
| ultimo_codigo_erro | last_error_code | text | Não |
| aceito_em | accepted_at | timestamp with time zone | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### tentativas_entrega_evento

Nome anterior: `event_delivery_attempts`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| entrega_id | delivery_id | uuid | Sim |
| numero_tentativa | attempt_number | integer | Sim |
| iniciado_em | started_at | timestamp with time zone | Sim |
| finalizado_em | finished_at | timestamp with time zone | Não |
| codigo_http | http_status | smallint | Não |
| codigo_erro | error_code | text | Não |

### arquivos

Nome anterior: `file_assets`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| recipiente | bucket | text | Sim |
| caminho_arquivo | object_path | text | Sim |
| nome_original | original_name | text | Sim |
| tipo_mime | mime_type | text | Sim |
| tamanho_bytes | size_bytes | bigint | Sim |
| sha256 | sha256 | text | Não |
| situacao | status | text | Sim |
| criado_por | created_by | uuid | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### chaves_api_integracao

Nome anterior: `integration_api_keys`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| conexao_id | connection_id | uuid | Sim |
| hash_chave | key_hash | text | Sim |
| escopos | scopes | ARRAY | Sim |
| expira_em | expires_at | timestamp with time zone | Não |
| revogado_em | revoked_at | timestamp with time zone | Não |
| criado_em | created_at | timestamp with time zone | Sim |

### conexoes_integracao

Nome anterior: `integration_connections`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| nome | name | text | Sim |
| tipo | kind | text | Sim |
| url_destino | endpoint_url | text | Sim |
| referencia_credenciais | credentials_ref | text | Sim |
| habilitado | enabled | boolean | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### assinaturas_eventos

Nome anterior: `integration_subscriptions`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| oficina_id | workshop_id | uuid | Sim |
| conexao_id | connection_id | uuid | Sim |
| tipo_evento | event_type | text | Sim |
| habilitado | enabled | boolean | Sim |
| assinado_em | subscribed_at | timestamp with time zone | Sim |

### tentativas_mensagem

Nome anterior: `message_attempts`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| mensagem_id | message_job_id | uuid | Sim |
| numero_tentativa | attempt_number | integer | Sim |
| iniciado_em | started_at | timestamp with time zone | Sim |
| finalizado_em | finished_at | timestamp with time zone | Não |
| resultado | result | text | Não |
| codigo_http | http_status | smallint | Não |
| codigo_erro | error_code | text | Não |

### eventos_mensagem

Nome anterior: `message_events`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| conexao_id | connection_id | uuid | Sim |
| mensagem_id | message_job_id | uuid | Não |
| mensagem_provedor_id | provider_message_id | text | Sim |
| chave_evento_provedor | provider_event_key | text | Sim |
| tipo_evento | event_type | text | Sim |
| ocorrido_no_provedor_em | provider_occurred_at | timestamp with time zone | Sim |
| recebido_em | received_at | timestamp with time zone | Sim |
| processado_em | processed_at | timestamp with time zone | Não |
| codigo_erro_processamento | processing_error_code | text | Não |
| dados | payload | jsonb | Sim |

### fila_mensagens

Nome anterior: `message_jobs`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| versao_orcamento_id | quote_version_id | uuid | Sim |
| conexao_id | connection_id | uuid | Sim |
| documento_id | document_id | uuid | Não |
| evento_origem_id | source_event_id | uuid | Não |
| destinatario_e164 | recipient_e164 | text | Sim |
| finalidade | purpose | text | Sim |
| chave_idempotencia | idempotency_key | text | Sim |
| nome_modelo_provedor | provider_template_name | text | Não |
| situacao | status | text | Sim |
| mensagem_provedor_id | provider_message_id | text | Não |
| tentativas | attempts | integer | Sim |
| maximo_tentativas | max_attempts | integer | Sim |
| proxima_tentativa_em | next_attempt_at | timestamp with time zone | Sim |
| token_reserva | lease_token | uuid | Não |
| reservado_ate | locked_until | timestamp with time zone | Não |
| ultimo_codigo_erro | last_error_code | text | Não |
| aceito_em | accepted_at | timestamp with time zone | Não |
| entregue_em | delivered_at | timestamp with time zone | Não |
| lido_em | read_at | timestamp with time zone | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### itens_pedido_pecas

Nome anterior: `part_request_items`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| pedido_id | request_id | uuid | Sim |
| produto_site_id | site_product_id | uuid | Não |
| descricao | description | text | Sim |
| quantidade | quantity | numeric | Sim |
| preco_cotado_centavos | quoted_unit_price_cents | bigint | Não |

### pedidos_pecas

Nome anterior: `part_requests`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| cliente_id | customer_id | uuid | Sim |
| solicitado_por | requested_by | uuid | Sim |
| chave_idempotencia | idempotency_key | uuid | Sim |
| situacao | status | text | Sim |
| observacoes_cliente | customer_notes | text | Não |
| observacoes_internas | internal_notes | text | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |
| hash_solicitacao | request_hash | text | Sim |

### etapas_producao

Nome anterior: `production_stages`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| nome | name | text | Sim |
| posicao | position | integer | Sim |
| cor | color | text | Sim |
| ativo | active | boolean | Sim |

### tokens_acesso_orcamento

Nome anterior: `quote_access_tokens`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| versao_orcamento_id | quote_version_id | uuid | Sim |
| hash_token | token_hash | text | Sim |
| referencia_segredo | secret_ref | text | Não |
| expira_em | expires_at | timestamp with time zone | Sim |
| revogado_em | revoked_at | timestamp with time zone | Não |
| criado_em | created_at | timestamp with time zone | Sim |

### aprovacoes_orcamento

Nome anterior: `quote_approvals`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| versao_orcamento_id | quote_version_id | uuid | Sim |
| token_acesso_id | access_token_id | uuid | Sim |
| decisao | decision | text | Sim |
| nome_informado | declared_name | text | Sim |
| metodo_verificacao | verification_method | text | Sim |
| texto_confirmacao | confirmation_text | text | Sim |
| confirmado_em | confirmed_at | timestamp with time zone | Sim |

### anexos_orcamento

Nome anterior: `quote_attachments`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| versao_orcamento_id | quote_version_id | uuid | Sim |
| arquivo_id | file_asset_id | uuid | Sim |
| legenda | caption | text | Não |
| visivel_ao_cliente | visible_to_customer | boolean | Sim |
| criado_em | created_at | timestamp with time zone | Sim |

### documentos_orcamento

Nome anterior: `quote_documents`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| versao_orcamento_id | quote_version_id | uuid | Sim |
| arquivo_id | file_asset_id | uuid | Sim |
| versao_modelo | template_version | text | Sim |
| gerado_em | generated_at | timestamp with time zone | Sim |

### itens_orcamento

Nome anterior: `quote_items`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| versao_orcamento_id | quote_version_id | uuid | Sim |
| item_catalogo_id | catalog_item_id | uuid | Não |
| posicao | position | integer | Sim |
| tipo | kind | text | Sim |
| descricao | description | text | Sim |
| unidade | unit | text | Sim |
| quantidade | quantity | numeric | Sim |
| preco_unitario_centavos | unit_price_cents | bigint | Sim |
| total_item_centavos | line_total_cents | bigint | Não |
| criado_em | created_at | timestamp with time zone | Sim |

### versoes_orcamento

Nome anterior: `quote_versions`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| orcamento_id | quote_id | uuid | Sim |
| numero_versao | version_number | integer | Sim |
| versao_estrutura_dados | snapshot_schema_version | smallint | Sim |
| dados_oficina | workshop_snapshot | jsonb | Sim |
| dados_cliente | customer_snapshot | jsonb | Sim |
| dados_veiculo | vehicle_snapshot | jsonb | Sim |
| observacoes | notes | text | Não |
| condicoes | terms | text | Não |
| moeda | currency | text | Sim |
| subtotal_centavos | subtotal_cents | bigint | Sim |
| desconto_centavos | discount_cents | bigint | Sim |
| total_centavos | total_cents | bigint | Não |
| expira_em | expires_at | timestamp with time zone | Não |
| publicado_em | published_at | timestamp with time zone | Não |
| criado_por | created_by | uuid | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### orcamentos

Nome anterior: `quotes`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| numero | number | bigint | Sim |
| cliente_id | customer_id | uuid | Não |
| veiculo_id | vehicle_id | uuid | Não |
| situacao | status | text | Sim |
| versao_atual_id | current_version_id | uuid | Não |
| revisao | lock_version | integer | Sim |
| criado_por | created_by | uuid | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |
| arquivado_em | archived_at | timestamp with time zone | Não |

### recursos

Nome anterior: `saas_features`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| codigo | code | text | Sim |
| descricao | description | text | Sim |

### recursos_plano

Nome anterior: `saas_plan_features`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| codigo_plano | plan_code | text | Sim |
| codigo_recurso | feature_code | text | Sim |
| habilitado | enabled | boolean | Sim |

### planos

Nome anterior: `saas_plans`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| codigo | code | text | Sim |
| nome | name | text | Sim |
| ativo | active | boolean | Sim |

### acoes_agendadas

Nome anterior: `scheduled_actions`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| versao_orcamento_id | quote_version_id | uuid | Sim |
| tipo_acao | action_type | text | Sim |
| chave_idempotencia | idempotency_key | text | Sim |
| agendado_para | due_at | timestamp with time zone | Sim |
| situacao | status | text | Sim |
| tentativas | attempts | integer | Sim |
| maximo_tentativas | max_attempts | integer | Sim |
| proxima_tentativa_em | next_attempt_at | timestamp with time zone | Sim |
| token_reserva | lease_token | uuid | Não |
| reservado_ate | locked_until | timestamp with time zone | Não |
| codigo_erro | error_code | text | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### itens_nota_atendimento

Nome anterior: `service_note_items`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| nota_id | note_id | uuid | Sim |
| item_catalogo_id | catalog_item_id | uuid | Não |
| posicao | position | integer | Sim |
| tipo | kind | text | Sim |
| descricao | description | text | Sim |
| quantidade | quantity | numeric | Sim |
| unidade | unit | text | Sim |
| preco_unitario_centavos | unit_price_cents | bigint | Sim |
| total_item_centavos | line_total_cents | bigint | Não |

### notas_atendimento

Nome anterior: `service_notes`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| numero | number | bigint | Sim |
| cliente_id | customer_id | uuid | Não |
| veiculo_id | vehicle_id | uuid | Não |
| situacao | status | text | Sim |
| dados_cliente | customer_snapshot | jsonb | Sim |
| dados_veiculo | vehicle_snapshot | jsonb | Sim |
| dados_oficina | workshop_snapshot | jsonb | Sim |
| observacoes | notes | text | Não |
| subtotal_centavos | subtotal_cents | bigint | Sim |
| desconto_centavos | discount_cents | bigint | Sim |
| total_centavos | total_cents | bigint | Não |
| emitido_em | issued_at | timestamp with time zone | Não |
| criado_por | created_by | uuid | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### produtos_site

Nome anterior: `site_products`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| item_catalogo_id | catalog_item_id | uuid | Sim |
| titulo | title | text | Sim |
| descricao | description | text | Não |
| visivel | visible | boolean | Sim |
| preco_exibido_centavos | displayed_price_cents | bigint | Não |
| imagem_id | image_asset_id | uuid | Não |

### veiculos

Nome anterior: `vehicles`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| placa | plate | text | Não |
| marca | brand | text | Não |
| modelo | model | text | Sim |
| ano_modelo | model_year | smallint | Não |
| origem | source | text | Sim |
| provedor_origem | source_provider | text | Não |
| origem_consultada_em | source_checked_at | timestamp with time zone | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |
| arquivado_em | archived_at | timestamp with time zone | Não |

### conexoes_whatsapp

Nome anterior: `whatsapp_connections`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| provedor | provider | text | Sim |
| conta_provedor_id | provider_account_id | text | Sim |
| telefone_provedor_id | provider_phone_id | text | Sim |
| telefone_e164 | phone_e164 | text | Sim |
| referencia_credenciais | credentials_ref | text | Sim |
| situacao | status | text | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### responsaveis_ordem_servico

Nome anterior: `work_order_assignments`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| oficina_id | workshop_id | uuid | Sim |
| ordem_servico_id | work_order_id | uuid | Sim |
| usuario_id | user_id | uuid | Sim |
| principal | is_lead | boolean | Sim |
| atribuido_em | assigned_at | timestamp with time zone | Sim |

### anexos_ordem_servico

Nome anterior: `work_order_attachments`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| ordem_servico_id | work_order_id | uuid | Sim |
| arquivo_id | file_asset_id | uuid | Sim |
| fase | phase | text | Sim |
| legenda | caption | text | Não |
| visivel_ao_cliente | visible_to_customer | boolean | Sim |
| capturado_em | captured_at | timestamp with time zone | Sim |
| enviado_por | uploaded_by | uuid | Não |

### paradas_ordem_servico

Nome anterior: `work_order_blocks`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| ordem_servico_id | work_order_id | uuid | Sim |
| motivo | reason | text | Sim |
| detalhes | details | text | Sim |
| previsao_resolucao_em | expected_resolution_at | timestamp with time zone | Não |
| iniciado_em | started_at | timestamp with time zone | Sim |
| encerrado_em | ended_at | timestamp with time zone | Não |
| criado_por | created_by | uuid | Sim |
| resolvido_por | resolved_by | uuid | Não |

### verificacoes_ordem_servico

Nome anterior: `work_order_checklist_items`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| ordem_servico_id | work_order_id | uuid | Sim |
| fase | phase | text | Sim |
| rotulo | label | text | Sim |
| posicao | position | integer | Sim |
| resultado | result | text | Sim |
| observacoes | notes | text | Não |
| verificado_por | checked_by | uuid | Não |
| verificado_em | checked_at | timestamp with time zone | Não |

### historico_ordem_servico

Nome anterior: `work_order_events`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| ordem_servico_id | work_order_id | uuid | Sim |
| tipo_evento | event_type | text | Sim |
| usuario_autor_id | actor_user_id | uuid | Não |
| tipo_autor | actor_kind | text | Sim |
| descricao | description | text | Sim |
| visivel_ao_cliente | visible_to_customer | boolean | Sim |
| metadados | metadata | jsonb | Sim |
| ocorrido_em | occurred_at | timestamp with time zone | Sim |

### itens_ordem_servico

Nome anterior: `work_order_items`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| ordem_servico_id | work_order_id | uuid | Sim |
| item_catalogo_id | catalog_item_id | uuid | Não |
| item_orcamento_origem_id | source_quote_item_id | uuid | Não |
| posicao | position | integer | Sim |
| tipo | kind | text | Sim |
| descricao | description | text | Sim |
| unidade | unit | text | Sim |
| quantidade | quantity | numeric | Sim |
| preco_unitario_centavos | unit_price_cents | bigint | Sim |
| total_item_centavos | line_total_cents | bigint | Não |
| situacao | status | text | Sim |
| concluido_em | completed_at | timestamp with time zone | Não |

### ordens_servico

Nome anterior: `work_orders`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| numero | number | bigint | Sim |
| cliente_id | customer_id | uuid | Sim |
| veiculo_id | vehicle_id | uuid | Sim |
| orcamento_origem_id | source_quote_id | uuid | Não |
| versao_orcamento_origem_id | source_quote_version_id | uuid | Não |
| situacao | status | text | Sim |
| prioridade | priority | text | Sim |
| etapa_id | stage_id | uuid | Não |
| local_id | bay_id | uuid | Não |
| dados_cliente | customer_snapshot | jsonb | Sim |
| dados_veiculo | vehicle_snapshot | jsonb | Sim |
| queixa_cliente | complaint | text | Não |
| diagnostico | diagnosis | text | Não |
| observacoes_internas | internal_notes | text | Não |
| resumo_cliente | customer_summary | text | Não |
| quilometragem_entrada | mileage_in | integer | Não |
| quilometragem_saida | mileage_out | integer | Não |
| combustivel_percentual | fuel_percent | smallint | Não |
| pertences | belongings | text | Não |
| recebido_em | received_at | timestamp with time zone | Não |
| entrega_prevista_em | promised_at | timestamp with time zone | Não |
| iniciado_em | started_at | timestamp with time zone | Não |
| concluido_em | completed_at | timestamp with time zone | Não |
| entregue_em | delivered_at | timestamp with time zone | Não |
| cancelado_em | cancelled_at | timestamp with time zone | Não |
| motivo_cancelamento | cancellation_reason | text | Não |
| condicoes_garantia | warranty_terms | text | Não |
| garantia_ate | warranty_until | date | Não |
| subtotal_centavos | subtotal_cents | bigint | Sim |
| desconto_centavos | discount_cents | bigint | Sim |
| total_centavos | total_cents | bigint | Não |
| revisao | lock_version | integer | Sim |
| criado_por | created_by | uuid | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### locais_oficina

Nome anterior: `workshop_bays`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| oficina_id | workshop_id | uuid | Sim |
| nome | name | text | Sim |
| tipo | kind | text | Sim |
| posicao_x | map_x | numeric | Não |
| posicao_y | map_y | numeric | Não |
| ativo | active | boolean | Sim |

### mapa_oficina

Nome anterior: `workshop_board`. Consulta do mapa; respeita as permissões de cada oficina.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Não |
| oficina_id | workshop_id | uuid | Não |
| numero | number | bigint | Não |
| situacao | status | text | Não |
| prioridade | priority | text | Não |
| etapa_id | stage_id | uuid | Não |
| nome_etapa | stage_name | text | Não |
| local_id | bay_id | uuid | Não |
| nome_local | bay_name | text | Não |
| cliente_id | customer_id | uuid | Não |
| veiculo_id | vehicle_id | uuid | Não |
| placa | plate | text | Não |
| modelo_veiculo | vehicle_model | text | Não |
| recebido_em | received_at | timestamp with time zone | Não |
| entrega_prevista_em | promised_at | timestamp with time zone | Não |
| resumo_cliente | customer_summary | text | Não |
| revisao | lock_version | integer | Não |
| atrasado | overdue | boolean | Não |
| presente_na_oficina | physically_in_shop | boolean | Não |
| paradas_abertas | open_blocks | jsonb | Não |
| quantidade_paradas | block_count | integer | Não |
| membros_responsaveis | assigned_members | jsonb | Não |

### membros_oficina

Nome anterior: `workshop_members`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| oficina_id | workshop_id | uuid | Sim |
| usuario_id | user_id | uuid | Sim |
| perfil | role | text | Sim |
| ativo | active | boolean | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### sites_oficina

Nome anterior: `workshop_sites`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| oficina_id | workshop_id | uuid | Sim |
| identificador_url | slug | text | Sim |
| dominio_personalizado | custom_domain | text | Não |
| dominio_verificado_em | domain_verified_at | timestamp with time zone | Não |
| titulo | title | text | Sim |
| descricao | description | text | Não |
| publicado | published | boolean | Sim |
| portal_habilitado | portal_enabled | boolean | Sim |
| pedidos_pecas_habilitados | parts_requests_enabled | boolean | Sim |
| tema | theme | jsonb | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### assinaturas_oficina

Nome anterior: `workshop_subscriptions`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| oficina_id | workshop_id | uuid | Sim |
| codigo_plano | plan_code | text | Sim |
| situacao | status | text | Sim |
| valido_ate | valid_until | timestamp with time zone | Não |
| provedor_cobranca | billing_provider | text | Não |
| assinatura_provedor_id | provider_subscription_id | text | Não |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |

### oficinas

Nome anterior: `workshops`.

| Campo em português | Nome anterior | Tipo | Obrigatório |
| --- | --- | --- | --- |
| id | id | uuid | Sim |
| nome | name | text | Sim |
| telefone_e164 | phone_e164 | text | Não |
| fuso_horario | timezone | text | Sim |
| moeda | currency | text | Sim |
| proximo_numero_orcamento | next_quote_number | bigint | Sim |
| criado_em | created_at | timestamp with time zone | Sim |
| atualizado_em | updated_at | timestamp with time zone | Sim |
| arquivado_em | archived_at | timestamp with time zone | Não |
| logo_id | logo_asset_id | uuid | Não |
| proximo_numero_os | next_work_order_number | bigint | Sim |
| proximo_numero_nota | next_note_number | bigint | Sim |
| endereco | address | jsonb | Sim |

## Operações públicas

| Nome atual | Nome anterior | Parâmetros |
| --- | --- | --- |
| converter_orcamento_em_os | convert_quote_to_work_order | p_oficina uuid, p_orcamento uuid |
| criar_oficina | create_workshop | p_nome text, p_telefone text |
| consultar_meu_historico_os | get_my_work_order_history | p_oficina uuid, p_ordem_servico uuid |
| consultar_minhas_ordens_servico | get_my_work_orders | p_oficina uuid |
| consultar_site_publicado | get_published_workshop_site | p_identificador_url text |
| solicitar_pecas | request_parts | p_oficina uuid, p_cliente uuid, p_chave uuid, p_itens jsonb, p_observacoes text |
| resolver_parada_os | resolve_work_order_block | p_oficina uuid, p_ordem_servico uuid, p_parada uuid |
| registrar_parada_os | set_work_order_block | p_oficina uuid, p_ordem_servico uuid, p_motivo text, p_detalhes text, p_previsao_em timestamp with time zone |
| atualizar_mapa_ordem_servico | update_work_order_board | p_oficina uuid, p_ordem_servico uuid, p_revisao_esperada integer, p_situacao text, p_etapa uuid, p_local uuid, p_entrega_prevista_em timestamp with time zone, p_recebido_em timestamp with time zone, p_motivo_cancelamento text |

Os parâmetros dessas operações também foram traduzidos. Atualize as chamadas `.rpc()` ao conectar o aplicativo. As permissões de equipe, cliente do portal e visitante permanecem separadas.

## Complemento: clientes e acesso por plano (migração 6)

A migração `20260928000600_clientes_e_acesso_por_plano.sql` acrescenta:

| Tabela | Campo | Significado |
|---|---|---|
| clientes | tipo | Pessoa física (`pessoa_fisica`) ou empresa (`pessoa_juridica`) |
| clientes | endereco | Endereço opcional, até 1.000 caracteres |
| clientes | observacoes | Observações opcionais, até 2.000 caracteres |
| clientes | revisao | Número usado para impedir sobrescrita de edições concorrentes |

Operações novas: `consultar_meu_acesso`, `listar_clientes`, `salvar_cliente` e `definir_arquivamento_cliente`.
Veja [clientes e planos](../clientes-e-planos.md) para parâmetros, regras de exclusão e testes. O esquema passa a ter quatro campos e quatro operações públicas adicionais; as 48 tabelas são preservadas.
