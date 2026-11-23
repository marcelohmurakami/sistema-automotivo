/** Leitura local: o arquivo original não é enviado a provedores. Valores em centavos. */
export type LinhaExtratoImportada = {
  identificador: string;
  data: string;
  descricao: string;
  valor: number;
};
export type ExtratoLido = {
  linhas: LinhaExtratoImportada[];
  conta: string;
  banco: string;
  semIdentificador: boolean;
};
export type ColunasExtrato = {
  data: number;
  descricao: number;
  valor: number;
  id: number;
};
export function detectarColunasExtrato(cabecalho: string[]): ColunasExtrato {
  const nomes = cabecalho.map((x) =>
    x
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ""),
  );
  const localizar = (opcoes: string[]) => nomes.findIndex((n) => opcoes.includes(n));
  return {
    data: localizar(["data", "date", "datamovimento", "datamovimentacao"]),
    descricao: localizar(["descricao", "historico", "description", "memo"]),
    valor: localizar(["valor", "valorr", "amount", "montante"]),
    id: localizar([
      "id",
      "identificador",
      "identificadorbancario",
      "identificadordobanco",
      "fitid",
      "transactionid",
    ]),
  };
}
function dataExtrato(s: string) {
  const v = s.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  const iso = br
    ? `${br[3]}-${br[2]}-${br[1]}`
    : /^\d{8}(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.test(v)
      ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
      : v;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso ||
    iso < "2000-01-01"
  )
    throw Error(`Data inválida no extrato: ${s}`);
  return iso;
}
function valorExtrato(s: string) {
  const v = s.trim().replace(/^R\$\s*/, "");
  if (
    !/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(v) &&
    !/^[+-]?\d+(?:\.\d{1,2})?$/.test(v)
  )
    throw Error(`Valor inválido: ${s}. Use valor com sinal (saídas negativas).`);
  const n = Math.round(
    Number(v.includes(",") ? v.replaceAll(".", "").replace(",", ".") : v) * 100,
  );
  if (!Number.isSafeInteger(n) || !n || Math.abs(n) > 1e10)
    throw Error("O extrato contém valor zero ou fora do limite.");
  return n;
}
export function lerCsvExtrato(texto: string): string[][] {
  if (texto.length > 2 * 1024 * 1024) throw Error("Use um arquivo de até 2 MB.");
  const primeira = texto.split(/\r?\n/, 1)[0];
  const sep = primeira.includes(";") ? ";" : primeira.includes("\t") ? "\t" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [],
    campo = "",
    aspas = false,
    fechado = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aspas = false;
          fechado = true;
        }
      } else campo += c;
    } else if (c === '"' && !campo && !fechado) aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
      fechado = false;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
      campo = "";
      fechado = false;
    } else {
      if (fechado || c === '"') throw Error("CSV inválido: confira as aspas.");
      campo += c;
    }
  }
  if (aspas) throw Error("CSV incompleto: falta fechar aspas.");
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  if (linhas.length < 2 || linhas.length > 2001)
    throw Error("Use um CSV com cabeçalho e até 2.000 movimentações.");
  const n = linhas[0].length;
  if (linhas.some((l) => l.length !== n))
    throw Error("O CSV tem linhas com colunas diferentes.");
  return linhas;
}
const textoTag = (s: string, t: string) =>
  (new RegExp(`<${t}\\s*>([^<]*)`, "i").exec(s)?.[1] || "")
    .trim()
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
async function hash(s: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function lerExtrato(
  texto: string,
  colunas?: ColunasExtrato,
): Promise<ExtratoLido> {
  texto = texto.replace(/^\ufeff/, "");
  if (texto.length > 2 * 1024 * 1024) throw Error("Use um arquivo de até 2 MB.");
  let dados: { id: string; data: string; descricao: string; valor: string }[];
  let conta = "",
    banco = "";
  const ofx = /<OFX[\s>]/i.test(texto);
  if (ofx) {
    if (/<!DOCTYPE|<!ENTITY/i.test(texto))
      throw Error("OFX com entidades externas não é aceito.");
    if (/<(?:CORRECTFITID|CORRECTACTION)>/i.test(texto))
      throw Error(
        "O arquivo contém retificações bancárias. Solicite um extrato consolidado para conferir os movimentos corrigidos.",
      );
    if (/<(?:CCACCTFROM|INVACCTFROM)>/i.test(texto))
      throw Error(
        "Use o extrato de uma conta bancária. Faturas de cartão e extratos de investimentos não são aceitos nesta importação.",
      );
    const moedas = [...texto.matchAll(/<CURDEF>\s*([^<\s]+)/gi)].map((x) =>
      x[1].toUpperCase(),
    );
    if (moedas.length !== 1 || moedas[0] !== "BRL")
      throw Error("Importe um único extrato em reais (BRL).");
    if ((texto.match(/<(?:BANKACCTFROM|CCACCTFROM)>/gi) || []).length !== 1)
      throw Error("Importe uma única conta por arquivo.");
    conta = textoTag(texto, "ACCTID");
    banco = textoTag(texto, "BANKID");
    dados = [...texto.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map((m) => ({
      id: textoTag(m[1], "FITID"),
      data: textoTag(m[1], "DTPOSTED"),
      descricao:
        textoTag(m[1], "MEMO") || textoTag(m[1], "NAME") || "Movimentação bancária",
      valor: textoTag(m[1], "TRNAMT"),
    }));
    if (dados.length !== (texto.match(/<STMTTRN>/gi) || []).length)
      throw Error("OFX incompleto. Baixe o extrato novamente.");
  } else {
    const [cab, ...linhas] = lerCsvExtrato(texto);
    const c = colunas;
    if (
      !c ||
      [c.data, c.descricao, c.valor].some(
        (x) => !Number.isInteger(x) || x < 0 || x >= cab.length,
      ) ||
      new Set([c.data, c.descricao, c.valor]).size !== 3 ||
      !Number.isInteger(c.id) ||
      c.id < -1 ||
      c.id >= cab.length
    )
      throw Error("Selecione as colunas de data, descrição e valor.");
    dados = linhas.map((l) => ({
      id: c.id >= 0 ? l[c.id] : "",
      data: l[c.data],
      descricao: l[c.descricao],
      valor: l[c.valor],
    }));
  }
  if (!dados.length || dados.length > 2000)
    throw Error("O arquivo precisa ter de 1 a 2.000 movimentações.");
  const ocorrencias = new Map<string, number>(),
    identificadores = new Set<string>();
  let semIdentificador = false;
  const linhas: LinhaExtratoImportada[] = [];
  for (const d of dados) {
    const data = dataExtrato(d.data),
      valor = valorExtrato(d.valor),
      descricao = d.descricao.trim();
    if (!descricao || descricao.length > 500 || d.id.length > 160)
      throw Error("Confira a descrição e o identificador das movimentações.");
    let identificador = d.id.trim();
    if (identificador) identificador = "id:" + identificador;
    else {
      semIdentificador = true;
      const h = await hash(JSON.stringify([data, valor, descricao]));
      const n = (ocorrencias.get(h) || 0) + 1;
      ocorrencias.set(h, n);
      identificador = `sem-id:${h}:${n}`;
    }
    if (identificadores.has(identificador))
      throw Error(
        "O arquivo repete um identificador bancário. Confira-o antes de importar.",
      );
    identificadores.add(identificador);
    linhas.push({ identificador, data, descricao, valor });
  }
  return { linhas, conta, banco, semIdentificador };
}
