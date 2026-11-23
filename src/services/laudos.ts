import { rpc } from "../lib/rpc";
import { novoId } from "../lib/uuid";
import {
  novoLaudo,
  validarLaudo,
  type DadosLaudo,
  type Laudo,
  type LinhaLaudo,
  type OrigemLaudo,
  type VersaoLaudo,
} from "../lib/laudos";
import { consultarIdentidade } from "./documentos";
import { consultarOS, listarOS } from "./ordensServico";
import { lerServicosDemo } from "./servicos";
import { consultarDetalhesAtendimento } from "./servicosCompletos";

type LaudoDemo = Omit<Laudo, "versoes"> & { versoes: VersaoLaudo[] };
const chaveDemo = (w: string) => `patio_laudos:${w}`;
function ler(w: string): LaudoDemo[] {
  return JSON.parse(localStorage.getItem(chaveDemo(w)) || "[]");
}
export async function listarLaudos(
  demo: boolean,
  w: string,
  busca: string,
  situacao: string,
  pagina: number,
  origem?: string,
  signal?: AbortSignal,
): Promise<{ itens: LinhaLaudo[]; total: number }> {
  if (!demo)
    return rpc(
      "listar_laudos",
      {
        p_oficina: w,
        p_busca: busca,
        p_situacao: situacao,
        p_pagina: pagina,
        p_origem: origem || null,
      },
      signal,
    );
  const todos = ler(w)
    .filter(
      (l) =>
        (!origem || l.origem_id === origem) &&
        (!situacao || l.situacao === situacao) &&
        `${l.numero} ${l.dados.titulo} ${l.dados.cliente} ${l.dados.bem}`
          .toLocaleLowerCase()
          .includes(busca.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        b.atualizado_em.localeCompare(a.atualizado_em) || b.id.localeCompare(a.id),
    );
  return {
    total: todos.length,
    itens: todos.slice(pagina * 24, pagina * 24 + 24).map((l) => ({
      ...l,
      titulo: l.dados.titulo,
      cliente: l.dados.cliente,
      bem: l.dados.bem,
    })),
  };
}
export async function consultarLaudo(
  demo: boolean,
  w: string,
  id: string,
  signal?: AbortSignal,
): Promise<Laudo> {
  if (!demo) return rpc("consultar_laudo", { p_oficina: w, p_id: id }, signal);
  const l = ler(w).find((x) => x.id === id);
  if (!l) throw Error("Laudo não encontrado.");
  return l;
}
export async function consultarVersaoLaudo(
  demo: boolean,
  w: string,
  id: string,
  versao: number,
  signal?: AbortSignal,
): Promise<VersaoLaudo> {
  if (!demo)
    return rpc(
      "consultar_versao_laudo",
      { p_oficina: w, p_id: id, p_versao: versao },
      signal,
    );
  const v = ler(w)
    .find((x) => x.id === id)
    ?.versoes.find((v) => v.versao === versao);
  if (!v) throw Error("Versão não encontrada.");
  return v;
}
export async function buscarOrigensLaudo(
  demo: boolean,
  w: string,
  busca: string,
  automotivo: boolean,
  signal?: AbortSignal,
): Promise<OrigemLaudo[]> {
  if (!demo)
    return rpc("buscar_origens_laudo", { p_oficina: w, p_busca: busca }, signal);
  if (automotivo)
    return (await listarOS(true, w, busca, "", 0)).itens.map((o) => ({
      id: o.id,
      tipo: "os",
      numero: o.numero,
      cliente: o.dados_cliente.nome,
      bem: o.dados_veiculo.modelo,
    }));
  const p = lerServicosDemo(w);
  return (
    await Promise.all(
      p.atendimentos.map(async (a) => {
        const d = await consultarDetalhesAtendimento(true, w, a.id);
        return {
          id: a.id,
          tipo: "atendimento" as const,
          numero: a.numero || 0,
          cliente: d.cliente.nome,
          bem: d.objeto.nome,
        };
      }),
    )
  )
    .filter((o) =>
      `${o.numero} ${o.cliente} ${o.bem}`
        .toLocaleLowerCase()
        .includes(busca.toLocaleLowerCase()),
    )
    .slice(0, 30);
}
export async function origemLaudo(
  demo: boolean,
  w: string,
  tipo: "os" | "atendimento",
  id: string,
): Promise<{ rotulo: string; dados: Partial<DadosLaudo> }> {
  if (!demo)
    return rpc("consultar_origem_laudo", { p_oficina: w, p_tipo: tipo, p_id: id });
  if (tipo === "os") {
    const o = await consultarOS(true, w, id);
    return {
      rotulo: `OS #${o.numero}`,
      dados: {
        cliente: o.dados_cliente.nome,
        bem: o.dados_veiculo.modelo,
        identificacao: [o.dados_veiculo.placa, o.dados_veiculo.motor]
          .filter(Boolean)
          .join(" · "),
        contato_cliente: o.dados_cliente.telefone_e164 || "",
        solicitacao: o.queixa_cliente || "",
        constatacoes: o.diagnostico || "",
        servicos: o.itens
          .filter((i) => i.situacao === "done")
          .map((i) => `${i.quantidade} × ${i.descricao}`)
          .join("\n"),
      },
    };
  }
  const d = await consultarDetalhesAtendimento(true, w, id);
  return {
    rotulo: `Atendimento #${d.atendimento.numero}`,
    dados: {
      cliente: d.cliente.nome,
      bem: d.objeto.nome,
      identificacao: [
        d.objeto.dados.marca,
        d.objeto.dados.modelo,
        d.objeto.dados.serie,
        d.objeto.dados.imei,
      ]
        .filter(Boolean)
        .join(" · "),
      solicitacao: d.atendimento.titulo,
      servicos: d.itens
        .filter(() => d.atendimento.situacao === "concluido")
        .map((i) => `${i.quantidade} × ${i.descricao}`)
        .join("\n"),
    },
  };
}
export type OperacaoLaudo = {
  id: string;
  revisao: number | null;
  acao: "salvar" | "emitir" | "revisar" | "cancelar";
  dados?: DadosLaudo;
  tipo?: "os" | "atendimento" | null;
  origem?: string | null;
  motivo?: string;
  chave?: string;
};
export async function operarLaudo(
  demo: boolean,
  w: string,
  p: OperacaoLaudo,
): Promise<Laudo> {
  if (p.acao === "salvar") validarLaudo(p.dados!);
  if (!demo)
    return rpc("operar_laudo", {
      p_oficina: w,
      p_id: p.id,
      p_revisao: p.revisao,
      p_acao: p.acao,
      p_dados: p.dados || null,
      p_tipo: p.tipo || null,
      p_origem: p.origem || null,
      p_motivo: p.motivo || "",
      p_chave: p.chave || novoId(),
    });
  const todos = ler(w);
  let l = todos.find((x) => x.id === p.id);
  if (l && l.revisao !== p.revisao)
    throw Error("Este laudo foi alterado. Atualize antes de continuar.");
  if (!l) {
    if (p.acao !== "salvar" || p.revisao !== null)
      throw Error("Salve o rascunho antes de continuar.");
    l = {
      id: p.id,
      numero: Math.max(0, ...todos.map((x) => x.numero)) + 1,
      situacao: "rascunho",
      versao: 0,
      revisao: 1,
      origem_tipo: p.tipo || null,
      origem_id: p.origem || null,
      origem_rotulo:
        p.origem && p.tipo ? (await origemLaudo(true, w, p.tipo, p.origem)).rotulo : "",
      dados: novoLaudo(p.dados),
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      motivo_cancelamento: "",
      versoes: [],
      historico: [],
    };
    todos.push(l);
  }
  if (l.situacao === "cancelado") throw Error("Este laudo está cancelado.");
  if (p.acao === "salvar") {
    if (l.situacao !== "rascunho")
      throw Error("Crie uma nova revisão antes de alterar.");
    l.dados = novoLaudo(p.dados);
  }
  if (p.acao === "emitir") {
    if (l.situacao !== "rascunho") throw Error("Este laudo já foi emitido.");
    validarLaudo(l.dados, true);
    const conteudo = {
      dados: structuredClone(l.dados),
      empresa: await consultarIdentidade(true, w),
      numero: l.numero,
      origem: l.origem_rotulo,
    };
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(conteudo)),
    );
    l.versao++;
    l.versoes.unshift({
      versao: l.versao,
      conteudo,
      hash: Array.from(new Uint8Array(bytes), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join(""),
      emitido_em: new Date().toISOString(),
      autor: "demo",
    });
    l.situacao = "emitido";
  }
  if (p.acao === "revisar" || p.acao === "cancelar") {
    if ((p.motivo || "").trim().length < 3) throw Error("Informe o motivo.");
    if (p.acao === "revisar" && l.situacao !== "emitido")
      throw Error("Somente laudos emitidos podem ganhar uma nova revisão.");
    l.situacao = p.acao === "revisar" ? "rascunho" : "cancelado";
    if (p.acao === "cancelar") l.motivo_cancelamento = p.motivo!;
  }
  l.revisao++;
  l.atualizado_em = new Date().toISOString();
  l.historico.unshift({
    acao: p.acao,
    motivo: p.motivo || "",
    versao: l.versao,
    criado_em: l.atualizado_em,
  });
  localStorage.setItem(chaveDemo(w), JSON.stringify(todos));
  return l;
}
