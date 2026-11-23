import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { especialidades } from "../src/lib/especialidades.ts";
import {
  perfisAtendimento,
  novaFichaEspecialidade,
} from "../src/lib/perfisAtendimento.ts";
import { indicadoresEspecialidade } from "../src/lib/indicadoresEspecialidade.ts";
import { camposFichaComplementar } from "../src/lib/fichaComplementarOS.ts";
import { campoTecnicoVisivel } from "../src/lib/camposFicha.ts";

const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: "output/.vite-especialidades-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { EditorFichaEspecialidade, ResumoFichaEspecialidade } =
    await server.ssrLoadModule("/src/components/FichaEspecialidade.tsx");
  const { RecepcaoEspecializada } = await server.ssrLoadModule(
    "/src/components/RecepcaoEspecializada.tsx",
  );
  const registros = [];
  for (const [id, p] of Object.entries(perfisAtendimento)) {
    const ficha = novaFichaEspecialidade(id);
    const html = renderToStaticMarkup(
      h(EditorFichaEspecialidade, {
        valor: ficha,
        alterar() {},
        mostrarEtapa: especialidades[id].ramo !== "automotivo",
      }),
    );
    assert.match(html, /<details class="os-detalhes ficha-especialidade">/);
    assert.doesNotMatch(html, /required=""|checked=""|<details[^>]* open=""/);
    assert.equal((html.match(/type="checkbox"/g) || []).length, p.checklist.length);
    assert.equal(renderToStaticMarkup(h(ResumoFichaEspecialidade, { ficha })), "");
    const entrada = renderToStaticMarkup(
      h(RecepcaoEspecializada, { valor: ficha, alterar() {} }),
    );
    const detalhes = renderToStaticMarkup(
      h(EditorFichaEspecialidade, {
        valor: ficha,
        alterar() {},
        ocultarCampos: p.recepcaoRapida,
      }),
    );
    assert.doesNotMatch(entrada, /required=""/);
    for (const idCampo of p.recepcaoRapida || []) {
      const campo = p.grupos.flatMap((g) => g.campos).find((c) => c.id === idCampo);
      assert.ok(campo, `${id}: campo de recepção existe: ${idCampo}`);
      if (campoTecnicoVisivel(campo, ficha)) {
        assert.ok(entrada.includes(campo.nome), `${id}: ${campo.nome} na entrada`);
        assert.ok(
          !detalhes.includes(`-${idCampo}-rotulo`),
          `${id}: campo sem duplicação`,
        );
      }
    }
    for (const c of p.grupos.flatMap((g) => g.campos)) {
      if (campoTecnicoVisivel(c, novaFichaEspecialidade(id)))
        assert.ok(html.includes(c.nome), `${id}: ${c.nome} está acessível`);
      ficha.campos[c.id] =
        c.tipo === "data"
          ? "2026-10-14"
          : c.tipo === "numero"
            ? c.passo === 1
              ? "4"
              : "4.125"
            : c.opcoes?.[0] || "Anotação <técnica>";
    }
    for (const c of p.checklist) ficha.checklist[c] = true;
    const preenchida = renderToStaticMarkup(
      h(EditorFichaEspecialidade, { valor: ficha, alterar() {} }),
    );
    for (const c of p.grupos.flatMap((g) => g.campos))
      assert.ok(
        preenchida.includes(c.nome),
        `${id}: ${c.nome} preenchido permanece acessível`,
      );
    const resumo = renderToStaticMarkup(h(ResumoFichaEspecialidade, { ficha }));
    assert.match(resumo, /Anotação &lt;técnica&gt;/);
    assert.doesNotMatch(resumo, /<técnica>/);
    const gruposPdf = camposFichaComplementar({
      ficha_especialidade: ficha,
      checklist: {},
    });
    assert.ok(gruposPdf.some((g) => g.titulo.startsWith(especialidades[id].nome)));
    assert.ok(gruposPdf.some((g) => g.titulo.startsWith("Conferência")));
    registros.push({ id, nome: id, ficha });
  }
  let r = indicadoresEspecialidade(registros);
  assert.equal(r.semFicha, 0);
  assert.equal(r.grupos.length, Object.keys(perfisAtendimento).length);
  assert.ok(
    r.grupos.every(
      (g) =>
        g.total === 1 &&
        g.completos === 1 &&
        g.conferidos === 1 &&
        g.pendentes.length === 0,
    ),
  );
  const registroMecanica = registros.find((r) => r.id === "mecanica");
  registroMecanica.ficha.campos.testes_saida = "  ";
  registroMecanica.ficha.checklist[perfisAtendimento.mecanica.checklist[0]] = false;
  registros.push(
    { id: "legado", nome: "Sem ficha" },
    { id: "vazio", nome: "Vazio", ficha: novaFichaEspecialidade("mecanica") },
  );
  r = indicadoresEspecialidade(registros);
  const mecanica = r.grupos.find((g) => g.perfil.id === "mecanica");
  assert.equal(r.semFicha, 2);
  assert.equal(mecanica.total, 2);
  assert.equal(mecanica.completos, 0);
  assert.equal(mecanica.conferidos, 0);
  assert.equal(mecanica.pendentes[0].faltam.length, 1);
  assert.equal(indicadoresEspecialidade([]).grupos.length, 0);
  console.log(
    "PASS 26 formulários, campos acessíveis, opcionais recolhidos, resumo escapado, ficha complementar e indicadores com dados ausentes/parciais/completos",
  );
} finally {
  await server.close();
}
