export type RegistroMigracao = {
  tipo: "cliente" | "catalogo" | "ordem_servico" | "financeiro" | "historico";
  id: string;
  dados: Record<string, unknown>;
};
export type PacoteMigracao = {
  formato: "patio.migracao.v1";
  origem: string;
  registros: RegistroMigracao[];
};
export function lerPacoteMigracao(texto: string): PacoteMigracao {
  if (new TextEncoder().encode(texto).length > 4_000_000)
    throw Error("Use um arquivo de até 4 MB. Divida a migração em lotes.");
  const p = JSON.parse(texto) as PacoteMigracao;
  if (
    p?.formato !== "patio.migracao.v1" ||
    typeof p.origem !== "string" ||
    p.origem.trim().length < 2 ||
    p.origem.length > 100 ||
    !Array.isArray(p.registros) ||
    p.registros.length < 1 ||
    p.registros.length > 500
  )
    throw Error("Use o modelo padrão, com até 500 registros por lote.");
  const ids = new Set<string>();
  for (const r of p.registros) {
    if (
      !r ||
      !["cliente", "catalogo", "ordem_servico", "financeiro", "historico"].includes(
        r.tipo,
      ) ||
      typeof r.id !== "string" ||
      !r.id.trim() ||
      r.id.length > 120 ||
      !r.dados ||
      Array.isArray(r.dados) ||
      typeof r.dados !== "object"
    )
      throw Error("Confira tipo, identificador e dados dos registros.");
    const id = r.tipo + ":" + r.id;
    if (ids.has(id)) throw Error("Há identificadores repetidos no arquivo.");
    ids.add(id);
    if (r.tipo === "financeiro") {
      const v = r.dados.valor_centavos,
        pago = r.dados.pago_centavos ?? 0;
      if (
        !Number.isSafeInteger(v) ||
        Number(v) < 1 ||
        !Number.isSafeInteger(pago) ||
        Number(pago) < 0 ||
        Number(pago) > Number(v)
      )
        throw Error("Confira os valores financeiros em centavos e o total já pago.");
    }
  }
  return p;
}
export const modeloMigracao: PacoteMigracao = {
  formato: "patio.migracao.v1",
  origem: "Sistema anterior",
  registros: [
    {
      tipo: "cliente",
      id: "CLI-1",
      dados: {
        nome: "Cliente de exemplo",
        telefone_e164: "+5516999990000",
        email: "cliente@example.com",
      },
    },
    {
      tipo: "catalogo",
      id: "SERV-1",
      dados: {
        descricao: "Diagnóstico",
        tipo: "service",
        unidade: "un",
        preco_padrao_centavos: 10000,
      },
    },
    {
      tipo: "ordem_servico",
      id: "OS-1",
      dados: {
        cliente_referencia: "CLI-1",
        data_servico: "2026-01-15",
        objeto: "Bem ou local atendido",
        situacao: "concluido",
        total_centavos: 10000,
        itens: [{ descricao: "Diagnóstico", quantidade: 1, valor_centavos: 10000 }],
      },
    },
    {
      tipo: "financeiro",
      id: "CONTA-1",
      dados: {
        natureza: "receber",
        descricao: "Saldo anterior · OS-1",
        valor_centavos: 10000,
        pago_centavos: 4000,
        competencia: "2026-01-15",
        vencimento: "2026-02-15",
        pessoa: "Cliente de exemplo",
      },
    },
    {
      tipo: "historico",
      id: "EVENTO-1",
      dados: {
        documento_referencia: "OS-1",
        data: "2026-01-15",
        descricao: "Registro do sistema anterior",
      },
    },
  ],
};
export function nomeArquivoSeguro(nome: string) {
  return (
    nome
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .replace(/^\.+/, "")
      .slice(0, 120) || "arquivo"
  );
}
export function baixarArquivo(nome: string, conteudo: Blob) {
  const url = URL.createObjectURL(conteudo),
    a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
