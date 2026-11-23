import { readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { especialidades } from "../src/lib/especialidades.ts";

const pasta = "output/logistica-estoque-20261029";
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const regressao = await json("output/validacao-refatoracao-atual/resultado.json");
if (regressao.resultados.some((r) => !r.sucesso))
  throw new Error("A regressão ainda tem falhas. Aguarde a bateria final.");
const interfaceFinal = await json(pasta + "/novos-fluxos/interface.json");
if (
  interfaceFinal.errors.length ||
  interfaceFinal.errosRpc.length ||
  interfaceFinal.resultados.length < 207
)
  throw new Error("A interface completa precisa passar.");
const devolucoes = await json(pasta + "/devolucoes-catalogos.json");
const migracao = await json(pasta + "/migracao.json");
const audit = await json(pasta + "/auditoria-dependencias-final.json");
if (audit.metadata.vulnerabilities.total)
  throw new Error("Confira a auditoria de dependências.");
const logisticaLog = await readFile(
  "output/validacao-refatoracao-atual/supabase_tests_validate-logistica-estoque.mjs.log",
  "utf8",
);
const estoqueLog = await readFile(
  "output/validacao-refatoracao-atual/supabase_tests_validate-suprimentos.mjs.log",
  "utf8",
);
const logistica = Number(logisticaLog.match(/OK\s+(\d+)\s+verificações/)?.[1]);
if (!logistica) throw new Error("Resultado de logística ausente.");
const totalBancoNovo = logistica + devolucoes.verificacoes + migracao.verificacoes;
await copyFile(
  "output/validacao-refatoracao-atual/resultado.json",
  pasta + "/regressao-final.json",
);
await writeFile(pasta + "/logistica-banco.log", logisticaLog);
await writeFile(pasta + "/suprimentos-regressao.log", estoqueLog);
const migracoes = [];
for (const nome of (await readdir("supabase/migrations"))
  .filter((n) => /^2026102900(09|10|11)00_/.test(n))
  .sort()) {
  const bytes = await readFile("supabase/migrations/" + nome);
  migracoes.push({
    nome,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  });
}
const publicacao = await json("output/auditoria-financeiro-estoque-20261029/publicacao.json").catch(e => { if(e.code !== "ENOENT") throw e; return null; });
const manifesto = {
  geradoEm: new Date().toISOString(),
  situacao:
    publicacao ? "Publicado e conferido; veja o relatório de auditoria financeira e estoque" : "Validado localmente; publicação já autorizada, em preparação",
  migracoes,
  verificacoesBancoNovas: totalBancoNovo,
  verificacoesInterface: interfaceFinal.resultados.length,
  suites: regressao.resultados.length,
  catalogos:
    "Importação CSV; nenhuma integração em tempo real com fornecedor configurada",
  dependencias: audit.metadata.vulnerabilities,
};
await writeFile(pasta + "/manifesto.json", JSON.stringify(manifesto, null, 2));
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const linhas = Object.entries(especialidades)
  .map(
    ([id, e]) =>
      `<tr><td>${esc(e.nome)}</td><td>${interfaceFinal.resultados.some((r) => r.nome === "catalogo-" + id) ? "Aprovado" : "Confira a evidência"}</td><td>Saldos, transferências, devoluções, crédito, catálogo e pedido</td></tr>`,
  )
  .join("");
await writeFile(
  pasta + "/relatorio.html",
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logística do estoque · Validação</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f4;color:#21392d;font:16px/1.65 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:40px 22px}h1{font-size:clamp(28px,4vw,42px);line-height:1.15;margin:12px 0}h2{font-size:23px;margin:36px 0 12px}.intro{max-width:820px;color:#596b60}.tag{display:inline-block;border-radius:30px;background:#e2eddb;padding:5px 12px;font-size:13px;font-weight:700}.pendente{background:#fff3d6;border:1px solid #ddc78f;padding:17px;border-radius:12px}.numeros{display:flex;gap:12px;flex-wrap:wrap;margin:25px 0}.numero{background:white;border:1px solid #dce4d8;border-radius:12px;padding:20px;flex:1 1 190px}.numero strong{display:block;font-size:29px}.numero span,.nota,figcaption{font-size:14px;color:#5e7164}table{width:100%;border-collapse:collapse;background:white;font-size:14px}td,th{padding:15px;text-align:left;vertical-align:top;border-bottom:1px solid #dce4d8}th{background:#e8eee4}.rolar{overflow:auto;border:1px solid #dce4d8;border-radius:12px}a{color:#365f2a}li{margin:7px 0}details{background:white;border:1px solid #dce4d8;padding:18px;border-radius:12px;margin:16px 0}summary{font-weight:700;cursor:pointer}.fotos{display:flex;gap:22px;align-items:start;flex-wrap:wrap}figure{margin:0;flex:1 1 420px}figure img{max-width:100%;border:1px solid #dce4d8;border-radius:10px}figure.mobile{flex:0 1 280px}figcaption{margin:8px 0}code{font-size:12px;overflow-wrap:anywhere}@media(max-width:600px){main{padding:24px 16px}td,th{min-width:160px;padding:12px}.fotos{display:block}figure{margin:20px 0}}@media print{body{background:white}main{padding:0}.fotos{display:none}details{break-inside:avoid}}
</style><main><span class="tag">Validação local · 29/10/2026</span><h1>Etiquetas, depósitos e fornecedores</h1><p class="intro">Controle integrado ao estoque e às compras dos 26 subsetores. Listas em linha, busca limitada, ações diretas e detalhes recolhidos para manter a operação simples.</p><p class="pendente">${publicacao ? `<strong>Publicado no Supabase e na Vercel.</strong> Migrações 20261029000900 a 20261029001100 aplicadas. <a href="../auditoria-financeiro-estoque-20261029/relatorio.html">Confira a auditoria e a validação no sistema publicado.</a>` : "<strong>Publicação autorizada e em preparação.</strong> As migrações 20261029000900 a 20261029001100 e o frontend foram validados localmente."}</p>
<div class="numeros"><div class="numero"><strong>${totalBancoNovo}</strong><span>verificações específicas do banco, incluindo migração de dados anteriores</span></div><div class="numero"><strong>${interfaceFinal.resultados.length}</strong><span>verificações da interface nos 26 subsetores</span></div><div class="numero"><strong>${regressao.resultados.length}/${regressao.resultados.length}</strong><span>suítes locais aprovadas na bateria final</span></div></div>
<h2>O que foi entregue</h2><div class="rolar"><table><thead><tr><th>Recurso</th><th>Onde usar</th><th>Comportamento</th></tr></thead><tbody>
<tr><td>Etiquetas e leitura</td><td>Estoque → Etiquetas / Ler código; seleção de produtos e unidades nos fluxos de compras, reservas e transferências</td><td>PDF em A4 ou etiqueta térmica 80 × 50 mm, código de barras Code 128 e QR. Identificação do produto ou da unidade por série/IMEI. Leitura por câmera, imagem ou leitor que digita o código. Um resultado seleciona o produto imediatamente; códigos ambíguos pedem escolha. A leitura não movimenta o estoque.</td></tr>
<tr><td>Depósitos e veículos</td><td>Estoque → Depósitos e veículos; seleção do local ao receber ou movimentar produtos</td><td>Cadastro de locais, saldos disponíveis e reservados, transferências com histórico, seleção das unidades rastreadas, recebimentos e consumo por local. O total da empresa não muda numa transferência. Estornos restauram o local de origem.</td></tr>
<tr><td>Devolução e crédito</td><td>Compras e reposição → Devoluções e créditos</td><td>Devolução vinculada ao pedido ou avulsa, envio, protocolo, prazo, análise, substituição parcial, crédito, conclusão sem reposição e encerramento. Créditos só abatem contas de compra do mesmo fornecedor; o histórico permite desfazer o uso. Não são registrados pagamentos bancários fictícios.</td></tr>
<tr><td>Catálogo de fornecedor por arquivo</td><td>Compras e reposição → Catálogos dos fornecedores → Importar catálogo CSV</td><td>Modelo para download, prévia e validação de até 500 linhas no formulário. Código, aplicação, marca, preço, disponibilidade e prazo. Vínculo a produto existente ou cadastro com saldo zero; criação de pedido com confirmação. Data e origem do arquivo ficam visíveis.</td></tr>
</tbody></table></div>
<p class="pendente"><strong>Catálogo externo em tempo real permanece pendente.</strong> Você informou que ainda não tem fornecedor para conectar. A importação CSV funciona agora; consulta automática de preços e disponibilidade dependerá do fornecedor e de sua API ou arquivo. O sistema não apresenta a disponibilidade importada como informação ao vivo.</p>
<h2>Cuidados incorporados ao funcionamento</h2><ul><li>O estoque já cadastrado permanece no local “Estoque principal”. A migração preserva saldos, reservas e séries, e cria acompanhamento apenas para devoluções antigas ainda pendentes.</li><li>Transferências não utilizam quantidades reservadas. Série/IMEI precisa pertencer ao produto, à empresa e ao local correto.</li><li>Repetir a mesma operação não duplica entradas, transferências, créditos ou pedidos. Alterações concorrentes pedem atualização da tela.</li><li>O crédito pode quitar integralmente uma compra. A tela distingue o valor original, o abatimento e o que falta pagar. Para cancelar uma conta com crédito, primeiro é necessário estornar sua aplicação.</li><li>Troca do fornecedor pode devolver a mesma série/IMEI sem duplicar a unidade. Crédito ou conclusão sem reposição retira a quantidade correspondente da pendência do pedido.</li><li>A importação do catálogo não aumenta estoque nem altera automaticamente o preço de venda. Arquivos antigos, códigos duplicados e preços inválidos são recusados antes da gravação.</li><li>As novas tabelas têm isolamento por empresa e acesso pelas funções autorizadas. Compras e créditos exigem permissão de gerência; os acessos anteriores do plano continuam sendo respeitados.</li></ul>
<h2>Testes realizados</h2><p>A bancada executou a interface React real no navegador, com as funções SQL reais em PostgreSQL local (PGlite) e empresas fictícias. Foram conferidos os fluxos completos de transferência, devolução, análise, concessão e uso de crédito, estorno, encerramento, importação, vínculo, pedido e recebimento. As verificações do banco incluem consumo e restauração do estoque ao concluir ou reabrir os atendimentos.</p><ul><li>${logistica} verificações de locais, transferências, reservas, etiquetas e consumo nos 26 subsetores.</li><li>${devolucoes.verificacoes} verificações de devoluções, créditos, séries e catálogos nos 26 subsetores.</li><li>${migracao.verificacoes} verificações com registros criados antes das migrações, nos 26 subsetores.</li><li>Regressão das reservas, compras parciais, sugestões, cotações e séries do módulo anterior; evidência anexada.</li><li>Layout verificado em 320, 390, 768 e 1440 pixels, nos temas claro e escuro, sem conteúdo ultrapassando a largura da tela nos cenários testados.</li><li>Etiquetas em PDF renderizadas e inspecionadas; leitura por imagem no formulário e decodificação independente do Code 128 testadas.</li><li>TypeScript, lint, formatação e build verificados. Auditoria final das dependências: nenhuma vulnerabilidade reportada pelo npm na data da execução.</li></ul>
<p class="nota">Limites da validação: ${publicacao ? "o teste publicado é documentado no relatório de auditoria;" : "o teste publicado ainda será realizado;"} impressora física, câmera e leitores USB/Bluetooth reais não foram utilizados. Não existe conexão automática com fornecedor configurada. A bancada não substitui um teste de carga com milhões de registros.</p>
<h2>Visual conferido</h2><div class="fotos"><figure><a href="novos-fluxos/catalogos-claro-1440.png"><img src="novos-fluxos/catalogos-claro-1440.png" alt="Catálogo em linhas no computador"></a><figcaption>Catálogo com preço, disponibilidade e ação direta de pedido.</figcaption></figure><figure class="mobile"><a href="novos-fluxos/depositos-escuro-390.png"><img src="novos-fluxos/depositos-escuro-390.png" alt="Depósitos e veículos em tela de celular"></a><figcaption>Depósitos no celular, com espaçamento e ações visíveis.</figcaption></figure></div>
<p><a href="etiquetas/a4.pdf">Exemplo de etiquetas A4</a> · <a href="etiquetas/termica.pdf">Exemplo de etiqueta térmica</a></p>
<details><summary>Conferência por subsetor</summary><div class="rolar"><table><thead><tr><th>Subsetor</th><th>Fluxo de interface</th><th>Escopo</th></tr></thead><tbody>${linhas}</tbody></table></div></details>
<details><summary>Evidências e migrações</summary><ul><li><a href="regressao-final.json">Bateria final completa</a></li><li><a href="novos-fluxos/interface.json">Interface nos 26 subsetores</a></li><li><a href="logistica-banco.log">Testes de depósitos e etiquetas</a></li><li><a href="devolucoes-catalogos.json">Testes de devoluções e catálogo</a></li><li><a href="migracao.json">Migração com dados anteriores</a></li><li><a href="suprimentos-regressao.log">Regressão de compras e reservas</a></li><li><a href="auditoria-dependencias-final.json">Auditoria de dependências</a></li><li><a href="manifesto.json">Manifesto desta entrega</a></li></ul>${migracoes.map((m) => `<p><code>${m.nome}</code><br><small>SHA-256: <code>${m.sha256}</code></small></p>`).join("")}</details></main></html>`,
);
console.log("Relatório salvo em", pasta + "/relatorio.html");
