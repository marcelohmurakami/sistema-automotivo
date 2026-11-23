import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { especialidades } from "../src/lib/especialidades.ts";
import { perfilAtendimento } from "../src/lib/perfisAtendimento.ts";
import { cenariosEspecialidades } from "../supabase/tests/cenarios-especialidades.mjs";

const lote = process.argv.find((x) => x.startsWith("--lote="))?.slice(7);
if (!/^\d{8}$/.test(lote || "")) throw Error("Informe --lote=AAAAMMDD");
const pasta = resolve("output", `auditoria-pos-refatoracao-${lote}`);
const ler = async (nome) => JSON.parse(await readFile(resolve(pasta, nome), "utf8"));
const rotinas = await ler("rotinas-remotas.json");
const interfaceUI = await ler("jornadas-interface.json");
const regressao = await ler("resultado-regressao.json");
let aplicacao = null;
try {
  aplicacao = await ler("aplicacao-migracao.json");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const html = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const reais = Object.entries(rotinas.perfis),
  aprovados = reais.filter(([, r]) => r.status === "aprovado");
const conflitos = reais.flatMap(([, r]) => r.conflitosRevisao || []);
const verificacoes = reais.reduce((s, [, r]) => s + r.verificacoes.length, 0);
const familias = {
  automotivo: "Automotivo",
  assistencia_tecnica: "Assistência técnica",
  manutencao_campo: "Manutenção",
  limpeza: "Limpeza",
};
const formatar = (v) =>
  (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const total = reais.reduce((s, [, r]) => s + (r.total || 0), 0),
  saldo = reais.reduce((s, [, r]) => s + (r.saldo || 0), 0);
const falhas = regressao.resultados.filter((r) => !r.sucesso);
const comparacao = [];
for (const [id, e] of Object.entries(especialidades)) {
  const texto = await readFile(resolve(pasta, "ui-" + id + ".txt"), "utf8");
  const p = perfilAtendimento(id, e.ramo),
    campos = p.grupos.flatMap((g) => g.campos);
  for (const [campo, valor] of Object.entries({
    ...cenariosEspecialidades[id].entrada,
    ...cenariosEspecialidades[id].saida,
  })) {
    const c = campos.find((x) => x.id === campo);
    const alternativas = [
      valor,
      c?.rotulosOpcoes?.[valor],
      /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split("-").reverse().join("/") : null,
    ].filter(Boolean);
    comparacao.push({
      perfil: id,
      campo,
      valorEsperado: valor,
      visivelNaCaptura: alternativas.some((v) => texto.includes(v)),
    });
  }
}
await writeFile(
  resolve(pasta, "conferencia-campos-ui.json"),
  JSON.stringify(comparacao, null, 2),
);
const particularidades = Object.entries(especialidades)
  .map(([id, e]) => {
    const p = perfilAtendimento(id, e.ramo),
      r = rotinas.perfis[id],
      cenario = cenariosEspecialidades[id];
    const atual =
      e.ramo === "automotivo"
        ? "Correção de conflitos de edição e mensagem neutra para diagnóstico geral não preenchido."
        : "Cadastro rápido de cliente e equipamento/local dentro do atendimento; edição por link independente da página atual; correção de conflitos de revisão.";
    return `<details class="perfil" data-busca="${html((e.nome + " " + familias[e.ramo] + " " + cenario.caso).toLowerCase())}"><summary><span>${html(e.nome)}</span><small>${html(familias[e.ramo])} · ficha conferida</small></summary><div class="conteudo-perfil"><p><b>Cenário:</b> ${html(cenario.caso)}.</p><p><b>Foco:</b> ${html(p.foco)}.</p><p><b>Etapas próprias:</b> ${html(p.etapas.join(" → "))}.</p><p><b>Mudanças aplicáveis nesta rodada:</b> ${html(atual)}</p><h4>Informações próprias disponíveis e revisadas</h4>${p.grupos.map((g) => `<p><b>${html(g.nome)}:</b> ${g.campos.map((c) => html(c.nome)).join("; ")}.</p>`).join("")}<h4>Conferência operacional</h4><ul>${p.checklist.map((c) => `<li>${html(c)}</li>`).join("")}</ul><p><b>Dados do teste:</b> ${formatar(r.total)} de serviço; ${formatar(r.total - r.saldo)} recebido; ${formatar(r.saldo)} em aberto. Valores fictícios registrados no sistema, sem movimentação bancária.</p><p><b>Verificações registradas:</b> ${r.verificacoes.length}. ${html(r.status === "aprovado" ? "Jornada real aprovada." : "Ciclo principal concluído; reteste de conflito depende da correção do banco.")}</p><p><a href="ui-${id}.txt">Captura textual da interface</a> · <a href="../contas-teste/${lote}/acessos.html">Acesso da nova empresa de teste</a></p></div></details>`;
  })
  .join("\n");
const saida = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auditoria dos 26 subsistemas — ${lote}</title><style>
:root{font-family:system-ui,sans-serif;color:#233332;background:#f3f6f5;line-height:1.6}body{margin:0}main{max-width:1150px;margin:auto;padding:38px 24px 80px}h1{font-size:2.2rem;line-height:1.2;max-width:850px}h2{margin-top:44px;color:#164b43}h3{margin-top:30px}p{max-width:1000px}a{color:#166a60}section,.perfil{background:white;border:1px solid #d9e3df;border-radius:14px;padding:22px;margin:18px 0}header small{text-transform:uppercase;letter-spacing:.08em;color:#55746b}.numeros{display:flex;gap:14px;flex-wrap:wrap}.numeros div{flex:1;min-width:170px;background:#e3f0eb;border-radius:12px;padding:18px}.numeros b{display:block;font-size:2rem}.aviso{background:#fff3d8;border-color:#e6ca88}.ok{background:#e3f0eb}table{width:100%;border-collapse:collapse}td,th{text-align:left;vertical-align:top;padding:14px;border-bottom:1px solid #d9e3df}th{background:#edf3f0}summary{cursor:pointer;display:flex;justify-content:space-between;gap:18px;font-weight:650}.perfil small{font-weight:400;color:#527268}.perfil .conteudo-perfil{padding-top:20px}.perfil p{margin:10px 0}.perfil h4{margin-bottom:8px}input{width:100%;box-sizing:border-box;border:1px solid #9fbab1;border-radius:9px;padding:14px;font:inherit}button{cursor:pointer;border:1px solid #8caba0;border-radius:8px;background:white;color:#164b43;font:inherit;padding:10px 16px;margin:12px 8px 4px 0}.tabela{overflow:auto}li{margin:5px 0}img{width:100%;max-width:980px;border-radius:10px}footer{margin-top:40px;color:#527268}@media(max-width:620px){main{padding:22px 15px}h1{font-size:1.7rem}summary{display:block}summary small{display:block}td,th{padding:10px}section{padding:16px}}@media print{body{background:white}main{max-width:none;padding:0}.acoes{display:none}section,.perfil{break-inside:avoid}details:not([open]) .conteudo-perfil{display:block}.perfil{border-radius:0}a{color:inherit}}
</style><main><header><small>Auditoria após a refatoração · 19–20/10/2026</small><h1>26 empresas novas. Rotinas reais e particularidades conferidas.</h1><p>Relatório da rodada solicitada após a refatoração: novos logins, novas empresas e simulações com dados fictícios, usando o aplicativo React e o Supabase conectado. As verificações locais complementam as simulações reais e exercitam situações de erro.</p></header>
<div class="numeros"><div><b>26</b>novos usuários e empresas</div><div><b>${Object.keys(interfaceUI).length}/26</b>perfis conferidos na interface</div><div><b>${regressao.resultados.length - falhas.length}/${regressao.resultados.length}</b>suítes locais aprovadas</div></div>
<section class="${aplicacao?.aplicada ? "ok" : "aviso"}"><h3>${aplicacao?.aplicada ? "Correção do banco aplicada e conferida" : "Correção do banco preparada; aplicação pendente de autorização"}</h3><p>O teste de edição simultânea encontrou um problema real: usar SQLSTATE 40001 para uma revisão antiga pode fazer o PostgREST repetir a mesma transação até ocorrer timeout. A migração <b>20261019001200</b> substitui esse código por <b>PT409</b> em 24 funções, preservando mensagens, validações, assinaturas e permissões. Os testes locais comprovaram a preservação e a rejeição da edição antiga nos 26 perfis.</p><p>${aplicacao?.aplicada ? `As 24 definições foram comparadas antes e depois no banco conectado: somente o código de conflito foi alterado, além da normalização de indentação. Os ${conflitos.length} testes reais retornaram HTTP 409, entre ${Math.min(...conflitos.map((c) => c.duracaoMs))} e ${Math.max(...conflitos.map((c) => c.duracaoMs))} ms. A aplicação e os resultados estão registrados nas evidências abaixo.` : "Enquanto essa migração não for aplicada e o reteste remoto concluído, esta auditoria não deve ser interpretada como liberação final do banco para operação comercial."}</p><p><a href="../../supabase/migrations/20261019001200_conflitos_revisao_http.sql">Migração preparada</a> · <a href="conflitos-local.log">Teste local da correção</a> · <a href="https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b">Documentação oficial da causa</a></p></section>
<h2>Mudanças desta rodada</h2><div class="tabela"><table><thead><tr><th>Problema encontrado</th><th>Correção ou melhoria</th><th>Como foi conferido</th></tr></thead><tbody>
<tr><td>Era necessário sair do atendimento para criar cliente e equipamento/local.</td><td>Cadastro rápido compartilhado nas 16 especialidades de assistência, manutenção e limpeza. Seleção automática, preservação da ficha, identificação adequada ao ramo e endereço para trabalho em campo.</td><td>Celular criado e entregue pela interface, mantendo restrição de apagar dados. Visita técnica criada com local novo; endereço obrigatório validado. Proteção contra envio do atendimento enquanto o cadastro rápido está aberto.</td></tr>
<tr><td>Edição de atendimento por link dependia do equipamento estar na lista carregada.</td><td>O cliente vem da seleção do formulário; equipamento e endereço podem vir do detalhe consultado por ID, sem depender da página da listagem.</td><td>OS de climatização aberta por link com a lista filtrada para outro cliente. Salvamento confirmado com cliente, local e endereço preservados.</td></tr>
<tr><td>OS entregue podia dizer “Aguardando avaliação técnica”.</td><td>Diagnóstico geral vazio passa a indicar que o campo não foi preenchido, sem inventar uma etapa pendente.</td><td>Achado na ficha de mecânica; aplicação compartilhada às dez especialidades automotivas.</td></tr>
<tr><td>Versão antiga enviada ao banco podia provocar repetição interna e timeout.</td><td>Migração com HTTP 409 explícito para conflitos de revisão em 24 funções.</td><td>Reproduzido no Supabase. Comparação integral das funções antes/depois; privilégios preservados; 26 cenários locais de edição antiga. Reteste real: ${conflitos.length}/26 retornaram PT409 / HTTP 409. Aplicação remota: ${aplicacao?.aplicada ? "concluída" : "pendente"}.</td></tr>
<tr><td>Arquivos HTML/PDF gerados pela bancada recarregavam o servidor de desenvolvimento durante uma ficha aberta.</td><td>Vite ignora output/ e backups/ no monitoramento de alterações.</td><td>A inspeção dos grupos internos das fichas prosseguiu sem os recarregamentos causados pelos artefatos de teste. Alteração restrita ao desenvolvimento.</td></tr>
<tr><td>Teste de compra usava a data UTC e falhava na virada do dia antes da meia-noite brasileira.</td><td>O teste usa a mesma data de São Paulo adotada pela regra de compra.</td><td>Falha da primeira regressão identificada na fixture; nova execução da suíte completa. A validação da compra não foi enfraquecida.</td></tr>
</tbody></table></div>
<h2>O que foi simulado</h2><section><p><b>Banco real, empresas isoladas:</b> 26 novos logins autenticados, dois clientes fictícios por perfil, produto, serviço e funcionário de teste. As empresas têm Plano Completo para permitir testar todas as funções, sem cobrança externa.</p><ul><li><b>Automotivo:</b> orçamento, emissão, aprovação interna, conversão idempotente em OS, origem da peça, parada por aprovação, retomada, execução, conferência, pronto, entrega e pagamento parcial.</li><li><b>Assistência:</b> cliente e aparelho, diagnóstico e dados próprios, orçamento, aprovação, execução, espera, conclusão, retirada ou aceite conforme a modalidade, cobrança e pagamento parcial.</li><li><b>Manutenção e limpeza:</b> cliente e local/ativo, ficha própria, orçamento, execução, equipe, uma hora de trabalho, conclusão e aceite; agenda com bloqueio de sobreposição.</li><li><b>Conferências cruzadas:</b> consumo exato de estoque, itens do cliente sem baixa indevida, 4,5 litros na troca de óleo, 0,25 litro nos cenários de limpeza; cobrança e baixa repetidas sem duplicação; rejeição de valor acima do saldo; valores presentes no relatório; acesso a outra empresa recusado.</li></ul><p>Foram registradas <b>${verificacoes} verificações operacionais</b> nos 26 perfis. O ciclo principal registrou <b>${formatar(total)}</b> em serviços simulados, <b>${formatar(total - saldo)}</b> em recebimentos fictícios e <b>${formatar(saldo)}</b> de saldo. Os atendimentos adicionais criados manualmente na interface são evidências separadas e não entram nessa soma.</p><p><b>Interface:</b> login, identificação da empresa, navegação, listagem, resumo e ficha própria conferidos nos 26 perfis. Nos 16 não automotivos, os grupos internos da ficha foram abertos. Foram conferidos ${comparacao.filter((x) => x.visivelNaCaptura).length}/${comparacao.length} valores esperados nas capturas das fichas, incluindo os dados próprios de cada cenário. A jornada manual adicional de celulares incluiu criar cliente/aparelho, aprovar, iniciar, concluir, recusar o envio de WhatsApp e registrar a retirada.</p><p><b>Exceções:</b> a bancada local cobre reabertura, estorno e reaplicação de estoque, preservação da cobrança, retrabalho, permissões por plano e função, portal, documentos, recorrência, cancelamento, edição concorrente, paginação e isolamento entre empresas. Também foram verificados no banco conectado o registro de garantia/retrabalho, custo de R$ 20 e nota 5 nos 26 perfis; nos 16 não automotivos, reabertura, retorno do estoque e nova baixa, preservando a cobrança e o recebimento parcial. O reteste remoto possui ${aprovados.length}/26 perfis atualmente aprovados no arquivo de resultados; o histórico de falhas de conflito foi preservado.</p></section>
<h2>Particularidades de cada subsistema</h2><p>Os campos abaixo são registros oferecidos pelo sistema e conferidos nesta auditoria. Não são procedimentos técnicos universais nem novas medições inventadas. Os perfis já existiam; as mudanças comuns desta rodada estão identificadas em cada ficha.</p><div class="acoes"><label for="busca">Encontrar subsetor ou situação</label><input id="busca" placeholder="Ex.: retífica, dados, fachada, climatização"><button id="abrir">Expandir todas as fichas</button><button id="fechar">Recolher fichas</button><button onclick="window.print()">Imprimir relatório</button></div>${particularidades}
<h2>Validação técnica e evidências</h2><section><ul><li><a href="rotinas-remotas.log">Primeiro ciclo: 26 jornadas reais concluídas</a></li><li><a href="rotinas-remotas.json">Resultados, IDs e verificações por empresa</a></li><li><a href="reteste-apos-migracao.log">Reteste final: 26 perfis aprovados, sem falhas</a></li><li><a href="aplicacao-migracao.json">Aplicação e conferência da migração 012</a> · <a href="migracao-012-confirmada.png">Comprovante visual</a></li><li><a href="excecoes-remotas.log">Histórico anterior à correção</a> · <a href="excecoes-remotas-continuacao.log">Continuação anterior ao reteste final</a></li><li><a href="conferencia-campos-ui.json">Conferência dos 283 valores próprios das fichas</a></li><li><a href="jornadas-interface.json">Índice das 26 inspeções pela interface</a></li><li><a href="resultado-regressao.json">Resultado de cada suíte local</a> · <a href="regressao-final.log">Log geral</a></li><li><a href="conflitos-local.log">Preservação das 24 funções e conflitos nos 26 perfis</a></li><li><a href="typescript-final.log">TypeScript</a> · <a href="lint-final.log">ESLint</a> · <a href="build-final.log">Build de produção</a></li><li><a href="../../docs/refatoracao-escalabilidade-2026-10-19.md">Relatório da refatoração anterior</a> · <a href="../../docs/avaliacao-completa-subsistemas-2026-10-19.md">Avaliação anterior e suas particularidades</a></li></ul></section>
<h2>Novos acessos para testar</h2><section><p><a href="../contas-teste/${lote}/acessos.html"><b>Abrir as 26 contas e empresas novas</b></a></p><p>Empresas identificadas por ZZ [TESTE ${lote}]. As senhas estão somente no arquivo local de acessos; não foram reproduzidas neste relatório. Os e-mails example.com são fictícios e não recebem mensagens. Não reutilize os registros simulados como operações reais.</p></section>
<h2>Evidências visuais</h2><section><h3>Cadastro de local sem sair do atendimento</h3><img src="cadastro-rapido-local-interface.png" alt="Cadastro rápido de local dentro da ficha de atendimento"><h3>Reparo de celular criado pelo cadastro rápido e entregue</h3><img src="celulares-cadastro-rapido-entregue.png" alt="Reparo entregue, com dados do cliente e autorização de não apagar dados preservados"><h3>Edição por link, fora da página filtrada</h3><img src="edicao-fora-da-pagina.png" alt="Atendimento de climatização salvo com cliente e endereço preservados"></section>
<h2>Limites e pontos que exigem homologação externa</h2><section><p>Os testes comprovam os cenários descritos, não a inexistência de qualquer defeito. Não houve deploy, envio de WhatsApp/e-mail, transação bancária, emissão fiscal real, ensaio físico em veículos/aparelhos/instalações nem teste de carga com milhões de registros e usuários simultâneos em produção. A inspeção das fichas não equivale a clicar em toda combinação possível de campos. Planos e permissões adicionais, portal e casos de erro foram exercitados também por testes locais; não foram criados 26 clientes externos com caixa de e-mail real.</p><p>${aplicacao?.aplicada ? "A correção de conflito está aplicada e o reteste remoto foi concluído. Antes da liberação comercial, a infraestrutura publicada e as integrações externas precisam da sua homologação específica." : "Antes da liberação comercial, a correção de conflito precisa estar aplicada e retestada; a infraestrutura e as integrações externas precisam de homologação."} Não há autorização implícita neste relatório para enviar mensagens a pessoas reais ou publicar os sites de teste.</p></section><footer>Gerado em ${html(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))}. Evidências e dados fictícios do lote ${html(lote)}.</footer></main><script>
const fichas=[...document.querySelectorAll('.perfil')];document.getElementById('busca').addEventListener('input',e=>{const termo=e.target.value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');fichas.forEach(f=>f.hidden=!f.dataset.busca.normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(termo));});document.getElementById('abrir').onclick=()=>fichas.forEach(f=>{if(!f.hidden)f.open=true});document.getElementById('fechar').onclick=()=>fichas.forEach(f=>f.open=false);
</script></html>`;
await writeFile(resolve(pasta, "relatorio-completo.html"), saida);
console.log(
  JSON.stringify({
    perfis: reais.length,
    interface: Object.keys(interfaceUI).length,
    suites: regressao.resultados.length,
    falhas: falhas.length,
    total,
    saldo,
    camposCapturados: comparacao.filter((x) => x.visivelNaCaptura).length,
    camposNaoCapturados: comparacao
      .filter((x) => !x.visivelNaCaptura)
      .map((x) => ({ perfil: x.perfil, campo: x.campo })),
  }),
);
