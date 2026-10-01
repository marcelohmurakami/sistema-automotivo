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

O aplicativo usa React, TypeScript, React Router, Tailwind, Lucide e a fonte local Manrope. React Query gerencia as consultas reais de acesso e clientes no Supabase. A identidade visual usa o nome provisório Pátio.

## Convenções

Use português nos textos, nomes de tabelas, campos e novas operações de negócio. Identificadores SQL usam letras sem acentos: `orcamentos`, `ordens_servico`, `oficina_id` e `criado_em`.

Não altere os arquivos de migrações já aplicadas. Mudanças no banco são novos arquivos em `supabase/migrations`. Os códigos de integração, os esquemas internos do Supabase e o conteúdo de documentos já gravados precisam manter seus contratos técnicos.

## Primeiro acesso da Oficina do Marcelo

Empresa e dados de exemplo criados em 28/09/2026. O proprietário recebeu convite por e-mail para definir a senha em `/definir-senha`. Detalhes em [acesso e carga inicial](docs/database/acesso-e-carga-inicial-2026-09-28.md).
