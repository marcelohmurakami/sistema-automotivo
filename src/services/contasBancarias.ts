import { rpc } from "../lib/rpc";
import {
  consultarFinanceiroDemoCompleto,
  hoje,
  novoTitulo,
  salvarTitulo,
  baixarTitulo,
} from "./financeiro";
export type ContaBancaria = {
  codigo: string;
  nome: string;
  tipo: "caixa" | "banco";
  banco: string;
  agencia: string;
  numero: string;
  ativo: boolean;
  revisao: number;
  saldo: number;
};
export const contasPadrao: ContaBancaria[] = [
  {
    codigo: "caixa",
    nome: "Dinheiro em caixa",
    tipo: "caixa",
    banco: "",
    agencia: "",
    numero: "",
    ativo: true,
    revisao: 1,
    saldo: 0,
  },
  {
    codigo: "banco",
    nome: "Banco / conta digital",
    tipo: "banco",
    banco: "",
    agencia: "",
    numero: "",
    ativo: true,
    revisao: 1,
    saldo: 0,
  },
];
const chave = (oficina: string) => `patio_contas_bancarias_${oficina}`;
export async function registrarSaldoInicialConta(
  demo: boolean,
  oficina: string,
  id: string,
  conta: ContaBancaria,
  valor: number,
  data: string,
) {
  if (!Number.isSafeInteger(valor) || !valor || Math.abs(valor) > 1e10)
    throw Error("Informe um saldo diferente de zero.");
  if (!demo)
    return rpc("registrar_saldo_inicial_conta", {
      p_oficina: oficina,
      p_chave: id,
      p_conta: conta.codigo,
      p_valor: valor,
      p_data: data,
    });
  const t = {
    ...novoTitulo(valor < 0 ? "pagar" : "receber"),
    id,
    categoria: "saldo_inicial",
    descricao: `Saldo inicial · ${conta.nome}`,
    valor_centavos: Math.abs(valor),
    competencia: data,
    vencimento: data,
  };
  await salvarTitulo(true, oficina, t);
  return baixarTitulo(true, oficina, t, {
    chave: id,
    conta: conta.codigo,
    valor_centavos: Math.abs(valor),
    taxa_centavos: 0,
    data,
    forma: "outro",
    observacao: "Saldo anterior informado pelo usuário",
  });
}
export async function consultarContasBancarias(
  demo: boolean,
  oficina: string,
  data = hoje(),
  signal?: AbortSignal,
): Promise<ContaBancaria[]> {
  if (!demo)
    return rpc(
      "consultar_contas_financeiras",
      { p_oficina: oficina, p_data: data },
      signal,
    );
  const contas: ContaBancaria[] = JSON.parse(
    localStorage.getItem(chave(oficina)) || JSON.stringify(contasPadrao),
  );
  const { titulos, baixas } = consultarFinanceiroDemoCompleto();
  return contas.map((c) => ({
    ...c,
    saldo: baixas
      .filter((b) => b.conta === c.codigo && b.data <= data)
      .reduce(
        (s, b) =>
          s +
          (b.estorno_de ? -1 : 1) *
            (titulos.find((t) => t.id === b.titulo_id)?.natureza === "receber"
              ? b.valor_centavos - b.taxa_centavos
              : -b.valor_centavos),
        0,
      ),
  }));
}
export async function salvarContaBancaria(
  demo: boolean,
  oficina: string,
  conta: ContaBancaria,
  nova = false,
) {
  if (!demo)
    return rpc("salvar_conta_financeira", {
      p_oficina: oficina,
      p_codigo: conta.codigo,
      p_dados: conta,
      p_revisao: nova ? null : conta.revisao,
    });
  const lista = await consultarContasBancarias(true, oficina);
  const atual = lista.find((c) => c.codigo === conta.codigo);
  if (atual && atual.revisao !== conta.revisao)
    throw Error("A conta foi alterada. Atualize a tela.");
  if (!conta.nome.trim()) throw Error("Informe o nome da conta.");
  if (["caixa", "banco"].includes(conta.codigo) && !conta.ativo)
    throw Error("Mantenha a conta anterior disponível.");
  localStorage.setItem(
    chave(oficina),
    JSON.stringify([
      ...lista.filter((c) => c.codigo !== conta.codigo),
      { ...conta, revisao: (atual?.revisao || 0) + 1 },
    ]),
  );
}
