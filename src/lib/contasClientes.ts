export type ContaTitulo = {
  id: string;
  descricao: string;
  vencimento: string;
  total_centavos: number;
  pago_centavos: number;
  aberto_centavos: number;
};
export type ContaOS = {
  id: string;
  numero: number;
  cliente_id: string | null;
  chave_cliente: string;
  cliente: string;
  telefone: string;
  data: string;
  situacao: string;
  veiculo: string;
  placa: string;
  servicos: string;
  vencimento: string;
  total_centavos: number;
  pago_centavos: number;
  aberto_centavos: number;
  vencido_centavos: number;
  titulos: ContaTitulo[];
};
export type ContasClientes = {
  consultado_em: string;
  hoje: string;
  ordens: ContaOS[];
};
export type ClienteDevedor = {
  chave: string;
  nome: string;
  telefone: string;
  avulso: boolean;
  ordens: ContaOS[];
  aberto: number;
  vencido: number;
  vencimento: string;
};
export function rankingDevedores(dados: ContasClientes): ClienteDevedor[] {
  const clientes = new Map<string, ClienteDevedor>();
  for (const o of dados.ordens) {
    if (o.aberto_centavos <= 0) continue;
    const c = clientes.get(o.chave_cliente) || {
      chave: o.chave_cliente,
      nome: o.cliente,
      telefone: o.telefone,
      avulso: !o.cliente_id,
      ordens: [],
      aberto: 0,
      vencido: 0,
      vencimento: o.vencimento,
    };
    c.ordens.push(o);
    c.aberto += o.aberto_centavos;
    c.vencido += o.vencido_centavos;
    if (o.vencimento < c.vencimento) c.vencimento = o.vencimento;
    clientes.set(c.chave, c);
  }
  return [...clientes.values()].sort(
    (a, b) =>
      b.aberto - a.aberto ||
      b.vencido - a.vencido ||
      a.nome.localeCompare(b.nome) ||
      a.chave.localeCompare(b.chave),
  );
}
export function totaisConta(ordens: ContaOS[]) {
  return ordens.reduce(
    (t, o) => ({
      total: t.total + o.total_centavos,
      pago: t.pago + o.pago_centavos,
      aberto: t.aberto + o.aberto_centavos,
      vencido: t.vencido + o.vencido_centavos,
    }),
    { total: 0, pago: 0, aberto: 0, vencido: 0 },
  );
}
// Bloqueia a exportação silenciosa se os valores/dados selecionados mudarem durante a escolha.
export function assinaturaConta(ordens: ContaOS[]) {
  return JSON.stringify(
    [...ordens]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((o) => ({
        ...o,
        titulos: [...o.titulos].sort((a, b) => a.id.localeCompare(b.id)),
      })),
  );
}
