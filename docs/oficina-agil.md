# Oficina ágil — implementação de 05/10/2026

## Onde usar

| Recurso | Caminho | Funcionamento |
| --- | --- | --- |
| Atendimento expresso | Novo orçamento ou nova OS → Atendimento expresso | Ditado pelo navegador ou teclado; relato aproveitado sem IA; foto de placa/painel e extração assistida no Completo. Sempre revisar antes de aplicar. |
| Margem prevista | Edição do orçamento → Conferir margem | Custo das peças, tempo, custo da hora, despesas extras e desconto. Dados incompletos geram aviso; não confundir estimativa com lucro realizado. |
| Aprovação por grupos | Item do orçamento → Explicar serviço | Grupo, prioridade, explicação e dependência. O cliente pode selecionar grupos; a OS recebe somente os autorizados com desconto proporcional. A proposta original permanece íntegra. |
| Retorno de clientes | Oportunidades | Orçamentos sem resposta há um dia, serviços adiados e manutenções próximas. Registrar contato, combinar retorno, preparar orçamento e acompanhar recebimentos da OS vinculada. |
| Receber por Pix | OS → Pagamento do cliente → Cobranças Pix | Sinal ou saldo, QR code/copia e cola e confirmação pelo provedor. Disponível após conectar a conta da oficina. |
| Compra por XML | Compras → Importar compra por XML | Conferir nota, associar cada linha à peça ou cadastrar uma nova, informar preço e vencimento. Compra, estoque e conta a pagar são gravados juntos; chave repetida não duplica entrada. |
| Importar cadastros | Clientes / Peças e serviços → Importar | Modelo CSV, validação por linha, prévia, até 500 registros. Cadastro equivalente é ignorado, sem sobrescrever o existente. |
| Sem conexão | Rascunhos no aparelho | Preparar online, guardar relato/KM e até 12 fotos por atendimento, selecionar cliente/veículo e sincronizar. A retomada reutiliza a mesma OS e as mesmas reservas de fotos. |
| Funilaria e terceiros | OS → Etapas e terceiros | Modelo de seis etapas ou etapas próprias; responsável, situação, prazo e fornecedor. A etapa aparece no mapa; terceiro concluído pode gerar conta a pagar vinculada à OS. |
| Primeiros passos | Começar por aqui | Identidade da oficina, importações, catálogo e primeiro atendimento. Mostra notinhas no Básico e orçamento nos demais planos. |
| Aviso de envio incerto | Assistente e automações | Conferir no WhatsApp antes de marcar enviado, devolver para revisão ou cancelar. Nenhum reenvio cego. |

As opções avançadas ficam recolhidas para manter o atendimento curto. Os menus de mapa, orçamento, OS e clientes aparecem primeiro. Restrições de plano, vínculo com a oficina e permissões também são verificadas no servidor.

## Banco e funções

As cinco migrações `20261005000100` a `20261005000500` foram aplicadas ao projeto Supabase `hzihxtjirttetnfdujcx`. Foram publicadas `pix-os`, `webhook-pix` e `capturar-atendimento`. As duas funções usadas pelo aplicativo validam o usuário no Supabase; o webhook valida assinatura e consulta o pagamento no provedor. A validação legada de JWT do gateway fica desligada porque a autenticação é feita pelo código.

`npm run preparar:funcoes` gera arquivos únicos para o editor do Supabase em `tmp/funcoes`. Os arquivos originais permanecem em `supabase/functions`. Credenciais de recebimento e IA pertencem exclusivamente a Edge Functions → Secrets, nunca a variáveis `VITE_*`.

### Pix por oficina

Adaptador implementado para Mercado Pago Payments API; assinatura do SaaS continua separada dos recebimentos dos clientes da oficina.

1. Contratar/configurar a conta recebedora de cada oficina e obter suas credenciais pelo provedor.
2. Em Secrets, configurar `PIX_OFICINAS_JSON` com uma entrada por oficina, contendo `oficina` (UUID), `token`, `segredo_webhook`, `recebedor_id` e `ambiente` (`teste` ou `producao`). Não compartilhar conta recebedora entre empresas por padrão.
3. Configurar o webhook de pagamentos da aplicação no provedor. A criação informa `https://hzihxtjirttetnfdujcx.supabase.co/functions/v1/webhook-pix?oficina=UUID_DA_OFICINA`; os avisos devem incluir `data.id`, `x-signature` e `x-request-id`.
4. Habilitar `PIX_HABILITADO=true` somente após conferir credenciais e ambiente. Produção exige também `PIX_PRODUCAO_HABILITADA=true`.
5. Homologar com a conta do provedor antes de receber dinheiro real: geração, sinal, saldo, cancelamento, expiração, atraso de webhook e reembolso. Pagamentos reais não foram realizados nesta entrega.

Valor, moeda, recebedor, ambiente e referência são conferidos no servidor. Eventos repetidos não duplicam baixas. Divergência com pagamento manual e reembolso parcial exigem conferência; não há tentativa de corrigir dinheiro automaticamente por suposição. Cobrança cuja criação teve resultado incerto conserva a identificação para consulta e requer conciliação caso o provedor continue indisponível. Sem credenciais, a interface orienta usar o registro manual de recebimento.

### IA, voz e mensagens

A leitura assistida usa `OPENAI_API_KEY` e `OPENAI_VISION_MODEL` (ou `OPENAI_MODEL`), com modelo compatível com imagens e saída estruturada. Exige plano Completo e segue a quota existente de IA. A imagem e o relato enviados pelo usuário são processados pelo provedor para gerar somente um rascunho; não são registrados no histórico da IA, que recebe apenas a descrição genérica da execução. Custos de peças e diagnósticos não são inventados. A leitura real de fotos por IA não foi homologada com credenciais de produção.

Ditado depende do suporte e da permissão do navegador. O teclado continua disponível. Não houve captura do microfone ou da câmera nesta validação.

O atendimento autônomo de mensagens recebidas no WhatsApp continua desativado. A tela Oportunidades prepara uma conversa para revisão manual. As rotinas transacionais existentes dependem da conexão e configuração previamente estabelecidas, e o novo tratamento de envio incerto não as reativa.

## Offline e publicação

O build inclui manifest e service worker com os arquivos finais do aplicativo. A prévia de desenvolvimento (`npm run dev`) não instala o service worker. Usar `npm run build` e `npm run preview` para homologar o pacote, e HTTPS na publicação. Abrir o site online uma vez e preparar o aparelho antes de trabalhar sem rede. Clientes e veículos preparados expiram após sete dias e devem ser atualizados.

Rascunhos pertencem à conta e à oficina, ficam no IndexedDB do aparelho e sobrevivem a recargas. Fotos são reduzidas antes de guardar. Sincronização é uma ação explícita; recebimentos, aprovações e mudanças no banco exigem conexão. Ao sair da conta, os dados locais são removidos. Não limpar os dados do navegador antes de sincronizar o atendimento.

A versão web desta entrega está no projeto local; o build está em `dist`. Publicação do frontend e URL pública seguem a configuração de hospedagem existente. Links gerados em localhost não abrem no telefone do cliente fora desse computador.

## Validação

- Bancada completa: 587 verificações aprovadas, além de TypeScript, ESLint e build. Relatório em `bancada-produtividade/resultado.json`.
- Quatro cenários adicionais do pacote offline: arquivos finais existentes, navegação sem rede, ausência de cache de APIs privadas e limpeza limitada ao cache do aplicativo. O primeiro teste detectou um problema de hash no Vite/Rolldown, corrigido gerando o worker após a escrita final dos arquivos. Log em `validacao-oficina-agil/testes-pwa.log`.
- Banco: 46 cenários novos de aprovação parcial, dependências, desconto, OS, oportunidades, terceiros, importação, Pix, repetição de eventos e isolamento entre empresas.
- Conta real de validação: proposta #7, R$ 270,00 original, grupo Lubrificação aprovado por R$ 180,00, OS #7 com R$ 180,00; captura de foto local, recarga e sincronização integral em outra OS; importação de um cliente fictício por CSV; compra fictícia por XML com 2 peças a R$ 15,00, estoque e conta a pagar de R$ 30,00; oportunidade do serviço adiado com retorno combinado para 12/10; layout móvel em 390 px sem rolagem horizontal. Dados identificados com `[BANCADA 05/10]`.
- Funções publicadas recusaram requisições sem usuário (401); webhook sem integração configurada respondeu 503. A tela autenticada de Pix mostrou a orientação de configuração, sem gerar cobrança.
- Não realizados: recebimento bancário real, envio real de WhatsApp, leitura real por IA, microfone/câmera ou teste físico de perda de sinal em telefone. O comportamento de cache sem rede foi verificado com ambiente simulado; o fluxo local e a sincronização de foto foram exercitados no navegador.

Comandos: `npm run test:bancada` (inclui o teste do worker após o build), `npm run test:oficina-agil` e `node --test scripts/testar-pwa.mjs` (requer build anterior).
