import { XMLParser, XMLValidator } from "fast-xml-parser";
export const normalizarColuna = (s: string) =>
  s
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
export function lerCSV(texto: string): Record<string, string>[] {
  if (texto.length > 3_000_000)
    throw new Error(
      "Arquivo muito grande. Divida em arquivos de até 500 linhas e 3 MB.",
    );
  texto = texto.replace(/^\uFEFF/, "");
  const cabecalho = texto.split(/\r?\n/, 1)[0];
  const sep =
    (cabecalho.match(/;/g) || []).length > (cabecalho.match(/,/g) || []).length
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    fechado = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (quoted && texto[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        fechado = true;
      } else if (field === "" && !fechado) quoted = true;
      else throw new Error("Aspas inválidas no CSV. Exporte novamente a planilha.");
    } else if (!quoted && (c === sep || c === "\n" || c === "\r")) {
      row.push(field);
      field = "";
      fechado = false;
      if (c !== sep) {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        if (row.some((x) => x.trim())) rows.push(row);
        row = [];
      }
    } else {
      if (fechado)
        throw new Error("Aspas inválidas no CSV. Exporte novamente a planilha.");
      field += c;
    }
  }
  if (quoted) throw new Error("Há um campo com aspas não fechadas.");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 501)
    throw new Error("A planilha deve ter cabeçalho e de 1 a 500 linhas.");
  const cols = rows.shift()!.map(normalizarColuna);
  if (new Set(cols).size !== cols.length || cols.some((c) => !c))
    throw new Error(
      "Confira os nomes das colunas. Não repita nem deixe cabeçalhos vazios.",
    );
  return rows.map((r, n) => {
    if (r.length !== cols.length)
      throw new Error(`Linha ${n + 2}: quantidade de colunas diferente do cabeçalho.`);
    return Object.fromEntries(cols.map((c, i) => [c, r[i].trim()]));
  });
}
export function centavosBR(s: string) {
  const limpo = s.replace(/R\$\s*/g, "").replace(/\s/g, "");
  if (
    !/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(limpo) &&
    !/^\d+(?:\.\d{1,2})?$/.test(limpo)
  )
    throw new Error("Use um preço como 120,50.");
  const v = Number(
    limpo.includes(",") || /^\d{1,3}(?:\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo,
  );
  const c = Math.round(v * 100);
  if (!Number.isSafeInteger(c) || c > 100000000)
    throw new Error("Preço acima do limite permitido.");
  return c;
}
export function prepararCadastros(
  rows: Record<string, string>[],
  tipo: "clientes" | "catalogo",
) {
  return rows.map((r, n) => {
    try {
      if (tipo === "clientes") {
        if (!r.nome || r.nome.length < 2 || r.nome.length > 160)
          throw new Error("Informe nome com 2 a 160 caracteres.");
        let tel = (r.telefone || r.telefone_e164 || "").replace(/\D/g, "");
        if (tel.length === 10 || tel.length === 11) tel = "55" + tel;
        if (tel && !/^[1-9][0-9]{7,14}$/.test(tel))
          throw new Error("Telefone inválido. Inclua DDD.");
        const email = r.email || "";
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new Error("E-mail inválido.");
        return {
          nome: r.nome,
          telefone_e164: tel ? "+" + tel : "",
          email,
          endereco: r.endereco || "",
          observacoes: r.observacoes || "",
          tipo:
            r.tipo === "empresa" || r.tipo === "pessoa_juridica"
              ? "pessoa_juridica"
              : "pessoa_fisica",
        };
      }
      if (!r.descricao || r.descricao.length > 300)
        throw new Error("Informe descrição de até 300 caracteres.");
      const tipoItem = normalizarColuna(r.tipo || "servico");
      if (!["servico", "service", "peca", "produto", "part"].includes(tipoItem))
        throw new Error("Tipo deve ser serviço ou peça.");
      const unidade = r.unidade || "un";
      if (unidade.length > 15) throw new Error("Unidade muito longa.");
      return {
        descricao: r.descricao,
        tipo: ["servico", "service"].includes(tipoItem) ? "service" : "part",
        unidade,
        preco_padrao_centavos: centavosBR(r.preco || "0"),
        favorito: ["sim", "true", "1"].includes(normalizarColuna(r.favorito || "")),
      };
    } catch (e) {
      throw new Error(`Linha ${n + 2}: ${(e as Error).message}`, { cause: e });
    }
  });
}
export type ItemNfe = {
  codigo: string;
  ean: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  custo_centavos: number;
  total_xml_centavos: number;
  produto_id: string;
  preco_venda_centavos: number;
};
export type NotaImportada = {
  chave_nfe: string;
  emitente: { nome: string; documento: string; endereco: string };
  data: string;
  vencimento: string;
  total_xml_centavos: number;
  itens: ItemNfe[];
  avisos: string[];
};
export function lerNFe(xml: string): NotaImportada {
  if (xml.length > 3_000_000) throw new Error("XML maior que 3 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("XML com declaração de entidades não é aceito.");
  if (XMLValidator.validate(xml) !== true)
    throw new Error("XML inválido ou incompleto.");
  const doc = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: false,
    trimValues: true,
  }).parse(xml);
  const nfe = doc.nfeProc?.NFe ?? doc.NFe,
    inf = nfe?.infNFe;
  if (!inf || inf.ide?.mod !== "55")
    throw new Error("Selecione um XML de NF-e modelo 55.");
  const chave = String(inf["@Id"] || "").replace(/^NFe/, "");
  if (!/^\d{44}$/.test(chave)) throw new Error("A chave de acesso da NF-e é inválida.");
  const protocolos = doc.nfeProc?.protNFe?.infProt;
  if (protocolos && protocolos.cStat !== "100" && protocolos.cStat !== "150")
    throw new Error("Este XML não informa autorização de uso da nota.");
  if (protocolos?.chNFe && protocolos.chNFe !== chave)
    throw new Error("A chave do protocolo difere da nota.");
  const numero = (x: unknown) => {
    const s = String(x ?? "");
    if (!/^\d+(?:\.\d+)?$/.test(s))
      throw new Error("Valor ou quantidade inválida na nota.");
    const n = Number(s);
    if (!Number.isFinite(n) || n > 1e10) throw new Error("Valor acima do limite.");
    return n;
  };
  const linhas = Array.isArray(inf.det) ? inf.det : [inf.det];
  if (linhas.length > 100 || !linhas[0])
    throw new Error("Importe notas com 1 a 100 produtos.");
  const itens: ItemNfe[] = linhas.map((d: Record<string, Record<string, string>>) => {
    const p = d.prod;
    const q = numero(p.qCom),
      c = Math.round(numero(p.vUnCom) * 100);
    if (
      q <= 0 ||
      q > 1000000 ||
      Math.abs(q * 1000 - Math.round(q * 1000)) > 0.00001 ||
      c > 100000000
    )
      throw new Error("Confira as quantidades: são aceitas até 3 casas decimais.");
    return {
      codigo: p.cProd || "",
      ean: p.cEAN || "",
      descricao: p.xProd,
      unidade: p.uCom,
      quantidade: q,
      custo_centavos: c,
      total_xml_centavos: Math.round(numero(p.vProd) * 100),
      produto_id: "",
      preco_venda_centavos: 0,
    };
  });
  const data = String(inf.ide.dhEmi || inf.ide.dEmi || "").slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
    !Number.isFinite(Date.parse(data)) ||
    new Date(data).toISOString().slice(0, 10) !== data
  )
    throw new Error("Data de emissão inválida.");
  const total = Math.round(numero(inf.total?.ICMSTot?.vNF) * 100),
    soma = itens.reduce((s, i) => s + Math.round(i.quantidade * i.custo_centavos), 0);
  const avisos = [
    "Confira fornecedor, unidades e produtos antes de importar. A leitura do XML não verifica sua autenticidade na SEFAZ.",
  ];
  if (soma !== total)
    avisos.push(
      "O total da nota difere dos produtos (frete, impostos, descontos ou arredondamento). Ajuste os custos da conferência ou registre a diferença separadamente no financeiro.",
    );
  if (!protocolos)
    avisos.push(
      "Este arquivo não contém protocolo de autorização. Confirme a autorização da nota antes de usar.",
    );
  const endereco = inf.emit.enderEmit || {};
  return {
    chave_nfe: chave,
    emitente: {
      nome: inf.emit.xNome,
      documento: inf.emit.CNPJ || inf.emit.CPF || "",
      endereco: [
        endereco.xLgr,
        endereco.nro,
        endereco.xBairro,
        endereco.xMun,
        endereco.UF,
      ]
        .filter(Boolean)
        .join(", "),
    },
    data,
    vencimento: data,
    total_xml_centavos: total,
    itens,
    avisos,
  };
}
