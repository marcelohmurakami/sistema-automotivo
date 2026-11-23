# Revisão detalhada: eletrodomésticos e eletrônica

Revisão realizada em 15 e 16/10/2026. Complementa
[a implementação dos dois perfis](eletrodomesticos-eletronica-2026-10-15.md).

## Particularidades conferidas

| Área | Eletrodomésticos | Eletrônica e reparo de placas |
| --- | --- | --- |
| Recepção | Categoria do aparelho, identificação/PNC, alimentação, bancada ou domicílio | Equipamento completo, placa avulsa ou módulo; código, revisão e equipamento de origem |
| Diagnóstico | Defeito, instalação, erro e conferências por categoria | Inspeção, falha intermitente, pontos medidos, instrumentos e intervenções anteriores |
| Execução | Serviços, peças, responsável, horas e modalidade do atendimento | Componentes, posições, rastreabilidade e reparos em placa |
| Validação | Funcionamento, resultado e limitações do teste | Condição disponível, medições, duração e limitações; teste parcial permanece parcial |
| Encerramento | Bancada segue para retirada; domicílio segue para aceite no local | Devolução com orientações e alcance do ensaio registrado |
| Documentos | Identificação, serviço, data, observações, orientações e garantia | Também placa/revisão e limitações; diagnóstico e medições internos na ficha técnica |

## Correções encontradas nesta revisão

- Editar um atendimento concluído preserva a data de conclusão e os dados antigos,
  evitando tratar a edição como uma nova conclusão.
- Reabrir um reparo retira-o da fila de retirada e restaura a etapa de reparo.
  Medições, anotações e dados do recebedor permanecem no histórico/ficha.
- Defeitos antigos registrados em `dados.solicitacao` aparecem na ficha quando
  ainda não existe um defeito específico. Uma edição ou limpeza explícita não é
  sobrescrita pelo valor antigo.
- Edições preservam campos desconhecidos/legados do atendimento e equipamento.
  Falha ao carregar os detalhes bloqueia a gravação de um formulário incompleto.
- As quantidades respeitam a unidade: peças/unidades inteiras; horas e outras
  unidades fracionárias mantêm sua precisão. Os botões respeitam mínimo e máximo.
- A atualização de um atendimento invalida também as consultas de estoque usadas
  na seleção de peças e no histórico.
- O plano básico não oferece ações de atendimento que não pode usar. A abertura
  direta de uma URL também passa pela proteção do recurso.
- Falhas na consulta de funcionários e do serviço externo de cobrança têm
  tratamento e opção de tentar novamente, sem derrubar a tela inteira.
- No financeiro dos ramos de serviços, o saldo das contas registradas deixa de ser
  apresentado como lucro completo. A rentabilidade do atendimento tem relatório
  próprio, sujeito à permissão do plano.
- Comprovantes preservam observações para o cliente, serviços realizados,
  orientações e identidade da empresa. Orientações idênticas não são duplicadas.
  Testes parciais e limitações ficam explícitos; anotações internas não entram no
  comprovante do cliente. Datas técnicas e de garantia usam dia/mês/ano.
- Ajustes de largura mínima dos formulários evitam forçar uma coluna de 280 px
  dentro de contêineres menores. A paginação dos PDFs foi conferida visualmente.

## Verificação no navegador

Foram percorridas 15 rotas compartilhadas em cada perfil: equipamentos, agenda,
clientes, estoque, financeiro, serviços, funcionários, fornecedores, compras,
relatórios, garantias, site, equipe, planos e configurações. Esta passagem verifica
carregamento, textos e controles visíveis; não significa que cada ação de cada
modal dessas 30 visitas tenha sido executada.

Fluxos preenchidos e executados com dados fictícios no ambiente local:

- Eletrodomésticos: aprovação de orçamento, início do reparo, quantidade de item,
  registro de horas, conclusão, pergunta de aviso ao cliente, retirada, garantia,
  edição de atendimento concluído e reabertura.
- Eletrônica: criação com placa avulsa, código/revisão, medição, duração do ensaio,
  resultado parcial e limitação. Resumo conferido após salvar.
- Compras: cadastro de fornecedor durante a compra, seleção de componente do
  estoque, entrada de duas unidades e registro do pagamento a prazo. O saldo
  subiu de 8 para 10; não foi registrado pagamento imediato.
- Portal: cliente autenticado aprovou o orçamento compartilhado em cada perfil.
  Dados internos não aparecem na apresentação pública do atendimento.
- Permissões: acesso básico não libera ordens por URL; funcionário não acessa o
  financeiro nem as ações gerenciais de reabertura/qualidade.
- Layout de lista em largura móvel de 390 px, sem rolagem horizontal observada.

A primeira passagem por Planos encontrou uma falha: a resposta simulada de um
serviço externo sem implementação era aceita como válida. O componente passou a
validar a resposta, e o servidor de QA passou a informar indisponibilidade. A
conferência posterior exibiu a tela normalmente com mensagem de cobrança
indisponível. O registro inicial foi preservado, sem apagar a evidência da falha.
Uma captura inicial de Site ainda contém o estado de carregamento; a verificação
funcional do portal foi feita separadamente, após carregar e autenticar.

## Testes automatizados e documentos

O ambiente local usa as migrações SQL reais em PostgreSQL/PGlite, com usuários e
empresas fictícios. A sessão autenticada é simulada; permissões e operações são
exercitadas nas funções reais do banco.

- `scripts/testar-auditoria-reparos.mjs`: recuperação do defeito legado,
  reabertura dos cinco perfis de assistência, limites de quantidade e documentos.
- `supabase/tests/validate-auditoria-reparos.mjs`: em ambos os perfis, edição de
  concluído, entrega, reabertura, recomposição/consumo de estoque, reconclusão,
  revisão desatualizada, histórico, fatura sem duplicidade e isolamento de acesso.
- Suítes especializadas já existentes: campos condicionais, valores antigos,
  persistência dos perfis, aceite no domicílio, retirada e portal.
- Seis PDFs de QA: comprovante, ficha técnica e conteúdo extenso de cada perfil.
  Conferência visual das páginas renderizadas do comprovante de eletrodomésticos,
  da ficha de eletrônica e das três páginas do comprovante extenso de eletrônica.
  Também foram verificadas automaticamente observações, orientações, datas,
  ausência de conteúdo interno e tolerância a imagens inválidas.

TypeScript estrito, ESLint, formatação e build aprovados. A primeira regressão
desta rodada aprovou 112/120 suítes; as oito falhas eram de resolução de módulos
CommonJS pelo Vite no ambiente restrito. A mesma suíte de componentes passou fora
dessa restrição, sem mudanças no código. A repetição integral local terminou com
**120/120 suítes aprovadas**, usando a migração `20261015000900`.

## Banco conectado

A migração `20261015000900_etapa_reabertura_reparos.sql` foi aplicada após a
autorização explícita do usuário. A consulta de verificação retornou a função
`private.etapa_reabertura_reparo()` existente e um gatilho ativo na tabela correta.
Não foram criadas ordens fictícias no banco conectado para esta bancada.

## Evidências e limites

Evidências em `output/revisao-minuciosa-reparos/`: visitas por perfil, aprovação no
portal, captura móvel, PDFs e confirmação da migração. Log final em
`output/verificacao-revisao-minuciosa-final.log`; repetição da regressão em
`output/regressao-revisao-minuciosa-final.log`; resultado das suítes em
`output/validacao-refatoracao-atual/resultado.json`.

- A navegação manual usa o aplicativo real com servidor local de QA. Não é uma
  homologação de e-mail, armazenamento, cobrança ou pagamentos externos.
- A pergunta e o link de WhatsApp foram conferidos; nenhuma mensagem foi enviada.
- O aceite no domicílio tem cobertura automatizada e inspeção anterior de campos;
  não foi repetido manualmente até o fim nesta rodada.
- A inspeção móvel cobriu a lista. O roteiro interativo completo de formulários
  móveis não foi concluído porque o controle do iframe deixou de responder.
- Revisão de código, regressão automatizada e percursos manuais têm coberturas
  diferentes. Não se afirma que todos os estados e combinações possíveis foram
  exercitados manualmente ou que o sistema está livre de qualquer bug.
