# Bancada da oficina — 13 e 14/10/2026

Validação local com dados fictícios, banco PGlite em memória e as migrações do
projeto. Nenhum dado de produção, cobrança ou mensagem externa foi alterado.

## Correções encontradas durante a bancada

- A prévia de recebimento aceitava taxa igual ao valor recebido, enquanto o
  banco recusava a operação. O formulário agora exige taxa inferior ao valor,
  bloqueia o envio e só mostra a prévia quando os valores são válidos. Os testes
  verificam recebimentos parciais, centavos, valores inválidos e conservação dos
  saldos em mil combinações de valores.
- Uma falha ao validar o acesso deixava o usuário apenas com a opção de tentar
  novamente. A tela agora permite sair e entrar novamente, com tratamento de
  falha e prevenção de cliques duplicados. O teste renderiza o componente real
  e confirma que o conteúdo protegido continua oculto durante erro ou espera.

## Jornada integrada adicionada

`supabase/tests/validate-jornada-oficina.mjs` executa nove etapas usando as
funções públicas do banco e seus controles de acesso:

1. Compra a prazo, entrada no estoque, custo médio e repetição idempotente.
2. Orçamento com serviço, peças e desconto, aprovação pública e conversão em OS.
3. Entrada na oficina, pausa, retomada e recebimento parcial com taxa.
4. Rejeição de baixas inválidas sem alteração do caixa ou da dívida.
5. Conclusão, conferência, retirada e baixa do estoque sem duplicar a conta.
6. Saldo do cliente e seleção de OS para a conta em PDF.
7. Quitação, estorno, repetição do estorno e novo recebimento.
8. Conciliação entre caixa, receitas, custos, taxas, despesas e relatórios;
   registro de retrabalho com horas, custo e avaliação.
9. Bloqueio das consultas de outra oficina.

A bancada descobre automaticamente as suítes disponíveis. O atalho
`npm run test:bancada` também executa TypeScript, ESLint, formatação e build.
As rotinas de site e QA usam a migração mais recente por padrão.

## Conferência no navegador

Com a aplicação React e o banco local, foram percorridos os seguintes fluxos:

- OS de cliente particular, veículo cadastrado durante o atendimento, serviço
  avulso, conclusão dos itens, conferência, pronto e retirada.
- Aviso de WhatsApp sem telefone cadastrado; pagamento apresentado na retirada.
- Recebimento parcial de R$ 50 com taxa de R$ 1,50: caixa de R$ 48,50 e saldo
  de R$ 75,50 em uma OS de R$ 125,50.
- Despesa de R$ 100 dividida em R$ 33,34, R$ 33,33 e R$ 33,33; vencimentos em
  31/01, 28/02 e 31/03/2027, sem movimento no caixa antes do pagamento.
- Relatórios financeiros, oficina, estoque e qualidade; agrupamento do gráfico;
  conta do cliente, desmarcação das OS e confirmação de geração do PDF.
- Mini site, acesso de cliente autorizado, histórico compartilhado e pedido de
  peça. Um cliente sem autorização não visualiza as OS. A página autorizada não
  expõe as anotações privadas nem a OS do outro cliente.
- Portal em 390 px sem rolagem horizontal. Capturas em `output/bancada-*.png`.

O download do PDF pelo navegador não pôde ser capturado pela ferramenta de
automação; a confirmação de geração foi observada na interface. A geração do
documento e os valores têm cobertura nas suítes automatizadas.

## Ajuste pontual solicitado na busca

Somente o `padding-inline` do campo “Digite o serviço ou a peça” mudou de zero
para 14 px em `OrdensServico.css`. Os botões, a disposição e os espaçamentos
externos do editor foram preservados. Conferido no computador e em 390 px, com
14 px de preenchimento computado e sem transbordamento horizontal da página.
Captura: `output/espacamento-busca-os.png`.

## Resultado e limites

Execução final: **96/96 suítes aprovadas**, além de TypeScript, ESLint,
formatação e build. A suíte de site/portal passou em 97 verificações. A de
volume passou em 168 verificações com 600 clientes, 60 orçamentos e 20 entregas.
O cenário de relatórios com 3.000 OS, 3.000 itens e 9.000 eventos levou 167 ms
na medição local; isso não representa latência de rede nem carga em produção.
O build mantém o aviso preexistente sobre a importação simultaneamente estática
e dinâmica de `ordensServico.ts`; não impede a compilação.

O resultado consolidado da execução fica em
`output/bancada-completa/resultado.json`, com o log em `execucao.log` na mesma
pasta. Os logs de cada suíte ficam em `output/validacao-refatoracao-atual`.

Auth, SMTP, pagamentos e webhooks externos usam simulações. Esta bancada não
substitui homologação com os provedores reais, teste de carga com conexões
PostgreSQL concorrentes, validação em dispositivos físicos ou restauração de
um backup privado de produção. Não houve deploy nem migração em produção.
