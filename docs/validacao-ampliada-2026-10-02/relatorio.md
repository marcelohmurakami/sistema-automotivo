# Validação ampliada — 02/10/2026

## Resultado e escopo

Foram executadas 548 verificações automatizadas aprovadas: 350 das suítes de banco, 21 de webhook, 9 de backup e 168 adicionais de volume. Também foram realizados os cenários de interface abaixo, com duas contas reais e dados fictícios no Supabase remoto. ESLint completo e build de produção (incluindo TypeScript) passaram após as correções.

Oficina remota usada: `[VALIDAÇÃO] Atendimento completo 2026-09-30 19:41:46`, ID `01f25297-5779-41b7-8acb-e0138da4c8e8`. Contas A e B já autenticadas em origens independentes. Nenhum dado da oficina principal foi modificado. Não houve transação bancária, envio de mensagem ou publicação do frontend.

### Cadastros criados pela interface nesta rodada

- 8 clientes: João, Transportadora São José & Filhos, Ana, Bruno, Carla, Daniel, Érica e Fábio; todos identificados por `[QA EXT]`.
- 4 veículos fictícios, sem placa: hatch com ruído nos freios, sedan com superaquecimento, van com vibração e SUV para funilaria.
- 3 orçamentos novos: #3, #4 e #5; o #3 também recebeu uma segunda versão.
- 3 OS novas: #2 cancelada após estorno; #3 entregue a prazo; #4 entregue e quitada.
- 1 serviço favorito, 1 fornecedor, 1 compra de estoque e 1 despesa fictícia para simular prejuízo.

Os registros foram mantidos para inspeção. Somados aos dados anteriores, a oficina tem 10 clientes, 5 orçamentos e 4 OS. Não confundir esses cadastros remotos com os 600 clientes do teste local descartável.

## Cenários executados pela interface

### Clientes

1. Salvar formulário sem nome: bloqueado pelo campo obrigatório.
2. Telefone incompleto `123`: mensagem orienta informar DDD; cadastro não gravado.
3. E-mail inválido: bloqueado pelo formulário.
4. Cliente mínimo, somente nome: salvo e listado.
5. Empresa com acentos, símbolo `&`, e-mail fictício e observações: salva como empresa.
6. Edição de nome: novo nome persistiu na lista.
7. Busca sem correspondência: estado vazio adequado.
8. Exclusão recuperável: cliente saiu da lista ativa.
9. Restauração: mesmo cliente voltou, lixeira ficou vazia.
10. Cinco novos cadastros consecutivos: sem duplicação observada, nomes corretos na lista.
11. Cinco buscas por nomes, inclusive Érica e Fábio: resultados corretos.
12. Duas contas abriram o mesmo cadastro; A salvou primeiro, B recebeu conflito. Ao reabrir, a observação de A estava preservada.

### Orçamentos

13. Tentativa de rascunho sem cliente: bloqueada.
14. Cadastro de veículo dentro do orçamento: criado e selecionado.
15. Item avulso com preço de R$85,50: centavos preservados.
16. Desconto de R$100 sobre R$85,50: envio bloqueado pelo limite do campo. A prévia ainda mostra valor negativo durante o preenchimento inválido, sem gravá-lo.
17. Desconto válido de R$5,50: total de R$80,00 persistido e conferido no detalhe.
18. Emissão de proposta: versão congelada e link gerado.
19. Proposta pública sem confirmação: botão de aprovação desabilitado.
20. Recusa com nome e confirmação: situação recusada registrada na oficina.
21. Nova versão após recusa: v1 preservada e v2 editável.
22. Revisão do preço para R$75,50: total revisado de R$70,00.
23. Link anterior após revisão: indisponível.
24. Emissão e cancelamento da v2: cancelada, versões mantidas.
25. Serviço cadastrado como favorito apareceu no início do catálogo do orçamento.
26. Dois toques na mesma peça adicionam duas linhas; remover uma linha e alterar quantidade funcionou. O comportamento atual não agrupa automaticamente linhas iguais.
27. Orçamento de frota: serviço de R$159,90 + quatro filtros de R$35 = R$299,90.
28. Troca de links na mesma aba revelou defeito: a página mantinha o token anterior. Corrigido e repetido com sucesso.
29. Após a correção, mudar do link válido para o revogado e voltar restaurou a proposta correta, com nome vazio e confirmação desmarcada.
30. Aprovação pública da frota: nome e decisão registrados; valores mantidos.
31. Conversão em OS: itens e total de R$299,90 preservados; link da OS criado.
32. Orçamento de funilaria criado em viewport 390 × 844: dois itens, observações e desconto; subtotal R$1.100, desconto R$100, total R$1.000. Rascunho visível também na outra conta.
33. Modal da proposta móvel: largura 358 px e conteúdo 358 px, sem rolagem horizontal; screenshot inspecionada.

### OS, pagamentos e cancelamento

34. OS direta de diagnóstico urgente, com responsável e relato: criada sem orçamento prévio.
35. Mão de obra fracionada: 1,5 × R$100 = R$150.
36. Pagamento de R$151 em OS de R$150: bloqueado.
37. Taxa de R$40 em recebimento de R$40: rejeitada sem baixa.
38. Sinal fictício de R$40: OS ficou parcialmente paga, R$110 em aberto.
39. Tentativa de cancelar OS com sinal: bloqueada, solicitando estorno.
40. Estorno de R$40: pago voltou a zero; histórico preservado.
41. Cancelamento após estorno, com motivo: OS encerrada como cancelada.
42. Cadastro rápido de Ana dentro da OS: o relato preenchido antes foi mantido.
43. Peça do cliente a custo de venda zero e serviço de R$120: itens aceitos.
44. Origem definida como peça trazida pelo cliente: não vinculou consumo ao estoque.
45. Itens concluídos; transições recebida → execução → conferência → pronta → entregue realizadas.
46. Checklist pendente não bloqueia entrega hoje; trata-se de conferência informativa. Não foi alterada essa regra de negócio.
47. Pagamento combinado para 09/10/2026: R$120 a receber, R$0 pagos. Nenhuma entrada de caixa foi inventada.

### Estoque, compra, financeiro e relatórios

48. OS da frota vinculada a quatro filtros com saldo de três.
49. Tentativa de entrega: bloqueada por saldo insuficiente. OS permaneceu pronta para entrega, sem baixa parcial.
50. Fornecedor fictício cadastrado pela tela própria.
51. Compra de cinco filtros a R$24: total R$120, R$20 pagos e R$100 a pagar em 09/10.
52. Estoque subiu de três para oito; custo médio ponderado passou a R$22,50: `(3 × 20 + 5 × 24) / 8`.
53. Nova tentativa de entrega após reposição: concluída.
54. Histórico mostrou uma entrada de cinco pela compra e uma saída de quatro pela OS #4; saldo final quatro. A OS com peça do cliente não gerou saída.
55. Quitação da frota por cartão de crédito: R$299,90, taxa fictícia de R$8,90, saldo a receber zerado.
56. Financeiro conciliado antes da despesa: caixa R$450, receitas R$599,90, custo de peças R$130, taxas R$9,90, resultado R$460, a receber R$120, a pagar R$100.
57. Despesa de aluguel de R$600, ainda não paga: resultado mudou para prejuízo de R$140 e contas a pagar para R$700; caixa permaneceu R$450.
58. Relatórios: três OS entregues, R$599,90 vendidos, ticket médio R$199,97, nenhuma OS em atendimento, prejuízo de R$140 e alerta para revisar custos.
59. Indicador de prazo apresentou corretamente seu denominador: uma entrega com prazo informado, uma no prazo. Não interpretado como cobertura de todas as entregas.
60. Quinze navegações repetidas entre clientes, orçamentos e financeiro e três recargas da lista: resultados carregaram sem perda de dados.

## Velocidade observada

Medição entre a ação automatizada e sua confirmação visual, sem tempo de digitação. Inclui latência da ferramenta. Frontend Vite local e Supabase remoto; navegador já autenticado. Não são medidas de renderização pura, de produção publicada, de aparelho físico ou de rede 4G. Não foi feito teste de centenas de usuários simultâneos.

| Ação | Amostras | Intervalo observado |
| --- | ---: | ---: |
| Salvar cliente, série repetida | 5 | 515–652 ms |
| Buscar cliente | 5 | 520–715 ms |
| Navegar para Clientes, tela já visitada | 5 | 499–865 ms |
| Navegar para Financeiro, tela já visitada | 5 | 498–652 ms |
| Navegar para Orçamentos, tela já visitada | 5 | 455–658 ms |
| Salvar orçamento no layout celular | 1 | 1.255 ms |
| Registrar compra com estoque e pagamento | 1 | 1.232 ms |
| Quitar OS com taxa | 1 | 1.090 ms |
| Recarregar lista de orçamentos | 3 | 2.071–3.546 ms |

As recargas mantêm sessão e cache HTTP. São mais lentas que navegar dentro do aplicativo. Amostras de ações isoladas não representam percentis confiáveis. Os tempos brutos estão em `tempos-interface.json`; ações sem medição válida foram excluídas, inclusive tentativas da automação com seletor incorreto.

## Volume em banco local isolado

Script `scripts/testar-volume-atendimentos.mjs`, sem conexão remota:

- 600 clientes, com acentos e apóstrofos, criados por funções públicas; paginação percorreu todos sem duplicação.
- 60 orçamentos com um a dez itens, quantidades fracionadas e descontos; 120 tentativas de criação resultaram em 60 registros.
- 20 propostas emitidas/aprovadas/convertidas e OS entregues; conversões repetidas mantiveram uma OS por orçamento.
- Receita das entregas reconciliada e zero entrada de caixa para entregas a prazo.
- Segunda conta sem vínculo não conseguiu ler os clientes ou abrir orçamento por ID conhecido.
- 168 verificações aprovadas. Registro completo em `volume-local.json`.

Tempos locais (10 amostras por consulta; sem rede): mediana de 5,32 ms para listar clientes, 5,57 ms para buscar o último cliente, 8,55 ms para listar orçamentos, 3,14 ms para abrir orçamento de dez itens e 16,51 ms para consultar o financeiro. Esses valores medem esse banco descartável, não a capacidade do Supabase em produção.

## Correções realizadas

1. `src/pages/PropostaPublica.tsx`: observar mudanças do fragmento da URL e remontar o conteúdo por token. Uma nova proposta não herda nome, confirmação ou estado da anterior. Regressão verificada com dois links reais da oficina de testes, na mesma aba, sem recarga.
2. `src/pages/OrdensServico.tsx`: remover invalidações duplicadas de estoque, detalhe da OS e financeiro, já cobertas por `atualizarIntegracoes`. Evita cancelar/reiniciar consultas desnecessariamente após uma operação. Entrega e quitação foram verificadas depois da alteração; não foi atribuído um ganho percentual sem comparação controlada.

## Verificação técnica e reprodução

Comandos executados com sucesso:

```powershell
node scripts/validar-banco.mjs
node supabase/tests/validate-webhook.mjs
node scripts/testar-backup.mjs
node scripts/testar-volume-atendimentos.mjs
node node_modules/eslint/bin/eslint.js .
npm.cmd run build
git diff --check
```

O teste de volume usa a instalação local do PGlite já disponível para as suítes. Pode receber `DB_VALIDATION_RUNTIME` quando o runtime estiver em outro caminho. Reexecutá-lo recria somente o banco descartável e atualiza seu relatório JSON.

Screenshots: `conflito-cliente.png`, `estoque-insuficiente.png`, `estoque-historico-final.png`, `os-frota-quitada.png`, `financeiro-conciliado.png`, `financeiro-prejuizo.png`, `orcamento-mobile-formulario.png`, `orcamento-mobile-salvo.png`, `orcamentos-testados.png` e `relatorios-conferidos.png`.

As limitações observadas de usabilidade (checklist informativo, linhas repetidas no catálogo e prévia de desconto inválido) estão descritas acima. A rodada não avaliou serviços externos sem configuração, SMTP, envio de WhatsApp, cobrança bancária ou desempenho após publicação. As correções estão no projeto local e o build foi gerado; não houve deploy.
