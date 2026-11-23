# Orçamento técnico integrado

- Editor de itens compartilhado com a OS, incluindo item avulso no topo, edição, remoção/desfazer, catálogo e desconto. Orçamentos mantêm explicações, grupos, dependências, custo previsto e pacotes.
- Campo de tipo de serviço usa a especialidade da empresa; banco valida compatibilidade.
- Versões guardam detalhes do serviço, relato, diagnóstico e códigos de falha/testes. Informações aparecem na proposta e no documento do orçamento.
- Em orçamento novo, “Salvar e anexar fotos” abre as fotos do rascunho. Versões publicadas preservam os anexos e exigem nova versão para acrescentá-los.
- Conversão aprovada, inclusive liberação de OS aguardando aprovação, copia dados técnicos e referências das fotos prontas (fase Antes), preservando legenda e visibilidade. Conversões repetidas não duplicam anexos. OS possui campo próprio para códigos de falha/testes.

## Validação

- validate-orcamento-tecnico.mjs: persistência, tipo incompatível, acesso público, revisão, fotos, conversão repetida e liberação de OS pendente.
- validate-cliente-avulso.mjs com migração 015: criação/edição/aprovação/conversão sem cadastrar cliente.
- TypeScript, ESLint dos arquivos alterados, build Vite e 26 testes de documentos aprovados.
- Migração 20261008001500 aplicada no projeto hzihxtjirttetnfdujcx via SQL Editor, com retorno “Success. No rows returned”. Ajuste da função de fotos para preservar visibilidade também confirmado.
- Sessão do aplicativo estava na tela de login; não foi feita uma validação visual autenticada nem criados registros de teste na empresa real.

## Carro/motor livre e relação de peças (2026-10-09)

- Orçamento de retífica usa carro e motor livres, como a OS, sem exigir seleção ou cadastro prévio. O vínculo interno necessário é criado ao salvar, uma única vez por chave de criação; edições guardam a identificação na versão sem alterar cadastros compartilhados.
- Relação opcional de peças a trocar em orçamento e OS: texto com quantidades, referências e responsável pela compra. Lista informativa, independente dos itens faturados/estoque, incluída nos documentos do cliente.
- Lista segue a revisão e a conversão do orçamento em OS. Motor substitui placa nos documentos e na busca/listagem de orçamentos da retífica.
- validate-orcamento-motor-pecas.mjs passou para cadastro livre, repetição sem duplicar, revisão, consulta pública, conversão, edição na OS e total preservado. ESLint, TypeScript, build e testes de documentos passaram.
