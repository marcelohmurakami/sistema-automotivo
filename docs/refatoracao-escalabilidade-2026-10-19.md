# Refatoração e escalabilidade — 19/10/2026

Esta rodada sucede a [avaliação dos 26 subsistemas](avaliacao-completa-subsistemas-2026-10-19.md). O foco foi retirar o crescimento do histórico do caminho de abertura dos formulários e organizar o código compartilhado. As particularidades das especialidades e os fluxos aprovados foram preservados.

## Alterações

| Área | Resultado |
| --- | --- |
| Orçamentos e OS | Cliente, veículo e catálogo são pesquisados sob demanda, em lotes de até 30. Abrir o formulário deixa de baixar os cadastros completos. Seleções existentes são recuperadas por ID, inclusive fora das primeiras opções. |
| Catálogo de serviços | Paginação por cursor, com 24 serviços por página. Favoritos, arquivados e pesquisa são filtrados no banco. Totais são independentes da página. |
| Assistência, manutenção e limpeza | Histórico paginado por cursor; somente clientes, objetos e cobranças relacionados à página são transferidos. Indicadores consideram a operação completa e continuam respeitando o subsetor. |
| Agenda | Busca apenas o período visível, incluindo reservas que atravessam a meia-noite. Dia, semana e mês preservados. Períodos acima de 31 dias são recusados; acima de 2 mil reservas, a interface solicita reduzir o período, sem apresentar uma lista truncada como completa. |
| Visitas de limpeza | O modelo é consultado pelo ID para obter revisão e valor. A programação aguarda essa consulta, mesmo quando o modelo não aparece na página da agenda. |
| Importação de NF-e | Correspondência dos itens da nota feita no banco em uma consulta. A seleção manual pesquisa o catálogo somente quando o campo é aberto. |
| Relatórios automotivos | Histórico fechado sem relação com o período deixa de ser enviado ao navegador. Custos e ocorrências das OS relevantes são preservados. Primeira entrega por cliente e última movimentação de estoque são agregadas no banco. |
| Relatórios de serviços | A projeção dos detalhes é compartilhada entre a ficha e o relatório. As permissões do relatório são verificadas uma vez, evitando repetir verificações para cada atendimento. |
| Abas de relatórios | Financeiro, oficina e produção consultam seus dados quando a aba é usada. A exportação completa busca as abas ainda não abertas e só gera o CSV depois de todas responderem. |
| Navegador | Buscas com debounce de 200 ms, cache compartilhado e cancelamento de consultas substituídas. Cadastros e alterações invalidam os seletores relacionados, evitando opções antigas em outro formulário. Índices em memória substituem buscas repetidas por OS, cliente, equipamento e funcionário. |
| Organização | `Servicos.tsx` foi separado em página, agenda, formulário e seletores. Paginação, consultas de seleção e busca de catálogo têm módulos próprios reutilizáveis. O carregamento integral destinado ao modo offline ficou explicitamente separado dos formulários conectados. |

Correções encontradas durante a validação: contador de OS sem histórico considerava registros fora do período; consulta da agenda tinha nomes ambíguos de datas; a prévia de visitas dependia da página atual; busca de peças por código era descartada por uma segunda filtragem local apenas pela descrição. Foram corrigidas e verificadas.

## Medições

Bancada PostgreSQL/PGlite local, com registros artificiais. Cada mediana usa três repetições após aquecimento. Não inclui rede, concorrência, infraestrutura ou limites do Supabase de produção.

| Cenário | Resultado |
| --- | --- |
| 1 milhão de clientes: primeiras 30 opções | 2,07 ms; resposta de 3.375 bytes |
| 1 milhão de clientes: pesquisa pelo último cliente | 494,51 ms; um resultado, 112 bytes |
| JSON equivalente ao cadastro integral de 1 milhão | 119.000.163 bytes; calculado no banco, sem transferir todo esse conteúdo para o cliente |
| 100 mil atendimentos: primeira página | 7,67 ms; 30 registros, 16.884 bytes |
| 100 mil atendimentos: página seguinte | 4,81 ms; mesmo limite de registros |
| Indicadores de 100.001 atendimentos, mesma base e processo | 5.012,82 ms antes; 317,76 ms após permitir ao PostgreSQL incorporar o cálculo à consulta; resultados idênticos |

Resultados completos: `output/refatoracao-escala-2026-10-19/escala.json` e `resumo-otimizado.json`. O script versionado `scripts/medir-escalabilidade.mjs` permite reproduzir cargas de 1 mil a 1 milhão de clientes. É opt-in para não impor essa carga a cada teste.

## Validação

- 133 suítes locais aprovadas, com as migrações novas, incluindo jornadas dos 26 perfis, financeiro, estoque, permissões, isolamento entre empresas e portal.
- Teste adicional de consultas: pesquisa além do primeiro lote, 130 atendimentos sem perda ou repetição entre páginas, 80 serviços entre favoritos e não favoritos, total global independente da página, filtros por cliente, busca por código, correspondência de NF-e e reservas da agenda nos 16 perfis não automotivos.
- Comparação do cálculo operacional SQL/TypeScript em 192 combinações de perfil, situação e campos técnicos.
- Comparação dos relatórios antes/depois: valores financeiros não zerados, garantias de OS antigas abertas no último dia, retenção de clientes, última movimentação antiga, cinco combinações de filtros e relatório integral dos 16 perfis não automotivos.
- Interface real ligada ao banco local: criação de OS automotiva, criação e edição de ordem de celular, recuperação dos vínculos, agenda de limpeza e programação de duas visitas independentes, visões semanal e mensal.
- Exportação pela interface sem abrir previamente as abas Oficina e Produção: CSV gerado com 408 linhas, incluindo os três grupos. Arquivo preservado em `output/refatoracao-escala-2026-10-19/relatorio-exportado.csv`.
- Pacote SQL completo executado em uma transação no banco local antes da aplicação remota. A composição detectou e permitiu corrigir o terminador da última instrução.
- TypeScript, ESLint e build de produção aprovados. Os dois avisos preexistentes de importação dinâmica ineficaz não impedem o build.

Os testes de interface/localhost precisaram executar fora da restrição do sandbox: dentro dele, a resolução dos módulos do Vite e a conexão loopback falharam. A bateria final não utilizou dados nem credenciais de produção.

## Organização para manutenção

- `src/services/consultasCadastros.ts`: contrato de buscas limitadas para cadastro automotivo e catálogo.
- `src/services/painelServicos.ts`: página, resumo e seleção dos subsistemas não automotivos; implementação de demonstração separada da RPC.
- `src/lib/usePaginacaoCursor.ts`: navegação e reinício ao alterar filtros.
- `src/lib/useCatalogoBusca.ts` e `useCadastrosOrcamento.ts`: cache, cancelamento e preservação da seleção.
- `src/components/servicos/`: formulário, agenda, seleção e tipos próprios.
- `src/components/SelecaoCatalogo.tsx`: seleção de item compartilhada entre pacotes e NF-e.

Novas listagens devem filtrar pela empresa no banco, ordenar de forma determinística com ID como desempate e retornar uma página. Totais não devem ser calculados usando apenas a página visível. Busca por ID deve ser separada da busca de opções. Consultas de leitura podem receber `AbortSignal`; mutações não recebem repetição automática.

## Aplicação e limites

As migrações `20261019000600` a `20261019001100` contêm as novas consultas, índices e projeções. **As seis foram aplicadas ao Supabase conectado, após autorização explícita do usuário, em uma única transação.** A consulta posterior confirmou as 10 funções públicas envolvidas (novas ou atualizadas), os 22 índices válidos, as restrições de acesso e as versões finais dos relatórios e da agenda. Não foi publicado o frontend nesta etapa.

O pacote SQL e os hashes estão em `output/refatoracao-escala-2026-10-19/migracoes.sql` e `migracoes.json`. A verificação reproduzível está em `verificar-producao.sql`; a evidência visual e a leitura do resultado estão em `supabase-validado.png` e `supabase-validado.txt`, na mesma pasta.

Não há exclusão de registros nem conversão destrutiva. Em bases grandes, a criação dos índices deve ser programada: os arquivos transacionais usam `CREATE INDEX`, que pode bloquear escritas durante sua construção. O aplicativo antigo continua compatível com as novas funções até a publicação do aplicativo novo.

Este trabalho não demonstra capacidade de milhões de usuários simultâneos. Antes dessa escala, ainda é necessário medir concorrência, plano das consultas e recursos do banco no ambiente de implantação. Relatórios detalhados podem continuar grandes quando o próprio período contém muitos registros; o modo offline é um download integral solicitado pelo usuário e depende da capacidade do aparelho. O mapa automotivo carrega a operação ativa, não o histórico entregue. Não foram substituídos relatórios completos por totais truncados para obter números artificiais de desempenho.

Referências técnicas: [índices multicoluna do PostgreSQL](https://www.postgresql.org/docs/current/indexes-multicolumn.html) e [consultas e cancelamento no TanStack Query](https://tanstack.com/query/latest/docs/framework/react/reference/classes/Query).
