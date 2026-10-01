# Relatórios, histórico, configurações e tema

## Relatórios (`/relatorios`)

- Período em dias de Brasília, com comparação automática com o intervalo anterior de igual duração. Sem base anterior, não calcula crescimento percentual.
- OS entregues, valor vendido, valor médio, prazo médio em dias corridos e pontualidade entre as entregas com previsão cadastrada.
- Orçamentos criados no período: situação atual, sem confundir data de criação com data de aprovação. Denominador de enviados exclui rascunhos e cancelados.
- Situação atual: OS ativas, atrasadas, sem previsão, paradas, prontas para retirada e orçamentos aguardando resposta.
- Sugestões determinísticas baseadas nos números: revisar custos, resolver paradas, combinar retiradas, conferir dívidas e reposição. Não utiliza IA nem inventa causas, tendências ou previsões.
- Financeiro reutiliza os cálculos do módulo financeiro; resultado continua estimado e depende do registro de despesas e custos. Consultas financeiras têm tratamento de erro independente.
- Listas de até 15 atendimentos em atenção e 10 clientes por vendas. Indicadores agregados incluem todos os registros da seleção, sem corte. Exportação CSV dos indicadores.
- Na demonstração, usa OS/estoque/financeiro do navegador. Orçamentos antigos da demonstração não possuem data de criação; seus indicadores históricos não são exibidos.

## Histórico (`/historico`)

Combina auditoria registrada pelos módulos, eventos de OS e movimentações de estoque. Busca por texto ou número da OS, datas e módulo, com páginas de 30 eventos. Descrições de auditoria traduzidas no banco; busca aceita texto sem acento. Eventos de OS abrem o atendimento correspondente. Exibe data e identificador curto do autor quando disponível. Não existe exclusão pela tela.

O histórico contém eventos efetivamente gravados, não reconstrução de operações antigas que não produziram auditoria. Em demonstração, mostra OS e estoque; a auditoria completa é consultada na conta real.

## Configurações (`/configuracoes`)

Nome, telefone e endereço da oficina persistidos no Supabase. Revisão detecta edição concorrente. Proprietário/gerente alteram dados; funcionário pode consultar. Mudanças geram auditoria. Emissões futuras de orçamento capturam os dados da oficina; propostas já emitidas preservam o snapshot.

Dados de conta exibem perfil, plano e acesso aos recursos. Esta tela não altera senhas, permissões de membros, cobrança da assinatura ou preferências de outros usuários.

## Aparência

Claro, escuro e automático nas configurações; atalho de alternância no cabeçalho. Preferência local em `patio_tema`, aplicada antes da renderização do React e compartilhada entre abas do mesmo navegador. Automático acompanha `prefers-color-scheme`. Não aplica inversão de imagens: superfícies, textos e bordas usam tokens próprios em `Tema.css`. A impressão redefine os tokens para cores claras.

## Banco e acesso

- `20260929000400_gestao_relatorios.sql`: RPCs, recurso `reports`, revisão das configurações e auditoria.
- `20260929000500_busca_historico_portugues.sql`: tradução e busca sem acentos no histórico.
- Relatórios e histórico de gestão: Intermediário/Completo, proprietário/gerente. Configurações da oficina usam o recurso `customers`, disponível nos três planos. Validações estão no servidor, além das rotas protegidas.
- Migrações aplicadas no projeto automotivo; consulta remota das três RPCs validada com papel authenticated e identidade do proprietário, encerrada com rollback. Os dados reais da empresa não foram alterados nos testes de gravação.

## Verificação

22 verificações em `supabase/tests/validate-gestao.mjs`: persistência, revisão concorrente, valores agregados, pontualidade, comparação de períodos, busca, histórico, plano, perfil e isolamento. Build e lint. Navegador: tema escuro persistente após recarga, contraste do cabeçalho/menu móvel, configurações salvas em demonstração e relatórios compatíveis com os valores da OS/financeiro demonstrativos.
