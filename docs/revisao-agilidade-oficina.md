# Revisão de agilidade dos fluxos — 13/10/2026

## Critério usado

Prioridade para o trabalho repetido no balcão: criar orçamento, abrir OS, incluir serviços, encontrar cliente, registrar recebimento/pagamento e consultar indicadores. A revisão aplicou a redução de busca, movimentação, processamento desnecessário e retrabalho descrita pelo [Lean Enterprise Institute](https://www.lean.org/lexicon-terms/seven-wastes/), mantendo um caminho consistente para as ações frequentes.

Os números abaixo contam ações de interface em caminhos específicos, sem incluir digitação, rolagem ou a confirmação final de pagamento. Não são uma medição de tempo de atendimento nem uma promessa de ganho percentual.

## Mudanças implementadas

| Operação | Antes | Agora |
| --- | --- | --- |
| Iniciar OS de outra área, no desktop | Entrar em OS + Nova OS: 2 cliques | Nova OS no cabeçalho: 1 clique |
| Incluir item do catálogo com preço definido | Selecionar + confirmar item: 2 cliques | Incluir diretamente: 1 clique |
| Escolher veículo de cliente com somente um veículo vinculado | Abrir seleção + escolher: 2 cliques | Seleção automática: 0 cliques adicionais |
| Abrir recebimento/pagamento pela lista de contas | Abrir detalhes + Receber/Pagar: 2 cliques | Receber/Pagar na linha: 1 clique |
| Imprimir orçamento nos detalhes | Abrir outras opções + impressão: 2 cliques | Imprimir / PDF no cabeçalho: 1 clique |
| Salvar apenas o orçamento | Dispensar a pergunta automática de criação de OS | Detalhes do orçamento abrem diretamente |

- Acesso rápido por Ctrl+K/Cmd+K ou botão do cabeçalho, com busca, setas e Enter. Abre criação de OS, orçamento, receita, despesa e consultas diretamente. As ações respeitam plano e perfil.
- Cliente pesquisável por nome, telefone ou placa vinculada; veículo por placa ou modelo. O campo exige uma opção válida, sem confundir texto digitado com cadastro selecionado.
- Cliente sem cadastro disponível por um botão. Os campos livres de carro e motor das retíficas foram preservados.
- Favoritos do catálogo visíveis antes de pesquisar. Enter inclui o único resultado; múltiplos resultados exigem uma escolha. Quantidade e preço continuam editáveis.
- Clique duplo no catálogo não duplica a inclusão. Enter repetido ou sem busca não envia o formulário da OS.
- Ações de salvar permanecem acessíveis durante a rolagem dos editores de OS e orçamento.
- Orçamento salvo tem uma ação explícita para abrir OS aguardando aprovação; esta ação não autoriza os serviços.
- Contas têm filtros A receber, A pagar, Atrasados e Todos em aberto.
- Relatórios têm acesso direto por aba e períodos Hoje, Últimos 30 dias, Este mês e Mês anterior, além do período livre. O mês corrente continua sendo o padrão.
- Navegação direta para o ranking de clientes devendo; corrigido o destino do atalho Evolução.
- Buscas das listas de OS, orçamentos e contas aguardam 200 ms de pausa na digitação antes da consulta, reduzindo consultas intermediárias.

## Regras preservadas

Pagamento continua exigindo conferência e confirmação do valor, data, conta e forma. Recebimentos parciais mantêm o saldo. Recorrências variáveis sem valor confirmado não recebem baixa pelo novo atalho. Comissões direcionam para seu fluxo próprio. Cancelados e transferências não oferecem a baixa direta.

O veículo só é sugerido automaticamente quando há exatamente um vínculo válido; não é escolhido por aproximação. Item sem preço definido abre o editor. Limites, campos obrigatórios, edição, remoção e desfazer continuam disponíveis.

## Validação realizada

Ambiente local demonstrativo isolado, com dados fictícios e sem gravação no banco de produção.

- Testes automatizados em `scripts/testar-agilidade.mjs`: permissões de atalhos, busca com acentos/sinônimos/múltiplas palavras e seleção de veículo único, múltiplo, ausente ou com vínculo duplicado.
- Criação completa de OS com cliente cadastrado e veículo automático.
- Criação completa de OS de retífica com cliente sem cadastro, carro e motor livres.
- Orçamento salvo sem pergunta intermediária; impressão acessível; conversão para OS permanece aguardando aprovação com início bloqueado.
- Criação de conta de R$ 300, recebimento parcial de R$ 120 e saldo de R$ 180.
- Abertura de nova OS repetida na mesma página, abertura de receita e acesso direto à aba de contas e ao relatório financeiro.
- Validação de cliente não selecionado e preço obrigatório em item avulso.
- Clique duplo adiciona somente um item; inclusão por Enter não envia a OS; remoção e desfazer restauram o item.
- Perfil de funcionário sem ações financeiras no acesso rápido.
- Layout e recebimento em largura de 390 px, sem transbordamento horizontal da página; navegação por teclado e tema escuro.
- TypeScript, ESLint dos arquivos alterados e build de produção.

Para medir o ganho em tempo real, observar atendimentos equivalentes durante um turno e registrar tempo total, retornos para correção e campos que ainda causam dúvida. Os resultados deste documento se limitam às etapas eliminadas e aos cenários testados.
