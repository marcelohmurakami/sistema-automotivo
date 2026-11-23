# Atendimento WhatsApp — 02/10/2026

Publicado no n8n: [Automotivo - Atendimento WhatsApp de testes](https://n8n.murakamitech.tech/workflow/O42xYZ626Hw7jBZV).

Instância reutilizada: `estudos-whatsapp`. A consulta real de conexão retornou `state: open`. Foram despublicados os fluxos de salões `9NEcFqG4ITOlrJ7x` (entrada e recibos) e `wcN8NpYBJL4lKc9k` (fila). Não reativá-los junto com este atendimento: compartilham o número e a rota de entrada.

## Comportamento

Responde a mensagens individuais novas com triagem da Oficina do Marcelo. `oi` ou `menu` mostra orçamento, andamento, agendamento e contato com a equipe. Solicita informações para avaliação humana, sem prometer valores, horários ou prazos. Áudios e anexos são reconhecidos, mas não transcritos ou diagnosticados.

Não utiliza IA, não cadastra automaticamente clientes/orçamentos, não consulta OS nem cria reservas. A conversa permanece no WhatsApp para a equipe atender. O fluxo de lembretes e avisos aprovados do sistema continua separado e inativo.

## Arquivos e validação

- `n8n/atendimento.mjs`: normalização e respostas.
- `scripts/gerar-atendimento-whatsapp.mjs`: gera o JSON importável.
- `n8n/workflows/atendimento-whatsapp.json`: workflow importado e publicado.
- `node scripts/testar-atendimento-whatsapp.mjs`: 26 verificações aprovadas, sem enviar mensagens reais.
- `docs/whatsapp-atendimento-publicado.png`: evidência da publicação e diagnóstico de conexão executado.

Confirmados no servidor: variáveis presentes, conexão aberta e publicação. Ainda pendente: mensagem real recebida, execução completa até envio e confirmação de recebimento pelo destinatário. Publicação e conexão, isoladamente, não comprovam entrega. Foi solicitado ao usuário enviar `oi` de outro WhatsApp.

## Operação

Usa o caminho POST `evolution-whatsapp/:secret`. Como há um parâmetro dinâmico, o n8n inclui o `webhookId` na URL: `/webhook/dd2dc3b5-f49d-4365-b468-ae2a42cbdf83/evolution-whatsapp/:secret`. Copiar sempre a URL de produção completa exibida pelo nó, substituindo o parâmetro no servidor. O segredo é validado contra `EVOLUTION_WEBHOOK_SECRET`; envio usa `EVOLUTION_API_KEY` já existente no n8n. `EVOLUTION_INSTANCE` deve ser `estudos-whatsapp`. Nenhum segredo foi gravado no repositório. As variáveis Supabase do sistema de salões não são utilizadas.

### Correção após teste real sem resposta

O usuário enviou “boa tarde” e não recebeu resposta. O diagnóstico mostrou que a Evolution estava habilitada, mas apontava para uma URL diferente da URL completa do novo webhook. Foi corrigido o destino na Evolution, preservando os eventos e a autenticação existentes. A consulta posterior confirmou `urlCorreta: true`, `habilitado: true`, evento `MESSAGES_UPSERT` e `porEvento: false`. Um evento de diagnóstico sem mensagem confirmou HTTP 200 na nova rota, sem enviar WhatsApp.

O nó `Conferir configuracao` agora usa `n8n/diagnostico-whatsapp.js` e verifica configuração, rota e HTTP. O gerador preserva o webhookId para não mudar novamente a URL a cada geração. O reparo foi executado uma vez; o código permanente apenas verifica a configuração. Nova versão publicada. Evidência: `docs/whatsapp-webhook-corrigido.png`. Ainda pendente a confirmação do usuário sobre recebimento do menu após enviar nova mensagem; HTTP 200 não comprova o envio final ao WhatsApp.

Ignora mensagens próprias, grupos, canais, recibos e eventos antigos com timestamp. Telefones LID precisam de `remoteJidAlt` válido. Duplicatas do lote são removidas no código e duplicatas entre execuções passam pelo nó Remove Duplicates do n8n. O histórico padrão desse nó é limitado; não representa garantia transacional de envio único sob qualquer concorrência.

O envio não tem repetição automática após falha, pois um timeout pode ocorrer após a mensagem já ter sido entregue. Como a deduplicação antecede o envio, uma falha exige revisão manual. Dados das execuções de produção não são persistidos pelo workflow, inclusive em erro; diagnosticar com uma conversa controlada sem expor conteúdo ou segredos.

Para pausar, usar Unpublish neste workflow. Não é necessário religar os salões para pausar o automotivo. Para alterar respostas, editar o módulo, executar os testes e o gerador e atualizar o workflow existente no n8n antes de publicar a nova versão.
