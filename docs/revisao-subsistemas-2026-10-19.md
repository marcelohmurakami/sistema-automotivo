# Revisão dos 26 subsistemas — 19/10/2026

## Ambiente e alcance

Revisão executada com 26 empresas fictícias e contas isoladas em uma bancada local. A interface React foi conectada a um adaptador de API local, usando PostgreSQL em PGlite com as migrações até `20261019000200`. As funções SQL, gatilhos e regras de acesso foram executados; autenticação, e-mails e integrações externas foram simulados.

Não houve mudança no banco conectado, envio de WhatsApp, movimentação financeira real ou deploy nesta revisão. As duas migrações de manutenção autorizadas anteriormente pertencem à revisão anterior.

## Problemas encontrados e corrigidos

| Problema | Correção | Conferência |
| --- | --- | --- |
| Os seis perfis de limpeza usavam estofados como exemplo de serviço | Exemplos próprios para residencial, comercial, pós-obra, estofados, vidros e limpeza geral | Teste dos 26 vocabulários e formulários pela interface |
| A busca de serviços dentro da OS sempre sugeria alinhamento | Exemplo passa a respeitar a especialidade da ficha, com a empresa como alternativa | Testes de vocabulário e fluxo dos dez perfis automotivos |
| Descrições de operação e agenda de limpeza mencionavam diagnóstico, reparo ou retirada | Textos sobre escopo, execução, conferência, equipes e recebimento | Painel e agenda de limpeza |
| Limpeza usava uma estrutura antiga de navegação; estilos de telas compartilhadas não eram aplicados corretamente | Reaproveitada a estrutura de menu agrupado, busca, cabeçalho e estilos, com nomes próprios de limpeza | Estoque, financeiro, agenda, compras, cadastro, relatórios e site; busca do menu; regras de permissões |
| Estoque e compras tratavam produtos de limpeza e materiais de manutenção como peças; o estoque de limpeza explicava retirada de reparo | Vocabulário central por ramo, inclusive cadastro, movimentos, histórico, busca, compra e importação de NF-e | Cadastro de produto, compra real na bancada e saldo integrado |
| O site de limpeza e manutenção oferecia “Solicitar uma peça” e a gestão mostrava “Pedidos de peças” | Produtos nos ramos de limpeza/manutenção; peças mantidas no automotivo/assistência | Solicitação local pelo cliente e consulta na gestão |
| Formulário público de limpeza mencionava equipamento | “Aplicação e observações” | Portal autenticado de limpeza |
| Comprovante de limpeza usava “Equipamento / local” e omitia o endereço do serviço | “Local do serviço” e “Endereço do serviço” no documento do cliente | Seis PDFs gerados, renderizados e conferidos |
| Categorias financeiras compartilhadas pressupunham peças/OS | Nomes abrangentes para serviços, produtos e materiais, preservando os identificadores e cálculos | Revisão das categorias compartilhadas e regressão financeira |

## Jornadas pela interface

Cada perfil teve sua conta aberta no navegador, formulário inspecionado e um atendimento fictício conduzido até o encerramento aplicável. Os dez perfis automotivos partiram de orçamento e chegaram à OS entregue. Nos dezesseis demais, o orçamento foi aprovado, iniciado e concluído. Na assistência, conclusão significa pronto para retirada; a retirada e a reabertura também foram exercitadas nos testes SQL.

| Família | Perfis testados |
| --- | --- |
| Automotivo — 10 | Mecânica, retífica, autoelétrica, autocenter, borracharia, estética, lava-rápido, troca de óleo, acessórios e funilaria |
| Assistência — 5 | Geral, celulares/tablets, informática/notebooks, eletrodomésticos e eletrônica/reparo de placas |
| Manutenção — 5 | Climatização, elétrica, hidráulica, equipamentos e manutenção geral |
| Limpeza — 6 | Residencial, comercial, pós-obra, estofados/tapetes, vidros/fachadas e geral |

Conferências adicionais pela interface:

- Tentativa de liberar OS com item pendente: bloqueada. Após concluir o item, o fluxo prosseguiu.
- Celulares → eletrodomésticos → celulares no novo atendimento: campos e exemplos atualizados; descrição digitada preservada.
- Reparo de R$ 150: cobrança gerada e recebimento de R$ 50 registrado; saldo restante de R$ 100 confirmado.
- Nova limpeza cadastrada do zero, com cliente, local, data e valor; detalhe aberto após salvar.
- Compra com cadastro rápido de fornecedor e seleção de produto do estoque: duas unidades a R$ 20, conta a pagar de R$ 40 e saldo de 9 para 11.
- Produto publicado no site local; cliente autorizado enviou solicitação; gestão recebeu o pedido. A solicitação não alterou o estoque.
- Cliente sem atendimento compartilhado recebeu a mensagem apropriada, sem exposição do atendimento interno.
- Telas compartilhadas conferidas em funilaria, celulares, climatização e pós-obra: estoque, clientes, financeiro, agenda, relatórios, garantias e site. Todas as abas do relatório de manutenção também foram abertas.
- Os avisos de WhatsApp e pagamento foram conferidos e dispensados nas jornadas; não houve contato externo.

## Testes automatizados

Novas suítes:

- `scripts/testar-vocabulario-subsistemas.mjs`: exemplos dos 26 perfis, separação de celulares/informática, vocabulário de estoque, navegação/permissões de limpeza e comprovantes dos seis perfis de limpeza.
- `supabase/tests/validate-jornadas-subsistemas.mjs`: jornadas transacionais dos 26 perfis.

Nos dez perfis automotivos, a suíte transacional verifica aprovação pública, conversão idempotente de orçamento em OS, preservação da especialidade, execução, conferência, conclusão, entrega, cobrança, recebimento parcial, repetição da baixa e bloqueio de pagamento acima do saldo.

Nos dezesseis outros perfis, verifica aprovação, conflito de revisão, execução, conflito de agenda, conclusão, consumo de estoque, retirada na assistência, faturamento, reabertura com reposição do estoque, nova conclusão sem duplicar cobrança, inclusão nos relatórios e recebimento parcial. Acesso por conta externa à empresa deve ser negado.

A regressão completa terminou com **126/126 suítes aprovadas**, incluindo as suítes existentes de estoque, compras, financeiro, parcelas, agendamento, contratos, assistência especializada, manutenção, garantias, permissões, portal, PDFs e relatórios. O console do navegador terminou sem erros ou avisos nas duas abas inspecionadas. O erro SQL provocado ao liberar uma OS com item pendente correspondeu ao bloqueio esperado. Logs estão na pasta de evidências abaixo.

A checagem do código final também passou em TypeScript estrito, ESLint, formatação e build. O build registra avisos de módulos importados de forma estática e dinâmica; isso limita a separação de alguns arquivos em pacotes, sem impedir a compilação. Não foi realizada uma medição de desempenho em produção nesta bancada.

## Evidências e reprodução

Pasta: `output/revisao-subsistemas-2026-10-19/`.

- `jornadas-ui.json`: 26 perfis com resultado do atendimento.
- `formularios.json`: 26 formulários inspecionados.
- `paginas-compartilhadas.json`: registros das telas visitadas, incluindo capturas intermediárias de carregamento; as conferências finais estão nas entradas posteriores.
- `troca-perfil.json`: campos após alternar a especialidade e descrição preservada.
- `criacao-limpeza-ui.txt`: novo atendimento salvo pela interface.
- `portal-limpeza.txt`: solicitação fictícia recebida no portal.
- `limpeza-estoque-corrigido.png`: tela com layout, menu e vocabulário corrigidos.
- `pdf/`: seis comprovantes, imagens renderizadas e painel de conferência.
- `verificacao-final.log`: regressão completa após correções estruturais.
- `checagem-codigo-final.log`: tipos, lint, formatação e build após os últimos ajustes de texto.

Para repetir a bancada de navegação:

```powershell
node --experimental-strip-types scripts/qa-site-local.mjs --subsistemas
$env:VITE_SUPABASE_URL='http://127.0.0.1:5205'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='qa-local-ficticia'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5179 --strictPort
```

As contas e dados são criados pelo arquivo `supabase/tests/subsistemas-fixture.mjs`. Não usar essas credenciais fictícias em ambientes publicados.

Para repetir a validação completa:

```powershell
node scripts/verificar-projeto.mjs
```

## Limites

Os testes cobrem os percursos e cenários descritos, não todas as combinações possíveis de dados, planos e dispositivos. A navegação manual foi feita em navegador desktop; não substitui uma matriz de aparelhos físicos e navegadores. SMTP, provedores financeiros, impressão em impressora física, WhatsApp e autenticação real do Supabase precisam da validação de integração no ambiente publicado. Os PDFs foram renderizados localmente. Nenhuma falha transacional permaneceu reproduzível nos cenários exercitados; isso não é uma garantia de ausência de qualquer bug.
