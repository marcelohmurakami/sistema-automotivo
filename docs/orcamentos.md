# Orçamentos

Implementado em 28/09/2026, com a migração 7 aplicada ao projeto `hzihxtjirttetnfdujcx`.

## Uso

1. Entre na conta real e abra Orçamentos. Disponível nos planos Intermediário e Completo.
2. Selecione cliente e veículo vinculado. Cadastros rápidos estão disponíveis no editor.
3. Toque em peças e serviços do catálogo ou adicione itens avulsos. Ajuste quantidade, preço, desconto, observações e condições.
4. Clique em **Salvar orçamento**. O documento fica **Aguardando aprovação**, com validade padrão de 7 dias. O botão **Aprovar** aparece na lista e no detalhe, inclusive para rascunhos antigos. Ao escolher explicitamente **Salvar e anexar fotos**, o documento permanece editável para os anexos; depois use **Concluir orçamento** ou **Aprovar**.
5. Baixe o PDF ou compartilhe pelo menu nativo do celular. Quando indisponível, o arquivo é baixado para anexar manualmente à conversa do WhatsApp. O atalho do WhatsApp prepara a mensagem; não envia sozinho.
6. Se o cliente já autorizou, clique em **Aprovar**; o sistema registra a aprovação pela oficina e oferece a conversão em OS. Continua possível compartilhar o link para o próprio cliente consultar e aprovar ou recusar, informando nome e confirmação explícita. Salvar não aprova nem envia mensagens automaticamente.
7. Confirme **Sim, transformar em OS** para abrir a ordem criada com os itens e valores aceitos. Se preferir **Agora não**, o orçamento continua aprovado e mantém **Transformar em OS** na lista. Quando já existe uma ordem vinculada, aparece **Abrir OS**. A conversão não duplica ordens. Consulte `ordens-servico.md` para acompanhar a execução.

Rascunhos podem ser editados. Propostas emitidas exigem nova versão: a anterior permanece no histórico e seus links são revogados. Cancelamento preserva registros e revoga links. Não há exclusão definitiva pela interface.

## Publicação e compartilhamento

Configure `VITE_URL_PUBLICA` com o domínio HTTPS do frontend publicado e gere um novo build. Configure o host para servir `index.html` também nas rotas `/proposta`, `/aprovar-servico` e `/definir-senha`. Ajuste as URLs permitidas de autenticação no Supabase para o domínio definitivo.

Enquanto o app está em `127.0.0.1`, o link funciona apenas no próprio computador. O PDF pode ser enviado, mas a aprovação externa depende da publicação. Gerar ou copiar o link de aprovação não envia mensagens automaticamente.

O token aleatório de 256 bits segue no fragmento da URL; somente seu hash é persistido no banco. Quem recebe o link pode consultar e responder: o nome informado é uma declaração, não uma identidade verificada. Expiração, revogação, versão atual, plano e situação são conferidos no servidor. Não registre tokens em logs, analytics ou ferramentas de terceiros.

## Banco e segurança

RPCs de equipe: `listar_orcamentos`, `consultar_orcamento`, `salvar_orcamento`, `cadastrar_veiculo_orcamento`, `emitir_orcamento`, `gerar_link_orcamento`, `revisar_orcamento`, `cancelar_orcamento`. A conversão usa `converter_orcamento_em_os` já existente.

RPCs públicas: `consultar_orcamento_publico` e `responder_orcamento`. Retornam somente os dados necessários à proposta. Aprovação tem bloqueio transacional, proteção contra decisão conflitante e repetição idempotente. Operações registram auditoria e eventos na outbox para futuras automações.

Valores são calculados no servidor em centavos. Edição usa revisão para detectar concorrência. Criação usa chave idempotente. RLS e verificações de plano/oficina continuam obrigatórias mesmo quando alguém chama a API diretamente.

## Aprovação nos demais ramos — 26/10/2026

Assistência técnica, manutenção e limpeza passam a compartilhar a seleção por grupos já usada no automotivo. A cobertura inclui os 16 subsetores desses três ramos; o fluxo automotivo permanece disponível.

1. Abra o orçamento e selecione **Aprovação / link do cliente**. O atalho de aprovação na listagem também abre essa aba.
2. Para separar opções, abra a seção de organização dos grupos no fim da aba. Agrupe serviço e material que precisam ser autorizados juntos; indique dependências quando um grupo exigir outro. Salve a organização antes de compartilhar. Itens sem grupo ficam em **Atendimento**.
3. Escolha a validade e clique em **Gerar link de aprovação**. Copie o link e envie ao cliente pelo canal desejado. O cliente abre a proposta sem login, escolhe os grupos, confere o total, informa o nome e confirma aprovação ou recusa.
4. Se a autorização chegou por outro canal, selecione os grupos nessa mesma aba e registre quem autorizou, com confirmação explícita. Apenas quem gerencia os atendimentos pode registrar essa decisão.
5. A aprovação abre a OS com somente os itens autorizados e desconto proporcional. **Histórico** conserva todos os itens e valores da proposta original, a seleção, o nome informado, a data e a origem da decisão. A cobrança usa o total autorizado. A aprovação não baixa estoque nem registra pagamento automaticamente.
6. Uma recusa aparece como **Orçamento recusado** e preserva os itens para revisão. Revise a proposta ou gere outro link para solicitar uma nova decisão; a resposta anterior continua no histórico.

O portal autenticado também permite selecionar grupos e recusar. O link direto exige o recurso de orçamentos (plano Intermediário ou Completo), sem exigir o recurso de área do cliente. A seleção inclui dependências automaticamente; removê-las também remove os grupos dependentes. O servidor repete essa validação.

O endereço `/aprovar-servico#TOKEN` usa um segredo aleatório de 256 bits; o banco guarda somente o hash. O link expira, pode ser revogado e é substituído ao gerar outro. Alterações na revisão tornam propostas pendentes antigas indisponíveis. Respostas repetidas idênticas são idempotentes; decisões conflitantes são rejeitadas. O conteúdo público não inclui custos internos, margens, documentos pessoais, contatos privados ou anotações técnicas. O nome digitado pelo portador do link é autodeclarado, não uma assinatura digital certificada.

Migração `supabase/migrations/20261026000100_aprovacao_servicos.sql` aplicada em 26/10/2026 no projeto `hzihxtjirttetnfdujcx`, pelo SQL Editor, após autorização do usuário. Foram confirmadas 12 verificações de estrutura, funções, histórico e permissões no banco conectado. A API reconheceu as novas RPCs, rejeitou tokens inválidos e bloqueou leitura direta das duas tabelas para acesso anônimo. Evidências: `supabase-aplicada.png`, `verificacao-publicada.sql` e `api-publicada.json` em `output/aprovacao-servicos-20261026/`. Não reaplique esta migração; o projeto conectado não possui a tabela de histórico `supabase_migrations.schema_migrations`.

Frontend publicado em 26/10/2026: **https://patio-gestao-peach.vercel.app/**, projeto Vercel `patio-gestao`, build `-599532407`. Publicação estática via Vercel Drop, com os arquivos compilados, fallback das rotas da aplicação e regras de cache. Não há integração Git configurada: alterações futuras precisam de novo build e publicação nesse mesmo projeto. O endereço público dos links usa a origem atual quando `VITE_URL_PUBLICA` não está definida. Health check e rotas de entrada, recuperação e ajuda responderam no endereço HTTPS sem autenticação da Vercel; envio de e-mail de recuperação não faz parte desta verificação.

Teste real no frontend publicado e no Supabase conectado, usando somente empresas fictícias `ZZ [TESTE 20261019]`: orçamentos **374 (celulares), 375 (climatização) e 376 (limpeza residencial)**. Para cada caso, o link foi gerado na interface da empresa, a conta foi desconectada e o cliente aprovou somente **Serviço principal**, sem login. Proposta original de R$ 225,00 (três itens, desconto de R$ 25,00); OS resultante de R$ 135,00 (dois itens, desconto proporcional de R$ 15,00). O histórico da empresa preservou a proposta completa, identificou o adicional não autorizado e registrou nome, data e origem `link`. O comprovante do primeiro caso continuou disponível após recarregar, sem nova ação de aprovação. Uma conferência independente por leitura no banco confirmou os três resultados. Não foram registrados pagamentos nem enviadas mensagens a clientes. Evidências visuais e pacote publicado em `output/publicacao-vercel-20261026/`; conferência dos registros em `output/aprovacao-servicos-20261026/resultado-real-publicado.json`.

Evidências locais em `output/aprovacao-servicos-20261026/`: 48 fluxos (16 subsetores × link, portal e equipe), incluindo cobrança pelo total autorizado; casos negativos de versão, dependência, isolamento, expiração, revogação e conflito; recusa e reenvio; conferência visual dos três ramos e tela de 360 px. `banco.json` registra os resultados. Testes usam PGlite e usuários fictícios, sem alterar empresas reais. A regressão automotiva passou em 25 verificações e a do assistente em 1.129 verificações. As imagens registram os componentes reais conectados à bancada local.

## Homologação publicada nos 26 subsetores — 26/10/2026

Foram executados no navegador, sem login de cliente, 130 cenários: aprovação total, parcial, recusa, expiração e revogação em cada um dos 26 subsetores (10 automotivos, 5 de assistência, 5 de manutenção e 6 de limpeza). A conferência independente no Supabase confirmou valores, grupos, itens, preservação da proposta original e conversão em OS. Os cenários usam exclusivamente empresas fictícias `ZZ [TESTE 20261019]`.

As 338 verificações adicionais na API cobrem tentativas de aprovar e recusar 52 links bloqueados, repetição idempotente, respostas conflitantes e ausência de confirmação nos 78 casos decididos. Também foram bloqueadas quatro tentativas de aprovação após expirar/revogar o link já aberto e preenchido (mecânica e celulares). Não foram registrados pagamentos nem enviados avisos.

Corrigido o botão automotivo de aprovação que permanecia habilitado sem grupos selecionados. A interface bloqueia a seleção vazia, explica como continuar e limpa o erro anterior ao alterar os grupos. A mesma orientação foi incluída nos outros ramos; recusar continua possível com nome e confirmação. O servidor já rejeitava a aprovação vazia.

Correção publicada no mesmo projeto `patio-gestao`, em **https://patio-gestao-peach.vercel.app/**, build `-1368794868`, deployment `dpl_21w1PkrWwrqW1kks7f51Z3WXr9RR`. A publicação pelo CLI usa somente o pacote estático compilado, com instalação/build desativados no `vercel.json` desse pacote. Não use essa configuração estática na raiz do código-fonte. Os 130 links foram reabertos no novo build, com os comprovantes e bloqueios preservados. Duas aprovações parciais adicionais (mecânica #13 e celulares #457) foram salvas na interface e conferidas no banco: dois itens, R$ 135,00, originais com três itens e R$ 225,00 preservados.

Evidências em `output/links-todos-subsetores-20261026/relatorio.html`, com matriz por subsetor e capturas individuais. `navegador.json`, `resumo.json`, `intercorrencias-navegador.json`, `reconsulta-apos-publicacao.json` e `correcao-publicada-banco.json` contêm resultados sem credenciais ou tokens. Arquivos `*.local.json` são privados e não devem ser publicados. Preparação/conferência: `scripts/validar-links-publicados.mjs`; conferência pós-correção: `scripts/verificar-correcao-links-publicados.mjs`; relatório: `scripts/relatorio-links-publicados.mjs`.

## Validação e ambiente

Correção de 14/10/2026: ações principais compartilhadas entre lista e detalhe; emissão ao salvar pelo fluxo normal; aprovação de rascunhos antigos usando as RPCs existentes; preservação do documento salvo se a emissão falhar; conversão abre a OS e atualiza a listagem/mapa. Sem migração nova para esta correção.

Regressão em `scripts/testar-aprovacao-orcamento.mjs`: botões por situação/permissão, salvar e aprovar, rascunhos antigos, OS aguardando aprovação, repetição sem duplicidade, valores/quantidades e bloqueio de dados desatualizados ou propostas indisponíveis. Os testes de banco `validate-aprovacao-rapida`, `validate-cliente-avulso` e `validate-campos-orcamento` passaram com as migrações atuais. Fluxo completo também conferido no navegador com dados fictícios; evidência em `output/orcamento-aprovacao-atalhos.png`.

- Build e ESLint; suíte `supabase/tests/validate-orcamentos.mjs`: 25 verificações locais em PGlite, com Auth/Storage simulados.
- Navegador: criação, cálculo e emissão demonstrativos. O modo demonstração guarda dados no navegador e não simula aprovação pública real.
- PDF: documentos de uma e quatro páginas gerados pelo renderizador do aplicativo e revisados visualmente; arquivos de QA em `tmp/pdfs`.
- Migração aplicada pelo SQL Editor. Antes de usar `supabase db push`, concilie o histórico do CLI; não reaplique migrações já executadas.
- Oficina do Marcelo: Intermediário em avaliação sem cobrança até 28/10/2026 às 19:41, horário de Brasília. A verificação de validade bloqueia recursos quando o período expira; cobrança e retorno automático ao Básico ainda não estão implementados.
