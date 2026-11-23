import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const pasta = "output/visitas-publicadas-20261109";
const lotes = await Promise.all(
  ["automotivos26", "servicos26"].map(async (n) =>
    JSON.parse(await readFile(`${pasta}/${n}.json`, "utf8")),
  ),
);
const registros = lotes.flatMap((x) => x.resultados);
const banco = JSON.parse(await readFile(`${pasta}/conferencia-banco.json`, "utf8"));
assert.equal(banco.resultados.length, 26);
assert(banco.resultados.every(x => x.visitas === 2 && x.canceladas === 2 &&
  x.logistica_correta && x.recurso_liberado &&
  JSON.stringify(x.duracoes_minutos) === "[135,105]"));
assert.equal(lotes[0].build, lotes[1].build);
assert.equal(registros.length, 26);
assert.equal(new Set(registros.map((x) => x.perfil)).size, 26);
assert(
  registros.every(
    (x) =>
      x.ok &&
      x.checks.length === 8 &&
      x.registros.length === 2 &&
      x.rejeicoes.length === 3 &&
      (!x.recurso || x.recursoInativado) &&
      x.limpeza.length === 2 &&
      x.limpeza.every((y) => y.cancelado),
  ),
);
const contas = JSON.parse(
  await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
).contas;
const nomes = new Map(contas.map((x) => [x.especialidade, x.nome]));
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const bloco = (x, indice) => {
  const lote = indice < 10 ? "automotivos26" : "servicos26";
  return `<details><summary>${esc(nomes.get(x.perfil) || x.perfil)} <span>8/8 verificações</span></summary><ul>${x.checks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><p>2 visitas criadas e editadas; 3 tentativas conflitantes recusadas; visitas canceladas ao encerrar o teste.</p><div class="imagens">${["editar-mobile", "320", "1920"].map((tipo) => `<a href="${lote}-${x.perfil}-${tipo}.png"><img loading="lazy" src="${lote}-${x.perfil}-${tipo}.png" alt="${esc(x.perfil)} — ${tipo}"><small>${tipo === "editar-mobile" ? "Edição no celular" : tipo + " px"}</small></a>`).join("")}</div><details><summary>Registros e respostas do servidor</summary><pre>${esc(JSON.stringify({ registros: x.registros, rejeicoes: x.rejeicoes, encerramento: x.limpeza }, null, 2))}</pre></details></details>`;
};
const resumo = {
  ok: true,
  site: lotes[0].url,
  build: lotes[0].build,
  data: new Date().toISOString(),
  subsistemas: 26,
  verificacoes: 208,
  visitasCriadas: 52,
  tentativasConflitantesRecusadas: 78,
  visitasCanceladas: 52,
  larguras: [320, 390, 1920],
  tipo: "Interface publicada com dados reais exclusivamente nas empresas fictícias; sem mocks de rede",
  resultados: registros,
};
await writeFile(`${pasta}/resumo.json`, JSON.stringify(resumo, null, 2));
await writeFile(
  `${pasta}/relatorio.html`,
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visitas personalizadas — validação no site publicado</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f7f5;color:#182a22;font:16px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:40px 20px}h1{font-size:clamp(26px,4vw,40px);line-height:1.2;margin:8px 0 22px}h2{font-size:24px;margin-top:36px}.tag{color:#32634a;font-weight:700}a{color:#20563c}p{max-width:920px}.numeros{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:28px 0}.numeros>div,details{background:white;border:1px solid #ccd9d0;border-radius:12px;padding:18px}.numeros strong{display:block;font-size:32px;line-height:1.3}.numeros span{font-size:14px;color:#52685b}details{margin:12px 0}summary{cursor:pointer;font-weight:700}summary>span{float:right;color:#32634a;font-size:14px}.imagens{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.imagens a{display:grid;gap:6px;align-content:start}.imagens img{width:100%;max-height:340px;object-fit:contain;object-position:top;background:#eef3ef;border:1px solid #d8e3da;border-radius:6px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#f4f7f5;padding:12px;border-radius:8px}li{margin:8px 0}.nota{padding:18px;border-left:4px solid #598b6d;background:#e9f2eb}.meta{font-size:14px;color:#52685b}@media(max-width:600px){summary>span{display:block;float:none}.imagens{grid-template-columns:1fr 1fr}.imagens a:last-child{grid-column:1/-1}}@media print{body{background:white}details{break-inside:avoid}.imagens{display:none}}</style></head><body><main><div class="tag">VERIFICAÇÃO EM PRODUÇÃO · EMPRESAS FICTÍCIAS</div><h1>Visitas com duração personalizada</h1><p>Criação e edição pela interface do <a href="${esc(resumo.site)}">site publicado</a>, conferência dos horários gravados, calendário e bloqueios de sobreposição nos 26 subsistemas.</p><p class="meta">9 de novembro de 2026 · Versão ${esc(resumo.build)} · Chrome automatizado com dimensões de desktop e celular. As requisições usaram o servidor real, sem simular respostas.</p><div class="numeros"><div><strong>26/26</strong><span>subsistemas aprovados</span></div><div><strong>208</strong><span>verificações de fluxo</span></div><div><strong>52</strong><span>visitas criadas e editadas</span></div><div><strong>78</strong><span>tentativas conflitantes recusadas</span></div></div><h2>O que foi conferido</h2><ul><li>Visita de 1h45: formulário, gravação no servidor, exibição no calendário e releitura após recarregar.</li><li>Edição para 2h15 pelo celular, preservando cliente, responsável e deslocamentos.</li><li>Visita de 23h30 a 1h15: término no dia seguinte e presença nas duas datas do calendário.</li><li>Conflitos ao criar e editar: sobreposição do atendimento e do intervalo de viagem, margem e retorno; horários originais preservados quando a edição foi recusada.</li><li>Novo agendamento permitido no limite exato de disponibilidade da equipe.</li><li>Formulários e calendário conferidos em larguras de 320, 390 e 1920 pixels.</li></ul><div class="nota">As 52 visitas dos lotes finais foram canceladas após a verificação. As equipes fictícias criadas para os testes foram inativadas. Nenhum pagamento foi registrado e nenhum atendimento existente foi modificado.</div><h2>Resultados por subsistema</h2>${registros.map(bloco).join("")}<h2>Evidências técnicas</h2><p><a href="automotivos26.json">Resultados dos 10 subsistemas automotivos</a> · <a href="servicos26.json">Resultados dos 16 subsistemas de serviços</a> · <a href="resumo.json">Resumo completo</a> · <a href="conferencia-banco.json">Conferência SQL independente</a></p><p class="meta">Escopo: agendamento único de visitas e duração personalizada. Esta rodada não recalculou rotas com provedor externo, não testou recorrência nem substitui testes em aparelhos físicos. As imagens e respostas do servidor estão anexadas em cada subsistema. Nenhuma divergência foi encontrada nos fluxos concluídos desta rodada.</p></main></body></html>`,
);
console.log(
  JSON.stringify({
    ok: true,
    subsistemas: 26,
    verificacoes: 208,
    relatorio: `${pasta}/relatorio.html`,
  }),
);

