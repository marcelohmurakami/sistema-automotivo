import { rpc } from "../lib/rpc";
import { lerCatalogoDemo } from "../lib/catalogo";
import { listarFuncionarios } from "./funcionarios";
import {
  atendeClientes,
  corFuncionario,
  type PeriodoJornada,
} from "../lib/gestaoFuncionario";
import {
  inicioOcupacao,
  fimOcupacao,
  type VisitaPlanejada,
} from "../lib/logisticaVisitas";
export type ServicoFuncionario = {
  item_catalogo_id: string;
  ativo: boolean;
  duracao_minutos: number | null;
  preco_centavos: number | null;
};
export type ServicoProfissional = {
  id: string;
  descricao: string;
  duracao_minutos: number | null;
  preco_centavos: number;
};
export type ConfiguracaoFuncionario = {
  funcionario_id: string;
  recurso_id: string | null;
  nome_agenda: string;
  jornada: PeriodoJornada[] | null;
  revisao: number;
};
export type GestaoFuncionario = {
  configuracao: ConfiguracaoFuncionario;
  servicos: ServicoFuncionario[];
  catalogo: ServicoProfissional[];
};
export type BloqueioFuncionario = {
  id: string;
  funcionario_id: string | null;
  funcionario_nome?: string;
  tipo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  motivo: string;
  cancelado_em?: string | null;
  cancelamento_motivo?: string | null;
};
export type ProfissionalAgenda = {
  id: string;
  nome: string;
  nome_agenda: string;
  recurso_id: string | null;
  cor_agenda: string;
  ativo: boolean;
  atende_clientes: boolean;
  servicos: ServicoProfissional[];
};
export type EscolhaProfissional = {
  funcionario_id?: string;
  item_catalogo_id?: string;
  nome?: string;
  cor_agenda?: string;
  preco_centavos?: number;
  duracao_minutos?: number | null;
  servico?: string;
};
const chave = (w: string, f: string) => `patio_gestao_funcionario_${w}_${f}`;
const chaveBloqueios = (w: string) => `patio_bloqueios_funcionarios_${w}`;
export async function consultarGestaoFuncionario(
  demo: boolean,
  w: string,
  f: string,
  signal?: AbortSignal,
): Promise<GestaoFuncionario> {
  if (!demo)
    return rpc(
      "consultar_gestao_funcionario",
      { p_oficina: w, p_funcionario: f },
      signal,
    );
  const funcionario = (await listarFuncionarios(true, w)).find((x) => x.id === f);
  if (!funcionario) throw Error("Funcionário indisponível.");
  const salvo = JSON.parse(localStorage.getItem(chave(w, f)) || "null") as Omit<
    GestaoFuncionario,
    "catalogo"
  > | null;
  return {
    ...(salvo ?? {
      configuracao: {
        funcionario_id: f,
        recurso_id: f,
        nome_agenda: funcionario.nome,
        jornada: null,
        revisao: 1,
      },
      servicos: [],
    }),
    catalogo: lerCatalogoDemo(w)
      .filter((c) => c.tipo === "service" && !c.arquivado_em)
      .map((c) => ({
        id: c.id,
        descricao: c.descricao,
        preco_centavos: c.preco_padrao_centavos,
        duracao_minutos: c.ficha?.duracao_minutos ?? null,
      })),
  };
}
export async function salvarGestaoFuncionario(
  demo: boolean,
  w: string,
  f: string,
  secao: "jornada" | "servicos",
  dados: PeriodoJornada[] | ServicoFuncionario[],
  revisao: number,
) {
  if (!demo)
    return rpc("salvar_gestao_funcionario", {
      p_oficina: w,
      p_funcionario: f,
      p_secao: secao,
      p_dados: dados,
      p_revisao: revisao,
    });
  const atual = await consultarGestaoFuncionario(true, w, f);
  if (atual.configuracao.revisao !== revisao)
    throw Error("Configuração alterada. Atualize a ficha antes de salvar.");
  if (secao === "jornada") atual.configuracao.jornada = dados as PeriodoJornada[];
  else
    for (const s of dados as ServicoFuncionario[]) {
      if (!atual.catalogo.some((c) => c.id === s.item_catalogo_id))
        throw Error("Serviço indisponível.");
      atual.servicos = [
        ...atual.servicos.filter((x) => x.item_catalogo_id !== s.item_catalogo_id),
        s,
      ];
    }
  atual.configuracao.revisao++;
  localStorage.setItem(
    chave(w, f),
    JSON.stringify({ configuracao: atual.configuracao, servicos: atual.servicos }),
  );
}
export async function listarBloqueiosFuncionario(
  demo: boolean,
  w: string,
  f?: string,
  signal?: AbortSignal,
): Promise<BloqueioFuncionario[]> {
  if (!demo)
    return rpc(
      "listar_bloqueios_funcionario",
      { p_oficina: w, p_funcionario: f ?? null },
      signal,
    );
  const nomes = new Map((await listarFuncionarios(true, w)).map((x) => [x.id, x.nome]));
  return (
    JSON.parse(localStorage.getItem(chaveBloqueios(w)) || "[]") as BloqueioFuncionario[]
  )
    .filter((b) => !f || b.funcionario_id === f)
    .map((b) => ({ ...b, funcionario_nome: nomes.get(b.funcionario_id ?? "") }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}
export async function registrarBloqueioFuncionario(
  demo: boolean,
  w: string,
  b: BloqueioFuncionario,
) {
  if (!demo)
    return rpc("registrar_bloqueio_funcionario", {
      p_oficina: w,
      p_id: b.id,
      p_dados: b,
    });
  const lista = await listarBloqueiosFuncionario(true, w);
  const antigo = lista.find((x) => x.id === b.id);
  if (antigo) {
    if (
      antigo.inicio !== b.inicio ||
      antigo.fim !== b.fim ||
      antigo.funcionario_id !== b.funcionario_id
    )
      throw Error("Identificador já utilizado.");
    return b.id;
  }
  if (
    !Number.isFinite(Date.parse(b.inicio)) ||
    !Number.isFinite(Date.parse(b.fim)) ||
    Date.parse(b.fim) <= Date.parse(b.inicio)
  )
    throw Error("Período inválido.");
  const agenda = JSON.parse(
    localStorage.getItem("patio_servicos:" + w) || '{"agenda":[]}',
  ).agenda as (VisitaPlanejada & { recurso_id: string })[];
  if (
    agenda.some(
      (x) =>
        ["agendado", "confirmado"].includes(x.situacao) &&
        (!b.funcionario_id || x.recurso_id === b.funcionario_id) &&
        inicioOcupacao(x) < Date.parse(b.fim) &&
        fimOcupacao(x) > Date.parse(b.inicio),
    )
  )
    throw Error(
      "Já existem agendamentos neste período. Remarque ou cancele antes de bloquear.",
    );
  localStorage.setItem(chaveBloqueios(w), JSON.stringify([...lista, b]));
  return b.id;
}
export async function cancelarBloqueioFuncionario(
  demo: boolean,
  w: string,
  id: string,
  motivo: string,
) {
  if (!demo)
    return rpc("cancelar_bloqueio_funcionario", {
      p_oficina: w,
      p_id: id,
      p_motivo: motivo,
    });
  const lista = await listarBloqueiosFuncionario(true, w);
  localStorage.setItem(
    chaveBloqueios(w),
    JSON.stringify(
      lista.map((x) =>
        x.id === id
          ? {
              ...x,
              cancelado_em: new Date().toISOString(),
              cancelamento_motivo: motivo,
            }
          : x,
      ),
    ),
  );
}
export async function listarProfissionaisAgenda(
  demo: boolean,
  w: string,
  signal?: AbortSignal,
): Promise<ProfissionalAgenda[]> {
  if (!demo) return rpc("listar_profissionais_agenda", { p_oficina: w }, signal);
  return Promise.all(
    (await listarFuncionarios(true, w)).map(async (f) => {
      const g = await consultarGestaoFuncionario(true, w, f.id);
      return {
        id: f.id,
        nome: f.nome,
        nome_agenda: g.configuracao.nome_agenda,
        recurso_id: f.id,
        ativo: f.ativo,
        atende_clientes: atendeClientes(f),
        cor_agenda: corFuncionario(f),
        servicos: g.servicos
          .filter((s) => s.ativo)
          .flatMap((s) => {
            const c = g.catalogo.find((c) => c.id === s.item_catalogo_id);
            return c
              ? [
                  {
                    ...c,
                    duracao_minutos: s.duracao_minutos ?? c.duracao_minutos,
                    preco_centavos: s.preco_centavos ?? c.preco_centavos,
                  },
                ]
              : [];
          }),
      };
    }),
  );
}
export const dadosProfissional = (form: FormData): EscolhaProfissional =>
  JSON.parse(String(form.get("profissional") || "{}"));

/** Mesmas restrições operacionais na demonstração, sem gravar fora do navegador. */
export async function validarAgendaFuncionarioDemo(
  w: string,
  agenda: VisitaPlanejada & { recurso_id: string; profissional?: EscolhaProfissional },
) {
  if (!["agendado", "confirmado", "convertido"].includes(agenda.situacao)) return;
  const profissionais = await listarProfissionaisAgenda(true, w),
    p = profissionais.find((p) => p.recurso_id === agenda.recurso_id);
  const ini = inicioOcupacao(agenda),
    fim = fimOcupacao(agenda);
  const bloqueios = await listarBloqueiosFuncionario(true, w);
  if (
    bloqueios.some(
      (b) =>
        !b.cancelado_em &&
        (!b.funcionario_id || b.funcionario_id === p?.id) &&
        Date.parse(b.inicio) < fim &&
        Date.parse(b.fim) > ini,
    )
  )
    throw Error("Horário bloqueado: confira as ausências e os bloqueios da equipe.");
  if (!p) return;
  if (!p.ativo || !p.atende_clientes)
    throw Error("Funcionário inativo ou sem atendimento habilitado.");
  const g = await consultarGestaoFuncionario(true, w, p.id),
    local = (ms: number) => new Date(ms - 3 * 3600000).toISOString(),
    inicio = local(ini),
    termino = local(fim);
  if (
    g.configuracao.jornada !== null &&
    !g.configuracao.jornada.some(
      (j) =>
        j.dia === new Date(inicio).getUTCDay() &&
        inicio.slice(0, 10) === termino.slice(0, 10) &&
        inicio.slice(11, 16) >= j.inicio &&
        termino.slice(11, 16) <= j.fim,
    )
  )
    throw Error(
      "Horário fora da jornada do funcionário, incluindo intervalo e deslocamento.",
    );
  const sid = agenda.profissional?.item_catalogo_id,
    s = p.servicos.find((s) => s.id === sid);
  if (sid && !s) throw Error("Este serviço não está habilitado para o funcionário.");
  agenda.profissional = {
    funcionario_id: p.id,
    nome: p.nome,
    cor_agenda: p.cor_agenda,
    ...(s
      ? {
          item_catalogo_id: s.id,
          servico: s.descricao,
          preco_centavos: s.preco_centavos,
          duracao_minutos: s.duracao_minutos,
        }
      : {}),
  };
}
