# n8n do automotivo

Workflow `workflows/01-avisos-automotivo.json`, importado como `dBajzPqLKMPAgsug` em https://n8n.murakamitech.tech.

A cada 5 minutos chama a função `automacoes-oficina` no Supabase automotivo com `x-automotivo-secret`. A função gera lembretes idempotentes e processa um aviso aprovado por oficina configurada. O n8n não recebe credenciais de administrador do banco ou dados dos clientes na resposta.

Mantido como rascunho até configurar o segredo, validar o canal `estudos-whatsapp`, o plano Completo e o destinatário de teste. Consulte `docs/expansao-documentos-site-automacoes.md` para os passos restantes. Não publique o workflow com variáveis ausentes.
# Sugestões de recontato para troca de óleo

O fluxo `workflows/02-recontatos-troca-oleo.json` chama a função `recontatos-oleo` a cada cinco minutos e prepara, no máximo, uma sugestão por execução. É entregue **inativo**. Para habilitá-lo, publicar a função, aplicar a migração `20261020000500` e configurar `AUTOMOTIVO_AGENDADOR_SECRET`, `OPENAI_API_KEY` e `OPENAI_MODEL` no backend. No n8n, usar o mesmo segredo do agendador; nunca colocar a chave administrativa do Supabase ou a chave da IA no workflow.

Na OS de troca de óleo, informar a quilometragem atual, a próxima quilometragem e o uso médio diário informado pelo cliente, ou uma data de revisão. Ao ficar pronta/entregue, a OS alimenta a fila. Não há média de uso inventada. O limite de previsão é de 730 dias. A data informada pela empresa prevalece quando for mais próxima. Uma nova troca do mesmo veículo substitui o lembrete anterior.

Em **Assistente e automações → Próximas trocas de óleo**, a empresa confere a previsão, revisa a mensagem e pode abrir o WhatsApp. Nenhuma mensagem é enviada automaticamente por este fluxo. A IA recebe apenas números e datas, começa a preparar sugestões 14 dias antes e tem até três tentativas espaçadas por um dia. A fila funciona com concorrência controlada e ignora respostas antigas quando a OS muda. Sem IA configurada, a previsão e o texto padrão continuam disponíveis.

As previsões passam a ser criadas para OS finalizadas ou atualizadas após a migração; registros antigos não são modificados em massa. Planos precisam permitir `automations`; gerar texto com IA também exige `ai`.

Referências de implementação: [Responses API e geração de texto](https://developers.openai.com/api/docs/guides/text) e [HTTP Request do n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/).
