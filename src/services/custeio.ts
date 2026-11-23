import { rpc } from "../lib/rpc";
export const desvincularCusto = (oficina: string, id: string, motivo: string) =>
  rpc("desvincular_custo_servico", { p_oficina: oficina, p_id: id, p_motivo: motivo });
import type { ParametrosCusteio } from "../lib/precificacao";
export const categoriasCusto: Record<string, string> = {
  materiais: "Peças e materiais",
  mao_obra: "Mão de obra",
  terceiros: "Serviços de terceiros",
  deslocamento: "Deslocamento",
  impostos: "Impostos e taxas",
  comissoes: "Comissões",
  garantia: "Garantias e retrabalho",
  outros: "Outros custos",
};
export type FonteCusto = {
  chave: string;
  categoria: string;
  descricao: string;
  valor: number | null;
  financeiro: boolean;
  pendente: boolean;
};
export type RevisaoCusto = {
  minutos: number;
  categorias: Record<string, string>;
  desconsideradas: Record<string, string>;
};
export type CusteioServico = {
  id: string;
  cliente_id: string | null;
  cliente: string;
  titulo: string;
  data: string;
  receita: number;
  situacao: string;
  automotivo: boolean;
  direto: number;
  mao_obra_apropriada: number;
  indiretos: number;
  custo: number;
  margem: number;
  minutos: number;
  fontes: FonteCusto[];
  fontes_pendentes: number;
  assinatura: string;
  conferido: boolean;
  // Antes da primeira conferência, a API também pode retornar um objeto com campos nulos.
  conferencia: {
    dados: RevisaoCusto | null;
    revisao: number | null;
    conferido_em: string | null;
  } | null;
  parametros: ParametrosCusteio | null;
};
export type ParametrosSalvos = {
  mes: string;
  dados: ParametrosCusteio;
  revisao: number;
};
export const buscarDespesasCusteio = (
  oficina: string,
  busca: string,
  signal?: AbortSignal,
) =>
  rpc<
    {
      id: string;
      descricao: string;
      valor_centavos: number;
      disponivel: number;
      ordem_servico_id: string | null;
    }[]
  >("buscar_despesas_custeio", { p_oficina: oficina, p_busca: busca }, signal);
export const consultarParametros = (oficina: string, mes: string) =>
  rpc<ParametrosSalvos | null>("consultar_parametros_custeio", {
    p_oficina: oficina,
    p_mes: mes,
  });
export const salvarParametros = (
  oficina: string,
  mes: string,
  dados: ParametrosCusteio,
  revisao: number | null,
) =>
  rpc("salvar_parametros_custeio", {
    p_oficina: oficina,
    p_mes: mes,
    p_dados: dados,
    p_revisao: revisao,
  });
export const listarCusteio = (
  oficina: string,
  inicio: string,
  fim: string,
  busca: string,
  pagina: number,
  signal?: AbortSignal,
) =>
  rpc<{ total: number; itens: CusteioServico[] }>(
    "listar_custeio_servicos",
    {
      p_oficina: oficina,
      p_inicio: inicio,
      p_fim: fim,
      p_busca: busca,
      p_pagina: pagina,
    },
    signal,
  );
export const consultarCusteio = (oficina: string, id: string, signal?: AbortSignal) =>
  rpc<CusteioServico>(
    "consultar_custeio_servico",
    {
      p_oficina: oficina,
      p_documento: id,
    },
    signal,
  );
export const registrarCusto = (
  oficina: string,
  id: string,
  chave: string,
  dados: {
    categoria: string;
    descricao: string;
    valor: number;
    data: string;
    vencimento: string;
    titulo_id?: string;
    fonte_origem?: string;
  },
) =>
  rpc<string>("registrar_custo_servico", {
    p_oficina: oficina,
    p_documento: id,
    p_chave: chave,
    p_dados: dados,
  });
export const conferirCusteio = (
  oficina: string,
  doc: CusteioServico,
  dados: RevisaoCusto,
) =>
  rpc("conferir_custeio_servico", {
    p_oficina: oficina,
    p_documento: doc.id,
    p_assinatura: doc.assinatura,
    p_revisao: doc.conferencia?.revisao ?? null,
    p_dados: dados,
  });
export const gruposResultado: Record<string, string> = {
  receita: "Receita bruta",
  deducoes: "Deduções da receita",
  custos: "Custos dos serviços e produtos",
  operacionais: "Despesas operacionais",
  receita_financeira: "Receitas financeiras",
  despesa_financeira: "Despesas financeiras",
  tributo_lucro: "Tributos sobre o lucro",
};
export type MapaContabil = {
  categoria: string;
  grupo: string;
  conta_debito: string;
  conta_credito: string;
  revisao: number;
};
export type AjusteResultado = {
  id: string;
  competencia: string;
  categoria: string;
  descricao: string;
  valor: number;
};
export type ApuracaoCompleta = {
  custos_sem_financeiro: number;
  grupos: Record<string, number>;
  receita_liquida: number;
  resultado_bruto: number;
  resultado_operacional: number;
  resultado_liquido: number;
  servicos_revisar: number;
  valores_nao_confirmados: number;
  sem_mapeamento: number;
  assinatura: string;
  conferido: boolean;
  conferencia: { observacao: string; conferido_em: string } | null;
  plano: MapaContabil[];
  ajustes: AjusteResultado[];
  clientes: {
    id: string;
    cliente: string;
    receita: number;
    custo: number;
    margem: number;
    quantidade: number;
    pendentes: number;
  }[];
};
export type LinhaContabil = {
  chave: string;
  data: string;
  descricao: string;
  categoria: string;
  grupo: string;
  valor: number;
  conta_debito: string;
  conta_credito: string;
};
export const consultarApuracao = (
  oficina: string,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
) =>
  rpc<ApuracaoCompleta>(
    "consultar_apuracao_completa",
    {
      p_oficina: oficina,
      p_inicio: inicio,
      p_fim: fim,
    },
    signal,
  );
export const salvarMapaContabil = (oficina: string, dados: MapaContabil) =>
  rpc("salvar_plano_apuracao", {
    p_oficina: oficina,
    p_categoria: dados.categoria,
    p_dados: dados,
    p_revisao: dados.revisao || null,
  });
export const registrarAjuste = (oficina: string, ajuste: AjusteResultado) =>
  rpc("registrar_ajuste_apuracao", {
    p_oficina: oficina,
    p_id: ajuste.id,
    p_dados: ajuste,
  });
export const cancelarAjuste = (oficina: string, id: string, motivo: string) =>
  rpc("cancelar_ajuste_apuracao", { p_oficina: oficina, p_id: id, p_motivo: motivo });
export const conferirApuracao = (
  oficina: string,
  inicio: string,
  fim: string,
  assinatura: string,
  observacao: string,
) =>
  rpc("conferir_apuracao", {
    p_oficina: oficina,
    p_inicio: inicio,
    p_fim: fim,
    p_assinatura: assinatura,
    p_observacao: observacao,
  });
export async function exportarContabilidade(
  oficina: string,
  inicio: string,
  fim: string,
) {
  const linhas: LinhaContabil[] = [];
  let assinatura: string | undefined;
  for (let pagina = 0; pagina <= 10000; pagina++) {
    const d = await rpc<{ total: number; assinatura: string; linhas: LinhaContabil[] }>(
      "exportar_apuracao_contabil",
      { p_oficina: oficina, p_inicio: inicio, p_fim: fim, p_pagina: pagina },
    );
    if (d.total > 100000)
      throw Error(
        "Este período contém mais de 100 mil lançamentos. Escolha um intervalo menor para exportar pelo navegador.",
      );
    if (assinatura && assinatura !== d.assinatura)
      throw Error(
        "Os lançamentos mudaram durante a exportação. Gere o arquivo novamente.",
      );
    assinatura = d.assinatura;
    linhas.push(...d.linhas);
    if (linhas.length >= d.total) return linhas;
    if (!d.linhas.length)
      throw Error("Os lançamentos mudaram durante a exportação. Tente novamente.");
  }
  throw Error("Escolha um período menor para exportar.");
}
export type SimulacaoPreco = {
  id: string;
  nome: string;
  mes: string;
  parametros: ParametrosCusteio;
  entrada: { minutos: number; materiais: number; terceiros: number; outros: number };
  resultado: { preco: number; piso: number; custo: number };
  criado_em: string;
};
export const salvarSimulacao = (
  oficina: string,
  s: Pick<SimulacaoPreco, "id" | "nome" | "mes" | "entrada">,
) =>
  rpc<SimulacaoPreco["resultado"]>("simular_preco_servico", {
    p_oficina: oficina,
    p_mes: s.mes,
    p_entrada: s.entrada,
    p_id: s.id,
    p_nome: s.nome,
  });
export const listarSimulacoes = (oficina: string) =>
  rpc<SimulacaoPreco[]>("listar_simulacoes_precos", { p_oficina: oficina });
