import {
  matchQuery,
  type Query,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
const integracoes = new Set<string>([
  "alertas",
  "lembretes-financeiros",
  "oportunidades",
  "recorrencias",
  "catalogo",
  "selecao-operacao",
  "aux-orcamento",
  "auxiliares-orcamento",
  "financeiro",
  "financeiro-detalhe",
  "contas-bancarias",
  "custeio",
  "custeio-detalhe",
  "lucro-documento",
  "lucro-cliente",
  "detalhes-atendimento",
  "apuracao",
  "conciliacao",
  "conciliacao-detalhe",
  "conciliacao-sem-extrato",
  "contratos-cobrancas",
  "mapa-oficina",
  "financeiro-relatorio",
  "financeiro-os",
  "financeiro-historico",
  "comissoes",
  "qualidade-avancada",
  "garantia-financeiro",
  "compras",
  "compra",
  "estoque",
  "suprimentos",
  "estoque-historico",
  "os-detalhe",
  "os",
  "servicos",
  "pagamento-apos-registro",
  "documento-cliente",
  "documentos-lista",
  "relatorios",
  "relatorios-oficina",
  "relatorios-servicos",
  "historico-gestao",
  "ficha-cliente",
]);
/** Uma passagem pelo cache preserva todas as integrações e refaz apenas as consultas ativas. */
export async function atualizarIntegracoes(
  qc: QueryClient,
  prioridade?: readonly string[],
  confirmadas: readonly QueryKey[] = [],
) {
  // Uma ficha completa devolvida pela gravação já está atualizada no cache.
  // A exceção é exata: outras OS e empresas continuam sendo invalidadas.
  const deveAtualizar = (consulta: Query) =>
    integracoes.has(String(consulta.queryKey[0])) &&
    !confirmadas.some((queryKey) => matchQuery({ queryKey, exact: true }, consulta));
  if (prioridade) {
    const imediatas = new Set(prioridade);
    // Alertas e painéis secundários continuam atualizando, mas não seguram a ação principal.
    // Os conjuntos são disjuntos: cada consulta é invalidada uma única vez.
    void qc
      .invalidateQueries({
        predicate: (consulta) => {
          const chave = String(consulta.queryKey[0]);
          return deveAtualizar(consulta) && !imediatas.has(chave);
        },
      })
      .catch(() => {
        /* O estado de erro permanece na própria consulta. */
      });
    await qc.invalidateQueries({
      predicate: (consulta) => {
        const chave = String(consulta.queryKey[0]);
        return deveAtualizar(consulta) && imediatas.has(chave);
      },
    });
    return;
  }
  await qc.invalidateQueries({
    predicate: deveAtualizar,
  });
}
