import { rpc } from "../lib/rpc";
import { dataSaoPaulo } from "../lib/alertas";

export type PreferenciasLembretes = {
  mostrar_entrada: boolean;
  frequencia: "todos" | "uteis" | "desligado";
  horario: string;
  conferido_em: string | null;
  adiado_ate: string | null;
};
export type PendenciaLembrete = {
  tipo: "financeiro" | "conta_mensal";
  id: string;
  descricao: string;
  natureza: "pagar" | "receber";
  vencimento: string;
  valor_centavos: number | null;
  valor_pendente: boolean;
  origem: string;
};
export type AdiamentoFinanceiro = Pick<
  PendenciaLembrete,
  "tipo" | "id" | "vencimento"
> & { ate: string };
export type LembretesFinanceiros = {
  preferencias: PreferenciasLembretes;
  total: number;
  receber: number;
  pagar: number;
  itens: PendenciaLembrete[];
  adiamentos: AdiamentoFinanceiro[];
};
export const preferenciasPadrao: PreferenciasLembretes = {
  mostrar_entrada: true,
  frequencia: "uteis",
  horario: "17:00",
  conferido_em: null,
  adiado_ate: null,
};
const chaveDemo = (oficina: string, usuario: string) =>
  `patio_lembretes:${oficina}:${usuario}`;
function estadoDemo(oficina: string, usuario: string) {
  const salvo = JSON.parse(localStorage.getItem(chaveDemo(oficina, usuario)) || "null");
  return (salvo || { preferencias: { ...preferenciasPadrao }, adiamentos: [] }) as Pick<
    LembretesFinanceiros,
    "preferencias" | "adiamentos"
  >;
}
export function conferenciaPendente(p: PreferenciasLembretes, agora: Date) {
  const dia = dataSaoPaulo(agora);
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(agora);
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return (
    p.frequencia !== "desligado" &&
    p.conferido_em !== dia &&
    hora >= p.horario.slice(0, 5) &&
    (p.frequencia !== "uteis" || (semana > 0 && semana < 6)) &&
    !(p.adiado_ate && Date.parse(p.adiado_ate) > agora.getTime())
  );
}
export function lembreteAdiado(
  adiamentos: AdiamentoFinanceiro[],
  tipo: string,
  id: string,
  vencimento: string | null,
  agora: Date,
) {
  return adiamentos.some(
    (x) =>
      x.tipo === tipo &&
      x.id === id &&
      x.vencimento === vencimento &&
      Date.parse(x.ate) > agora.getTime(),
  );
}
export function destinoLembrete(
  x: Pick<PendenciaLembrete, "tipo" | "id" | "valor_pendente">,
) {
  return x.tipo === "conta_mensal"
    ? "/financeiro?aba=recorrencias"
    : `/financeiro?aba=contas&titulo=${encodeURIComponent(x.id)}&acao=registrar`;
}
export async function consultarLembretesFinanceiros(
  demo: boolean,
  oficina: string,
  usuario: string,
  pagina = 0,
  signal?: AbortSignal,
): Promise<LembretesFinanceiros> {
  if (!demo)
    return rpc(
      "consultar_lembretes_financeiros",
      { p_oficina: oficina, p_pagina: pagina },
      signal,
    );
  const { consultarFinanceiro } = await import("./financeiro");
  const { consultarContasMensaisPendentes } = await import("./recorrencias");
  const estado = estadoDemo(oficina, usuario),
    agora = new Date(),
    hoje = dataSaoPaulo(agora);
  const itens: PendenciaLembrete[] = [];
  for (let paginaContas = 0; ; paginaContas++) {
    const r = await consultarFinanceiro(true, oficina, {
      inicio: hoje,
      fim: hoje,
      busca: "",
      filtro: "abertos",
      natureza: "",
      pagina: paginaContas,
      os: null,
    });
    for (const t of r.itens)
      if (
        !t.cancelado_em &&
        !t.transferencia_id &&
        t.aberto_centavos > 0 &&
        t.vencimento <= hoje &&
        (!t.provisorio || t.pagamento_combinado)
      )
        itens.push({
          tipo: "financeiro",
          id: t.id,
          descricao: t.descricao,
          natureza: t.natureza,
          vencimento: t.vencimento,
          valor_centavos: t.aberto_centavos,
          valor_pendente: !!t.valor_variavel && !t.valor_confirmado_em,
          origem: t.ordem_servico_id
            ? "Ordem de serviço"
            : t.compra_id
              ? "Compra"
              : "Conta",
        });
    if ((paginaContas + 1) * 30 >= r.total) break;
  }
  for (let paginaMensal = 0; ; paginaMensal++) {
    const r = await consultarContasMensaisPendentes(true, oficina, paginaMensal);
    for (const t of r.itens)
      if (t.vencimento <= hoje)
        itens.push({
          tipo: "conta_mensal",
          id: t.id,
          descricao: t.descricao,
          natureza: t.natureza,
          vencimento: t.vencimento,
          valor_centavos: null,
          valor_pendente: true,
          origem: "Conta mensal",
        });
    if ((paginaMensal + 1) * 30 >= r.total) break;
  }
  const visiveis = itens
    .filter(
      (x) => !lembreteAdiado(estado.adiamentos, x.tipo, x.id, x.vencimento, agora),
    )
    .sort(
      (a, b) =>
        a.vencimento.localeCompare(b.vencimento) ||
        a.tipo.localeCompare(b.tipo) ||
        a.id.localeCompare(b.id),
    );
  return {
    ...estado,
    total: visiveis.length,
    receber: visiveis.filter((x) => x.natureza === "receber").length,
    pagar: visiveis.filter((x) => x.natureza === "pagar").length,
    itens: visiveis.slice(pagina * 20, (pagina + 1) * 20),
  };
}
export async function atualizarLembretesFinanceiros(
  demo: boolean,
  oficina: string,
  usuario: string,
  acao: "configurar" | "conferir" | "adiar" | "adiar_item" | "reativar",
  dados: Record<string, unknown> = {},
) {
  if (!demo)
    return rpc<void>("atualizar_lembretes_financeiros", {
      p_oficina: oficina,
      p_acao: acao,
      p_dados: dados,
    });
  const estado = estadoDemo(oficina, usuario);
  if (acao === "configurar") Object.assign(estado.preferencias, dados);
  if (acao === "conferir") estado.preferencias.conferido_em = dataSaoPaulo();
  if (acao === "adiar" || acao === "adiar_item") {
    const ate = String(dados.ate);
    if (
      !Number.isFinite(Date.parse(ate)) ||
      Date.parse(ate) <= Date.now() ||
      Date.parse(ate) > Date.now() + 366 * 86400000
    )
      throw new Error("Escolha um horário futuro, em até um ano.");
    if (acao === "adiar") estado.preferencias.adiado_ate = ate;
    else {
      estado.adiamentos = estado.adiamentos.filter(
        (x) => !(x.tipo === dados.tipo && x.id === dados.id),
      );
      estado.adiamentos.push({
        tipo: dados.tipo as AdiamentoFinanceiro["tipo"],
        id: String(dados.id),
        vencimento: String(dados.vencimento),
        ate,
      });
      const chaveLidos = `patio_alertas_lidos:${oficina}:${usuario}`;
      const lidos: string[] = JSON.parse(localStorage.getItem(chaveLidos) || "[]");
      const prefixo = `${dados.tipo}:${dados.id}:${dados.vencimento}:`;
      localStorage.setItem(
        chaveLidos,
        JSON.stringify(lidos.filter((chave) => !chave.startsWith(prefixo))),
      );
    }
  }
  if (acao === "reativar") {
    estado.preferencias.adiado_ate = null;
    estado.adiamentos = [];
  }
  localStorage.setItem(chaveDemo(oficina, usuario), JSON.stringify(estado));
}
