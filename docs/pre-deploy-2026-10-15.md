# Preparação do código para publicação — 15/10/2026

Esta entrega amplia a operação de assistência técnica, manutenção de campo e limpeza sobre os cadastros, agenda e fichas por especialidade existentes. Alterações locais anteriores foram preservadas. Nenhuma migração remota, configuração de provedor, publicação ou cobrança real foi executada.

## Operação dos três ramos

- Resumo do atendimento com cliente, equipamento/local, data, situação, valor e impressão acessível. Itens, equipe/horas, garantia e histórico ficam em abas próprias.
- Itens de serviço e materiais do estoque, externos ou fornecidos pelo cliente. Quantidade inteira para unidades/peças/serviços; frações para medidas como horas, litros e metros. Desconto, custos adicionais e custos de materiais separados.
- Conclusão debita materiais de forma atômica e registra o custo aplicado. Saldo insuficiente reverte a operação. Reabertura exige motivo e devolve os materiais; estorno avulso desses movimentos é bloqueado.
- Equipe com funcionários sem login, apontamento de horas e bloqueio de sobreposição. Comissões dependem do plano, incidem sobre os serviços após desconto proporcional e geram uma conta a pagar sem duplicação.
- Retornos em garantia, retrabalho e reclamações com motivo, responsável, custo, tempo, solução e nota. Dados internos não são apresentados ao cliente.
- Cobrança vinculada ao atendimento, reemissão após cancelamento e pergunta para abrir a conversa do WhatsApp após a conclusão. Nenhuma mensagem é enviada automaticamente.
- Recorrências, recursos/equipes de agenda, etapas técnicas, checklists e particularidades por subsetor permanecem integrados às fichas e aos alertas.

Os perfis de assistência cobrem celulares/tablets, informática/notebooks, eletrodomésticos e eletrônica/placas. Manutenção contempla climatização, elétrica, hidráulica/bombeamento e máquinas. Limpeza contempla residencial, comercial/condomínios, pós-obra, estofados/tapetes e vidros/fachadas, além dos perfis gerais. Os campos operacionais não constituem certificação técnica ou cumprimento automático de normas profissionais.

## Relatórios e documentos

- Datas selecionáveis, mês atual por padrão, filtros de cliente, subsetor e funcionário quando permitido.
- Faturamento, custos e margem dos atendimentos; caixa separado por data do movimento; despesas e meios de recebimento; serviços, materiais e clientes por faturamento/margem; orçamento aprovado versus valor final.
- Operação por período, atrasos, tempos médios, etapas, fila atual e próximos agendamentos.
- Qualidade por data de abertura da ocorrência, mesmo quando o serviço original pertence a outro período; custo de retorno, avaliação e prazo de solução.
- Equipe: horas, comissão, custo e retornos relacionados. O faturamento com vários integrantes usa rateio igual explícito, preservando centavos, e não é apresentado como medição individual de produção.
- Estoque: saldo, mínimo, consumo, reserva, fornecedor e tempo sem movimentação.
- Contas a receber por cliente, considerando saldo atual de todos os períodos. Seleção dos atendimentos que entram no PDF da conta; seleção vazia e mistura de clientes são rejeitadas.
- Comprovante do serviço e ficha técnica separados. Custos e observações internas não entram no documento simples nem no portal.

A margem desconta **custos registrados**. Não é lucro líquido contábil: despesas gerais são exibidas separadamente e valores não cadastrados não podem ser inferidos. Comissões históricas continuam compondo o custo agregado mesmo após mudança para um plano sem detalhamento por funcionário.

## Site e área do cliente

Site público com apresentação e exemplos próprios de cada ramo. O cliente autenticado vê somente os atendimentos explicitamente compartilhados e vinculados ao seu acesso. Pode aprovar o orçamento vigente; uma versão antiga é recusada. Revogar o acesso remove a consulta. O portal automotivo mantém seu contrato anterior.

IA e automações automotivas não são anunciadas como funcionalidades dos outros ramos. A publicação do site e o acesso real por e-mail dependem das configurações externas descritas no guia de ativação.

## Preparação de produção

- Cobrança SaaS suporta teste e produção, com ativação explícita, preços configuráveis e validação de ambiente em todo o fluxo.
- Diagnóstico local sanitizado: versão, módulo permitido, categoria/código e identificador de ocorrência; sem mensagens, pilhas, nomes, valores financeiros ou tokens. Exportação pelo usuário em Ajuda.
- Build gera `health.json`. Verificação de publicação é somente leitura.
- GitHub Actions executa a verificação local em pushes e pull requests. O manifesto de release registra hashes das migrações, lockfile, build e resultado dos testes. Nenhum workflow de deploy automático foi adicionado.

## Validação executada

`npm run check`: TypeScript estrito, ESLint, formatação, build de produção e **110/110 suítes** locais aprovadas. Banco PostgreSQL compatível via PGlite isolado, com as migrações até `20261015000500`.

As suítes abrangem financeiro, orçamentos/OS, estoque, agenda, permissões, assinaturas, webhook, portal, relatórios, PDFs e os três ramos. Os ajustes finais de integridade também passaram em execução direcionada: quantidade, funcionário duplicado, arquivamento de material em uso, estorno indevido, margem após mudança de plano e arredondamento de centavos.

Conferência no navegador com dados fictícios locais: assistência com itens/quantidade/qualidade e margem; manutenção com conclusão, aviso de WhatsApp, cobrança, ranking e download da conta; limpeza com ficha por subsetor; layout de relatórios em desktop e celular. PDFs renderizados e conferidos visualmente. Evidências em `output/pre-deploy/` e `output/pdf/`; relatório automatizado em `output/validacao-refatoracao-atual/resultado.json`.

Esses testes não comprovam latência, capacidade sob carga ou entrega de provedores reais. A homologação do ambiente publicado deve testar domínio/Auth, SMTP, Storage, cobrança, duas sessões reais e restauração do backup. Isso depende da infraestrutura externa, que ficou para depois conforme solicitado.

## Para publicar depois

1. Escolher domínio e hospedagem, configurar URLs públicas/Auth e fallback SPA.
2. Aplicar migrações pendentes na ordem e publicar as Edge Functions revisadas. As cinco novas migrações desta entrega começam em `20261015000100` e terminam em `20261015000500`; conferir também todas as migrações anteriores ainda não aplicadas.
3. Configurar SMTP, produtos/preços/chaves/webhooks do provedor de cobrança, canais opcionais de integração, suporte e documentos comerciais.
4. Habilitar backups e alertas da infraestrutura, ensaiar restauração em projeto separado e executar a homologação externa.

Procedimento detalhado: [ativação dos serviços](ativacao-servicos.md). Para reconstruir a evidência local, executar `npm ci`, `npm run check` e `node scripts/preparar-release.mjs`.
