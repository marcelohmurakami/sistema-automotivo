# Entenda o banco do sistema automotivo

O banco está no projeto `sistema_automotivo`, no Supabase. Os nomes de tabelas e campos estão em português. Os identificadores não usam acentos para facilitar o uso no código.

## Por onde começar

1. `oficinas`: dados da empresa que utiliza o sistema.
2. `membros_oficina`: pessoas da equipe e seus perfis de acesso.
3. `clientes` e `veiculos`: cadastros usados no atendimento.
4. `itens_catalogo`: serviços e peças favoritos, com seus preços sugeridos.
5. `orcamentos`: número, cliente, veículo e situação do orçamento.
6. `versoes_orcamento` e `itens_orcamento`: proposta exata enviada ao cliente, com itens e valores.
7. `aprovacoes_orcamento`: registro da decisão do cliente sobre aquela versão.
8. `ordens_servico`: ficha do serviço, que pode ser criada a partir do orçamento aprovado.
9. `historico_ordem_servico`, `paradas_ordem_servico` e `anexos_ordem_servico`: andamento, motivos de parada e fotos.
10. `mapa_oficina`: consulta que reúne carros, etapas, locais, responsáveis e prazos.

As demais tabelas atendem aos planos, site, portal do cliente, pedidos de peças, envio de mensagens, automações e auditoria. O [dicionário completo](dicionario-portugues.md) explica os nomes de todas as tabelas e campos.

## Como ler os campos

- `id`: identificador único do registro.
- `oficina_id`: oficina à qual o registro pertence.
- `cliente_id` e `veiculo_id`: ligações com os cadastros de cliente e veículo.
- `criado_em` e `atualizado_em`: datas de criação e última alteração.
- `arquivado_em`: quando o registro foi arquivado; o histórico é preservado.
- Campos terminados em `_centavos`: valores monetários inteiros. Por exemplo, `15000` representa R$ 150,00.
- `dados_cliente` e `dados_veiculo`: cópias dos dados usados na proposta ou atendimento; não são links para os dados atuais.
- `revisao`: controle que impede uma edição antiga do celular de sobrescrever uma alteração mais recente.

## Situações armazenadas e seus significados

Os códigos internos abaixo foram preservados para manter a compatibilidade com dados e integrações. Na interface do aplicativo, use os rótulos em português.

| Contexto | Código interno | Texto em português |
| --- | --- | --- |
| Orçamento | draft | Rascunho |
| Orçamento | awaiting_approval | Aguardando aprovação |
| Orçamento | approved | Aprovado |
| Orçamento | declined | Recusado |
| Orçamento | expired | Expirado |
| Orçamento ou OS | cancelled | Cancelado |
| OS | open | Aberta |
| OS | in_progress | Em execução |
| OS | quality_check | Em conferência |
| OS | ready | Pronta para entrega |
| OS | delivered | Entregue |
| Parada | parts | Aguardando peças |
| Parada | approval | Aguardando aprovação |
| Parada | third_party | Aguardando terceiro |
| Parada | capacity | Falta de disponibilidade |
| Parada | diagnosis | Aguardando diagnóstico |
| Parada | other | Outro motivo |
| Perfil | owner | Proprietário |
| Perfil | manager | Gestor |
| Perfil | staff | Equipe |
| Plano | basic | Básico |
| Plano | intermediate | Intermediário |
| Plano | complete | Completo |
| Item | service | Serviço |
| Item | part | Peça |
| Foto | before | Antes |
| Foto | during | Durante |
| Foto | after | Depois |

## Segurança e próximos passos

Cada oficina consulta seus próprios dados. As regras do banco continuam ativas após a tradução. As operações públicas em português mantêm verificações de usuário, oficina, plano e acesso do cliente.

As migrações originais são mantidas como histórico. Não execute novamente esses arquivos no banco atual. Para um ambiente novo, execute as cinco migrações na ordem dos nomes.

O banco está implantado, mas login, telas, PDF, WhatsApp e automações ainda precisam ser conectados ao aplicativo. As verificações locais usam simulações do Auth e Storage; a integração completa ainda precisa ser testada.
