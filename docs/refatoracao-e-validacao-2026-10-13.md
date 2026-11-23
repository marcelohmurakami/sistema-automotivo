# Refatoração e validação — 13/10/2026

## Escopo

Refatoração da aplicação existente, preservando as alterações funcionais anteriores
e os contratos do banco. Foram trabalhados os formulários centrais, dependências
entre módulos, cálculos de relatórios, carregamento de páginas, diálogos e ferramentas
de validação. Não houve implantação nem alteração de dados de produção nesta revisão.

## Organização do código

| Responsabilidade                                                          | Local                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Chamada comum de RPC, timeout e propagação de erros                       | `src/lib/rpc.ts`                                           |
| Formatação monetária com uma instância reutilizada de `Intl.NumberFormat` | `src/lib/formatacao.ts`                                    |
| Serialização e download de CSV                                            | `src/lib/csv.ts`                                           |
| Bloqueio de rolagem compartilhado entre diálogos                          | `src/lib/bloqueioRolagem.ts`                               |
| Leitura defensiva de preferências locais                                  | `src/lib/armazenamentoLocal.ts`                            |
| Formulário de abertura/edição da OS                                       | `src/components/ordens-servico/FormularioOS.tsx`           |
| Editor e rascunho de orçamento                                            | `src/components/orcamentos/EditorOrcamento.tsx`            |
| Formulário de contas, incluindo parcelas                                  | `src/components/financeiro/FormularioTituloFinanceiro.tsx` |
| Formulário de pagamento/recebimento                                       | `src/components/financeiro/FormularioBaixaFinanceira.tsx`  |
| Contratos dos dados de gestão                                             | `src/types/relatoriosGestao.ts`                            |
| Cálculo puro dos indicadores                                              | `src/lib/relatoriosGestao.ts`                              |

As páginas continuam responsáveis pela navegação, consultas e persistência. Os
formulários recebem dados e callbacks tipados. Os consumidores de `rpc` e `dinheiro`
agora dependem de utilitários comuns, sem importar infraestrutura do serviço de
orçamentos. Uma regra do ESLint impede a reintrodução desses imports antigos.

O TypeScript está em modo estrito. O código de `src` recebeu formatação consistente
com Prettier. Relatórios, mapa, clientes e planos usam suas rotas com carregamento
sob demanda; acessar configurações não carrega relatórios por uma reexportação.

As migrações históricas não foram reescritas. O comportamento de não repetir
automaticamente mutações RPC foi preservado.

## Falhas corrigidas

1. **Rolagem bloqueada depois de fechar janelas sobrepostas.** Cada diálogo restaurava
   uma cópia própria do estilo anterior. Fechar fora da ordem de abertura podia deixar
   `overflow: hidden` na página. Agora há um contador compartilhado, com liberação
   idempotente e restauração somente após fechar o último diálogo.
2. **Falha de abertura causada por preferências locais inválidas.** O provedor de acesso
   fazia `JSON.parse` diretamente para obter o nome demonstrativo. JSON corrompido ou
   estrutura inesperada podia interromper a interface, inclusive antes de entrar na
   conta real. A leitura agora valida o objeto e usa um nome padrão.
3. **Relatórios cortados no celular.** O conteúdo mínimo das abas expandia a coluna
   implícita do grid. A página chegava a 466 px em uma tela de 390 px. O grid agora usa
   `minmax(0, 1fr)` e a barra de abas tem rolagem própria. As cinco abas foram
   conferidas em 390 px; o financeiro também foi conferido em 320 px, sem alargar a página.

O botão X dos diálogos também declara `type="button"`, evitando submissão acidental
quando um diálogo é usado dentro de um formulário.

## Desempenho medido

| Medida local                                                  |     Antes |    Depois |
| ------------------------------------------------------------- | --------: | --------: |
| JavaScript do pacote principal, sem gzip                      | 503,54 kB | 374,44 kB |
| Cálculo dos relatórios: 3.000 OS, 3.000 itens e 9.000 eventos |    524 ms |    182 ms |

O pacote principal diminuiu aproximadamente 26%. Os relatórios passaram a indexar
OS, itens, eventos, custos e vínculos uma vez, evitando buscas completas repetidas.
O benchmark comparou **todo o resultado**, incluindo ordenação, com a implementação
anterior usando `assert.deepEqual`. Uma medição anterior nesta mesma revisão deu
530 ms e 155 ms; tempo depende da carga da máquina. Esses números não representam
latência de rede nem promessa de tempo em produção.

Evidência local: `output/refatoracao-desempenho-comparado.json` e
`output/refatoracao-build-final.log`. Bibliotecas grandes de PDF continuam separadas
em seus próprios pacotes. O build ainda informa que um import dinâmico entre os
serviços demonstrativos de orçamento e OS não cria um pacote separado, pois o módulo
também tem consumidores estáticos; isso não impediu a compilação.

## Validação automatizada

- **92 de 92 suítes aprovadas:** 24 scripts locais e 68 suítes do banco/interface.
- Banco PostgreSQL local em memória com PGlite, usando as migrações até
  `20261013000800`. A suíte `validate-product` conserva intencionalmente seu cenário
  histórico de tradução do esquema.
- TypeScript estrito, ESLint, verificação de formatação e build de produção aprovados.
- Testes de regras financeiras, parcelas e pagamentos parciais, OS e orçamento,
  estoque, compras, planos e permissões, qualidade, agenda, alertas, site/portal,
  isolamento de oficinas, documentos, rascunhos, funcionamento offline e volume.
- Novos testes cobrem ordens diferentes de fechamento de diálogos, liberações
  duplicadas, preferências inválidas, CSV com acentos/aspas/quebras de linha e
  proteção contra fórmulas, centavos/arredondamento e cálculos em volume.

Seis testes antigos divergiam do contrato atual: novos tipos de alertas, auditoria
do catálogo, recurso de relatórios de funcionários e confirmação de e-mail do portal,
desistência com cancelamento opcional da OS, especialidade da empresa e código de
conflito de revisão. Foram atualizados para conferir o comportamento vigente. As
asserções de autorização e de ocultação de valores financeiros foram preservadas.

O comando antigo `scripts/validar-banco.mjs`, usado pela bancada, agora encaminha
para a bateria completa. Antes ele executava uma lista fixa de 27 suítes com limite
de migração antigo. A nova descoberta automática inclui futuros arquivos de teste.

## Verificação no navegador

Aplicação real e rotas reais, em origem local isolada (`127.0.0.1:5177`), usando
somente dados fictícios da demonstração:

- Entrada na demonstração e carregamento de clientes, mapa, planos e relatórios.
- Nova OS com cliente cadastrado, seleção automática do único veículo, inclusão
  do serviço e observações; confirmação do total de R$ 100.
- Avanço da OS por execução, conferência e pronta. A conclusão exibiu o aviso ao
  cliente e não abriu pagamento. Nenhuma mensagem de WhatsApp foi enviada.
- Novo orçamento, fechamento/reabertura e recuperação do cliente, veículo, item e
  observações; salvamento do rascunho de R$ 100.
- Conta de R$ 100 dividida em R$ 33,34 + R$ 33,33 + R$ 33,33, com vencimentos mensais.
- Recebimento parcial de R$ 10: primeira parcela passou a R$ 23,34; relatório
  mostrou R$ 10 no caixa e R$ 90 a receber.
- Gráfico financeiro exibiu os valores ao selecionar o pico; filtro Hoje alterou
  o período; abas financeiro, oficina, produção, estoque e qualidade abriram.
- Fechamento por Escape e por X; rolagem restaurada após fechar o diálogo.
- Nenhum erro ou aviso de console capturado nesses percursos.

Capturas locais: `output/refatoracao-relatorios-desktop.png`,
`output/refatoracao-relatorios-celular.png` e `output/refatoracao-mapa-celular.png`.

## Comandos de manutenção

```powershell
npm run check         # tipos, lint, formatação, build e regressão local completa
npm test              # 92 suítes atuais; novos arquivos entram automaticamente
npm run test:unit     # scripts locais
npm run test:db       # suítes de banco/interface
npm run format
npm run format:check
```

Se o executável npm do ambiente estiver indisponível, a verificação completa
também pode ser iniciada com `node scripts/verificar-projeto.mjs`.
Os resultados individuais e o resumo JSON ficam em
`output/validacao-refatoracao-atual/`. A pasta `output` contém artefatos de teste e
não é versionada. `node scripts/testar-volume-relatorios.mjs` verifica os cálculos
em volume; a opção `--comparar` requer a cópia local anterior desta revisão.

## Limites da verificação

Testes aprovados não demonstram ausência absoluta de falhas. Esta revisão não
homologou novamente SMTP, cobrança/gateway real, WhatsApp externo, armazenamento
remoto ou restauração de backup de produção. A migração de um backup privado não
integra a bateria automática geral. Essas verificações dependem dos ambientes e
dados correspondentes.

A serialização CSV foi validada automaticamente. O navegador embutido não forneceu
o evento de download na tentativa de capturar o arquivo exportado; a recepção do
arquivo pelo navegador fica sem confirmação nesta revisão. Também não foi medida
latência de consultas no Supabase de produção.

## Revisão visual e de navegação — 13/10/2026

Após a refatoração, foram revisados os fluxos de mapa, OS, orçamento, financeiro
e relatórios. As mudanças desta etapa são locais; não foi realizado deploy.

- OS e orçamentos compartilham `FiltrosSituacao`: consultas frequentes em um
  clique, situações adicionais em um seletor e limpeza de filtros no estado vazio.
  A busca continua combinada com a situação e a paginação reinicia ao alterá-la.
- Os indicadores do mapa filtram as OS. Durante uma busca ou filtro, só aparecem
  as etapas com resultados, evitando que o serviço procurado fique numa coluna
  fora da tela. A visão completa mantém as cinco etapas. As cores têm rótulos e
  os controles indicam a seleção com `aria-pressed`.
- Cliente, veículo e valores ganharam destaque nas listas. No celular, as ações
  da OS ficam abaixo da identificação, sem comprimir o nome do cliente. A lista
  de orçamentos também se adapta à largura intermediária de 1024 px.
- Relatórios e financeiro apresentam todas as categorias no celular, sem exigir
  rolagem lateral das abas. Foram ajustados tamanhos, alinhamento e contraste
  nos temas claro e escuro, preservando botões compactos no computador.
- O cabeçalho dos diálogos acompanha a rolagem. Clique fora não fecha a edição;
  X e Esc continuam disponíveis. No toque, ações do mapa têm altura mínima de
  44 px.
- Receber/pagar mostra a conta e o saldo, com prévia do movimento líquido e do
  valor que continuará em aberto. Observações ficam recolhidas e taxas maiores
  que o recebimento são barradas pelo formulário. A gravação e as regras de
  negócio do financeiro permanecem nas funções existentes.

Validação desta etapa:

- TypeScript, ESLint, formatação dos arquivos alterados e build aprovados.
  O build mantém o aviso já existente sobre importação dinâmica e estática de
  `ordensServico.ts`; ele não impede a compilação.
- **25/25 suítes locais** aprovadas com `node scripts/testar-tudo.mjs --unidade`,
  incluindo quatro novos testes de filtros do mapa e as regressões de ordenação.
- Navegador local com dados fictícios: filtros principais/adicionais e limpeza,
  indicador do mapa, estado vazio, formulário longo, fechamento por X/Esc e
  preservação da janela ao clicar fora.
- Conferência visual em 1280, 1024, 390 e 320 px. Sem transbordamento horizontal
  da página nos percursos verificados. As categorias Estoque e Qualidade abrem
  seus painéis na largura de 320 px.
- Prévia de recebimento: saldo R$ 23,34, recebimento de R$ 10 e taxa de R$ 1
  mostram entrada de R$ 9 e saldo de R$ 13,34. Taxa de R$ 11 para recebimento de
  R$ 10 fica inválida. Nenhum pagamento real foi registrado nesta conferência.

As capturas ficam em `output/visual-*.png`. A bateria de banco documentada acima
pertence à refatoração anterior; esta revisão de interface não a executou de novo.
