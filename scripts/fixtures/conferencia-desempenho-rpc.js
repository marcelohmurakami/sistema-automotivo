window.qaChamadas = [];
export async function rpc(nome, dados) {
  window.qaChamadas.push({ nome, dados });
  if (nome === "buscar_cadastros_operacao") {
    if (dados.p_tipo === "veiculos")
      return dados.p_id
        ? [
            {
              id: dados.p_id,
              nome: "Veículo fora da página",
              cliente_id: dados.p_cliente,
            },
          ]
        : [{ id: "v1", nome: "Fiat QA", cliente_id: dados.p_cliente }];
    return dados.p_id
      ? [{ id: dados.p_id, nome: "Cliente fora da página" }]
      : [
          { id: "c1", nome: "Ana QA" },
          { id: "c2", nome: "João QA" },
        ];
  }
  if (nome === "consultar_produtividade")
    return { pacotes: [{ id: "p1", nome: "Pacote QA", ativo: true }] };
  if (nome === "itens_do_pacote")
    return [{ descricao: "Serviço QA", quantidade: 1, preco_unitario_centavos: 10000 }];
  throw Error("RPC não prevista na bancada: " + nome);
}
