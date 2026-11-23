import { rpc } from "../lib/rpc";

import { hoje, type TituloFinanceiro, type BaixaFinanceira } from "./financeiro";
import { consultarClienteDemo } from "./clientes";
import type { OrdemServico } from "./ordensServico";
import type { ContasClientes, ContaOS } from "../lib/contasClientes";

export async function consultarContasClientes(
  demo: boolean,
  oficina: string,
): Promise<ContasClientes> {
  if (!demo) return rpc("consultar_contas_clientes", { p_oficina: oficina });
  const data = hoje();
  const os: OrdemServico[] = JSON.parse(localStorage.getItem("patio_os_v1") || "[]");
  const f: { titulos: TituloFinanceiro[]; baixas: BaixaFinanceira[] } = JSON.parse(
    localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
  );
  const ordens: ContaOS[] = [];
  for (const o of os) {
    if (o.situacao === "cancelled") continue;
    const titulos = f.titulos
      .filter(
        (t) =>
          t.ordem_servico_id === o.id &&
          t.natureza === "receber" &&
          !t.cancelado_em &&
          !t.transferencia_id &&
          !t.provisorio,
      )
      .map((t) => {
        const pago = f.baixas
          .filter((b) => b.titulo_id === t.id)
          .reduce((s, b) => s + (b.estorno_de ? -1 : 1) * b.valor_centavos, 0);
        return {
          id: t.id,
          descricao: t.descricao,
          vencimento: t.vencimento,
          total_centavos: t.valor_centavos,
          pago_centavos: pago,
          aberto_centavos: Math.max(0, t.valor_centavos - pago),
        };
      })
      .sort(
        (a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id),
      );
    const abertos = titulos.filter((t) => t.aberto_centavos > 0);
    if (!abertos.length) continue;
    let c = null;
    if (o.cliente_id) {
      try {
        c = consultarClienteDemo(o.cliente_id);
      } catch {
        /* Snapshot da OS preserva clientes removidos da demonstração. */
      }
    }
    ordens.push({
      id: o.id,
      numero: o.numero,
      cliente_id: o.cliente_id || null,
      chave_cliente: o.cliente_id ? `cliente:${o.cliente_id}` : `os:${o.id}`,
      cliente: c?.nome || o.dados_cliente.nome,
      telefone: c?.telefone_e164 || o.dados_cliente.telefone_e164 || "",
      data: o.data_servico || (o.recebido_em || o.criado_em).slice(0, 10),
      situacao: o.situacao,
      veiculo: o.dados_veiculo.modelo,
      placa: o.dados_veiculo.placa || "",
      servicos: o.itens
        .filter(
          (i) =>
            i.tipo === "service" &&
            i.situacao !== "cancelled" &&
            !(i as typeof i & { removido_em?: string | null }).removido_em,
        )
        .map((i) => i.descricao)
        .join("; "),
      titulos,
      vencimento: abertos[0].vencimento,
      total_centavos: titulos.reduce((s, t) => s + t.total_centavos, 0),
      pago_centavos: titulos.reduce((s, t) => s + t.pago_centavos, 0),
      aberto_centavos: titulos.reduce((s, t) => s + t.aberto_centavos, 0),
      vencido_centavos: titulos
        .filter((t) => t.vencimento < data)
        .reduce((s, t) => s + t.aberto_centavos, 0),
    });
  }
  return {
    hoje: data,
    consultado_em: new Date().toISOString(),
    ordens: ordens.sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero),
  };
}
