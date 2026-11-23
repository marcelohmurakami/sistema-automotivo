import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('output/offline-picos-20261119');
const ler = async p => JSON.parse(await readFile(resolve(root, p), 'utf8'));
const estat = valores => {
  const a = [...valores].sort((x, y) => x - y), i = Math.floor(a.length / 2);
  return { n: a.length, mediana: a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2, p95: a[Math.ceil(a.length * .95) - 1], maximo: a.at(-1) };
};
const traces = await ler('diagnostico-percurso-final/resultados.json');
assert.equal(traces.resultados.length, 24); assert.deepEqual(traces.falhas, []);
const montagem = [];
for (const r of traces.resultados) {
  const p = await ler(`diagnostico-percurso-final/${r.perfil}-${r.fase}-${r.rodada}.cpuprofile`);
  const ids = new Set(p.nodes.filter(n => n.callFrame.functionName === 'showModal').map(n => n.id));
  const showModalMs = p.samples.reduce((s, id, i) => s + (ids.has(id) ? (p.timeDeltas[i] || 0) / 1000 : 0), 0);
  montagem.push({ perfil: r.perfil, fase: r.fase, rodada: r.rodada, showModalMs, paginaSegundos: r.segundos, editorSegundos: r.editorSegundos, etapas: r.diagnostico.etapas });
}
const experimentos = [];
for (const [nome, arquivo, descricao] of [
  ['visibilidade', 'experimento-visibilidade/resultados.json', 'Mesmo build corrigido nos dois grupos. Grupo depois recebe apenas CSS de content-visibility:auto nos cartões fora da tela. Variante descartada.'],
  ['editor-direto', 'experimento-editor-direto/medicoes/resultados.json', 'Build corrigido contra variante que carrega o editor sem Suspense. Variante descartada.'],
]) {
  const d = await ler(arquivo); assert.equal(d.resultados.length, 40); assert.deepEqual(d.falhas, []);
  const e = { nome, descricao, arquivo };
  for (const fase of ['antes', 'depois']) {
    const a = d.resultados.filter(r => r.fase === fase);
    e[fase] = { pagina: estat(a.map(r => r.segundos)), editor: estat(a.map(r => r.editorSegundos)), total: estat(a.map(r => r.segundos + r.editorSegundos)) };
  }
  experimentos.push(e);
}
const calibracao = await ler('calibracao-cpu.json');
assert.equal(calibracao.resultados.length, 6);
assert(calibracao.resultados.every(r => r.razaoAntes > 3 && r.razaoDepois > 3));
assert(calibracao.resultados.filter(r => r.modo === 'preparado').every(r => r.online === false));
const final = await ler('resumo.json');
const pioras = final.comparacoes.filter(r => r.cenario === 'preparado' && r.depois.total.mediana > r.antes.total.mediana).map(r => ({ perfil: r.perfil, mobile: r.mobile, antes: r.antes.total.mediana, depois: r.depois.total.mediana, diferenca: r.depois.total.mediana - r.antes.total.mediana }));
const resultado = {
  geradoEm: new Date().toISOString(),
  conclusao: 'A carga inicial desnecessária e os controles ocultos foram corrigidos e medidos. As 24 jornadas instrumentadas localizam trabalho nativo de layout e showModal no editor. As duas intervenções adicionais não trouxeram ganho consistente e não foram incorporadas. As oscilações restantes não foram atribuídas com segurança a uma causa única; não se afirma que todo pico foi eliminado. Traces com profiler não compõem a comparação final.',
  montagem, experimentos, piorasMedianaPercurso: pioras,
};
await writeFile(resolve(root, 'analise-residual.json'), JSON.stringify(resultado, null, 2));
console.log(JSON.stringify({ traces: montagem.length, experimentos, piorasMedianaPercurso: pioras.length }, null, 2));
