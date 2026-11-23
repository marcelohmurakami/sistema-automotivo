import { useState } from "react";
import { Dialogo } from "../Dialogo";
import { novoId } from "../../lib/uuid";
import { dinheiro } from "../../lib/formatacao";
import { suprimentos, type ItemSolicitado } from "../../services/suprimentos";
import { EscolherFornecedor, EscolherProduto } from "./Comum";
import { useSuprimentos } from "./helpers";
import { passoProduto } from "./helpers";
export function NovoPedido({
  cotacao = false,
  iniciais = [],
  fechar,
  salvo,
}: {
  cotacao?: boolean;
  iniciais?: ItemSolicitado[];
  fechar: () => void;
  salvo: (id: string) => void;
}) {
  const { w, erro, setErro, ocupado, executar } = useSuprimentos();
  const [id] = useState(novoId),
    [itens, setItens] = useState(iniciais),
    [fornecedor, setFornecedor] = useState("");
  return (
    <Dialogo
      aberto
      fechar={() => !ocupado && fechar()}
      titulo={cotacao ? "Nova cotação entre fornecedores" : "Novo pedido de compra"}
    >
      <form
        className="supr"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!cotacao && !fornecedor) {
            setErro("Selecione o fornecedor na busca.");
            return;
          }
          const f = new FormData(e.currentTarget);
          if (
            await executar(() =>
              cotacao
                ? suprimentos.executar(w, "criar_cotacao_compra", {
                    p_id: id,
                    p_titulo: f.get("referencia"),
                    p_itens: itens.map(({ produto_id, quantidade }) => ({
                      produto_id,
                      quantidade,
                    })),
                  })
                : suprimentos.executar(w, "salvar_pedido_compra", {
                    p_id: id,
                    p_dados: {
                      referencia: f.get("referencia"),
                      fornecedor_id: fornecedor,
                      previsao: f.get("previsao"),
                      condicoes: f.get("condicoes"),
                      observacoes: f.get("observacoes"),
                    },
                    p_itens: itens,
                  }),
            )
          )
            salvo(id);
        }}
      >
        <fieldset disabled={ocupado}>
          <label>
            {cotacao ? "O que deseja cotar?" : "Nome do pedido"}
            <input
              name="referencia"
              maxLength={160}
              minLength={2}
              required
              placeholder="Ex.: reposição da semana"
              autoFocus
            />
          </label>
          {!cotacao && <EscolherFornecedor selecionar={setFornecedor} />}
          <EscolherProduto
            selecionar={(p) =>
              setItens((v) =>
                v.some((i) => i.produto_id === p.id)
                  ? v.map((i) =>
                      i.produto_id === p.id
                        ? { ...i, quantidade: i.quantidade + 1 }
                        : i,
                    )
                  : [
                      ...v,
                      {
                        produto_id: p.id,
                        descricao: p.descricao,
                        unidade: p.unidade,
                        quantidade: 1,
                        custo_centavos: p.custo_centavos,
                      },
                    ],
              )
            }
          />
          {itens.length === 0 && (
            <p className="supr-vazio">Busque os produtos acima para começar.</p>
          )}
          {itens.map((i, idx) => (
            <div className="supr-linha" key={i.produto_id}>
              <div>
                <strong>{i.descricao}</strong>
                <small>{i.unidade}</small>
              </div>
              <label className="supr-numero">
                Quantidade
                <input
                  type="number"
                  required
                  min={passoProduto(i.unidade)}
                  step={passoProduto(i.unidade)}
                  max={1000000}
                  value={i.quantidade}
                  onChange={(e) =>
                    setItens((v) =>
                      v.map((x, n) =>
                        n === idx ? { ...x, quantidade: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </label>
              {!cotacao && (
                <label className="supr-numero">
                  Custo final (R$)
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    max="1000000"
                    value={i.custo_centavos / 100}
                    onChange={(e) =>
                      setItens((v) =>
                        v.map((x, n) =>
                          n === idx
                            ? {
                                ...x,
                                custo_centavos: Math.round(
                                  Number(e.target.value) * 100,
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
              )}
              <button
                type="button"
                aria-label={`Remover ${i.descricao}`}
                onClick={() => setItens((v) => v.filter((_, n) => n !== idx))}
              >
                Remover
              </button>
            </div>
          ))}
          {!cotacao && (
            <>
              <p className="supr-valor">
                Total previsto:{" "}
                {dinheiro(
                  itens.reduce(
                    (t, i) => t + Math.round(i.quantidade * i.custo_centavos),
                    0,
                  ),
                )}
              </p>
              <p className="supr-aviso">
                Informe o custo final por unidade, já com frete e impostos. O pedido só
                movimenta estoque e gera a conta a pagar quando a entrega é recebida.
              </p>
            </>
          )}
          {!cotacao && (
            <details>
              <summary>Prazo e condições (opcional)</summary>
              <div className="supr-campos">
                <label>
                  Previsão de entrega
                  <input type="date" name="previsao" />
                </label>
                <label>
                  Condição de pagamento
                  <input
                    name="condicoes"
                    maxLength={1000}
                    placeholder="Ex.: 30 dias após a entrega"
                  />
                </label>
              </div>
              <label>
                Observações
                <textarea name="observacoes" maxLength={2000} />
              </label>
            </details>
          )}
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <button className="botao-primario" disabled={!itens.length || ocupado}>
            {ocupado ? "Salvando…" : cotacao ? "Criar cotação" : "Criar pedido"}
          </button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
