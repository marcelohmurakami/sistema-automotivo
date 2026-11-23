import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const out = resolve("output/os-velocidade-20261116");
const ler = async (f) => JSON.parse(await readFile(resolve(out, f), "utf8"));
const grupos = ["", "-completo", "-pronto", "-rapido"];
const antes = await Promise.all(
  grupos.map((s) => ler("antes" + s + "/resultados.json")),
);
const depois = await Promise.all(
  grupos.map((s) => ler("depois" + s + "/resultados.json")),
);
const ca = await ler("antes-controlado/resultados.json"),
  cd = await ler("depois-controlado/resultados.json"),
  ui = await ler("interface/resultados.json"),
  reg = await ler("regressao/resultados.json"),
  pag = await ler("pagamento/interface.json"),
  pub = await ler("publicacao.json");
const rede = await ler("rede-limitada/resultados.json");
assert(rede.ok && rede.resultados.length === 24 && rede.resultados.every((x) => x.ok));
assert.equal(rede.builds.depois, pub.build);
const abasAntes = await ler("antes-consulta/resultados.json"),
  abasDepois = await ler("depois-consulta/resultados.json");
for (const r of [abasAntes, abasDepois])
  assert(r.ok && r.resultados.length === 140 && r.resultados.every((x) => x.ok));
assert.equal(abasDepois.build, pub.build);
for (const lista of [antes, depois])
  for (const [i, r] of lista.entries()) {
    assert(r.ok && r.resultados.every((x) => x.ok));
    assert.equal(r.resultados.length, [200, 40, 60, 40][i]);
    assert.equal(r.documentos.length, 20);
    assert(r.documentos.every((x) => x.verificado));
  }
for (const r of depois) assert.equal(r.build, pub.build);
for (const [r, n] of [
  [ca, 48],
  [cd, 48],
  [ui, 74],
  [reg, 16],
])
  assert(r.ok && r.resultados.length >= n && r.resultados.every((x) => x.ok));
assert(pag.ok && pag.resultados.every((x) => x.ok));
assert.equal(depois[0].extras.length, 20);
const stat = (r) => {
  const v = r.map((x) => x.segundos).sort((a, b) => a - b),
    n = v.length;
  assert(n);
  return {
    n,
    mediana: (v[(n - 1) >> 1] + v[n >> 1]) / 2,
    p95: v[Math.ceil(n * 0.95) - 1],
    min: v[0],
    max: v.at(-1),
  };
};
const a = antes.flatMap((x) => x.resultados),
  d = depois.flatMap((x) => x.resultados);
const redeResumo = ["desktop", "celular"].map((tela) => ({
  nome: "Salvar OS de 12 itens — rede limitada",
  tela,
  antes: stat(rede.resultados.filter((x) => x.tela === tela && x.fase === "antes")),
  depois: stat(rede.resultados.filter((x) => x.tela === tela && x.fase === "depois")),
  cliques: [1],
  campos: [0],
}));
const consulta = [];
for (const nome of new Set(abasDepois.resultados.map((x) => x.nome)))
  for (const tela of ["desktop", "celular"]) {
    const ant = abasAntes.resultados.filter((x) => x.nome === nome && x.tela === tela),
      dep = abasDepois.resultados.filter((x) => x.nome === nome && x.tela === tela);
    consulta.push({
      nome,
      tela,
      antes: stat(ant),
      depois: stat(dep),
      cliques: [...new Set(dep.map((x) => x.cliques))],
      campos: [0],
    });
  }
const escolha = (ls) => [
  ...ls[0].resultados,
  ...ls
    .slice(1)
    .flatMap((r) => r.resultados.filter((x) => x.nome !== "Abrir lista de OS")),
];
const detalhar = [];
for (const nome of new Set(escolha(depois).map((x) => x.nome)))
  for (const tela of ["desktop", "celular"]) {
    const ant = escolha(antes).filter((x) => x.nome === nome && x.tela === tela),
      dep = escolha(depois).filter((x) => x.nome === nome && x.tela === tela);
    if (!dep.length) continue;
    detalhar.push({
      nome,
      tela,
      antes: stat(ant),
      depois: stat(dep),
      cliques: [...new Set(dep.map((x) => x.cliques))],
      campos: [...new Set(dep.map((x) => x.campos))],
    });
  }
const roteiros = [
  ["Criar OS simples", 0, ["Abrir lista de OS", "Criar OS simples"]],
  [
    "Criar OS com cadastros existentes",
    3,
    ["Abrir lista de OS", "Criar OS com cliente e serviço cadastrados"],
  ],
  [
    "Criar OS completa: 12 itens e dados opcionais",
    1,
    ["Abrir lista de OS", "Criar OS completa com 12 itens"],
  ],
  [
    "Buscar pelo cliente e consultar",
    0,
    ["Buscar OS pelo cliente", "Consultar OS encontrada"],
  ],
  [
    "Abrir edição e alterar quantidade, desconto e observação",
    0,
    ["Abrir edição na consulta", "Alterar quantidade, desconto e observação"],
  ],
  [
    "Editar pela lista e acrescentar 11 itens com custo",
    0,
    ["Abrir edição pela lista", "Completar OS com 12 itens e custos"],
  ],
  ...["adiar", "total", "parcial", "prazo"].map((m) => [
    "Criar pronta, pagamento " + m + " e impressão",
    2,
    [
      "Abrir lista de OS",
      "Criar OS pronta até abrir pagamento",
      "Pagamento e impressão: " + m,
    ],
  ]),
];
function somar(lista, indice, nomes, tela) {
  const r = lista[indice].resultados.filter((x) => x.tela === tela),
    perfis = [...new Set(r.map((x) => x.perfil))];
  return perfis.flatMap((perfil) => {
    const itens = nomes.map((nome) =>
      r.find((x) => x.perfil === perfil && x.nome === nome),
    );
    return itens.every(Boolean)
      ? [
          {
            perfil,
            segundos: itens.reduce((s, x) => s + x.segundos, 0),
            cliques: itens.reduce((s, x) => s + x.cliques, 0),
            campos: itens.reduce((s, x) => s + x.campos, 0),
          },
        ]
      : [];
  });
}
const processos = [];
for (const [nome, i, nomes] of roteiros)
  for (const tela of ["desktop", "celular"]) {
    const ant = somar(antes, i, nomes, tela),
      dep = somar(depois, i, nomes, tela);
    if (dep.length)
      processos.push({
        nome,
        tela,
        antes: stat(ant),
        depois: stat(dep),
        cliques: [...new Set(dep.map((x) => x.cliques))],
        campos: [...new Set(dep.map((x) => x.campos))],
      });
  }
const controlados = [];
for (const n of [12, 100])
  for (const largura of [1920, 390])
    for (const nome of new Set(
      cd.resultados.filter((x) => x.n === n).map((x) => x.nome),
    ))
      controlados.push({
        nome,
        n,
        largura,
        antes: stat(
          ca.resultados.filter(
            (x) => x.n === n && x.largura === largura && x.nome === nome,
          ),
        ),
        depois: stat(
          cd.resultados.filter(
            (x) => x.n === n && x.largura === largura && x.nome === nome,
          ),
        ),
      });
const inventario = [
  [
    "src/pages/OrdensServico.tsx",
    "OrdensServico.tsx",
    "Alterado",
    "Busca, abertura, edição, gravação, atualização das integrações e tratamento de conflito.",
  ],
  [
    "src/services/ordensServico.ts",
    "ordensServico-service.ts",
    "Alterado",
    "Normalização da busca numérica e cancelamento de consultas superadas. Regras de gravação preservadas.",
  ],
  [
    "src/lib/atualizarIntegracoes.ts",
    "atualizarIntegracoes.ts",
    "Alterado",
    "Exceção exata para a ficha confirmada pelo servidor. Demais listas, painéis e empresas continuam atualizando.",
  ],
  [
    "src/components/ordens-servico/ResumoOS.tsx",
    "ResumoOS.tsx",
    "Alterado",
    "Ação de editar deslocada para o início da ficha; compatibilidade preservada para outros usos.",
  ],
  [
    "src/components/ordens-servico/ResumoOS.css",
    "ResumoOS.css",
    "Alterado",
    "Botão de edição junto à impressão, com adaptação à largura disponível.",
  ],
  [
    "src/lib/buscaDocumentos.ts",
    null,
    "Novo",
    "Normaliza número copiado com # e zeros à esquerda, preservando nomes, placas e motores.",
  ],
  [
    "src/lib/buscaOrcamentos.ts",
    null,
    "Reutilização",
    "Usa o mesmo normalizador; regressão da busca de orçamentos incluída.",
  ],
  [
    "src/components/ordens-servico/FormularioOS.tsx",
    null,
    "Revisado e testado",
    "Mantidos opcionais, datas, dados do cliente, quantidades inteiras, custos, descontos e revisão da OS.",
  ],
  [
    "src/components/EditorItensOS.tsx",
    null,
    "Revisado e testado",
    "Cadastro, busca de catálogo, edição, custo por item e desfazer remoção. Já usa lista memorizada.",
  ],
  [
    "src/components/ListaItensOS.tsx",
    null,
    "Revisado e testado",
    "Lista memorizada e controle rápido de quantidades, inclusive com 100 itens.",
  ],
  [
    "src/services/impressaoNotaOS.ts",
    null,
    "Revisado e testado",
    "Consultas paralelas já existentes; impressão continua depois da decisão de pagamento.",
  ],
  [
    "src/components/ProvedorPagamentoAposRegistro.tsx",
    null,
    "Revisado e testado",
    "Sequência pagamento → impressão, permissão financeira e bloqueio de continuação duplicada.",
  ],
  [
    "src/components/LucroServico.tsx",
    null,
    "Revisado e testado",
    "Consulta no site publicado, conferência do valor final da OS e layout em desktop/celular.",
  ],
  [
    "src/components/PagamentosIntegrados.tsx",
    null,
    "Revisado e testado",
    "Consulta financeira e fluxo de pagamento exercitados sem alteração nas regras financeiras.",
  ],
];
const fontes = [];
for (const [arquivo, snapshot, situacao, revisao] of inventario) {
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  fontes.push({
    arquivo,
    situacao,
    revisao,
    sha256: hash(await readFile(arquivo)),
    ...(snapshot
      ? { antes: hash(await readFile(resolve(out, "antes", snapshot))) }
      : {}),
  });
}
const repetidas = (lista) =>
  lista[0].resultados
    .filter((x) =>
      [
        "Criar OS simples",
        "Alterar quantidade, desconto e observação",
        "Completar OS com 12 itens e custos",
      ].includes(x.nome),
    )
    .reduce(
      (s, x) =>
        s + x.requisicoes.filter((r) => r.nome === "consultar_ordem_servico").length,
      0,
    );
const resumo = {
  geradoEm: new Date().toISOString(),
  publicacao: pub,
  escopo: "10 perfis automotivos; Chrome desktop e celular emulado",
  medicoesPublicadas:
    a.length + d.length + abasAntes.resultados.length + abasDepois.resultados.length,
  medicoesControladas: ca.resultados.length + cd.resultados.length,
  medicoesRedeLimitada: rede.resultados.length,
  rede: redeResumo,
  osCriadas: antes.concat(depois).reduce((s, x) => s + x.documentos.length, 0),
  interface: ui.resultados.length,
  pagamento: pag.resultados.length,
  suites: reg.resultados.length,
  consultasFichaDuranteGravacao: { antes: repetidas(antes), depois: repetidas(depois) },
  processos,
  consulta,
  detalhar,
  controlados,
  fontes,
};
await writeFile(resolve(out, "resumo.json"), JSON.stringify(resumo, null, 2));
const csv = [
  ["fase", "perfil", "tela", "processo", "segundos", "cliques", "campos"],
  ...antes.flatMap((r, i) =>
    r.resultados.map((x) => [
      "antes" + grupos[i],
      x.perfil,
      x.tela,
      x.nome,
      x.segundos,
      x.cliques,
      x.campos,
    ]),
  ),
  ...depois.flatMap((r, i) =>
    r.resultados.map((x) => [
      "depois" + grupos[i],
      x.perfil,
      x.tela,
      x.nome,
      x.segundos,
      x.cliques,
      x.campos,
    ]),
  ),
  ...[abasAntes, abasDepois].flatMap((r) =>
    r.resultados.map((x) => [
      r.fase + "-consulta",
      x.perfil,
      x.tela,
      x.nome,
      x.segundos,
      x.cliques,
      x.campos,
    ]),
  ),
]
  .map((row) => row.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(";"))
  .join("\n");
await writeFile(resolve(out, "medicoes.csv"), "\ufeff" + csv);
const esc = (x) =>
    String(x).replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    ),
  f = (x) =>
    x.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
  faixa = (a) => a.sort((a, b) => a - b).join(" / ");
const tabela = (rs) =>
  `<div class="tabela"><table><thead><tr><th>Processo</th><th>Tela</th><th>Antes (s)</th><th>Depois (s)</th><th>P95 depois (s)</th><th>n</th><th>Cliques</th><th>Campos</th></tr></thead><tbody>${rs.map((x) => `<tr><td>${esc(x.nome)}</td><td>${x.tela}</td><td>${f(x.antes.mediana)}</td><td><b>${f(x.depois.mediana)}</b></td><td>${f(x.depois.p95)}</td><td>${x.depois.n}</td><td>${faixa(x.cliques)}</td><td>${faixa(x.campos)}</td></tr>`).join("")}</tbody></table></div>`;
const nomes = {
  mecanica: "Oficina mecânica",
  retifica: "Retífica",
  autoeletrica: "Autoelétrica",
  autocenter: "Centro automotivo",
  borracharia: "Borracharia",
  estetica: "Estética automotiva",
  lava_rapido: "Lava-rápido",
  troca_oleo: "Troca de óleo",
  acessorios: "Acessórios",
  funilaria: "Funilaria",
};
const perfis = [...new Set(depois[0].documentos.map((x) => x.perfil))];
assert.equal(perfis.length, 10);
const evidencias = [
  [
    "rede-limitada/resultados.json",
    "Comparação alternada com rede limitada e API real",
  ],
  ["antes-consulta/resultados.json", "Navegação dentro da OS: antes"],
  ["depois-consulta/resultados.json", "Navegação dentro da OS: depois"],
  ...["antes", "depois"].flatMap((fase) =>
    grupos.map((s) => [
      fase + s + "/resultados.json",
      "Medições publicadas: " + fase + s,
    ]),
  ),
  ["antes-controlado/resultados.json", "CPU reduzida: antes"],
  ["depois-controlado/resultados.json", "CPU reduzida: depois"],
  ["interface/resultados.json", "Interface e falhas"],
  ["pagamento/interface.json", "Pagamento e entrega"],
  ["regressao/resultados.json", "Regressão"],
  ["publicacao.json", "Conferência da publicação"],
  ["pacote.json", "Arquivos publicados e hashes"],
  ["medicoes.csv", "Planilha CSV das medições"],
  ["resumo.json", "Resumo e hashes dos fontes"],
  ["build.log", "Build de produção"],
];
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ordens de serviço — velocidade e validação</title><style>*{box-sizing:border-box}body{margin:0;background:#edf1f0;color:#1d302c;font:15px/1.6 system-ui,sans-serif}main{max-width:1240px;margin:auto;padding:40px 24px}h1{font-size:36px;line-height:1.2;margin:12px 0}h2{font-size:24px;margin:0 0 16px}h3{font-size:18px}section{background:white;border:1px solid #d4dfda;border-radius:16px;padding:26px;margin:24px 0}p{max-width:100ch}.selo{color:#16644d;font-weight:750}.metricas{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:28px 0}.metrica{padding:20px;background:#173e34;color:#fff;border-radius:12px}.metrica strong{display:block;font-size:29px}.nota{background:#fff2d2;border-left:4px solid #a57418;padding:16px;border-radius:6px}a{color:#12644c;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:11px;text-align:left;border-bottom:1px solid #dce5e0;vertical-align:top}th{background:#eaf2ee}tbody tr:nth-child(even){background:#f4f7f5}td:not(:first-child){font-variant-numeric:tabular-nums}.tabela{overflow:auto;max-width:100%}details{border-top:1px solid #d4dfda;padding:16px 0}summary{cursor:pointer;font-weight:700}.fotos{display:grid;grid-template-columns:2fr 1fr;align-items:start;gap:20px}img{max-width:100%;border:1px solid #cbd8d1;border-radius:8px}figure{margin:0}figcaption{font-size:13px;color:#4c665c}li{margin:8px 0}code{overflow-wrap:anywhere;font-size:12px}@media(max-width:650px){main{padding:20px 12px}h1{font-size:29px}section{padding:18px}.metricas{grid-template-columns:1fr 1fr}.fotos{grid-template-columns:1fr}}@media print{body{background:white}main{padding:0}section{break-inside:avoid}.tabela{overflow:visible}table{font-size:10px}th,td{padding:5px}details>div{display:block}.metricas{grid-template-columns:repeat(4,1fr)}a{color:inherit}}</style><main>
<span class="selo">PUBLICADO E CONFERIDO · ORDENS DE SERVIÇO</span><h1>Criar, encontrar e editar<br>com menos espera</h1><p>Auditoria de 16/11/2026. Site: <a href="${pub.url}">${pub.url}</a>. Build <b>${esc(pub.build)}</b>. A publicação foi comparada com os arquivos locais, por hash.</p>
<div class="metricas"><div class="metrica"><strong>${resumo.medicoesPublicadas}</strong>medições no site</div><div class="metrica"><strong>${resumo.medicoesControladas + resumo.medicoesRedeLimitada}</strong>medições controladas</div><div class="metrica"><strong>${resumo.osCriadas}</strong>OS fictícias verificadas</div><div class="metrica"><strong>10</strong>perfis automotivos</div></div>
<p class="nota"><b>Como ler os segundos:</b> são tempos de execução automatizada, incluindo resposta da interface e do servidor. O preenchimento é feito por automação; não representa o tempo de uma pessoa pensar, procurar informações ou digitar. As medidas reais variam com rede, aparelho e volume de dados. Mediana é o valor central; P95 é o limite que cobre 95% desta amostra.</p>
<section><h2>O que mudou</h2><ul><li>Ao salvar, a ficha completa confirmada pelo banco aparece imediatamente. Listas, mapa e financeiro atualizam em segundo plano, sem prender o botão de salvamento.</li><li>A consulta antiga da ficha é cancelada antes de atualizar o cache, para não substituir os dados recém-salvos por uma resposta atrasada.</li><li><b>Editar OS</b> fica perto da impressão, antes dos serviços. Não é preciso descer até o final da ficha para encontrar a ação.</li><li>Busca aceita o número copiado com <b># e zeros à esquerda</b>. Enter inicia a busca sem aguardar a pausa de digitação; um botão limpa o campo.</li><li>Consultas substituídas podem ser canceladas. A atualização periódica da lista pausa durante a edição ou consulta de uma ficha.</li><li>Duplo clique é bloqueado imediatamente. Em conflito de edição, os campos digitados são preservados; fechar e reabrir carrega a revisão atual.</li></ul><p>Nas 60 gravações comparáveis do roteiro principal, as chamadas adicionais à consulta da ficha durante a operação passaram de <b>${repetidas(antes)}</b> para <b>${repetidas(depois)}</b>. Isso não remove a confirmação do servidor: a gravação já devolve a OS completa.</p></section>
<section><h2>Processos do início ao fim</h2><p>A criação começa na navegação para a página de OS e termina com a ficha salva e utilizável. A consulta começa na busca. A edição começa ao clicar para editar. O fluxo “pronta” termina quando o navegador chama a impressão, após a decisão de pagamento.</p>${tabela(processos)}<p>Cliques são ações explícitas nos botões e seleções. Campos preenchidos são contados separadamente; foco, rolagem automática e digitação não são contados como cliques. Os caminhos de retífica e dos demais perfis possuem campos diferentes, por isso há contagens alternativas. Cada modo de pagamento foi exercitado cinco vezes por versão, distribuído entre os perfis.</p><details><summary>Ver cada etapa medida separadamente</summary>${tabela(detalhar)}</details></section>
<section><h2>Consulta das informações da OS</h2><p>Os mesmos documentos completos foram consultados nas duas versões. Foram conferidos serviços, fotos, lucro e custos, dados do atendimento, histórico e pagamento. O valor final exibido na aba de lucro e custos foi comparado com o total da OS; o saldo recebido foi conferido.</p>${tabela(consulta)}</section><section><h2>OS grandes e lista lenta</h2><p>Chrome com CPU reduzida a ¼ da velocidade e revalidação da lista atrasada em 2 segundos, de forma controlada. São três repetições por combinação de tamanho e tela. Este cenário isola a espera removida; não é uma previsão da velocidade da internet do cliente.</p><div class="tabela"><table><thead><tr><th>Etapa</th><th>Itens</th><th>Largura</th><th>Antes (s)</th><th>Depois (s)</th><th>P95 depois (s)</th></tr></thead><tbody>${controlados.map((x) => `<tr><td>${esc(x.nome)}</td><td>${x.n}</td><td>${x.largura}</td><td>${f(x.antes.mediana)}</td><td><b>${f(x.depois.mediana)}</b></td><td>${f(x.depois.p95)}</td></tr>`).join("")}</tbody></table></div></section>
<section><h2>Comparação alternada com conexão limitada</h2><p>Os arquivos das duas versões publicadas foram servidos localmente, com a API real do Supabase. Foram alternadas as versões anterior e nova, em mecânica e retífica, com três repetições em cada tela. Somente o salvamento é cronometrado. A conexão foi limitada a 4 Mbps de download, 1 Mbps de upload e 250 ms de latência; login, abertura e preenchimento ficam fora desta medida. Esta é uma simulação de conexão limitada, separada dos tempos comuns do site.</p>${tabela(redeResumo)}</section><section><h2>Conferência dos dados e proteção contra falhas</h2><ul><li>OS simples de R$ 100,00; edição para duas unidades com 10% de desconto: R$ 180,00.</li><li>Inclusão de mais 11 itens: total final R$ 338,40, 12 itens e custo unitário preservado. Reabertura e consulta independente no banco.</li><li>OS completa com catálogo, custos, diagnóstico, observação interna e condições de garantia. Conferência após recarregar.</li><li>OS pronta de R$ 100,00 com desconto: financeiro R$ 90,00; impressão mantém a escolha de ocultar o desconto. Recebimento total de R$ 90,00, parcial de R$ 30,00, prazo ou adiamento, conforme o roteiro.</li><li>Falha de gravação preserva formulário e dados antigos; reenvio funciona. Conflito de revisão não sobrescreve outro usuário. Duplo clique não duplica a gravação.</li><li>Entrega posterior não repete recebimento já registrado. Falha de consulta financeira não é interpretada como quitação.</li></ul><p><b>${ui.resultados.length} verificações de interface</b>, <b>${pag.resultados.length} cenários adicionais de pagamento/entrega</b> e <b>${reg.resultados.length} suítes de regressão</b> aprovados. As suítes verificam criação, edição, cliente avulso, custos, desconto, pagamento parcial, estoque, OS pronta, permissões e ações do mapa. Veja os logs abaixo.</p></section>
<section><h2>Desktop e celular</h2><p>Fluxos publicados em 1920 × 1080 e 390 × 844. Interface local em 320, 390, 768, 1366 e 1920 px, nos temas claro e escuro. Sem rolagem horizontal nos diálogos verificados. Celular emulado em Chrome; não houve teste em aparelho físico ou Safari.</p><div class="fotos"><figure><a href="depois/retifica-desktop-consulta.png"><img src="depois/retifica-desktop-consulta.png" alt="Consulta publicada da OS no desktop"></a><figcaption>Consulta publicada · desktop · retífica.</figcaption></figure><figure><a href="depois/retifica-celular-consulta.png"><img src="depois/retifica-celular-consulta.png" alt="Consulta publicada da OS no celular"></a><figcaption>Consulta publicada · celular · retífica.</figcaption></figure></div><details><summary>Outros tamanhos e temas</summary><div class="fotos">${["escuro", "claro"].flatMap((t) => [320, 390, 768, 1366, 1920].map((w) => `<figure><a href="interface/consulta-${t}-${w}.png"><img loading="lazy" src="interface/consulta-${t}-${w}.png" alt="Consulta ${t}, ${w} px"></a><figcaption>${t} · ${w} px</figcaption></figure>`)).join("")}</div></details></section>
<section><h2>Perfis conferidos no site</h2><div class="tabela"><table><thead><tr><th>Perfil</th><th>OS antes</th><th>OS depois</th><th>Resultado</th></tr></thead><tbody>${perfis.map((p) => `<tr><td>${esc(nomes[p] || p)}</td><td>${antes.reduce((s, r) => s + r.documentos.filter((x) => x.perfil === p).length, 0)}</td><td>${depois.reduce((s, r) => s + r.documentos.filter((x) => x.perfil === p).length, 0)}</td><td>Criação, edição, consulta e pagamento/impressão conferidos</td></tr>`).join("")}</tbody></table></div><p>Foram usadas somente empresas fictícias “ZZ [TESTE 20261019]”. Os documentos e recebimentos de teste permanecem nessas empresas. Não houve mensagens a clientes, cobrança em provedor externo ou impressão física.</p></section>
<section><h2>Arquivos revisados e alterações</h2><p>Esta é a revisão do módulo de OS automotivas. Não é uma declaração de revisão integral de todos os componentes do produto ou de teste ponta a ponta nos outros 16 subsistemas.</p><div class="tabela"><table><thead><tr><th>Arquivo</th><th>Situação</th><th>Conferência</th></tr></thead><tbody>${fontes.map((x) => `<tr><td><code>${esc(x.arquivo)}</code></td><td>${x.situacao}</td><td>${x.revisao}</td></tr>`).join("")}</tbody></table></div><p>Os hashes atuais e, quando disponíveis, anteriores estão no arquivo <a href="resumo.json">resumo.json</a>. Não foi necessária migração de banco.</p></section>
<section><h2>Evidências reproduzíveis</h2><ul>${evidencias.map(([url, n]) => `<li><a href="${url}">${n}</a></li>`).join("")}</ul><details><summary>Suítes e logs individuais</summary><ul>${reg.resultados.map((x) => `<li><a href="regressao/${x.log}">${esc(x.arquivo)}</a> · aprovado</li>`).join("")}</ul></details><p>Os tempos antes e depois foram coletados em execuções separadas, sem execução simultânea dos testes de CPU. No teste publicado, cada conta começa em uma sessão nova, sem service worker; o desktop é medido primeiro e o celular em seguida, reaproveitando o cache de arquivos da mesma sessão. O protocolo é igual antes e depois. Variações de rede e do servidor podem fazer uma etapa ficar mais lenta em uma rodada. O teste controlado separa esse efeito da espera causada pelo código. Roteiros piloto e tentativas interrompidas não entram nas contagens.</p></section>
</main></html>`;
await writeFile(resolve(out, "relatorio.html"), html);
console.log(
  JSON.stringify({
    arquivo: resolve(out, "relatorio.html"),
    medicoes:
      resumo.medicoesPublicadas +
      resumo.medicoesControladas +
      resumo.medicoesRedeLimitada,
    os: resumo.osCriadas,
    build: pub.build,
  }),
);
