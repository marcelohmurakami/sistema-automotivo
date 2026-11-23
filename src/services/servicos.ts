import { rpc } from "../lib/rpc";
import { transacaoDemo } from "../lib/transacaoDemo";
import {
  inicioOcupacao,
  fimOcupacao,
  type LogisticaVisita,
} from "../lib/logisticaVisitas";
import { especialidades, tiposDaEspecialidade } from "../lib/especialidades";
import { ramos } from "../lib/ramos";
import { tituloDemoAtivo } from "./financeiro";
import { validarEtapaReparo } from "../lib/assistenciaTecnica";
import { validarLimpeza } from "../lib/limpeza";
import { validarAceiteServico } from "../lib/aceiteServico";
import {
  validarFichaEspecialidade,
  type FichaEspecialidade,
} from "../lib/perfisAtendimento";

export type ObjetoServico = {
  quantidade_atendimentos?: number;
  id: string;
  cliente_id: string;
  nome: string;
  dados: Record<string, string>;
  arquivado: boolean;
  revisao: number;
};
export type RecursoAgenda = {
  id: string;
  nome: string;
  ativo: boolean;
  revisao: number;
};
export const estadosServico = {
  orcamento: "Orçamento",
  aprovado: "Aprovado",
  em_execucao: "Em execução",
  aguardando: "Aguardando",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
export const estadosAgenda = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Não compareceu",
};
export type AtendimentoServico = {
  mostrar_desconto_nota?: boolean;
  retorno_agendado?: boolean;
  compartilhado_cliente?: boolean;
  resumo_cliente?: string;
  numero?: number;
  data_servico?: string;
  concluido_em?: string | null;
  ficha_especialidade?: FichaEspecialidade | null;
  id: string;
  cliente_id: string;
  objeto_id: string;
  titulo: string;
  situacao: keyof typeof estadosServico;
  dados: Record<string, string>;
  valor_centavos: number;
  vencimento: string;
  revisao: number;
};
export type ReservaServico = {
  recursos_reservados?: string[];
  resumo_recursos?: import("./reservasRecursos").ResumoRecurso[];
  distribuicao?: import("./distribuicaoTecnicos").CriteriosDistribuicao;
  logistica?: LogisticaVisita;
  visita?: boolean;
  deslocamento_minutos?: number;
  id: string;
  atendimento_id: string;
  recurso_id: string;
  inicio: string;
  fim: string;
  situacao: keyof typeof estadosAgenda;
  observacoes: string;
  revisao: number;
};
export type PainelServicos = {
  objetos: ObjetoServico[];
  recursos: RecursoAgenda[];
  atendimentos: AtendimentoServico[];
  agenda: ReservaServico[];
  cobrancas: { atendimento_id: string; titulo_id: string }[];
};
export function lerServicosDemo(oficina: string): PainelServicos {
  const salvo = localStorage.getItem(`patio_servicos:${oficina}`);
  if (salvo) {
    const painel = JSON.parse(salvo) as PainelServicos;
    let proximo = painel.atendimentos.reduce(
      (maior, a) => Math.max(maior, a.numero || 0),
      0,
    );
    for (const a of painel.atendimentos) {
      a.numero ||= ++proximo;
      a.data_servico ||= a.vencimento;
    }
    return painel;
  }
  const hoje = diaLocal(new Date()),
    limpeza = oficina.endsWith("limpeza"),
    campo = oficina.endsWith("manutencao_campo");
  const objetos: ObjetoServico[] = Array.from({ length: 6 }, (_, i): ObjetoServico => ({
    id: `objeto-${i}`,
    cliente_id: `exemplo-${i}`,
    nome: limpeza
      ? `Imóvel ${i + 1}`
      : campo
        ? `Instalação ${i + 1}`
        : `Notebook ${i + 1}`,
    dados:
      limpeza || campo
        ? { endereco: "Endereço ilustrativo", area: "120" }
        : {
            marca: "Exemplo",
            modelo: "Equipamento de teste",
            serie: `DEMO-${i + 1}`,
          },
    arquivado: false,
    revisao: 1,
  }));
  const recursos: RecursoAgenda[] = [
    {
      id: "equipe-a",
      nome: limpeza ? "Equipe Horizonte" : "Técnico Alex",
      ativo: true,
      revisao: 1,
    },
    {
      id: "equipe-b",
      nome: limpeza ? "Equipe Aurora" : "Técnica Beatriz",
      ativo: true,
      revisao: 1,
    },
  ];
  const atendimentos: AtendimentoServico[] = objetos.map((o, i) => ({
    numero: i + 1,
    data_servico: hoje,
    id: `atendimento-${i}`,
    cliente_id: o.cliente_id,
    objeto_id: o.id,
    titulo: limpeza
      ? ["Limpeza residencial", "Limpeza pós-obra", "Higienização de escritório"][i % 3]
      : campo
        ? ["Manutenção preventiva", "Revisão de instalação", "Inspeção técnica"][i % 3]
        : ["Diagnóstico e reparo", "Troca de componente", "Revisão preventiva"][i % 3],
    situacao: i === 0 ? "em_execucao" : "aprovado",
    dados: {
      solicitacao: "Atendimento fictício para experimentar o sistema.",
      checklist: "Conferir condições iniciais\nExecutar serviço\nConferir resultado",
    },
    valor_centavos: 15000 + i * 7500,
    vencimento: somarDias(hoje, i),
    revisao: 1,
  }));
  const agenda: ReservaServico[] = Array.from({ length: 18 }, (_, i) => ({
    id: `reserva-${i}`,
    atendimento_id: atendimentos[i % 6].id,
    recurso_id: recursos[i % 2].id,
    inicio: `${somarDias(hoje, Math.floor(i / 3))}T${["08", "11", "14"][i % 3]}:00:00-03:00`,
    fim: `${somarDias(hoje, Math.floor(i / 3))}T${["10", "13", "16"][i % 3]}:00:00-03:00`,
    situacao: i % 3 ? "agendado" : "confirmado",
    observacoes: "Exemplo local",
    revisao: 1,
  }));
  const painel = { objetos, recursos, atendimentos, agenda, cobrancas: [] };
  localStorage.setItem(`patio_servicos:${oficina}`, JSON.stringify(painel));
  return painel;
}
export const gravarServico = async (
  funcao: string,
  oficina: string,
  dados: Record<string, unknown>,
  demo = false,
) => {
  if (funcao === "criar_atendimento_com_itens") {
    const { criarAtendimentoComItens } = await import("./servicosCompletos");
    const id = await criarAtendimentoComItens(demo, oficina, dados);
    if (
      !demo &&
      (dados.p_dados as AtendimentoServico)?.situacao === "concluido" &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(
        new CustomEvent("patio:atendimento-concluido", { detail: { oficina, id } }),
      );
    return id;
  }
  const ficha = (dados.p_dados as Record<string, unknown> | undefined)
    ?.ficha_especialidade;
  if (ficha != null) validarFichaEspecialidade(ficha);
  const entrada = dados.p_dados as AtendimentoServico | undefined;
  if (funcao === "salvar_atendimento_servico" && entrada) {
    validarEtapaReparo(entrada);
    validarAceiteServico(entrada);
    validarLimpeza(entrada);
  }
  const avisar =
    funcao === "salvar_atendimento_servico" &&
    entrada?.situacao === "concluido" &&
    !entrada.concluido_em;
  const notificar = (id: string) => {
    if (avisar && typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent("patio:atendimento-concluido", { detail: { oficina, id } }),
      );
  };
  if (!demo) {
    const id = await rpc<string>(funcao, { p_oficina: oficina, ...dados });
    notificar(id);
    return id;
  }
  if (funcao === "programar_visitas_limpeza") {
    const { programarVisitasLimpezaDemo } = await import("./visitasLimpeza");
    await programarVisitasLimpezaDemo(oficina, dados);
    return String(dados.p_chave);
  }
  const p = lerServicosDemo(oficina),
    id = String(dados.p_id || dados.p_atendimento || dados.p_chave);
  function atualizar<T extends { id: string; revisao: number }>(lista: T[], novo: T) {
    const index = lista.findIndex((x) => x.id === novo.id);
    if (index >= 0) {
      if (dados.p_revisao == null) return;
      if (lista[index].revisao !== dados.p_revisao)
        throw new Error("Registro alterado. Atualize a tela.");
      lista[index] = { ...novo, revisao: lista[index].revisao + 1 };
    } else lista.push({ ...novo, revisao: 1 });
  }
  function reservar(g: ReservaServico) {
    if (
      !Number.isInteger(g.deslocamento_minutos || 0) ||
      (g.deslocamento_minutos || 0) < 0 ||
      (g.deslocamento_minutos || 0) > 720
    )
      throw new Error("Informe um deslocamento entre 0 e 720 minutos.");
    if (!g.visita) {
      g.deslocamento_minutos = 0;
      g.logistica = undefined;
    }
    if (Date.parse(g.fim) <= Date.parse(g.inicio)) throw new Error("Término inválido.");
    if (
      ["agendado", "confirmado"].includes(g.situacao) &&
      p.agenda.some(
        (x) =>
          x.id !== g.id &&
          x.recurso_id === g.recurso_id &&
          ["agendado", "confirmado"].includes(x.situacao) &&
          inicioOcupacao(x) < fimOcupacao(g) &&
          fimOcupacao(x) > inicioOcupacao(g),
      )
    )
      throw new Error("Esta equipe já tem um atendimento nesse horário.");
    atualizar(p.agenda, g);
  }
  const d = dados.p_dados as Record<string, unknown>;
  if (funcao === "salvar_objeto_atendimento")
    atualizar(p.objetos, { ...d, id } as ObjetoServico);
  else if (funcao === "salvar_recurso_agenda")
    atualizar(p.recursos, {
      id,
      nome: String(dados.p_nome),
      ativo: !!dados.p_ativo,
      revisao: 0,
    });
  else if (funcao === "salvar_atendimento_servico") {
    const antigo = p.atendimentos.find((x) => x.id === id);
    if (antigo && dados.p_revisao == null) return id;
    if (antigo && antigo.revisao !== dados.p_revisao)
      throw new Error("Registro alterado. Atualize a tela.");
    if (antigo?.situacao === "concluido" && d.situacao !== "concluido")
      throw new Error("Use Reabrir atendimento para devolver os materiais.");
    if (antigo?.ficha_especialidade && d.ficha_especialidade === null)
      throw new Error("Preserve a ficha do atendimento.");
    if (ficha) {
      const tecnica = ficha as FichaEspecialidade;
      const ramo = Object.keys(ramos).find((r) => oficina.endsWith(r));
      if (ramo && especialidades[tecnica.especialidade]?.ramo !== ramo)
        throw new Error("Ficha incompatível com o ramo da empresa.");
      if (
        antigo?.ficha_especialidade &&
        antigo.ficha_especialidade.especialidade !== tecnica.especialidade
      )
        throw new Error("Preserve o subsetor da ficha já registrada.");
      const tipo = (d.dados as Record<string, string> | undefined)?.tipo_servico;
      if (
        tipo &&
        tipo !== antigo?.dados.tipo_servico &&
        !tiposDaEspecialidade(tecnica.especialidade).some((t) => t === tipo)
      )
        throw new Error("Tipo de serviço incompatível com o subsetor do atendimento.");
    }
    if (
      antigo &&
      p.cobrancas.some(
        (x) => x.atendimento_id === id && tituloDemoAtivo(x.titulo_id),
      ) &&
      (d.valor_centavos !== antigo.valor_centavos || d.situacao === "cancelado")
    )
      throw new Error("Atendimento já faturado.");
    const {
      validarValorAtendimentoDemo,
      registrarTransicaoAtendimentoDemo,
      concluirDemo,
    } = await import("./servicosCompletos");
    validarValorAtendimentoDemo(oficina, id, Number(d.valor_centavos));
    transacaoDemo(
      [
        `patio_servicos:${oficina}`,
        `patio_detalhes_servicos:${oficina}`,
        "patio_estoque_v1",
      ],
      () => {
        if (d.situacao === "concluido" && antigo?.situacao !== "concluido") {
          concluirDemo(oficina, id);
          d.concluido_em = new Date().toISOString();
        }
        atualizar(p.atendimentos, {
          numero: antigo?.numero || p.atendimentos.length + 1,
          data_servico: antigo?.data_servico || diaLocal(new Date()),
          ...antigo,
          ...d,
          id,
        } as AtendimentoServico);
        registrarTransicaoAtendimentoDemo(
          oficina,
          antigo,
          p.atendimentos.find((a) => a.id === id)!,
        );
        if (d.situacao === "cancelado")
          p.agenda = p.agenda.map((x) =>
            x.atendimento_id === id && ["agendado", "confirmado"].includes(x.situacao)
              ? { ...x, situacao: "cancelado", revisao: x.revisao + 1 }
              : x,
          );
        localStorage.setItem(`patio_servicos:${oficina}`, JSON.stringify(p));
      },
    );
    notificar(id);
    return id;
  } else if (funcao === "salvar_agenda_servico")
    reservar({ ...d, id } as ReservaServico);
  else if (funcao === "agendar_serie_servico") {
    for (let i = 0; i < Number(dados.p_quantidade); i++)
      reservar({
        ...d,
        id: `${id}-${i}`,
        inicio: new Date(
          Date.parse(String(d.inicio)) + i * Number(dados.p_intervalo) * 86400000,
        ).toISOString(),
        fim: new Date(
          Date.parse(String(d.fim)) + i * Number(dados.p_intervalo) * 86400000,
        ).toISOString(),
      } as ReservaServico);
  } else if (funcao === "faturar_atendimento_servico") {
    const anterior = p.cobrancas.find((x) => x.atendimento_id === id);
    if (anterior && tituloDemoAtivo(anterior.titulo_id)) return anterior.titulo_id;
    if (anterior) p.cobrancas = p.cobrancas.filter((c) => c !== anterior);
    const t = p.atendimentos.find((x) => x.id === id);
    if (!t || ["orcamento", "cancelado"].includes(t.situacao) || t.valor_centavos <= 0)
      throw new Error("Aprove o atendimento e informe o valor.");
    const { novoTitulo, salvarTitulo } = await import("./financeiro");
    const titulo = {
      ...novoTitulo("receber"),
      descricao: t.titulo,
      categoria: "servicos",
      valor_centavos: t.valor_centavos,
      vencimento: t.vencimento,
    };
    await salvarTitulo(true, oficina, titulo);
    p.cobrancas.push({ atendimento_id: id, titulo_id: titulo.id });
    localStorage.setItem(`patio_servicos:${oficina}`, JSON.stringify(p));
    return titulo.id;
  } else throw new Error("Operação de demonstração indisponível.");
  localStorage.setItem(`patio_servicos:${oficina}`, JSON.stringify(p));
  notificar(id);
  return id;
};
const formatoDiaLocal = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
});
const formatoHoraLocal = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
export function diaLocal(data: string | Date) {
  return formatoDiaLocal.format(new Date(data));
}
export function horaLocal(data: string) {
  return formatoHoraLocal.format(new Date(data));
}
export function somarDias(dia: string, n: number) {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
