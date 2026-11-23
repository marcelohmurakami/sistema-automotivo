import assert from "node:assert/strict";
import { createServer } from "vite";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";

const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: "output/.vite-reparos-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { RecepcaoEspecializada } = await server.ssrLoadModule(
    "/src/components/RecepcaoEspecializada.tsx",
  );
  const { EditorFichaEspecialidade } = await server.ssrLoadModule(
    "/src/components/FichaEspecialidade.tsx",
  );
  const { ResumoTecnicoReparo } = await server.ssrLoadModule(
    "/src/components/ResumoTecnicoReparo.tsx",
  );
  const render = (Componente, ficha) =>
    renderToStaticMarkup(h(Componente, { valor: ficha, ficha, alterar: () => {} }));
  const f = novaFichaEspecialidade("assistencia_eletrodomesticos");
  assert.match(render(RecepcaoEspecializada, f), /Tipo de eletrodoméstico/);
  assert.doesNotMatch(render(RecepcaoEspecializada, f), /Endereço e acesso/);
  f.campos.modalidade = "Domicílio";
  assert.match(render(RecepcaoEspecializada, f), /Endereço e acesso/);
  f.campos.familia = "Geladeira / freezer";
  assert.match(render(EditorFichaEspecialidade, f), /Temperaturas, estabilização/);
  assert.doesNotMatch(render(EditorFichaEspecialidade, f), /Entrada de água, lavagem/);
  f.campos.lavagem = "Histórico que deve permanecer";
  assert.match(render(EditorFichaEspecialidade, f), /Histórico que deve permanecer/);
  const b = novaFichaEspecialidade("assistencia_eletronica");
  assert.match(render(RecepcaoEspecializada, b), /Revisão da placa/);
  assert.doesNotMatch(
    render(EditorFichaEspecialidade, b),
    /IMEI|Lavadora|Endereço e acesso/,
  );
  b.campos = {
    resultado_teste: "Teste parcial",
    condicao_ensaio: "Somente placa / módulo",
    limitacoes_teste: "Sem equipamento original",
  };
  const resumo = render(ResumoTecnicoReparo, b);
  assert.match(resumo, /Teste parcial/);
  assert.match(resumo, /Sem equipamento original/);
  assert.doesNotMatch(resumo, /reparo-validado/);
  const recepcaoMecanica = render(
    RecepcaoEspecializada,
    novaFichaEspecialidade("mecanica"),
  );
  assert.match(recepcaoMecanica, /Entrada rápida · Oficina mecânica/);
  assert.doesNotMatch(
    recepcaoMecanica,
    /IMEI|Tipo de eletrodoméstico|Revisão da placa/,
  );
  console.log(
    "PASS componentes reais: recepção por subsetor, campos condicionais, histórico preservado e validação parcial visível.",
  );
} finally {
  await server.close();
}
