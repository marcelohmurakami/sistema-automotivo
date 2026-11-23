# Sistema automotivo

Sistema para oficinas, funilarias e centros automotivos, pensado para criar orçamentos e acompanhar serviços rapidamente pelo celular.

## Estado atual

- Banco implantado no Supabase com controle de acesso por oficina e plano.
- Nomes das tabelas, campos e operações públicas em português, conforme a quinta migração.
- Estrutura para clientes, veículos, catálogo, orçamentos, ordens de serviço, fotos, planos, portal e automações.
- Esboço visual implementado: cabeçalho, menu lateral, navegação no celular, rotas com Outlet, mapa da oficina, orçamentos, OS, clientes e catálogo.
- Clientes: cadastro, busca, edição, exclusão reversível e restauração conectados ao Supabase, com login e isolamento por oficina.
- Controle de planos no banco e no front, com página Meu plano e demonstração separada dos dados reais.
- Orçamentos integrados: rascunhos, versões, catálogo, PDF, compartilhamento, aprovação por link e conversão em OS.
- Ordens de serviço integradas: atendimento, diagnóstico, itens, execução, fotos antes/durante/depois, paradas, checklist, garantia e histórico.
- Estoque integrado à OS: cadastro de peças, entradas, saídas, contagem física, mínimos, extrato e estornos.
- Compras, fornecedores, financeiro, relatórios, histórico, mapa, catálogo e equipe conectados ao banco.
- Notinhas, fotos de orçamento, PDFs, identidade dos documentos, site, portal e fila de automações implementados. IA e WhatsApp dependem da configuração e validação dos serviços externos.
- Cobrança de homologação com preços de teste, mudança de plano, atraso/cancelamento e histórico. Nenhum gateway ou cobrança real está ativo.
- Recuperação de senha, aviso de falta de conexão e recuperação de erro de tela.
- [Estado da homologação](docs/homologacao.md): validações, implantação, cobrança de teste, backup e dependências restantes.
- [Orçamentos](docs/orcamentos.md): funcionamento, publicação e validação.
- [Ordens de serviço](docs/ordens-servico.md): fluxo, fotos privadas e validação.
- [Estoque](docs/estoque.md): peças, movimentações, baixa automática na entrega da OS e estornos.

- [Clientes, acesso e planos](docs/clientes-e-planos.md): configuração, permissões, contratos e testes.

## Entenda o banco

- [Dicionário completo em português](docs/database/dicionario-portugues.md): tabelas, campos e operações.
- [Modelo do produto](docs/database/product-v2.md): relacionamentos e regras de negócio.
- [Instruções do banco](supabase/README.md): migrações e testes.
- [Layout e navegação](docs/layout.md): componentes, responsividade e funcionamento do esboço.

## Executar o aplicativo

```powershell
npm install
npm run dev
```

Para verificar o código e gerar a versão de distribuição:

```powershell
npm run lint
npm run build
```

Para conferir tipos, lint, formatação, build e a bateria completa de testes locais:

```powershell
npm run check
```

`npm test` executa as suítes de regras de negócio, componentes puros e banco isolado
com as migrações atuais. `npm run test:unit` e `npm run test:db` permitem executar
essas partes separadamente. Nenhum desses comandos altera o banco de produção.
Os resultados ficam em `output/validacao-refatoracao-atual/`.

Use `npm run format` para aplicar o padrão de código e `npm run format:check` para
conferir. Veja a [refatoração e validação de 13/10/2026](docs/refatoracao-e-validacao-2026-10-13.md)
para a organização dos módulos, evidências e limites da homologação local.

O aplicativo usa React, TypeScript, React Router, Tailwind, Lucide e a fonte local Manrope. React Query gerencia as consultas reais de acesso e clientes no Supabase. A identidade visual usa o nome provisório Pátio.

## Publicação na Vercel

O `vercel.json` configura Vite, instalação com `npm ci`, compilação com
`npm run build`, saída `dist` e fallback das rotas para `index.html`. O Node
utilizado é o 22.x. O `.vercelignore` exclui credenciais, backups e evidências
locais do envio pela CLI.

Antes de publicar, configure no projeto da Vercel:

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`: URL e chave **pública**
  do Supabase. Nunca use a chave administrativa em uma variável `VITE_`.
- `VITE_URL_PUBLICA`: origem HTTPS escolhida para o sistema.
- `VITE_RELEASE_ID`: identificação da versão.
- URLs de suporte, termos e privacidade e versão dos termos, conforme
  `.env.example`, para a ativação comercial.

Configure também a origem publicada e os redirecionamentos de autenticação
no Supabase. O frontend na Vercel não publica automaticamente as migrações ou
Edge Functions do Supabase; SMTP, cobrança e integrações seguem o
[guia de ativação](docs/ativacao-servicos.md).

Para validar o código, execute `npm run check`. Essa verificação inclui o
conteúdo do pacote de produção, as referências dos assets e o cache offline.
Depois do deploy, execute
`node scripts/verificar-publicacao.mjs https://seu-dominio`
e confirme login e recuperação de senha no domínio publicado.

Referência: [Vite e rotas SPA na Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## Convenções

Use português nos textos, nomes de tabelas, campos e novas operações de negócio. Identificadores SQL usam letras sem acentos: `orcamentos`, `ordens_servico`, `oficina_id` e `criado_em`.

Não altere os arquivos de migrações já aplicadas. Mudanças no banco são novos arquivos em `supabase/migrations`. Os códigos de integração, os esquemas internos do Supabase e o conteúdo de documentos já gravados precisam manter seus contratos técnicos.

## Primeiro acesso da Oficina do Marcelo

Empresa e dados de exemplo criados em 28/09/2026. O proprietário recebeu convite por e-mail para definir a senha em `/definir-senha`. Detalhes em [acesso e carga inicial](docs/database/acesso-e-carga-inicial-2026-09-28.md).
