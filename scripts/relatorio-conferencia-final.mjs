import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, relative, join } from "node:path";

const pasta = resolve("output/conferencia-final-20261111");
const ler = async (p, padrao = null) => {
  try { return JSON.parse(await readFile(resolve(pasta, p), "utf8")); } catch { return padrao; }
};
const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const numero = (n) => n.toLocaleString("pt-BR");
async function listar(dir) {
  const saida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory() && !["baseline", "build", "ui-build", "fixture-build", "node_modules"].includes(e.name)) saida.push(...await listar(p));
    else if (e.isFile()) saida.push(p);
  }
  return saida;
}
const antes = await ler("antes.json");
const depois = await ler("depois.json", antes);
const arquivos = await listar(pasta);
const vistos = new Set(), fontesCobertura = [];
for (const p of arquivos.filter(p => /(?:cobertura|resultados)\.json$/.test(p))) {
  const r = await ler(relative(pasta, p));
  const nomes = r?.componentes || r?.componentesExecutados;
  if (Array.isArray(nomes)) { nomes.forEach(n => vistos.add(n)); fontesCobertura.push(relative(pasta, p).replaceAll("\\", "/")); }
}
const regressao = await ler("regressao/resultado.json");
const recorrenciasReteste = await ler("regressao-reteste/banco-recorrencias.json");
const regressaoFinal = (regressao?.resultados || []).map(r => ({...r, sucesso: r.sucesso || (!!recorrenciasReteste?.ok && r.arquivo.endsWith("validate-desempenho-recorrencias.mjs"))}));
const offlineExecucoes = await Promise.all(["bancadas/bancada-documentos-offline/resultado.json", "offline-final/bancada-documentos-offline/resultado.json"].map(p => ler(p)));
const offlinePerfis = new Set(offlineExecucoes.flatMap(r => (r?.resultados || []).map(x => x.perfil)));
const finais = new Map();
const execucoes = [];
for (const sub of ["bancadas", "retestes", "retestes-2", "complementares", "offline-final", "retestes-3", "retestes-4", "retestes-5"]) {
  const r = await ler(sub + "/resultados.json");
  for (const t of r?.resultados || []) {
    const item = { ...t, evidencia: sub + "/" + t.nome + "/execucao.log" };
    execucoes.push(item);
    finais.set(t.nome, item);
  }
}
const controles = await ler("controles/resultado.json", {});
const publicacao = await ler("publicacao.json");
const rastreabilidade = await ler("rastreabilidade.json");
if (rastreabilidade?.ok) finais.set("conferir-rastreabilidade-desempenho", {nome:"conferir-rastreabilidade-desempenho",ok:true,duracaoMs:0,evidencia:"rastreabilidade.json"});
const navegacao = await ler("tempos-resumo.json");
const arquivoTabela = depois.arquivos.map(a => {
  const b = antes.arquivos.find(x => x.arquivo === a.arquivo);
  const executados = a.componentes.filter(n => vistos.has(a.arquivo + "#" + n));
  return { arquivo: a.arquivo, linhas: a.linhas, alterado: !b || a.sha256 !== b.sha256,
    componentes: a.componentes, executados, consultas: a.consultas.length,
    efeitos: a.efeitos.length, listas: a.listas, imagens: a.imagens.length,
    sha256: a.sha256 };
});
const runtimeTotal = depois.arquivos.reduce((n, a) => n + a.componentes.length, 0);
const runtimeVistos = arquivoTabela.reduce((n, a) => n + a.executados.length, 0);
const interfaceArquivos = ["interface/resultados.json", "interface-complementar/resultados.json", "interface-automotivo-reteste/resultados.json", "detalhes-final/resultados.json", "portais/resultados.json", "publicado/resultados.json", "portais-publicado/resultados.json"];
const interfaces = [];
for (const p of interfaceArquivos) { const r = await ler(p); if (r) interfaces.push({ arquivo: p, ...r }); }
const alteracoes = [
  ["Busca e seleção", "A busca local para ao completar as 30 opções visíveis. Os textos são normalizados uma vez por pesquisa e a lista é memorizada; mover pelas setas não repete a varredura.", "src/lib/buscaSelecaoRapida.ts; src/components/SelecaoRapida.tsx"],
  ["Calendário", "Datas e limites de ocupação são calculados uma vez por evento e agrupados por dia. Preservados deslocamento, retorno, margem, eventos sem fim, virada do dia e os filtros.", "src/lib/calendarioAgenda.ts; src/components/agenda/CalendarioAgenda.tsx"],
  ["Salvar e avançar atendimento", "Consultas repetidas são invalidadas uma vez. A gravação continua aguardando o servidor e o detalhe principal; alertas e relatórios secundários atualizam em segundo plano, sem prender o formulário.", "src/lib/atualizarConsultas.ts; src/lib/atualizarQualidade.ts; src/components/DetalhesAtendimento.tsx; src/pages/Servicos.tsx; src/components/servicos/PainelAssistencia.tsx"],
  ["Cadastros vinculados", "Selecionar um cliente ou equipamento já presente na lista não dispara outra consulta pelo mesmo ID. A consulta específica continua disponível para cadastros fora da página. Corrigidas opções duplicadas ao reencontrar uma seleção na página atual, preservando o nome atualizado.", "src/components/servicos/SelecaoOperacao.tsx; src/lib/useCadastrosOrcamento.ts"],
  ["Seções opcionais", "Pacotes de serviços e as listas de estoque e clientes do mini site são consultados somente ao abrir suas seções. Campos permanecem montados para preservar preenchimento e validação.", "src/components/SelecionarPacote.tsx; src/pages/MeuSite.tsx"],
  ["Banco de dados", "Três políticas mantêm as mesmas permissões e avaliam a identidade uma vez por consulta. Um índice comprovadamente duplicado foi retirado, preservando o índice equivalente. Nenhum saldo, pagamento ou OS foi alterado pela migração.", "supabase/migrations/20261111194135_conferencia_rls_e_indice_clientes.sql"],
  ["Erro encontrado na navegação", "Dados e segurança e Histórico importado abriam o conteúdo, mas exibiam Página não encontrada no cabeçalho automotivo. Corrigidos os títulos e a abertura da seção correspondente no menu.", "src/layouts/LayoutSistema.tsx"],
];
const links = (p) => `<a href="${escapar(p)}">${escapar(p)}</a>`;
const tempo = controles.tempos;
const micro = tempo ? Object.entries(tempo).map(([k, t]) => `<tr><td>${k === "seletor" ? "Busca comum em 10.000 opções, primeiros 30 resultados" : "Agrupamento do calendário, 500 eventos / 42 dias"}</td><td>${Number(t.antesMs).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ms</td><td>${Number(t.depoisMs).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ms</td></tr>`).join("") : "";
const resumo = {
  geradoEm: new Date().toISOString(), inventario: arquivoTabela.length,
  funcoesComponentes: runtimeTotal, funcoesExecutadas: runtimeVistos,
  fontesCobertura, arquivos: arquivoTabela, execucoes, ultimasExecucoes: [...finais.values()],
  regressao: regressao?.resultados, regressaoFinal, offlinePerfis: [...offlinePerfis], publicacao,
};
await writeFile(resolve(pasta, "conferencia.json"), JSON.stringify(resumo, null, 2));
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conferência final · Pátio</title><style>
:root{font-family:Arial,Helvetica,sans-serif;color:#172a31;background:#eff3f5;line-height:1.55}*{box-sizing:border-box}body{margin:0}article,details,small,p,li,summary{overflow-wrap:anywhere;min-width:0}main{max-width:1180px;margin:auto;padding:32px 24px}header{background:#142d35;color:white;padding:34px;border-radius:18px}h1{margin:0;font-size:32px}h2{font-size:24px;margin-top:40px}h3{margin-bottom:4px}a{color:#096878;overflow-wrap:anywhere}.meta{color:#c5d8df}.cards{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.cards div{flex:1;min-width:180px;background:white;border:1px solid #cfdbdf;border-radius:12px;padding:18px}.cards strong{font-size:28px;display:block}.nota{padding:18px;background:#e1eff2;border-left:4px solid #168095}.atencao{background:#fff1cf;border-color:#a77300}article,details{background:white;padding:18px 22px;border:1px solid #d2dde1;border-radius:12px;margin:12px 0}summary{cursor:pointer;font-weight:bold}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #d1dde0}th{background:#dfe9ed}tr:nth-child(even){background:#f5f8f9}.scroll{overflow:auto}code{font-size:12px;overflow-wrap:anywhere}small{color:#4b626c}.status{font-weight:bold}.ok{color:#176435}.falha{color:#9b3a27}input{padding:12px;font-size:16px;width:100%;border:1px solid #98adb6;border-radius:8px;margin:14px 0}footer{font-size:13px;margin-top:40px;color:#4b626c}@media(max-width:600px){main{padding:14px}header{padding:24px}h1{font-size:26px}td,th{padding:8px}article,details{padding:14px}}@media print{body{background:white}main{max-width:none;padding:0}header{border-radius:0}input{display:none}details{break-inside:avoid}.scroll{overflow:visible}a{color:inherit;text-decoration:none}th{position:static}}
</style><main><header><p class="meta">PÁTIO · AUDITORIA DE DESEMPENHO E REGRESSÃO</p><h1>Conferência final dos componentes</h1><p>11 e 12 de novembro de 2026 · Automotivo, assistência técnica, manutenção e limpeza</p><p class="meta">Evidências de código, banco e interface. Resultados separados por tipo de verificação.</p></header>
<div class="cards"><div><strong>${numero(arquivoTabela.length)}</strong>arquivos no inventário estático</div><div><strong>${numero(runtimeVistos)} / ${numero(runtimeTotal)}</strong>funções de componentes executadas em navegador</div><div><strong>26</strong>subsistemas contemplados nas baterias</div><div><strong>${numero(regressaoFinal.filter(r => r.sucesso).length)} / ${(regressao?.resultados || []).length}</strong>rotinas aprovadas após reteste</div></div>
<p class="nota">A conferência estática abrange o inventário inteiro. A execução em navegador registra quais componentes realmente renderizaram. Isso não significa testar todas as combinações de dados, permissões, equipamentos e provedores externos. A tabela final mostra os limites de cobertura, sem transformar uma leitura automática em uma afirmação de teste completo.</p>
<h2>O que foi corrigido e otimizado</h2>${alteracoes.map(([titulo, texto, arquivos]) => `<article><h3>${escapar(titulo)}</h3><p>${escapar(texto)}</p><small>${escapar(arquivos)}</small></article>`).join("")}
<h2>Velocidade: resultados medidos</h2><div class="scroll"><table><thead><tr><th>Operação isolada</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${micro}</tbody></table></div><p>Os números acima medem cálculos isolados sob as mesmas condições, não o tempo total de abertura do sistema. ${links("controles/resultado.json")}</p>
<p>As medições de navegação usam limitação de CPU em 4 vezes, rede de 1,6 Mbps e latência de 150 ms, com contas fictícias e o banco conectado. Os arquivos de cada rodada estão na pasta ${links("tempos/")}. Houve variação de rede e concorrência local; não se afirma que todas as telas ficaram uma porcentagem fixa mais rápidas.</p>
<details><summary>Medição de navegação · segunda rodada</summary><p>Medianas da amostra por operação. Quatro famílias representadas; a rota de OS automotiva usa uma família e a de atendimentos usa três. Valores incluem a espera de estabilização do teste. São amostras de laboratório, sem garantia de tempo fixo por tela.</p><div class="scroll"><table><thead><tr><th>Operação</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${(navegacao?.resultados || []).map(r=>`<tr><td>${escapar(r.operacao)}</td><td>${(r.antesMs/1000).toFixed(2)} s</td><td>${(r.depoisMs/1000).toFixed(2)} s</td></tr>`).join("")}</tbody></table></div><p>A primeira rodada, com outras baterias concorrentes, teve resultados mistos. Ambas foram preservadas. Os ganhos de navegação desta amostra não podem ser atribuídos exclusivamente às alterações, pois há cache, rede e variação do computador.</p>${links("tempos-resumo.json")}</details><h2>Testes e evidências</h2><p>Os testes de alteração de dados foram realizados em bancos locais isolados com o esquema do sistema. As contas conectadas usadas nas verificações de interface são empresas fictícias identificadas por ZZ [TESTE 20261019]. O relatório não contém senhas ou chaves.</p>
<div class="scroll"><table><thead><tr><th>Bateria</th><th>Última execução registrada</th><th>Duração</th><th>Evidência</th></tr></thead><tbody>${[...finais.values()].map(r => `<tr><td>${escapar(r.nome)}</td><td class="status ${r.ok ? "ok" : "falha"}">${r.ok ? "Aprovada" : r.timeout ? "Tempo excedido — conferir reteste" : "Falhou — conferir correção/reteste"}</td><td>${(r.duracaoMs / 60000).toFixed(1)} min</td><td>${links(r.evidencia)}</td></tr>`).join("")}</tbody></table></div>
<p>${links("regressao/resultado.json")} · ${links("rls.log")} · ${links("banco-publicacao.json")} · ${links("controles/resultado.json")}</p>
<p>As execuções iniciais com falha foram preservadas. Alguns testes ainda procuravam controles antigos: seletor de datas direto, botão de divisão de participantes visível e editor antigo de custo. Os testes foram ajustados aos fluxos atuais, mantendo as conferências dos valores gravados; os erros não foram escondidos nem tratados como aprovação.</p>
${interfaces.map(r => `<details><summary>Interface: ${escapar(r.arquivo)}</summary><p>Resultado do arquivo: ${r.ok ? "aprovado" : "consultar falhas e reteste"}.</p>${links(r.arquivo)}</details>`).join("")}
<h2>Conferências adicionais</h2><p>Documentos offline: 23 subsistemas passaram na primeira execução; os três restantes passaram na continuação. Os casos incluem criação de OS e orçamento, preços, descontos, impressão sem rede, reabertura, resposta perdida e tentativa repetida sem duplicação. A execução de visitas existentes foi testada separadamente nos 26 subsistemas, incluindo fotos, falha de envio e conflito de versão.</p><p>Atualização do aplicativo: 324 arquivos do cache conferidos; 167 recursos reutilizados. O IndexedDB foi preservado e a versão nova abriu sem internet. Os testes isolados das políticas de acesso passaram em 493 verificações nos 26 subsistemas.</p><p>Regressão: 225 das 226 rotinas passaram na primeira rodada; a rotina de recorrências excedeu o limite de tempo durante carga concorrente e passou quando repetida isoladamente. Os registros das duas execuções foram preservados.</p><p>${links("regressao-reteste/banco-recorrencias.json")} · ${links("bancadas/bancada-documentos-offline/resultado.json")} · ${links("offline-final/bancada-documentos-offline/resultado.json")} · ${links("complementares/bancada-offline-unificado/resultado.json")} · ${links("atualizacao-cache.json")}</p><h2>Publicação</h2><p>${publicacao ? escapar(publicacao.resumo || "Publicação registrada; consultar evidências abaixo.") : "Publicação ainda não registrada neste arquivo. O relatório será atualizado após a conferência."}</p><p>${links("publicacao.json")} · ${links("banco-publicacao.json")}</p>
<h2>Evidências visuais</h2><div class="cards"><div><p>Calendário no celular</p><a href="bancadas/verificar-calendario-layout/assistencia_celulares-semana-390.png"><img style="width:100%;max-height:520px;object-fit:contain" src="bancadas/verificar-calendario-layout/assistencia_celulares-semana-390.png" alt="Calendário da assistência no celular"></a></div><div><p>Formulário de reparo no celular</p><a href="interface/assistencia_celulares-formulario-mobile.png"><img style="width:100%;max-height:520px;object-fit:contain" src="interface/assistencia_celulares-formulario-mobile.png" alt="Formulário da assistência no celular"></a></div></div><h2>Inventário completo, arquivo por arquivo</h2><p>A coluna de execução mostra as funções nomeadas de componentes que rodaram durante esta auditoria. Arquivos de estilos e serviços recebem análise estática, compilação e os testes dos fluxos que os utilizam. A ausência de registro em navegador fica explícita.</p><input id="busca" placeholder="Filtrar por arquivo, componente ou situação" aria-label="Filtrar inventário"><div class="scroll"><table id="inventario"><thead><tr><th>Arquivo</th><th>Revisão</th><th>Execução observada</th><th>Consultas / efeitos</th></tr></thead><tbody>${arquivoTabela.map(a => `<tr><td><code>${escapar(a.arquivo)}</code><br><small>${numero(a.linhas)} linhas</small></td><td>${a.alterado ? "Alterado nesta conferência" : "Inventariado; preservado"}</td><td>${a.componentes.length ? `${a.executados.length}/${a.componentes.length} funções: ${escapar(a.executados.join(", ") || "sem execução registrada")}<br><small>Sem registro nesta rodada: ${escapar(a.componentes.filter(c => !a.executados.includes(c)).join(", ") || "nenhum" )}</small>` : "Sem componente React nomeado"}</td><td>${a.consultas} / ${a.efeitos}</td></tr>`).join("")}</tbody></table></div>
<h2>Critérios preservados e limites</h2><ul><li>Valores, permissões por empresa, confirmação de gravação, descontos, pagamento e idempotência offline não foram relaxados para ganhar velocidade.</li><li>Não foram desmontados campos opcionais preenchidos nem removidas validações de domínio.</li><li>Não foram criados índices indiscriminadamente ou removidos índices apenas porque o contador de uso era baixo.</li><li>O ambiente local não representa milhões de usuários simultâneos. Latência de provedores externos, dispositivo do cliente e volume real precisam de acompanhamento em produção.</li><li>As telas com dados sensíveis ou envio externo foram verificadas com dados fictícios ou serviços simulados; o relatório não alega ter efetuado cobranças, envio de mensagens ou emissão fiscal reais.</li></ul>
<footer>Gerado em ${escapar(new Date().toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo"}))}. Inventário e hashes: ${links("conferencia.json")}. Linha de base preservada em baseline; evidências anteriores não foram sobrescritas.</footer></main><script>document.querySelector('#busca').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase('pt-BR');for(const r of document.querySelectorAll('#inventario tbody tr'))r.hidden=!r.textContent.toLocaleLowerCase('pt-BR').includes(q)})</script></html>`;
await writeFile(resolve(pasta, "relatorio.html"), html);
console.log(JSON.stringify({ arquivos: arquivoTabela.length, runtimeVistos, runtimeTotal, baterias: finais.size, publicacao: !!publicacao }));
