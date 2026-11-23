# Mini site e área do cliente — 03/10/2026

Implementado no frontend local sobre os contratos Supabase existentes. Não exige nova migração. Não houve reativação de WhatsApp ou envio de mensagens.

## Utilização

1. Na oficina com Plano Completo, abrir **Meu site** (`/meu-site`).
2. Definir endereço, título e apresentação, habilitar publicação e área do cliente e salvar. Logo e cor vêm das Configurações da oficina.
3. Compartilhar o endereço `/oficina/<identificador>#area-cliente`. O painel permite copiar o endereço e alerta quando ele é apenas localhost.
4. O cliente cria a conta no próprio site e confirma seu e-mail. A oficina confere o cadastro e libera esse e-mail em **Acesso dos clientes**.
5. O cliente entra para ver as próprias OS, resumo compartilhado, etapas, entrada, previsão de entrega, entrega efetiva e histórico com datas. Andamento e atendimentos encerrados são separados. A busca aceita modelo, placa e número da OS.
6. A oficina atualiza a OS normalmente. O portal consulta novamente a cada 30 segundos enquanto em uso e oferece atualização manual. As mudanças de situação já geram eventos públicos; anotações internas continuam privadas.

O endereço `/previa-site` é uma demonstração explicitamente identificada, com dados fictícios fixos e sem operações reais. Não é acesso alternativo aos dados do portal. Disponível também pelo botão **Ver exemplo do mini site** em Meu site.

## Acesso e limitações

Os RPCs `consultar_site_publicado`, `consultar_meu_portal` e `consultar_meu_historico_os` já existem no Supabase. `private.has_portal_access` exige plano, site publicado, portal habilitado, usuário vinculado ao cliente, cliente ativo e acesso não revogado. As consultas não expõem observações internas ou eventos não compartilhados. O endpoint público não revela OS.

Para acesso de clientes pela internet é necessário publicar este build no domínio definitivo e validar as URLs de retorno e envio de confirmação/recuperação do Supabase Auth. Esta tarefa não publicou a nova versão na hospedagem nem validou SMTP real. A prévia local não comprova esse fluxo de e-mail.

## Verificações

- TypeScript, ESLint dos arquivos alterados e build Vite.
- 40 verificações em PGlite na suíte `validate-expansao.mjs`, incluindo cinco novas: datas do histórico, privacidade de anotação, isolamento entre contas, mini site bloqueado no Intermediário e portal bloqueado após downgrade.
- Navegador: prévia desktop e largura de 390 px, entrada pela âncora, alternância das abas, busca com resultado e sem resultado e expansão de atualizações. Sem overflow horizontal.
- Evidências: `mini-site-desktop.png` e `mini-site-mobile.png`. Conteúdo da prévia é fictício; não foi apresentado como teste autenticado de cliente real nesta tarefa.
