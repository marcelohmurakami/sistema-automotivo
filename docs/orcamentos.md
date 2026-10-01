# Orçamentos

Implementado em 28/09/2026, com a migração 7 aplicada ao projeto `hzihxtjirttetnfdujcx`.

## Uso

1. Entre na conta real e abra Orçamentos. Disponível nos planos Intermediário e Completo.
2. Selecione cliente e veículo vinculado. Cadastros rápidos estão disponíveis no editor.
3. Toque em peças e serviços do catálogo ou adicione itens avulsos. Ajuste quantidade, preço, desconto, observações e condições.
4. Salve o rascunho e confira a prévia. Emita com validade de 3, 7, 15 ou 30 dias.
5. Baixe o PDF ou compartilhe pelo menu nativo do celular. Quando indisponível, o arquivo é baixado para anexar manualmente à conversa do WhatsApp. O atalho do WhatsApp prepara a mensagem; não envia sozinho.
6. Na conta real, gere o link para o cliente consultar e aprovar ou recusar, informando nome e confirmação explícita.
7. Um orçamento aprovado pode ser convertido em OS, preservando os itens e valores aceitos. A tela de OS permite acompanhar execução, fotos, checklist, paradas e histórico; consulte `ordens-servico.md`.

Rascunhos podem ser editados. Propostas emitidas exigem nova versão: a anterior permanece no histórico e seus links são revogados. Cancelamento preserva registros e revoga links. Não há exclusão definitiva pela interface.

## Publicação e compartilhamento

Configure `VITE_URL_PUBLICA` com o domínio HTTPS do frontend publicado e gere um novo build. Configure o host para servir `index.html` também nas rotas `/proposta` e `/definir-senha`. Ajuste as URLs permitidas de autenticação no Supabase para o domínio definitivo.

Enquanto o app está em `127.0.0.1`, o link funciona apenas no próprio computador. O PDF pode ser enviado, mas a aprovação externa depende da publicação. Não há integração de envio automático pela API do WhatsApp Business, upload de fotos no orçamento ou serviço de automações nesta entrega.

O token aleatório de 256 bits segue no fragmento da URL; somente seu hash é persistido no banco. Quem recebe o link pode consultar e responder: o nome informado é uma declaração, não uma identidade verificada. Expiração, revogação, versão atual, plano e situação são conferidos no servidor. Não registre tokens em logs, analytics ou ferramentas de terceiros.

## Banco e segurança

RPCs de equipe: `listar_orcamentos`, `consultar_orcamento`, `salvar_orcamento`, `cadastrar_veiculo_orcamento`, `emitir_orcamento`, `gerar_link_orcamento`, `revisar_orcamento`, `cancelar_orcamento`. A conversão usa `converter_orcamento_em_os` já existente.

RPCs públicas: `consultar_orcamento_publico` e `responder_orcamento`. Retornam somente os dados necessários à proposta. Aprovação tem bloqueio transacional, proteção contra decisão conflitante e repetição idempotente. Operações registram auditoria e eventos na outbox para futuras automações.

Valores são calculados no servidor em centavos. Edição usa revisão para detectar concorrência. Criação usa chave idempotente. RLS e verificações de plano/oficina continuam obrigatórias mesmo quando alguém chama a API diretamente.

## Validação e ambiente

- Build e ESLint; suíte `supabase/tests/validate-orcamentos.mjs`: 25 verificações locais em PGlite, com Auth/Storage simulados.
- Navegador: criação, cálculo e emissão demonstrativos. O modo demonstração guarda dados no navegador e não simula aprovação pública real.
- PDF: documentos de uma e quatro páginas gerados pelo renderizador do aplicativo e revisados visualmente; arquivos de QA em `tmp/pdfs`.
- Migração aplicada pelo SQL Editor. Antes de usar `supabase db push`, concilie o histórico do CLI; não reaplique migrações já executadas.
- Oficina do Marcelo: Intermediário em avaliação sem cobrança até 28/10/2026 às 19:41, horário de Brasília. A verificação de validade bloqueia recursos quando o período expira; cobrança e retorno automático ao Básico ainda não estão implementados.
