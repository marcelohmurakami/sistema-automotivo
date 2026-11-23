# Revisão de manutenção — 19/10/2026

Revisão dos cinco perfis existentes: climatização, elétrica, hidráulica,
máquinas/equipamentos e manutenção residencial/predial geral. As mudanças estão
no código local. As migrações `20261019000100` e `20261019000200` foram aplicadas,
com autorização do usuário, ao Supabase conectado `hzihxtjirttetnfdujcx`.
Não foi realizado deploy da aplicação nesta revisão.

## Particularidades implementadas

| Perfil | Registros específicos da visita e intervenção |
| --- | --- |
| Climatização | Tipo de sistema, unidades interna/externa, código de erro, circuito refrigerante, condições e instrumentos das medições, referência e execução das rotinas do PMOC. |
| Elétrica | Circuito/instalação, procedimento ou ordem de trabalho, responsável pela liberação, condição da instalação, impacto do desligamento, instrumentos e resultados dos testes de proteção. |
| Hidráulica | Rede/material, áreas afetadas e danos anteriores, interrupção do abastecimento, pressão/duração/pontos do ensaio, recomposição de paredes/pisos e restabelecimento do sistema. |
| Equipamentos | Localização do ativo, regime/ciclo/carga, bloqueio e liberação, lubrificação, teste operacional e operador responsável; preservados horímetro, parada e próximo horímetro. |
| Residencial/predial | Condições anteriores do imóvel, escopo, intervenção, recomposição/acabamento, pendências e orientações ao responsável. |

Em todos os perfis, o planejamento rápido mostra natureza do serviço, ambiente,
ativo, endereço e solicitação. O endereço da visita fica registrado na OS,
separadamente do cadastro do local. Os detalhes técnicos permanecem nas seções
da ficha, sem duplicar os campos rápidos.

Os identificadores antigos, opções, etapas e checklists foram preservados. A
migração de perfis acrescenta os contratos de manutenção e mantém os demais ramos.

## Operação, resumo, aceite e documentos

- Menu agrupado em dia a dia, cadastros/compras, gestão/qualidade e minha empresa;
  rótulos de manutenção, visitas e locais/equipamentos, com permissões existentes.
- Resumo visual em três blocos: local/ativo, testes e condição de uso. Resultados
  parciais, reprovados e pendentes não aparecem como aprovação automática.
- Atalho **Aceite no local** e registro explícito de quem conferiu, data,
  resultado e ressalvas. Recusa ou aceite com ressalvas exige justificativa.
- Concluir o serviço não equivale a aprovar os testes ou obter o aceite.
  O banco impede registrar aceite antes da conclusão.
- Reabrir devolve o atendimento à execução específica do perfil, reinicia o
  aceite e a condição de uso e mantém medições e conferências anteriores no
  histórico. Corrigida também a reabertura demonstrativa quando a etapa já era
  a etapa de execução e a ficha não era atualizada.
- Histórico registra antes/depois, pessoa, data e ressalvas; valores anteriores
  têm uma linha separada para leitura.
- Comprovante do cliente inclui local, ativo, intervenção, testes/limitações,
  condição de uso, orientações e aceite. Anotações técnicas internas ficam na
  ficha técnica. Campos numéricos técnicos incluem suas unidades.
- Ajustado o espaçamento do PDF técnico para evitar uma segunda página contendo
  apenas a assinatura nos exemplos ensaiados.
- Estoque informa a baixa na conclusão e esclarece que o aceite não gera outra
  baixa. Financeiro usa linguagem de atendimentos e materiais.

## Testes executados

### Regressão automatizada

`node scripts/verificar-projeto.mjs` aprovou TypeScript, ESLint, formatação,
build de produção e **124/124 suítes**. Trata-se da bateria do projeto inteiro,
incluindo os testes novos de manutenção, não de 124 testes exclusivos deste ramo.

Os testes novos são `scripts/testar-manutencao.mjs` e
`supabase/tests/validate-manutencao.mjs`. Exercitam os cinco perfis com as funções
SQL reais em PostgreSQL local via PGlite:

- orçamento, aprovação, execução, conclusão, aceite, reabertura e nova conclusão;
- campos específicos, compatibilidade das fichas antigas e rejeição de datas inválidas;
- conflito de revisão concorrente e de agendamento;
- consumo fracionado de material, insuficiência de estoque e reversão na reabertura;
- aceite prematuro, falta de responsável/data/ressalvas e histórico antes/depois;
- cobrança idempotente, pagamento parcial, duplicidade e tentativa de exceder o saldo;
- horas, custos de garantia/retrabalho e reflexos nos relatórios;
- acesso de outra empresa negado, portal limitado ao conteúdo compartilhado e
  aprovação pelo cliente.

Exemplo transacional verificado por perfil: total R$ 322,50; material de 1,5 m;
estoque 7 → 5,5 na conclusão → 7 na reabertura → 5,5 na nova conclusão;
recebimento de R$ 100 com saldo R$ 222,50; ocorrência de R$ 35 e 30 minutos.

Depois da bateria, a checagem visual final motivou apenas um ajuste CSS no
histórico e um ajuste de texto no financeiro. Formatação e ESLint desses arquivos
foram conferidos novamente; a apresentação do histórico foi reaberta no navegador.

### Percursos no navegador

Base descartável com dados fictícios, API local na porta 5204 e aplicação na 5178.

| Perfil | Percurso preenchido pela interface |
| --- | --- |
| Climatização | Novo orçamento preventivo de split comercial, referência de PMOC e testes parciais; aprovação → execução → conclusão → aceite com ressalvas. Tentativa sem ressalvas bloqueada. |
| Elétrica | Novo orçamento residencial corretivo, circuito, procedimento e responsável; aprovação → execução → conclusão → recusa justificada do cliente. |
| Hidráulica | Orçamento existente detalhado com água quente/PPR, ensaio e recomposição; aprovação → execução → conclusão → aceite. |
| Equipamentos | Orçamento existente com horímetro, próxima manutenção, parada, impacto, lubrificação e teste; aprovação → execução → conclusão, mantendo aceite pendente. |
| Residencial/predial | Orçamento existente com danos anteriores, intervenção e acabamento; aprovação → execução → conclusão, mantendo aceite pendente. |

Após reiniciar a bancada com a migração final, foi conferida pela interface a
reabertura de uma OS de climatização aceita com ressalvas. A OS voltou a
**Limpeza e manutenção**, com condição de uso **Não avaliado**; o histórico
preservou o nome, data e ressalvas anteriores e registrou o retorno a pendente.

Foram registradas **84 visitas de páginas**, cobrindo as áreas compartilhadas
dos cinco perfis: ordens, agenda, clientes, locais/equipamentos, estoque,
financeiro, catálogo, funcionários, fornecedores, compras, relatórios, garantias,
site, equipe, planos e configurações, além do painel em quatro perfis.
Essa passagem confere carregamento, linguagem, dados e controles visíveis;
não significa executar cada combinação de ações de cada página.

As seis abas de relatórios foram conferidas em equipamentos. Exemplos visíveis:
três serviços concluídos, R$ 967,50 de receita, R$ 339 de custos, R$ 628,50 de
margem; R$ 645 a receber; estoque físico 5,5, reservado 1,5 e disponível 4.
O funcionário teve menus restritos e acesso direto a relatórios bloqueado.

No celular, painel e resumo foram inspecionados em viewport 390 × 844, sem
transbordamento horizontal da página. Dez PDFs — comprovante e ficha técnica
de cada perfil — foram gerados e renderizados. Os exemplos finais têm uma página.

## Aplicação no Supabase

Executadas, separadamente e com sucesso:

1. `20261019000100_manutencao_especializada.sql` — contratos dos cinco perfis.
2. `20261019000200_aceite_manutencao.sql` — validação, reabertura e histórico de aceite.

O conteúdo do editor foi comparado ao arquivo local antes da execução. Uma
consulta posterior confirmou os campos em todos os perfis, os dois gatilhos
ativos, a validação anterior de assistência preservada e a ausência de acesso
direto de usuários públicos às novas funções privadas.

Não foram criados atendimentos nem movimentados estoque ou financeiro de
produção para testar. A aplicação das migrações não exclui registros.

## Evidências e limites

Evidências locais em `output/revisao-manutencao/`:

- `verificacao-completa.log` e `suites.json`: bateria completa;
- `paginas.json`, `relatorios-abas.json` e arquivos por perfil: observações da interface;
- `reabertura-resumo.txt`, `reabertura-historico.txt` e imagem: reabertura final;
- `mobile-painel.png`, `mobile-resumo.png` e `pdf/`: verificação visual;
- `banco-migracao-001.txt`, `banco-migracao-002.txt`, `banco-verificado.txt/png` e
  `migracoes-sha256.json`: aplicação e conferência no Supabase.

Auth e integrações externas da bancada são simuladas. Não foram enviados
WhatsApps reais nem efetuadas cobranças externas. O serviço externo de cobrança
de assinatura retorna 503 na bancada; planos/permissões locais foram conferidos.
A aplicação registra decisões e testes do técnico; não executa ensaios físicos,
não certifica segurança da instalação e não emite automaticamente PMOC ou laudo.

## Referências usadas para detalhar os registros

- [Exemplo oficial de rotinas e registros de climatização — INSS](https://www.gov.br/inss/pt-br/centrais-de-conteudo/publicacoes/contratos-e-licitacoes/superintendencia-regional-sudeste-iii-rio-de-janeiro/sei-35663-000221-2019-87/sei35663-000221201987_00035.pdf): identificação por equipamento e referência às rotinas aplicáveis.
- [Documentação da NR-10 — Ministério do Trabalho](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-10-atualizada-2019.pdf): referência para registros de procedimento, responsável e condições de execução; não é declaração de conformidade legal do sistema.
- [Catálogos técnicos Tigre](https://www.tigre.com.br/catalogos-tecnicos/): ensaios e intervenções dependem da rede, material e instruções do fabricante; por isso pressão, duração, pontos e referência são registrados sem limites universais automáticos.
- [Monitoramento de equipamentos WEG](https://www.weg.net/institutional/BR/pt/wegmotorscan/monitoring?page=7): contexto de operação, tempo de funcionamento e condições do equipamento orientam os registros específicos.
