import { lerOrdensDemo } from "../lib/ordensDemo";
import { rpc } from "../lib/rpc";
import { consultarContasMensaisPendentes } from "./recorrencias";

import { consultarFinanceiro, hoje } from "./financeiro";
import type { OrdemServico } from "./ordensServico";
import { dataSaoPaulo, diasAte, marcoAlerta } from "../lib/alertas";

export type Alerta = {
  valor_pendente?: boolean;
  inicio?: string;
  horario_passou?: boolean;
  motivo?: string;
  detalhe?: string;
  chave: string;
  tipo: "financeiro" | "entrega" | "servico" | "agenda" | "contato" | "conta_mensal";
  id: string;
  titulo: string;
  natureza: "pagar" | "receber" | null;
  data: string | null;
  dias: number | null;
  valor_centavos: number | null;
  destino: string;
  pronto: boolean;
  lido: boolean;
};
const chaveLeitura = (oficina: string, usuario: string) =>
  `patio_alertas_lidos:${oficina}:${usuario}`;
const chaveExclusao = (oficina: string, usuario: string) =>
  `patio_alertas_excluidos:${oficina}:${usuario}`;

export async function excluirTodosAlertas(
  demo: boolean,
  oficina: string,
  usuario: string,
  chaves: string[],
) {
  const unicas = [...new Set(chaves)];
  if (!unicas.length) return;
  if (!demo) return rpc("excluir_alertas", { p_oficina: oficina, p_chaves: unicas });
  const armazenamento = chaveExclusao(oficina, usuario);
  const excluidos: string[] = JSON.parse(localStorage.getItem(armazenamento) || "[]");
  localStorage.setItem(
    armazenamento,
    JSON.stringify([...new Set([...excluidos, ...unicas])]),
  );
}

export async function excluirAlerta(
  demo: boolean,
  oficina: string,
  usuario: string,
  chave: string,
) {
  if (!demo) return rpc("excluir_alerta", { p_oficina: oficina, p_chave: chave });
  const armazenamento = chaveExclusao(oficina, usuario);
  const excluidos: string[] = JSON.parse(localStorage.getItem(armazenamento) || "[]");
  localStorage.setItem(
    armazenamento,
    JSON.stringify([...new Set([...excluidos, chave])]),
  );
}
export async function consultarAlertas(
  demo: boolean,
  oficina: string,
  usuario: string,
  financeiro: boolean,
  ordens: boolean,
  servicos = false,
  signal?: AbortSignal,
): Promise<Alerta[]> {
  if (!demo) return rpc("consultar_alertas", { p_oficina: oficina }, signal);
  const lista: Alerta[] = [],
    referencia = hoje();
  const lidos: string[] = JSON.parse(
    localStorage.getItem(chaveLeitura(oficina, usuario)) || "[]",
  );
  const excluidos: string[] = JSON.parse(
    localStorage.getItem(chaveExclusao(oficina, usuario)) || "[]",
  );
  function adicionar(a: Omit<Alerta, "chave" | "lido" | "dias">) {
    const dias = a.data ? diasAte(a.data, referencia) : null;
    const marco = dias === null ? null : marcoAlerta(dias);
    if (marco === null && !a.pronto) return;
    const chave = `${a.tipo}:${a.id}:${a.data ?? "sem-data"}:${marco ?? "pronto"}:${a.pronto}`;
    if (excluidos.includes(chave)) return;
    lista.push({ ...a, dias, chave, lido: lidos.includes(chave) });
  }
  if (financeiro) {
    let paginaMensal = 0;
    do {
      const mensal = await consultarContasMensaisPendentes(true, oficina, paginaMensal);
      for (const p of mensal.itens)
        adicionar({
          tipo: "conta_mensal",
          id: p.id,
          titulo: p.descricao,
          natureza: p.natureza,
          data: p.vencimento,
          valor_centavos: null,
          valor_pendente: true,
          destino: "/financeiro?aba=recorrencias",
          pronto: false,
        });
      if (++paginaMensal * 30 >= mensal.total) break;
    } while (paginaMensal < 10);
    let pagina = 0,
      total: number;
    do {
      const painel = await consultarFinanceiro(true, oficina, {
        inicio: referencia,
        fim: referencia,
        busca: "",
        natureza: "",
        filtro: "abertos",
        pagina,
        os: null,
      });
      total = painel.total;
      for (const t of painel.itens)
        if (!t.provisorio || t.pagamento_combinado)
          adicionar({
            tipo: "financeiro",
            valor_pendente: !!t.valor_variavel && !t.valor_confirmado_em,
            id: t.id,
            titulo: t.descricao,
            natureza: t.natureza,
            data: t.vencimento,
            valor_centavos: t.aberto_centavos,
            destino: `/financeiro?aba=contas&titulo=${t.id}`,
            pronto: false,
          });
      pagina++;
    } while (pagina * 30 < total);
  }
  if (ordens) {
    const os: OrdemServico[] = lerOrdensDemo();
    for (const o of os)
      if (!o.arquivado_em && !["delivered", "cancelled"].includes(o.situacao))
        adicionar({
          tipo: "entrega",
          id: o.id,
          titulo: `OS #${o.numero} · ${o.dados_veiculo.modelo}`,
          natureza: null,
          data: o.entrega_prevista_em
            ? dataSaoPaulo(new Date(o.entrega_prevista_em))
            : null,
          valor_centavos: null,
          destino: `/ordens-servico?os=${o.id}`,
          pronto: o.situacao === "ready",
        });
  }
  if (servicos) {
    const { lerServicosDemo } = await import("./servicos");
    const painel = lerServicosDemo(oficina);
    for (const t of painel.atendimentos.filter(
      (x) =>
        !["concluido", "cancelado"].includes(x.situacao) &&
        (!x.ficha_especialidade || !!x.ficha_especialidade.campos.prazo_servico),
    ))
      adicionar({
        tipo: "servico",
        id: t.id,
        titulo: t.titulo,
        natureza: null,
        data: t.ficha_especialidade
          ? t.ficha_especialidade.campos.prazo_servico
          : t.vencimento,
        valor_centavos: null,
        destino: `/atendimentos?atendimento=${t.id}`,
        pronto: false,
      });
    for (const g of painel.agenda.filter((x) =>
      ["agendado", "confirmado"].includes(x.situacao),
    ))
      adicionar({
        tipo: "agenda",
        id: g.id,
        titulo: `Agendamento · ${painel.atendimentos.find((x) => x.id === g.atendimento_id)?.titulo}`,
        natureza: null,
        data: dataSaoPaulo(new Date(g.inicio)),
        valor_centavos: null,
        destino: `/agenda?reserva=${g.id}`,
        pronto: false,
      });
  }
  return lista.sort(
    (a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity) || a.id.localeCompare(b.id),
  );
}
export async function marcarAlertasLidos(
  demo: boolean,
  oficina: string,
  usuario: string,
  chaves: string[],
) {
  if (!demo)
    return rpc("marcar_alertas_lidos", {
      p_oficina: oficina,
      p_chaves: chaves,
    });
  const chave = chaveLeitura(oficina, usuario);
  localStorage.setItem(
    chave,
    JSON.stringify([
      ...new Set([...JSON.parse(localStorage.getItem(chave) || "[]"), ...chaves]),
    ]),
  );
}
