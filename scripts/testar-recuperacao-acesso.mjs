import assert from "node:assert/strict";
import { createServer } from "vite";
// Renderiza os componentes reais com contexto isolado, sem Auth remoto.
const server = await createServer({
  configFile: false,
  cacheDir: "output/.vite-acesso-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  },
});
try {
  const { createElement: h } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MemoryRouter, Routes, Route } = await import("react-router-dom");
  const { ContextoAcesso } = await server.ssrLoadModule("/src/auth/contexto.ts");
  const { ExigirSessao } = await server.ssrLoadModule("/src/pages/Entrar.tsx");
  const render = (extra) =>
    renderToStaticMarkup(
      h(
        ContextoAcesso.Provider,
        {
          value: {
            demo: false,
            usuario: "usuario-ficticio",
            oficina: { id: "oficina-qa", perfil: "owner" },
            carregando: false,
            erro: "",
            atualizar: async () => {},
            sair: async () => {},
            ...extra,
          },
        },
        h(
          MemoryRouter,
          {},
          h(
            Routes,
            {},
            h(
              Route,
              { element: h(ExigirSessao) },
              h(Route, { path: "/", element: h("p", {}, "CONTEUDO_PROTEGIDO_QA") }),
            ),
          ),
        ),
      ),
    );
  for (const erro of ["Sessão inválida", "Acesso indisponível", "Falha de conexão"]) {
    const html = render({ erro });
    assert.ok(html.includes("Tentar novamente"));
    assert.ok(html.includes("Sair e entrar novamente"));
    assert.ok(html.includes(erro));
    assert.ok(!html.includes("CONTEUDO_PROTEGIDO_QA"));
  }
  assert.ok(
    render({ carregando: true }).includes("Carregando seu ambiente de trabalho"),
  );
  assert.ok(!render({ carregando: true }).includes("oficina"));
  assert.ok(!render({ carregando: true }).includes("CONTEUDO_PROTEGIDO_QA"));
  assert.ok(render({}).includes("CONTEUDO_PROTEGIDO_QA"));
  console.log(
    "PASS recuperação disponível em erros de sessão, permissão e rede; conteúdo protegido só após validação",
  );
} finally {
  await server.close();
}
