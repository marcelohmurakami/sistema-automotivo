import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";
import { supabase } from "../lib/supabase";

import { dataSaoPaulo, proximoMes, vencimentoMensal } from "../lib/alertas";

export type ContaRecorrente = {
  valor_variavel?: boolean;
  id: string;
  descricao: string;
  natureza: "pagar" | "receber";
  categoria: string;
  valor_centavos: number;
  dia: number;
  inicio: string;
  fim: string | null;
  ativa: boolean;
  revisao: number;
  proximo_mes: string;
};
export type ContaMensalPendente = {
  id: string;
  recorrencia_id: string;
  descricao: string;
  natureza: "pagar" | "receber";
  categoria: string;
  competencia: string;
  vencimento: string;
  titulo_id?: string | null;
};
const chavePendentes = "patio_contas_mensais_pendentes_v1";
/** Busca a competência exata; nunca confunde contas de mesmo nome nem paga outro mês. */
export async function consultarPagamentoMensal(
  demo: boolean,
  oficina: string,
  recorrencia: string,
) {
  const competencia = dataSaoPaulo().slice(0, 7) + "-01";
  if (demo) {
    gerarRecorrenciasDemo();
    const dados = JSON.parse(
      localStorage.getItem("patio_financeiro_v1") || '{"titulos":[]}',
    );
    const titulo = dados.titulos.find(
      (t: { recorrencia_id?: string; competencia: string; cancelado_em?: string }) =>
        t.recorrencia_id === recorrencia &&
        t.competencia === competencia &&
        !t.cancelado_em,
    );
    return {
      titulo: titulo?.id as string | undefined,
      pendente: lerPendentes().find(
        (p) =>
          p.recorrencia_id === recorrencia &&
          p.competencia === competencia &&
          !p.titulo_id,
      ),
    };
  }
  await rpc("sincronizar_contas_recorrentes", { p_oficina: oficina });
  const titulo = await supabase!
    .from("titulos_financeiros")
    .select("id")
    .eq("oficina_id", oficina)
    .eq("recorrencia_id", recorrencia)
    .eq("competencia", competencia)
    .is("cancelado_em", null)
    .maybeSingle();
  if (titulo.error) throw titulo.error;
  if (titulo.data) return { titulo: titulo.data.id as string, pendente: null };
  // A tabela de valores pendentes é privada; use a RPC com as verificações de acesso.
  for (let pagina = 0; ; pagina++) {
    const lista = await consultarContasMensaisPendentes(false, oficina, pagina);
    const pendente = lista.itens.find(
      (p) => p.recorrencia_id === recorrencia && p.competencia === competencia,
    );
    if (pendente) return { titulo: undefined, pendente };
    if ((pagina + 1) * 30 >= lista.total) return { titulo: undefined, pendente: null };
  }
}
function lerPendentes(): ContaMensalPendente[] {
  return JSON.parse(localStorage.getItem(chavePendentes) || "[]");
}
export async function consultarContasMensaisPendentes(
  demo: boolean,
  oficina: string,
  pagina = 0,
): Promise<{ itens: ContaMensalPendente[]; total: number }> {
  if (!demo)
    return rpc("consultar_contas_mensais_pendentes", {
      p_oficina: oficina,
      p_pagina: pagina,
    });
  gerarRecorrenciasDemo();
  const itens = lerPendentes()
    .filter((p) => !p.titulo_id)
    .sort(
      (a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id),
    );
  return { itens: itens.slice(pagina * 30, pagina * 30 + 30), total: itens.length };
}
export async function informarValorContaMensal(
  demo: boolean,
  oficina: string,
  id: string,
  valor: number,
): Promise<string> {
  if (!Number.isSafeInteger(valor) || valor < 1 || valor > 10000000000)
    throw new Error("Informe o valor desta conta.");
  if (!demo)
    return rpc("informar_valor_conta_mensal", {
      p_oficina: oficina,
      p_id: id,
      p_valor: valor,
    });
  const pendentes = lerPendentes(),
    p = pendentes.find((x) => x.id === id);
  if (!p) throw new Error("Conta mensal não encontrada.");
  const d = JSON.parse(
    localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
  );
  if (p.titulo_id) {
    if (
      d.titulos.some(
        (t: { id: string; valor_centavos: number; cancelado_em?: string }) =>
          t.id === p.titulo_id && t.valor_centavos === valor && !t.cancelado_em,
      )
    )
      return p.titulo_id;
    throw new Error(
      "O valor já foi informado. Abra a conta no financeiro para alterá-lo.",
    );
  }
  const titulo = novoId();
  d.titulos.push({
    ...p,
    id: titulo,
    valor_centavos: valor,
    valor_variavel: true,
    valor_confirmado_em: new Date().toISOString(),
    pessoa: "",
    observacoes: "",
    ordem_servico_id: null,
    automatico: false,
    custos_revisados: false,
    cancelado_em: null,
    revisao: 1,
    baixado_centavos: 0,
    aberto_centavos: valor,
  });
  p.titulo_id = titulo;
  localStorage.setItem("patio_financeiro_v1", JSON.stringify(d));
  localStorage.setItem(chavePendentes, JSON.stringify(pendentes));
  return titulo;
}
const chave = "patio_recorrencias_v1";
function ler(): ContaRecorrente[] {
  return JSON.parse(localStorage.getItem(chave) || "[]");
}
export async function consultarRecorrencias(
  demo: boolean,
  oficina: string,
): Promise<ContaRecorrente[]> {
  return demo ? ler() : rpc("consultar_contas_recorrentes", { p_oficina: oficina });
}
export function gerarRecorrenciasDemo() {
  const regras = ler();
  const pendentes = lerPendentes();
  const d = JSON.parse(
    localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
  );
  const limite = new Date(Date.parse(dataSaoPaulo()) + 5 * 86400000)
    .toISOString()
    .slice(0, 10);
  for (const r of regras.filter((r) => r.ativa)) {
    let mes = r.proximo_mes;
    while (mes <= limite && (!r.fim || mes <= r.fim)) {
      const vence = vencimentoMensal(mes, r.dia);
      if (vence > limite) break;
      if (
        vence >= r.inicio &&
        (!r.fim || vence <= r.fim) &&
        !d.titulos.some(
          (t: { recorrencia_id?: string; competencia: string }) =>
            t.recorrencia_id === r.id && t.competencia === mes,
        )
      ) {
        if (r.valor_variavel && r.valor_centavos === 0) {
          if (
            !pendentes.some((p) => p.recorrencia_id === r.id && p.competencia === mes)
          )
            pendentes.push({
              id: novoId(),
              recorrencia_id: r.id,
              competencia: mes,
              vencimento: vence,
              descricao: r.descricao,
              natureza: r.natureza,
              categoria: r.categoria,
            });
        } else
          d.titulos.push({
            id: novoId(),
            natureza: r.natureza,
            descricao: r.descricao,
            categoria: r.categoria,
            valor_centavos: r.valor_centavos,
            competencia: mes,
            vencimento: vence,
            recorrencia_id: r.id,
            valor_variavel: r.valor_variavel ?? false,
            valor_confirmado_em: null,
            pessoa: "",
            observacoes: "",
            ordem_servico_id: null,
            automatico: false,
            custos_revisados: false,
            cancelado_em: null,
            revisao: 1,
            baixado_centavos: 0,
            aberto_centavos: r.valor_centavos,
          });
      }
      mes = proximoMes(mes);
    }
    r.proximo_mes = mes;
  }
  localStorage.setItem("patio_financeiro_v1", JSON.stringify(d));
  localStorage.setItem(chave, JSON.stringify(regras));
  localStorage.setItem(chavePendentes, JSON.stringify(pendentes));
}
export async function salvarRecorrencia(
  demo: boolean,
  oficina: string,
  r: ContaRecorrente,
) {
  if (!demo)
    return rpc("salvar_conta_recorrente", {
      p_oficina: oficina,
      p_id: r.id,
      p_dados: r,
      p_revisao: r.revisao,
    });
  const regras = ler(),
    anterior = regras.find((x) => x.id === r.id);
  if (anterior && anterior.revisao !== r.revisao)
    throw new Error("Recorrência alterada. Atualize a tela.");
  if (
    !Number.isSafeInteger(r.valor_centavos) ||
    r.valor_centavos < (r.valor_variavel ? 0 : 1) ||
    r.valor_centavos > 10000000000 ||
    !Number.isInteger(r.dia) ||
    r.dia < 1 ||
    r.dia > 31 ||
    r.descricao.trim().length < 3 ||
    !r.inicio ||
    r.inicio < "2000-01-01" ||
    (r.fim && r.fim < r.inicio)
  )
    throw new Error("Confira descrição, valor, dia e período da recorrência.");
  if (anterior && anterior.inicio !== r.inicio)
    throw new Error("O início da recorrência não pode ser alterado.");
  const proximo = anterior?.proximo_mes ?? r.inicio.slice(0, 7) + "-01";
  const registro = {
    ...r,
    revisao: r.revisao + 1,
    proximo_mes:
      anterior && !anterior.ativa && r.ativa
        ? [proximo, dataSaoPaulo().slice(0, 7) + "-01"].sort().at(-1)!
        : proximo,
  };
  localStorage.setItem(
    chave,
    JSON.stringify([...regras.filter((x) => x.id !== r.id), registro]),
  );
  gerarRecorrenciasDemo();
}
