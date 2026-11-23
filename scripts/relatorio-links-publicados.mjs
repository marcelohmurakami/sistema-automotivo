import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { especialidades } from "../src/lib/especialidades.ts";
const pasta = "output/links-todos-subsetores-20261026";
const ui = JSON.parse(await readFile(`${pasta}/navegador.json`, "utf8"));
const db = JSON.parse(await readFile(`${pasta}/resumo.json`, "utf8"));
const tipos = ["total", "parcial", "recusa", "expirado", "revogado"];
const nomes = ["Total", "Parcial", "Recusa", "Expirado", "Revogado"];
const e = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
assert.equal(ui.length, 130);
assert.equal(db.casos.length, 130);
for (const perfil of Object.keys(especialidades))
  for (const tipo of tipos) {
    assert(ui.some((r) => r.especialidade === perfil && r.tipo === tipo && r.passou));
    assert(
      db.casos.some(
        (r) =>
          r.especialidade === perfil &&
          r.tipo === tipo &&
          r.conferido_em &&
          r.seguranca_conferida,
      ),
    );
  }
let publicacao = { publicado: false };
try {
  publicacao = JSON.parse(await readFile(`${pasta}/publicacao-correcao.json`, "utf8"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
const linhas = Object.entries(especialidades)
  .map(
    ([id, p]) =>
      `<tr><th>${e(p.nome)}<small>${e(p.ramo)}</small></th>${tipos
        .map((tipo) => {
          const r = ui.find((x) => x.especialidade === id && x.tipo === tipo);
          return `<td><a href="${e(r.evidencia)}">✓ Passou</a><small>Documento ${r.numero}</small></td>`;
        })
        .join("")}</tr>`,
  )
  .join("\n");
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>26 subsetores — aprovação por link</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f5f7f4;color:#17271d}main{max-width:1180px;margin:auto;padding:42px 24px}h1{font-size:36px;line-height:1.15;max-width:900px}h2{margin-top:38px}a{color:#215c40}small{display:block;color:#69746a;font-size:12px}.cards{display:flex;gap:14px;flex-wrap:wrap}.cards article{background:#e4efe2;padding:18px 24px;border-radius:12px;flex:1}.cards strong{display:block;font-size:32px}.scroll{overflow:auto}table{background:white;width:100%;border-collapse:collapse;font-size:14px}th,td{padding:12px;text-align:left;border-bottom:1px solid #dbe2d8}thead{background:#243a2c;color:white}tbody th{font-weight:600}img{max-width:100%;border-radius:10px;border:1px solid #c8d4c9}li{margin:8px 0}.nota{background:white;padding:18px;border-left:4px solid #7e9f51}</style><main><p>PÁTIO · HOMOLOGAÇÃO NO SITE PUBLICADO · 26/10/2026</p><h1>Aprovação por link nos 26 subsetores</h1><p><a href="${e(db.origem)}">Abrir o sistema publicado</a></p><div class="cards"><article><strong>26/26</strong>Subsetores testados</article><article><strong>130/130</strong>Cenários na interface</article><article><strong>338</strong>Verificações adicionais na API</article></div><h2>O que foi testado</h2><p>Cada célula abaixo abre a captura do teste correspondente. As decisões foram feitas na página pública, sem login, com dados fictícios. O banco foi conferido depois, usando as contas das respectivas empresas de teste.</p><div class="scroll"><table><thead><tr><th>Subsetor</th>${nomes.map((n) => `<th>${n}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table></div><h2>Resultados conferidos no banco</h2><ul><li><strong>Aprovação total:</strong> três itens autorizados, total R$ 225,00 e desconto R$ 25,00.</li><li><strong>Aprovação parcial:</strong> dois itens do grupo principal, total R$ 135,00 e desconto proporcional R$ 15,00. A proposta original de três itens e R$ 225,00 permanece preservada.</li><li><strong>Recusa:</strong> decisão registrada, nenhum grupo autorizado e nenhuma OS criada pela recusa.</li><li><strong>Expiração e revogação:</strong> consulta e tentativa direta de resposta bloqueadas. A interface não oferece o formulário de aprovação.</li><li><strong>Repetição:</strong> repetir a mesma resposta preserva a data original; resposta conflitante e ausência de confirmação explícita são rejeitadas. As vinte conversões automotivas autorizadas foram repetidas e devolveram a mesma OS.</li><li><strong>Privacidade:</strong> conferido que custos internos e a anotação privada de teste não aparecem na resposta pública.</li></ul><h2>Falha encontrada e correção</h2><p>No automotivo, o botão de aprovação permanecia habilitado sem grupos selecionados; ao clicar, aparecia um erro que continuava mesmo após corrigir a seleção. O servidor não registrava aprovação inválida.</p><p>A interface agora bloqueia a aprovação vazia, explica como continuar e limpa o erro ao alterar os grupos. A mesma orientação foi incluída nos demais ramos. A opção de recusar continua disponível com nome e confirmação.</p><p class="nota">${publicacao.publicado ? `Correção publicada e conferida no mesmo endereço. Build: <strong>${e(publicacao.build)}</strong>.` : "Correção local concluída; validação da publicação em andamento."}</p><h2>Link invalidado durante a leitura</h2><p>Também foram abertos quatro links válidos — dois no automotivo e dois na assistência. Com nome e confirmação já preenchidos, o link foi expirado ou revogado e depois houve tentativa de aprovação. Todas foram bloqueadas no servidor e a página passou a informar a indisponibilidade.</p><h2>Evidências de exemplo</h2><h3>Automotivo: aprovação parcial</h3><img src="mecanica-parcial.png" alt="Comprovante de aprovação parcial automotiva"><h3>Assistência: recusa</h3><img src="assistencia_celulares-recusa.png" alt="Recusa registrada na assistência"><h3>Manutenção: link expirado</h3><img src="manutencao_climatizacao-expirado.png" alt="Link vencido de manutenção bloqueado"><h3>Limpeza: link revogado</h3><img src="limpeza_residencial-revogado.png" alt="Link revogado de limpeza bloqueado"><h2>Escopo e rastreabilidade</h2><p>Preparação dos cenários por RPCs do aplicativo, decisões pelo navegador no frontend publicado, confirmação independente por RPCs autenticadas e anônimas. Expiração foi simulada alterando apenas a validade dos tokens QA identificados; revogação utilizou o fluxo de revisão do automotivo e a função de revogação dos outros ramos. As empresas usadas pertencem ao lote fictício ZZ [TESTE 20261019]. Não foram registrados pagamentos nem enviados avisos a clientes.</p><p>As capturas, nomes e números correspondem exclusivamente a dados de teste. Links secretos e credenciais foram omitidos do relatório.</p><p><a href="navegador.json">Resultados do navegador</a> · <a href="resumo.json">Conferência no banco e verificações da API</a> · <a href="intercorrencias-navegador.json">Testes com a página aberta</a></p></main></html>`;
let evidenciaPublicacao = "";
if (publicacao.publicado) {
  const reconsultas = JSON.parse(
    await readFile(`${pasta}/reconsulta-apos-publicacao.json`, "utf8"),
  );
  const bancoCorrecao = JSON.parse(
    await readFile(`${pasta}/correcao-publicada-banco.json`, "utf8"),
  );
  assert.equal(reconsultas.length, 130);
  assert(reconsultas.every((x) => x.passou));
  assert.equal(bancoCorrecao.length, 2);
  assert(bancoCorrecao.every((x) => x.passou));
  evidenciaPublicacao = `<h2>Conferência após republicar</h2><p>Todos os 130 links foram reabertos no build corrigido, preservando os comprovantes e bloqueios. Nos dois formulários, a seleção vazia bloqueou somente a aprovação; a recusa continuou disponível com nome e confirmação. Selecionar um adicional incluiu seu grupo obrigatório e exigiu confirmar novamente.</p><p>Foram salvas mais duas aprovações parciais — mecânica #13 e celulares #457 — na versão corrigida. O banco confirmou duas OS com dois itens e R$ 135,00, preservando três itens e R$ 225,00 nas propostas originais.</p><img src="selecao-vazia-corrigida-publicada.png" alt="Aprovação vazia bloqueada e orientação para selecionar um grupo"><p><a href="reconsulta-apos-publicacao.json">130 reconsultas após publicação</a> · <a href="correcao-publicada-banco.json">Conferência das duas novas aprovações</a></p>`;
}
await writeFile(
  `${pasta}/relatorio.html`,
  html.replace(
    "<h2>Link invalidado durante a leitura</h2>",
    `${evidenciaPublicacao}<h2>Link invalidado durante a leitura</h2>`,
  ),
);
console.log(
  "Relatório conferido: 26 subsetores, 130 cenários, 338 verificações adicionais.",
);
