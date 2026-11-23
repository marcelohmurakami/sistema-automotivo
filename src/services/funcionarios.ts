import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";

export type Funcionario = {
  admissao?: string | null;
  desligamento?: string | null;
  salario_centavos?: number | null;
  dados?: Record<string, string>;
  id: string;
  nome: string;
  funcao: string;
  telefone: string;
  email: string;
  observacoes: string;
  ativo: boolean;
  revisao: number;
};
export const novoFuncionario = (): Funcionario => ({
  id: novoId(),
  nome: "",
  funcao: "",
  telefone: "",
  email: "",
  observacoes: "",
  ativo: true,
  revisao: 0,
});
const chave = (oficina: string) => `patio_funcionarios_v1_${oficina}`;
export async function listarFuncionarios(
  demo: boolean,
  oficina: string,
  signal?: AbortSignal,
): Promise<Funcionario[]> {
  return demo
    ? JSON.parse(localStorage.getItem(chave(oficina)) || "[]")
    : rpc("listar_funcionarios", { p_oficina: oficina }, signal);
}
export async function salvarFuncionario(
  demo: boolean,
  oficina: string,
  f: Funcionario,
) {
  if (!demo)
    return rpc("salvar_funcionario", {
      p_oficina: oficina,
      p_id: f.id,
      p_dados: f,
      p_revisao: f.revisao || null,
    });
  const itens = await listarFuncionarios(true, oficina),
    anterior = itens.find((i) => i.id === f.id);
  if (anterior && !f.revisao) return;
  if (anterior && anterior.revisao !== f.revisao)
    throw new Error("Cadastro alterado. Atualize a lista.");
  if (f.admissao && f.desligamento && f.desligamento < f.admissao)
    throw new Error("Desligamento anterior à admissão.");
  localStorage.setItem(
    chave(oficina),
    JSON.stringify([
      ...itens.filter((i) => i.id !== f.id),
      { ...f, revisao: f.revisao + 1 },
    ]),
  );
  if ((f.salario_centavos ?? null) !== (anterior?.salario_centavos ?? null)) {
    const moeda = (v: number | null | undefined) =>
      v == null
        ? "não informado"
        : new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(v / 100);
    await registrarEventoFuncionario(true, oficina, f.id, {
      id: novoId(),
      tipo: "salario",
      inicio: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date()),
      fim: null,
      descricao: `Salário-base: ${moeda(anterior?.salario_centavos)} → ${moeda(f.salario_centavos)}`,
      situacao: "concluido",
    });
  }
}
export const tiposRegistroFuncionario: Record<string, string> = {
  vale: "Vale / adiantamento",
  emprestimo: "Empréstimo",
  recado: "Recado / pendência",
  ausencia: "Ausência / falta",
  ferias: "Férias",
  afastamento: "Afastamento",
  treinamento: "Treinamento",
  ocorrencia: "Ocorrência",
  salario: "Alteração salarial",
};
export type RegistroFuncionario = {
  valor_centavos?: number | null;
  abatimentos?: {
    id: string;
    valor_centavos: number;
    data: string;
    descricao: string;
  }[];
  id: string;
  tipo: string;
  inicio: string;
  fim: string | null;
  descricao: string;
  situacao: "pendente" | "concluido" | "cancelado";
  criado_em?: string;
};
export const saldoVale = (r: RegistroFuncionario) =>
  (r.valor_centavos ?? 0) -
  (r.abatimentos ?? []).reduce((s, p) => s + p.valor_centavos, 0);
export async function abaterValeFuncionario(
  demo: boolean,
  o: string,
  f: string,
  r: RegistroFuncionario,
  p: { id: string; valor_centavos: number; data: string; descricao: string },
) {
  if (!demo)
    return rpc("abater_vale_funcionario", {
      p_oficina: o,
      p_id: r.id,
      p_chave: p.id,
      p_valor: p.valor_centavos,
      p_data: p.data,
      p_descricao: p.descricao,
    });
  const lista = await listarRegistrosFuncionario(true, o, f),
    atual = lista.find((x) => x.id === r.id);
  if (!atual) throw new Error("Registro indisponível.");
  if (atual.abatimentos?.some((x) => x.id === p.id)) return;
  if (
    atual.situacao !== "pendente" ||
    p.valor_centavos <= 0 ||
    p.valor_centavos > saldoVale(atual)
  )
    throw new Error("Confira o saldo e o valor.");
  const novo = {
    ...atual,
    abatimentos: [...(atual.abatimentos ?? []), p],
    situacao:
      p.valor_centavos === saldoVale(atual)
        ? ("concluido" as const)
        : ("pendente" as const),
  };
  localStorage.setItem(
    chaveRegistros(o, f),
    JSON.stringify(lista.map((x) => (x.id === r.id ? novo : x))),
  );
}
const chaveRegistros = (o: string, f: string) =>
  `patio_funcionario_registros_${o}_${f}`;
export async function listarRegistrosFuncionario(
  demo: boolean,
  o: string,
  f: string,
  signal?: AbortSignal,
): Promise<RegistroFuncionario[]> {
  return demo
    ? JSON.parse(localStorage.getItem(chaveRegistros(o, f)) || "[]")
    : rpc("listar_registros_funcionario", { p_oficina: o, p_funcionario: f }, signal);
}
export async function registrarEventoFuncionario(
  demo: boolean,
  o: string,
  f: string,
  r: RegistroFuncionario,
) {
  if (!demo)
    return rpc("registrar_evento_funcionario", {
      p_oficina: o,
      p_funcionario: f,
      p_id: r.id,
      p_dados: r,
    });
  const lista = await listarRegistrosFuncionario(true, o, f);
  if (lista.some((x) => x.id === r.id)) return;
  if (
    ["vale", "emprestimo"].includes(r.tipo) &&
    (!Number.isSafeInteger(r.valor_centavos) ||
      !r.valor_centavos ||
      r.valor_centavos < 1)
  )
    throw new Error("Informe um valor válido.");
  localStorage.setItem(
    chaveRegistros(o, f),
    JSON.stringify([{ ...r, criado_em: new Date().toISOString() }, ...lista]),
  );
}
export async function situacaoEventoFuncionario(
  demo: boolean,
  o: string,
  f: string,
  id: string,
  situacao: "concluido" | "cancelado",
) {
  if (!demo)
    return rpc("situacao_evento_funcionario", {
      p_oficina: o,
      p_id: id,
      p_situacao: situacao,
    });
  const lista = await listarRegistrosFuncionario(true, o, f);
  const atual = lista.find((r) => r.id === id);
  if (
    atual &&
    ["vale", "emprestimo"].includes(atual.tipo) &&
    (situacao === "concluido" || atual.abatimentos?.length)
  )
    throw new Error(
      "Use os abatimentos para quitar. Registros com abatimentos não podem ser cancelados.",
    );
  localStorage.setItem(
    chaveRegistros(o, f),
    JSON.stringify(lista.map((r) => (r.id === id ? { ...r, situacao } : r))),
  );
}
