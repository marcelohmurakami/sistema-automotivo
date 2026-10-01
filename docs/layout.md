# Esboço visual do sistema automotivo

Pátio é o nome provisório usado na proposta visual. Paleta clara, grafite e verde-lima; tipografia Manrope hospedada junto ao aplicativo, ícones Lucide e estilos com Tailwind CSS e variáveis CSS.

## Estrutura

- `src/App.tsx`: rotas do React Router.
- `src/layouts/LayoutSistema.tsx`: cabeçalho, menu lateral, navegação de celular e `Outlet` para as páginas.
- `src/layouts/contexto.ts`: estado compartilhado do protótipo via contexto do Outlet.
- `src/pages/MapaOficina.tsx`: mapa por etapa, lista, indicadores, busca e filtros.
- `src/pages/Paginas.tsx`: orçamentos, OS, clientes, catálogo, configurações e página não encontrada.
- `src/components/Dialogo.tsx`: janela com foco controlado pelo elemento nativo dialog, fechamento por Escape e bloqueio do fundo.
- `src/components/NovoOrcamento.tsx`: formulário demonstrativo com cliente, placa, itens e total.
- `src/data/demonstracao.ts`: dados fictícios tipados.
- `src/index.css`: fonte, Tailwind e configurações globais.
- `src/App.css`: aparência dos componentes e adaptações de tamanho.

## Comportamentos disponíveis

- Navegação real entre páginas, mantendo cabeçalho e menu.
- Busca por placa, veículo ou cliente; filtros por prazo e responsável.
- Alternância entre quadro e lista, com filtro por etapa no celular.
- Detalhes de OS e avanço de etapa apenas na demonstração.
- Criação de rascunho de orçamento, soma dos itens e exibição na lista.
- Alteração do nome da oficina na sessão do protótipo.
- Estados vazios, avisos acessíveis, menu móvel e navegação inferior.

As alterações ficam somente na memória e são descartadas ao atualizar a página. Nenhum cadastro real, mensagem ou escrita no Supabase é feito por este esboço.

## Responsividade

- Acima de 1250 px: menu lateral fixo e mapa em quatro colunas.
- De 1021 a 1250 px: menu lateral compacto e mapa em duas colunas.
- Até 1020 px: menu lateral em uma janela deslizante.
- Até 760 px: navegação inferior, filtros por etapa e tabelas em cartões.
- Até 440 px: cartões de veículos em uma coluna, com botões e áreas de toque maiores.

A navegação usa rótulos em português, foco visível, link para pular ao conteúdo e preferências de movimento reduzido. O aplicativo não depende de fonte carregada de serviços externos.

## Executar e verificar

```powershell
npm run dev
npm run build
node node_modules/eslint/bin/eslint.js src vite.config.ts
```

O React Router usa rotas de navegador. Na hospedagem futura, configure o retorno de `index.html` para URLs de páginas, para que atualizar uma rota interna funcione.

Referências de implementação: [rotas e Outlet do React Router](https://reactrouter.com/start/declarative/routing) e [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite).

## Conferência desta entrega

- Compilação de produção e verificação ESLint dos componentes aprovadas.
- Conferência visual em 1440 px e 390 px; largura mínima de 320 px sem rolagem lateral da página.
- Testados no navegador: filtro de atrasados, detalhes de OS, retomada de execução, menu móvel, navegação para o catálogo e criação de rascunho de orçamento com total calculado.
- Após recarregar a versão final, não foram observados novos erros no console. Nenhum botão visível ficou sem nome acessível.
- Os testes de tela não conectam Auth, Storage, banco ou WhatsApp.
