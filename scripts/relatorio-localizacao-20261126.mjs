import { readFile, writeFile, readdir } from "node:fs/promises";
const dir = "output/localizacao-produtividade-20261126";
const ler = async (f, alternativa) => {
  try {
    return JSON.parse(await readFile(dir + "/" + f, "utf8"));
  } catch (e) {
    if (alternativa !== undefined) return alternativa;
    throw e;
  }
};
const apis = await Promise.all(
  (await readdir(dir))
    .filter((f) => /^api-.*\.json$/.test(f) && f !== "api-resumo.json")
    .map((f) => ler(f)),
);
const ui = await ler("interface.json", { status: "Em conferência", resultados: [] });
const publicacao = await ler("publicacao.json", {});
const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const num = (n) =>
  Number(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
const quant = (xs, p) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.max(0, Math.ceil(v.length * p) - 1)] || 0;
};
const medidas = (a, n) =>
  a.calls.filter((c) => c.nome === n && !c.erro).map((c) => c.segundos);
const inventario = [
  [
    "Página e painel incorporado",
    "Leitura, filtros, locais e seleção ficavam no Avançado após a lista.",
    "Ações e filtros no início; compartilhados pelos 26 subsistemas e pelos atalhos dos documentos.",
    "Alterado: Localizacao.tsx.",
  ],
  [
    "Cadastro rápido",
    "Descrição e destino; impressão exigia procurar a ação depois do cadastro.",
    "Descrição e destino mantidos. Guardar e imprimir abre diretamente o preparo do PDF. O local filtrado é sugerido explicitamente no formulário.",
    "Alterado: CadastroItemFisico.",
  ],
  [
    "Cadastro completo",
    "Categoria, acessórios, série e observações estavam em Avançado.",
    "Mais detalhes e acessórios nomeia o conteúdo. Mantém campos opcionais, validação e até 20 acessórios. Veículo deixa de ser sugerido como categoria para os outros setores.",
    "Alterado: CadastroItemFisico.",
  ],
  [
    "Escolha de destino",
    "Cada nova montagem reconsultava locais já carregados. Mensagem de carregamento duplicada.",
    "Cache de 60 segundos por empresa e busca; invalidação após edição; mensagem duplicada removida. Pesquisa, QR de local e novo local continuam disponíveis.",
    "Alterado: SeletorLocal.",
  ],
  [
    "Gerenciamento de locais",
    "Salvar esperava a reconsulta dos locais antes de liberar o formulário.",
    "Após confirmação do servidor, o novo destino fica selecionável; as listas são atualizadas em segundo plano.",
    "Alterado: GerenciarLocais.",
  ],
  [
    "Movimento individual e seleção múltipla",
    "Saída, entrega, retorno e não localizado escondidos no Avançado.",
    "Operação visível; motivo obrigatório nos casos apropriados; observação opcional recolhida. Mantida separação entre custódia física e pagamento da OS.",
    "Alterado: MovimentoFisico.",
  ],
  [
    "Movimento por leituras",
    "Era necessário consultar cada etiqueta ou localizar e selecionar os itens na lista.",
    "Novo fluxo: destino único, fila de leituras, conferência e uma confirmação para até 50 itens. Leitura repetida é ignorada e leituras recebidas durante a consulta são preservadas.",
    "Novo: MoverPorEtiquetas + filaEtiquetas.",
  ],
  [
    "Ficha e conjunto",
    "Acessórios e histórico estavam dentro de Avançado; histórico tinha uma segunda abertura.",
    "Acessórios acessíveis na ficha, com seleção do conjunto; histórico abre diretamente. Depois de salvar uma movimentação ou identificação, a ficha usa a resposta confirmada do servidor, sem aguardar outra consulta para atualizar o que o usuário vê.",
    "Alterado: DetalheFisico.",
  ],
  [
    "Busca e links",
    "Busca paginada com espera de 250 ms; link inicial reconhecia só PTI/PTL em maiúsculas.",
    "Link inicial também aceita minúsculas. Mensagem durante a espera da busca; cache de 15 segundos para reaberturas e invalidação após alterações.",
    "Alterado: ControleLocalizacao / DetalheFisico.",
  ],
  [
    "Leitor de QR e código de barras",
    "Câmera sob demanda, foto local e entrada manual; biblioteca carregada só quando usada.",
    "Mantido: evita peso na abertura e não pede câmera automaticamente. Entrada por teclado permite leitor USB/Bluetooth. Câmera física não foi exercitada nesta revisão.",
    "Revisado, sem mudança: LeitorEtiqueta.tsx.",
  ],
  [
    "Vincular etiqueta existente",
    "Consulta, seleção dos acompanhantes e confirmação; preserva etiqueta e histórico.",
    "Mantido: já evita novo cadastro e possui controle de revisão e repetição. O acesso pelo painel vinculado ficou visível no topo.",
    "Revisado: VincularEtiqueta.tsx.",
  ],
  [
    "PDF e impressão",
    "A4 com dez etiquetas por página ou térmica 80 × 50 mm; QR com identificador opaco.",
    "Mantido: paginação, dimensões e limite de 50 passaram. Biblioteca PDF continua carregada somente ao imprimir.",
    "Revisado, sem mudança: pdfEtiquetas.ts / ImprimirEtiquetas.",
  ],
  [
    "Atalho e diálogos",
    "Painel da localização carregado sob demanda; portal impede formulário filho de enviar a OS.",
    "Mantido: reduz carga inicial e impede submissão acidental do documento pai.",
    "Revisados: AtalhoLocalizacao / DialogoLocalizacao.",
  ],
  [
    "Serviço e banco",
    "RPCs com isolamento por empresa, revisão otimista, chave de repetição e transações. Histórico imutável.",
    "Mantidos e testados; o lote usa a operação atômica existente. Sem migração ou alteração de permissões.",
    "Revisados: services/localizacao.ts, localizacaoFisica.ts e SQL.",
  ],
  [
    "Layout responsivo",
    "Ações principais escondidas após a lista; controles e linhas já tinham alvos de toque de 44 px.",
    "Barra de ações quebra em linhas; filtros e formulário adaptam-se ao celular; fila tem rolagem vertical limitada. Alvos de toque preservados.",
    "Alterado: Localizacao.css.",
  ],
];
const processos = [
  [
    "Abrir leitor de etiqueta",
    "2 ações: Avançado → Ler etiqueta",
    "1 ação: Ler etiqueta",
    "−1 ação; elimina procurar o fim da lista",
  ],
  [
    "Abrir filtros",
    "1 abertura de Avançado, depois escolher",
    "Filtros já visíveis",
    "−1 ação",
  ],
  [
    "Selecionar vários itens",
    "2 ações para habilitar: Avançado → Selecionar",
    "1 ação: Selecionar vários",
    "−1 ação",
  ],
  [
    "Consultar histórico na ficha",
    "2 aberturas: Avançado → Histórico",
    "1 abertura: Histórico",
    "−1 ação",
  ],
  [
    "Selecionar N acompanhantes",
    "Abrir Avançado e marcar N caixas",
    "Selecionar conjunto",
    "N ações a menos; limite de 49 acompanhantes",
  ],
  [
    "Guardar e preparar impressão",
    "Guardar → Imprimir etiqueta → Baixar PDF",
    "Guardar e imprimir → Baixar PDF",
    "−1 ação; mesmos dados obrigatórios",
  ],
  [
    "Mover dez itens um por um",
    "10 aberturas + 10 escolhas de destino + 10 confirmações",
    "1 abertura + 1 destino + 10 leituras + 1 confirmação",
    "30 ações de formulário → 3, mais leituras; comparação com operação individual",
  ],
];
const consultas = apis.flatMap((a) => medidas(a, "listar_itens_fisicos"));
const linhas = apis
  .map(
    (a) =>
      `<tr><td>${esc(a.perfil)}</td><td>${a.ok ? "Passou" : "Falhou"}</td><td>${a.checks.length}</td><td>${num(quant(medidas(a, "listar_itens_fisicos"), 0.5))} s</td><td>${num(Math.max(...medidas(a, "listar_itens_fisicos")))} s</td></tr>`,
  )
  .join("");
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Localização e etiquetas — revisão de produtividade</title><style>body{margin:0;background:#f3f6f3;color:#17271e;font:16px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:40px 24px}h1{font-size:38px;line-height:1.15}h2{margin-top:42px;font-size:25px}h3{font-size:19px}.lead{font-size:20px;color:#46614f}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.card,section{background:white;border:1px solid #d9e2da;border-radius:12px;padding:20px}.card strong{display:block;font-size:30px}table{width:100%;border-collapse:collapse;background:white}td,th{padding:13px;text-align:left;vertical-align:top;border-bottom:1px solid #d6dfd7}th{background:#183d2b;color:white}tbody tr:nth-child(even){background:#edf3ee}.table{overflow:auto;border:1px solid #d6dfd7;border-radius:10px}a{color:#165937}small,.muted{color:#57685e}.note{border-left:4px solid #70944a;padding:16px;background:#edf3e7}code{overflow-wrap:anywhere}@media(max-width:600px){main{padding:22px 14px}h1{font-size:30px}td,th{padding:10px;min-width:130px}}@media print{body{background:white}main{max-width:none;padding:0}h2{break-after:avoid}tr{break-inside:avoid}.table{overflow:visible}}</style><main>
<p>REVISÃO TÉCNICA · 26–27/11/2026</p><h1>Encontrar, guardar e mover com menos etapas.</h1><p class="lead">Localização e etiquetas: revisão de uso diário, cadastro completo, consulta, custódia, impressão e velocidade.</p>
<div class="cards"><div class="card"><strong>${apis.filter((a) => a.ok).length}/26</strong>subsistemas pela API publicada</div><div class="card"><strong>${apis.reduce((s, a) => s + a.checks.length, 0)}</strong>cenários de API aprovados</div><div class="card"><strong>7</strong>testes de fila, QR e PDF</div><div class="card"><strong>${num(quant(consultas, 0.5))} s</strong>mediana das consultas à lista</div></div>
<p class="note">${esc(ui.status)}. Publicação: ${esc(publicacao.commit || "em acompanhamento")}. Estes números não significam que todos os clientes terão o mesmo tempo: a rede e o aparelho influenciam o resultado.</p>
<h2>O diferencial entregue</h2><p>Uma localização compartilhada pela equipe, ligada aos documentos existentes, com acessórios acompanhando o item e histórico de quem moveu cada coisa. Para movimentação em volume, basta escolher o destino uma vez e ler as etiquetas: o sistema monta a fila, ignora leituras repetidas e pede uma única confirmação. Se um item tiver sido alterado por outra pessoa, o lote é recusado por inteiro; a equipe não fica com uma movimentação pela metade.</p>
<h2>Processos e quantidade de ações</h2><p>Contagem derivada dos controles antes/depois. Cada escolha de destino conta como uma ação, independentemente dos eventos internos do seletor. Leitura física, tempo de digitação e deslocamento não foram convertidos em segundos fictícios.</p><div class="table"><table><thead><tr><th>Processo</th><th>Antes</th><th>Depois</th><th>Economia</th></tr></thead><tbody>${processos.map((r) => "<tr>" + r.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("")}</tbody></table></div>
<h2>Revisão componente por componente</h2><div class="table"><table><thead><tr><th>Componente</th><th>Antes</th><th>Depois / decisão</th><th>Implementação</th></tr></thead><tbody>${inventario.map((r) => "<tr>" + r.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("")}</tbody></table></div>
<h2>Velocidade: causa e efeito</h2><ul><li><b>Consultas repetidas:</b> os seletores compartilham locais válidos por 60 segundos. Abrir três formulários nesse intervalo não exige três novas consultas à mesma lista. Alterações locais invalidam o cache e o servidor continua conferindo destino, empresa e revisão no salvamento.</li><li><b>Espera após cadastrar local:</b> a confirmação do servidor já devolve o local completo. O formulário usa essa resposta e libera a ação sem aguardar a atualização das outras listas.</li><li><b>Rede lenta durante a leitura:</b> a fila preserva entradas enquanto uma consulta está em andamento. As consultas são sequenciais para evitar rajadas. O usuário precisa aguardar a conferência antes de confirmar o lote.</li><li><b>Peso inicial:</b> movimentação por etiquetas fica em módulo sob demanda. PDF e decodificador de câmera continuam fora da abertura inicial.</li><li><b>Listas longas:</b> paginação por cursor de 50 itens preservada; histórico só é consultado quando aberto.</li></ul>
<h2>Tempos observados na interface</h2><p>O clique até a confirmação inclui a automação e a comunicação com o navegador, portanto é uma amostra operacional e não um benchmark controlado do hardware. Exclui digitação humana. Baseline publicado: salvar item <b>0,519 s</b>, salvar movimentação <b>0,674 s</b>, uma amostra cada. Aberturas do cadastro antigo: <b>3,106 / 0,840 / 0,441 s</b>, com destino habilitado. Depois: <b>0,737 / 0,457 / 0,527 s</b>. Mediana de abertura: <b>0,840 → 0,527 s</b> (37% menor nesta pequena amostra). O pico foi preservado, sem descartá-lo; não é uma promessa de desempenho.</p><div class="table"><table><thead><tr><th>Processo</th><th>Setor / tela</th><th>Tempo observado</th><th>Ponto final medido</th></tr></thead><tbody>${ui.resultados.map((r) => `<tr><td>${esc(r.processo)}</td><td>${esc(r.contexto)}</td><td>${r.segundos.map((n) => num(n) + " s").join(" / ")}</td><td>${esc(r.fim)}</td></tr>`).join("")}</tbody></table></div><p>${esc(ui.coberturaTexto)}</p><p>O lote da assistência levou 1,860 s, acima das outras amostras. Esse resultado foi mantido. A medição do navegador não permite atribuir esse intervalo especificamente ao servidor, aparelho ou transporte da automação. Não foi usada a ausência de falhas no reteste como prova de eliminação de todos os picos.</p>
<h2>API publicada: todos os 26 subsistemas</h2><p>${consultas.length} consultas à lista: mediana ${num(quant(consultas, 0.5))} s; P95 ${num(quant(consultas, 0.95))} s; máximo ${num(Math.max(...consultas))} s. Esta rodada mede o servidor existente; não houve alteração de SQL, portanto não representa um ganho de backend antes/depois.</p><div class="table"><table><thead><tr><th>Subsistema</th><th>Resultado</th><th>Cenários</th><th>Mediana da lista</th><th>Máximo da lista</th></tr></thead><tbody>${linhas}</tbody></table></div>
<h2>O que foi exercitado</h2><p>Cadastro completo e acessórios; repetição de cadastro; consulta por QR em minúsculas; série e local; lote atômico; reenvio sem duplicar histórico; revisão concorrente; saída externa com responsável; entrega e retorno com motivo; correção da identificação preservando custódia; não localizado e recuperação; isolamento de empresas; histórico com autor e estados antes/depois.</p><p>A regressão de banco local também passou nos 26 subsistemas: paginação sem repetição, controle de permissões de funcionário e anônimo, tabelas sem acesso direto, histórico imutável, vínculo com orçamento/OS/estoque e proibição de alterar saldos financeiros pela movimentação física.</p>
<h2>Referências internacionais e engenharia de produção</h2><p>A abordagem de destino único e ações após leitura foi comparada com o <a href="https://help.sortly.com/quick-actions-on-the-sortly-mobile-app">Sortly — Quick Actions</a>. A consulta do bem, localização e itens relacionados foi comparada com <a href="https://help.getmaintainx.com/about-qr-codes-and-barcodes">MaintainX — QR e códigos de barras</a> e <a href="https://help.getmaintainx.com/viewing-assets">ficha de ativos</a>. A separação entre tarefas frequentes e detalhes opcionais segue o princípio de <a href="https://www.nngroup.com/articles/progressive-disclosure/">divulgação progressiva da Nielsen Norman Group</a>. São referências de desenho de fluxo, não alegação de exclusividade comercial.</p><p>Aplicação prática: reduzir procura visual, transportes repetidos entre telas, escolhas repetidas de destino e esperas sem trabalho útil. Conferência antes da gravação e transação atômica reduzem retrabalho. Não foi cronometrado trabalho humano no balcão nem deslocamento físico na empresa.</p>
<h2>Evidências e limites</h2><ul><li><a href="api-resumo.json">Resumo dos 26 perfis</a> e arquivos api-&lt;perfil&gt;.json: cenários e tempos individuais.</li><li><a href="banco-local.json">Regressão local de banco</a> e <a href="testes-unitarios.log">testes de fila, QR e PDF</a>.</li><li><a href="interface.json">Conferência de interface</a> e <a href="publicacao.json">publicação</a>.</li><li>As escritas de validação ocorreram exclusivamente em empresas fictícias ZZ, com itens identificados como QA L26. Nenhuma conta foi paga, nenhum estoque foi baixado e nenhuma OS foi encerrada por esses testes.</li><li>Testes com câmera real, impressora física e celular de baixo desempenho dependem desses equipamentos. Tamanho de tela emulado não equivale a hardware fraco. Não houve medição com rede artificialmente limitada nesta rodada.</li><li>PDFs A4 (11 itens em duas páginas) e térmico (duas etiquetas) gerados pelo renderizador real do sistema e inspecionados após renderização. A automação do navegador não confirmou a conclusão do download; isso não foi contado como impressão física aprovada.</li><li>Primeira execução do roteiro de API precisou corrigir uma premissa do próprio teste: o servidor ordena o resultado por ID. Os itens passaram a ser identificados pelo ID, sem depender da posição do array. As falhas anteriores não foram atribuídas ao produto.</li></ul></main></html>`;
await writeFile(dir + "/relatorio.html", html);
console.log(
  JSON.stringify({
    relatorio: dir + "/relatorio.html",
    componentes: inventario.length,
    perfis: apis.length,
    cenarios: apis.reduce((s, a) => s + a.checks.length, 0),
  }),
);
