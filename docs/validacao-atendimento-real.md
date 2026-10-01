# Validação do atendimento com contas reais — 30/09/2026

**Resultado: APROVADO nas integrações reais com Supabase Auth, PostgREST e Storage.** Foram aprovadas 35 verificações e 7 cenários de concorrência, com duas contas autenticadas distintas. A execução durou aproximadamente 15 segundos.

A conferência de todas as telas com duas sessões de navegador e do uso no celular continua pendente. A aprovação deste relatório não equivale a essa validação visual nem a um teste de pagamento bancário real.

## Evidência da execução aprovada

- Relatório: [1fce9f4f-2277-42d4-ba93-701635d89934.json](validacao-real/1fce9f4f-2277-42d4-ba93-701635d89934.json).
- Projeto: `hzihxtjirttetnfdujcx`.
- Início/fim UTC: `2026-09-30T20:14:13.257Z` / `2026-09-30T20:14:28.240Z`.
- Oficina isolada: `b42d41ee-d124-449d-9b14-738fd486e851`.
- Nome: `[VALIDAÇÃO] Atendimento completo 2026-09-30 20:12:56`.
- Conta A: `qa.automotivo.a.20260930@example.com`, proprietário.
- Conta B: `qa.automotivo.b.20260930@example.com`, gerente.
- Orçamento: `6c4e39b1-081a-4952-a2bd-76dd60e7bb2e`.
- OS entregue: `ef0239cb-bd7c-4742-b6b3-11b378bc2133`.
- Título quitado: `713f469d-ac18-4e7a-a420-17f110c8b385`.

O runner autentica por senha e verifica cada identidade com getUser. O atendimento usa chave pública e JWT individual, sem service_role nem simulação de Auth. As senhas foram digitadas pelo usuário no terminal sem eco e passadas pela entrada padrão; não foram gravadas pelo iniciador. O relatório não contém senhas ou tokens.

## Fluxo aprovado

1. Dois logins, acesso à oficina e recursos do plano.
2. Cliente, veículo, produto e estoque inicial de cinco unidades.
3. Orçamento com cálculo de itens e desconto no servidor.
4. Consulta pública, rejeição de token inválido, confirmação explícita e aprovação idempotente.
5. Conversão para uma única OS preservando itens e valor aprovado.
6. Upload simultâneo de fotos sintéticas antes/depois, confirmação, download autenticado por URL assinada e comparação SHA-256. Download anônimo bloqueado.
7. Sinal parcial, saldo em aberto e caixa líquido, sem receita prematura.
8. Execução, conferência, bloqueio de liberação com itens pendentes e entrega.
9. Consumo único de estoque, vinculado à OS, apenas na entrega.
10. Quitação sem ultrapassar o saldo, histórico financeiro e autores da OS.
11. OS entregue fora do mapa, novas fotos bloqueadas e proposta original preservada.

## Concorrência real

As duas contas enviaram requisições sobrepostas em sete cenários registrados com horários no relatório:

- Criação de orçamento com a mesma chave: mesmo orçamento retornado.
- Edição do orçamento com a mesma revisão: uma aceita, outra rejeitada com PT409.
- Conversão de orçamento aprovado: mesma OS retornada.
- Edição da OS com a mesma revisão: uma aceita, outra rejeitada com PT409.
- Registro do mesmo sinal: uma única baixa financeira.
- Entrega da mesma OS: uma aceita, outra rejeitada com PT409; uma baixa de estoque.
- Quitação com chaves diferentes: uma aceita, outra rejeitada por exceder o saldo.

A rejeição esperada de uma chamada nesses cenários representa proteção funcionando, não falha do teste.

## Valores conferidos

| Informação | Resultado |
| --- | --- |
| Orçamento e recebimentos | R$ 180,00 |
| Sinal / quitação | R$ 50,00 / R$ 130,00 |
| Custo das peças | R$ 40,00 |
| Taxa de recebimento | R$ 1,00 |
| Caixa líquido | R$ 179,00 |
| Resultado do atendimento de teste | R$ 139,00 |
| Estoque inicial / consumo / final | 5 / 2 / 3 unidades |

Os pagamentos são lançamentos fictícios no financeiro, sem cobrança ou transação bancária. As fotos são PNGs sintéticos. O resultado de R$ 139 considera apenas os custos e a taxa desse cenário, não todas as despesas operacionais de uma oficina.

## Falha encontrada e correção

A primeira execução, preservada em `validacao-real/45e15fe4-6ddf-4860-91b6-7c6bb3110a54.json`, falhou na edição concorrente: uma chamada salvou e a outra recebeu `upstream request timeout` após aproximadamente 125 segundos. A oficina anterior `01f25297-5779-41b7-8acb-e0138da4c8e8` permanece como evidência.

O banco usava `40001` para conflitos de revisão de negócio. A documentação PostgREST classifica `40*` como HTTP 500: https://postgrest.org/en/latest/references/errors.html . A migração `20260930000200_conflitos_http_409.sql` troca os RAISE explícitos por `PT409`, preservando mensagens, regras e permissões. O frontend aceita ambos durante a transição.

A revisão automática inicialmente bloqueou a aplicação por afetar várias funções públicas. Após autorização explícita do usuário, a migração foi aplicada com sucesso; a consulta remota confirmou 19 funções contendo PT409. Na repetição real, o conflito do orçamento retornou PT409 em aproximadamente 226 ms, e o atendimento completo passou. Não foi comprovada isoladamente a causa interna do timeout original.

Verificações locais adicionais: 25 testes de orçamentos, 28 de OS, lint dos arquivos alterados e build TypeScript/Vite aprovados. O build emitiu aviso de tamanho de bundle.

## Repetição e dados de teste

Não repetir o runner em nenhuma das oficinas acima: ambas já contêm dados e a segunda contém uma OS entregue. Preservar os relatórios. Para uma nova execução, preparar outra oficina isolada pelo seed `supabase/seeds/validacao-atendimento-real.sql` e executar `node scripts/iniciar-validacao-real.mjs ID_DA_NOVA_OFICINA`.

As duas contas e as oficinas de teste foram mantidas; as avaliações são de sete dias. Limpeza ou revogação não foi realizada. O iniciador Node substitui o arquivo PowerShell que foi bloqueado pela política de execução do Windows, sem alterar essa política.
