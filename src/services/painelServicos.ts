import { rpc } from "../lib/rpc";
import { resumoOperacao } from "../lib/operacaoServicos";
import { etapaPainelAssistencia } from "../lib/fluxoAssistencia";
import { lerDemo } from "./clientes";
import { diaLocal, lerServicosDemo, somarDias, type PainelServicos } from "./servicos";
import type { Auxiliares } from "./orcamentos";
import type { ObjetoServico, AtendimentoServico } from "./servicos";

export function buscarSelecaoServicos<T extends "objetos" | "atendimentos">(
  oficina: string,
  demo: boolean,
  tipo: T,
  busca = "",
  cliente = "",
  id = "",
  signal?: AbortSignal,
): Promise<
  (T extends "objetos"
    ? ObjetoServico
    : AtendimentoServico & { cliente_nome?: string })[]
> {
  if (!demo)
    return rpc(
      "buscar_selecao_servicos",
      {
        p_oficina: oficina,
        p_tipo: tipo,
        p_busca: busca,
        p_cliente: cliente || null,
        p_id: id || null,
      },
      signal,
    );
  const p = lerServicosDemo(oficina),
    porCliente = new Map(lerDemo().map((c) => [c.id, c.nome]));
  const itens =
    tipo === "objetos"
      ? p.objetos
      : p.atendimentos.map((a) => ({
          ...a,
          cliente_nome: porCliente.get(a.cliente_id),
        }));
  return Promise.resolve(
    itens
      .filter(
        (x) =>
          (!id || x.id === id) &&
          (!cliente || x.cliente_id === cliente) &&
          (!busca || JSON.stringify(x).toLowerCase().includes(busca.toLowerCase())),
      )
      .slice(0, 30),
  ) as ReturnType<typeof buscarSelecaoServicos<T>>;
}

export type CursorServico = { id: string; nome?: string; criado_em?: string };
export type FiltrosServicos = {
  tela: "objetos" | "atendimentos" | "agenda";
  busca?: string;
  documento?: string;
  fluxo?: string;
  cliente?: string;
  objeto?: string;
  reserva?: string;
  estado?: string;
  subsetor?: string;
  etapa?: string;
  foco?: string;
  inicio?: string;
  fim?: string;
};
export type PaginaServicos = PainelServicos & {
  clientes: Auxiliares["clientes"];
  proximo: CursorServico | null;
};
export type ResumoServicos = Record<
  | "objetos"
  | "clientes"
  | "abertos"
  | "pendencias"
  | "agendamentosHoje"
  | "espera"
  | "atrasados"
  | "retirada"
  | "retornos"
  | "aceite",
  number
>;
export const painelVazio: PaginaServicos = {
  objetos: [],
  atendimentos: [],
  agenda: [],
  recursos: [],
  cobrancas: [],
  clientes: [],
  proximo: null,
};

export async function consultarResumoServicos(
  oficina: string,
  demo: boolean,
  subsetor: string,
  signal?: AbortSignal,
): Promise<ResumoServicos> {
  if (!demo)
    return rpc(
      "resumo_operacao_servicos",
      { p_oficina: oficina, p_subsetor: subsetor },
      signal,
    );
  const p = lerServicosDemo(oficina),
    hoje = diaLocal(new Date());
  const operacao = p.atendimentos
    .filter((a) => !subsetor || a.ficha_especialidade?.especialidade === subsetor)
    .map((a) => resumoOperacao(a, hoje, p.agenda));
  return {
    objetos: p.objetos.filter((o) => !o.arquivado).length,
    clientes: lerDemo().filter((c) => !c.arquivado_em).length,
    abertos: operacao.filter((s) => s.aberto).length,
    pendencias: operacao.filter(
      (s) => s.aberto && s.prazo && s.prazo <= somarDias(hoje, 5),
    ).length,
    agendamentosHoje: p.agenda.filter(
      (g) =>
        diaLocal(g.inicio) === hoje && !["cancelado", "faltou"].includes(g.situacao),
    ).length,
    espera: operacao.filter((s) => s.espera).length,
    atrasados: operacao.filter((s) => s.atrasados).length,
    retirada: operacao.filter((s) => s.retirada).length,
    retornos: operacao.filter((s) => s.retornos).length,
    aceite: operacao.filter((s) => s.aceite).length,
  };
}

export async function consultarPaginaServicos(
  oficina: string,
  demo: boolean,
  filtros: FiltrosServicos,
  cursor: CursorServico | null,
  signal?: AbortSignal,
): Promise<PaginaServicos> {
  if (!demo)
    return rpc(
      "pagina_servicos",
      { p_oficina: oficina, p_filtros: filtros, p_apos: cursor },
      signal,
    );
  const p = lerServicosDemo(oficina),
    clientes = lerDemo(),
    hoje = diaLocal(new Date());
  const porCliente = new Map(clientes.map((c) => [c.id, c.nome])),
    porObjeto = new Map(p.objetos.map((o) => [o.id, o]));
  const busca = (filtros.busca || "").toLocaleLowerCase();
  const objetos = p.objetos.filter(
    (o) =>
      (!filtros.cliente || o.cliente_id === filtros.cliente) &&
      `${o.nome} ${porCliente.get(o.cliente_id)} ${JSON.stringify(o.dados)}`
        .toLocaleLowerCase()
        .includes(busca),
  );
  const atendimentos = p.atendimentos.filter((a) => {
    const s = resumoOperacao(a, hoje, p.agenda);
    return (
      (!filtros.documento ||
        a.dados.documento === filtros.documento ||
        (!a.dados.documento && a.situacao === "orcamento")) &&
      (!filtros.fluxo || etapaPainelAssistencia(a) === filtros.fluxo) &&
      (!filtros.estado || a.situacao === filtros.estado) &&
      (!filtros.cliente || a.cliente_id === filtros.cliente) &&
      (!filtros.subsetor ||
        a.ficha_especialidade?.especialidade === filtros.subsetor) &&
      (!filtros.objeto || a.objeto_id === filtros.objeto) &&
      (!filtros.etapa ||
        (a.ficha_especialidade?.etapa || "") ===
          (filtros.etapa === "sem_etapa" ? "" : filtros.etapa)) &&
      (!filtros.foco ||
        (filtros.foco === "pendencias"
          ? s.aberto && s.prazo && s.prazo <= somarDias(hoje, 5)
          : s[filtros.foco as "espera"])) &&
      `${a.numero || ""} ${a.titulo} ${porCliente.get(a.cliente_id)} ${JSON.stringify(porObjeto.get(a.objeto_id))} ${JSON.stringify(a.ficha_especialidade?.campos)}`
        .toLocaleLowerCase()
        .includes(busca)
    );
  });
  const itens = filtros.tela === "objetos" ? objetos : atendimentos;
  const inicio = cursor ? itens.findIndex((x) => x.id === cursor.id) + 1 : 0;
  const pagina = itens.slice(inicio, inicio + 30);
  return {
    ...p,
    clientes,
    ...(filtros.tela === "objetos"
      ? { objetos: pagina as typeof objetos }
      : filtros.tela === "atendimentos"
        ? { atendimentos: pagina as typeof atendimentos }
        : {}),
    proximo: inicio + 30 < itens.length ? { id: pagina.at(-1)!.id } : null,
  };
}
