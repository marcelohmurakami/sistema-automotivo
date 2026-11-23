import type { Acesso } from "../auth/contexto";
import { rpc } from "../lib/rpc";
import type { ContasClientes, ContaOS } from "../lib/contasClientes";
import { consultarContasClientes } from "./contasClientes";
import { consultarIdentidade, type Identidade } from "./documentos";
import { consultarClienteDemo } from "./clientes";
import { hoje, consultarFinanceiroDemoCompleto } from "./financeiro";
import { lerServicosDemo } from "./servicos";

export type ContaFicha = ContasClientes & { total: number; identidade: Identidade };
export async function consultarContaFicha(
  a: Acesso,
  cliente: string,
  pagina = 0,
  ids?: string[],
): Promise<ContaFicha> {
  const oficina = a.oficina!;
  if (!a.demo)
    return rpc("consultar_conta_financeira_cliente", {
      p_oficina: oficina.id,
      p_cliente: cliente,
      p_pagina: pagina,
      p_ids: ids ?? null,
    });
  let dados: ContasClientes;
  if (!oficina.ramo || oficina.ramo === "automotivo") {
    dados = await consultarContasClientes(true, oficina.id);
  } else {
    const painel = lerServicosDemo(oficina.id);
    const financeiro = consultarFinanceiroDemoCompleto();
    const c = consultarClienteDemo(cliente);
    const dia = hoje();
    const ordens: ContaOS[] = [];
    for (const atendimento of painel.atendimentos.filter(
      (at) =>
        at.cliente_id === cliente &&
        at.situacao !== "cancelado" &&
        at.dados.documento !== "orcamento",
    )) {
      const vinculados = painel.cobrancas
        .filter((v) => v.atendimento_id === atendimento.id)
        .map((v) => v.titulo_id);
      const titulos = financeiro.titulos
        .filter(
          (t) =>
            vinculados.includes(t.id) &&
            t.natureza === "receber" &&
            !t.cancelado_em &&
            !t.provisorio &&
            !t.transferencia_id,
        )
        .map((t) => ({
          id: t.id,
          descricao: t.descricao,
          vencimento: t.vencimento,
          total_centavos: t.valor_centavos,
          pago_centavos: t.baixado_centavos,
          aberto_centavos: Math.max(0, t.aberto_centavos),
        }));
      const aberto = titulos.reduce((n, t) => n + t.aberto_centavos, 0);
      if (!aberto) continue;
      ordens.push({
        id: atendimento.id,
        numero: atendimento.numero || 0,
        cliente_id: cliente,
        chave_cliente: `cliente:${cliente}`,
        cliente: c.nome,
        telefone: c.telefone_e164 || "",
        data: atendimento.data_servico || atendimento.vencimento,
        situacao: atendimento.situacao,
        veiculo:
          painel.objetos.find((o) => o.id === atendimento.objeto_id)?.nome ||
          atendimento.titulo,
        placa: "",
        servicos: atendimento.titulo,
        vencimento: titulos
          .filter((t) => t.aberto_centavos > 0)
          .map((t) => t.vencimento)
          .sort()[0],
        titulos,
        total_centavos: titulos.reduce((n, t) => n + t.total_centavos, 0),
        pago_centavos: titulos.reduce((n, t) => n + t.pago_centavos, 0),
        aberto_centavos: aberto,
        vencido_centavos: titulos
          .filter((t) => t.vencimento < dia)
          .reduce((n, t) => n + t.aberto_centavos, 0),
      });
    }
    dados = { ordens, hoje: dia, consultado_em: new Date().toISOString() };
  }
  const ordens = dados.ordens
    .filter((o) => o.cliente_id === cliente && (!ids || ids.includes(o.id)))
    .sort(
      (a, b) =>
        a.data.localeCompare(b.data) || a.numero - b.numero || a.id.localeCompare(b.id),
    );
  return {
    ...dados,
    ordens: ids ? ordens : ordens.slice(pagina * 50, (pagina + 1) * 50),
    total: ordens.length,
    identidade: {
      ...(await consultarIdentidade(true, oficina.id)),
      nome: oficina.nome,
    },
  };
}
