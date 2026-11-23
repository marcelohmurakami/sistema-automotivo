import { lerCSV, centavosBR, normalizarColuna } from "./importacao.ts";
export const disponibilidadesCatalogo = {
  disponivel: "Disponível",
  sob_encomenda: "Sob encomenda",
  indisponivel: "Indisponível",
  nao_informado: "Não informado",
} as const;
export type LinhaCatalogoFornecedor = {
  codigo: string;
  descricao: string;
  aplicacao: string;
  marca: string;
  unidade: string;
  preco_centavos: number;
  disponibilidade: keyof typeof disponibilidadesCatalogo;
  quantidade_disponivel: number | null;
  prazo_dias: number | null;
};
export function prepararCatalogoFornecedor(texto: string): LinhaCatalogoFornecedor[] {
  const codigos = new Set<string>();
  return lerCSV(texto).map((r, i) => {
    try {
      const codigo = (r.codigo ?? "").trim().toUpperCase(),
        descricao = r.descricao ?? "",
        unidade = r.unidade || "un";
      if (
        !codigo ||
        codigo.length > 80 ||
        [...codigo].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      )
        throw new Error("Informe um código de até 80 caracteres.");
      if (codigos.has(codigo)) throw new Error(`Código repetido: ${codigo}.`);
      codigos.add(codigo);
      if (descricao.length < 2 || descricao.length > 200)
        throw new Error("Descrição deve ter de 2 a 200 caracteres.");
      if (
        unidade.length > 20 ||
        (r.aplicacao ?? "").length > 1000 ||
        (r.marca ?? "").length > 100
      )
        throw new Error("Aplicação, marca ou unidade muito longa.");
      const disp = normalizarColuna(r.disponibilidade || "nao informado");
      if (!(disp in disponibilidadesCatalogo))
        throw new Error(
          "Disponibilidade: disponível, sob encomenda, indisponível ou não informado.",
        );
      const numerico = (s: string | undefined, max: number, inteiro = false) => {
        if (!s) return null;
        if (!/^\d+(?:[.,]\d{1,3})?$/.test(s))
          throw new Error("Quantidade ou prazo inválido.");
        const n = Number(s.replace(",", "."));
        if (n > max || (inteiro && !Number.isInteger(n)))
          throw new Error("Confira quantidade e prazo.");
        return n;
      };
      return {
        codigo,
        descricao,
        aplicacao: r.aplicacao ?? "",
        marca: r.marca ?? "",
        unidade,
        preco_centavos: centavosBR(r.preco || r.preco_unitario || ""),
        disponibilidade: disp as LinhaCatalogoFornecedor["disponibilidade"],
        quantidade_disponivel: numerico(r.quantidade_disponivel, 1000000),
        prazo_dias: numerico(r.prazo_dias, 365, true),
      };
    } catch (e) {
      throw new Error(
        `Linha ${i + 2}: ${e instanceof Error ? e.message : "Dados inválidos."}`,
        { cause: e },
      );
    }
  });
}
