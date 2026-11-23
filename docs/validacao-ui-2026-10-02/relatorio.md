# Atendimento real pela interface — 02/10/2026

## Resultado

Fluxo concluído pelo navegador com duas contas Supabase reais, em sessões independentes (`127.0.0.1` e `localhost`). Dados, fotos, estoque e lançamentos persistidos no projeto `hzihxtjirttetnfdujcx`. Nenhuma cobrança bancária ou mensagem foi enviada.

Foi criado um atendimento novo na oficina exclusivamente de validação `01f25297-5779-41b7-8acb-e0138da4c8e8`, preservando os registros anteriores. O runner de 30/09 não foi repetido nessa oficina. A oficina principal do Marcelo não foi usada.

- Conta A: `qa.automotivo.a.20260930@example.com`, proprietário.
- Conta B: `qa.automotivo.b.20260930@example.com`, gerente.
- Cliente: `[TESTE UI 02/10] Cliente atendimento`.
- Veículo: `[TESTE UI 02/10] Veículo fictício`, sem placa real.
- Produto: `[TESTE UI 02/10] Filtro`, SKU `QA-UI-0210`.
- Orçamento #2, versão 1.
- OS #1: `880f6625-6c07-4ef0-b803-d34c897db75a`.
- Aprovação às 10:07; entrega às 10:19, horário de São Paulo.

## Conferências executadas

1. Cadastro de cliente na conta A e leitura do mesmo cadastro na conta B.
2. Cadastro de peça a R$35, custo R$20 e entrada fictícia de cinco unidades.
3. Cadastro de veículo diretamente no orçamento.
4. Orçamento com duas peças, serviço de R$120 e desconto de R$10: total R$180 calculado e preservado.
5. Upload de foto sintética no orçamento e visualização da imagem na proposta pública pelo link.
6. Aprovação com nome informado e confirmação explícita. Ambas as contas viram o orçamento aprovado.
7. Conversão concorrente: as duas sessões confirmaram a conversão e receberam o mesmo ID de OS.
8. Edição desatualizada: A salvou responsável, diagnóstico e previsão; B tentou salvar a revisão anterior e recebeu `OS alterada. Reabra antes de salvar.` O valor de A foi preservado.
9. Sinal fictício de R$50 registrado pela OS; financeiro mostrou R$50 no caixa, R$130 em aberto e R$0 de receita/resultado antes da entrega.
10. Fotos sintéticas antes/depois enviadas por contas diferentes e exibidas nas duas sessões. O arquivo de teste foi reutilizado, com legendas distintas; não são fotos de serviço real.
11. Definição da origem da peça no estoque; saldo permaneceu em cinco antes da entrega.
12. Responsável, prazo e motivo de parada apareceram no mapa. Parada foi resolvida antes da liberação.
13. Tentativa de liberar com itens pendentes foi bloqueada. Depois, itens e checklist foram concluídos.
14. Entrega concorrente: uma chamada concluiu e a outra recebeu aviso de revisão desatualizada. O estoque registrou uma única saída de duas unidades vinculada à OS.
15. Veículo entregue saiu do mapa de OS abertas.
16. Quitação de R$130 com taxa fictícia de R$1. Histórico mostra dois pagamentos e a OS ficou quitada, sem saldo a receber.
17. Histórico da OS preservou conversão, edições, fotos, parada, execução e entrega.
18. PDF da OS baixado pelo botão real. Encontrada ausência da linha de desconto; correção aplicada e novo PDF conferido por extração de texto e renderização visual. Subtotal R$190, desconto R$10, total R$180.
19. Portal: conta B vinculada ao cliente de teste viu a OS entregue e o histórico permitido. Conta A, sem vínculo de cliente, recebeu orientação para solicitar acesso. A revogação de B removeu a visualização após recarregar.
20. Portal e OS quitada conferidos em viewport de 390 × 844; histórico dos dois pagamentos aberto no layout móvel. Isso é uma conferência no navegador, não um teste em aparelho físico.

## Valores reconciliados

| Medida | Valor confirmado |
| --- | --- |
| Itens antes do desconto | R$190,00 |
| Desconto | R$10,00 |
| Total aprovado / OS / pagamentos | R$180,00 |
| Sinal / quitação | R$50,00 / R$130,00 |
| Custo das peças consumidas | R$40,00 |
| Taxa de recebimento | R$1,00 |
| Caixa líquido | R$179,00 |
| Resultado estimado deste cenário | R$139,00 |
| Estoque inicial / consumo / final | 5 / 2 / 3 |

O resultado considera apenas os custos registrados no cenário. A interface também informa que custos adicionais da oficina devem ser cadastrados; não é uma conclusão sobre o lucro de uma empresa real.

## Correções e evidências

- `src/services/pdfDocumentos.ts`: subtotal e desconto agora aparecem no PDF da OS.
- `src/services/ordensServico.ts`: campos opcionais do subtotal e desconto preservados na tipagem do retorno.
- `src/pages/OrdensServico.tsx`: removido o título transitório `Alterar para undefined?` quando a confirmação de situação se fecha após sucesso.
- TypeScript e ESLint dos arquivos alterados aprovados. Build de publicação verificado ao encerrar.
- Evidências nesta pasta: `conflito-edicao.png`, `fotos-os.png`, `financeiro-sinal.png`, `mapa-parada.png`, `estoque-baixa-unica.png`, `financeiro-final.png`, `portal-cliente.png`, `portal-mobile.png`, `os-mobile-quitada.png`.

## Encerramento e limites

O Plano Completo foi habilitado temporariamente somente na avaliação da oficina fictícia para testar o portal; foi restaurado para Intermediário, preservando a expiração original em 07/10/2026. O acesso de cliente de B foi revogado e o site fictício foi despublicado. Os dados de atendimento, fotos e pagamentos fictícios permanecem como evidência.

O portal foi validado usando uma conta que também tem perfil de gerente; o teste negativo com a conta A sem vínculo confirmou que a consulta do portal exige a concessão específica. Não foi criada uma terceira conta exclusivamente externa nem testado cadastro por SMTP, que continua sem provedor.

Não houve teste em domínio público, WhatsApp, IA, Stripe ou pagamento bancário. O atendimento foi executado no frontend local com Supabase real. A publicação das correções do frontend continua separada deste teste.
