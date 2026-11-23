export type TaxaDiagnostico = {
  valor_centavos?: number;
  abater_na_aprovacao?: boolean;
  vencimento?: string;
  abatimento_centavos?: number;
};
export const abatimentoDiagnostico = (
  taxa: TaxaDiagnostico | undefined,
  total: number,
) =>
  taxa?.abater_na_aprovacao
    ? Math.min(Math.max(0, total), taxa.valor_centavos || 0)
    : 0;

export type ComprovanteAutorizacao = {
  versao_id: string;
  nome: string;
  decisao: string;
  grupos: string[];
  total_centavos: number;
  desconto_centavos: number;
  origem: "link" | "portal" | "equipe";
  confirmado_em: string;
  declaracao: string;
  registro_equipe?: string;
  hash_sha256: string;
  taxa_diagnostico?: TaxaDiagnostico;
  documento: {
    numero: number;
    versao?: number;
    empresa: string | { nome: string; ramo?: string };
    cliente: string;
    objeto: string;
    data_servico: string;
    condicoes?: string;
    observacoes?: string;
    resumo?: string;
    total_centavos: number;
    itens: {
      tipo?: string;
      descricao: string;
      quantidade: number;
      preco_centavos: number;
      grupo_servico?: string;
      unidade: string;
    }[];
  };
};

export function taxaDoFormulario(form: FormData): TaxaDiagnostico | undefined {
  if (!form.has("diagnostico_valor")) return undefined;
  const valor = Number(String(form.get("diagnostico_valor") || "0").replace(",", "."));
  if (!Number.isFinite(valor) || valor < 0 || valor > 1000000)
    throw Error("Informe um valor válido para a taxa de diagnóstico.");
  return {
    valor_centavos: Math.round(valor * 100),
    abater_na_aprovacao: form.has("diagnostico_abater"),
    vencimento: String(form.get("diagnostico_vencimento") || ""),
  };
}
