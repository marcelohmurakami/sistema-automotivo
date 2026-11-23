import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialogo } from "../Dialogo";
import { dinheiro } from "../../lib/formatacao";
import { novoId } from "../../lib/uuid";
import { hoje } from "../../services/financeiro";
import {
  suprimentos,
  type Cotacao,
  type PropostaCompra,
} from "../../services/suprimentos";
import { EscolherFornecedor, EstadoConsulta, Paginacao } from "./Comum";
import { useSuprimentos, dataCurta } from "./helpers";
export function DetalheCotacao({
  id,
  fechar,
  abrirPedido,
}: {
  id: string;
  fechar: () => void;
  abrirPedido: (id: string) => void;
}) {
  const operacao = useSuprimentos();
  const { w, erro, ocupado, executar } = operacao,
    [pagina, setPagina] = useState(0),
    [nova, setNova] = useState(false),
    [escolha, setEscolha] = useState<PropostaCompra | null>(null);
  const q = useQuery({
      queryKey: ["suprimentos", "cotacao", w, id, pagina],
      queryFn: ({ signal }) => suprimentos.cotacao(w, id, pagina, signal),
    }),
    c = q.data;
  const vigentes = c?.propostas.filter((p) => p.validade >= hoje()) ?? [],
    menor = Math.min(...vigentes.map((p) => p.total_centavos));
  return (
    <Dialogo aberto fechar={() => !ocupado && fechar()} titulo={c?.titulo ?? "Cotação"}>
      <div className="supr">
        <EstadoConsulta loading={q.isPending} error={q.error} />
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {c && (
          <>
            <div className="supr-barra">
              <p>{c.propostas.length} fornecedores · Mesmo conjunto de produtos</p>
              {c.pedido_id ? (
                <button
                  className="botao-primario"
                  onClick={() => abrirPedido(c.pedido_id!)}
                >
                  Abrir pedido aprovado →
                </button>
              ) : (
                <button
                  className="botao-primario"
                  disabled={ocupado}
                  onClick={() => {
                    setNova(true);
                    setEscolha(null);
                  }}
                >
                  Adicionar / atualizar proposta
                </button>
              )}
            </div>
            {nova && (
              <NovaProposta c={c} operacao={operacao} fechar={() => setNova(false)} />
            )}
            {!c.propostas.length && !nova && (
              <p className="supr-vazio">
                Registre as propostas recebidas para comparar.
              </p>
            )}
            {c.propostas.map((p) => (
              <div className="supr-painel" key={p.id}>
                <div className="supr-barra">
                  <h3>{p.fornecedor}</h3>
                  {p.validade < hoje() ? (
                    <span className="supr-selo">Vencida</span>
                  ) : (
                    p.total_centavos === menor && (
                      <span className="supr-selo">Menor custo</span>
                    )
                  )}
                  {c.escolhida === p.id && <span className="supr-selo">Escolhida</span>}
                </div>
                <div className="supr-linha">
                  <span className="supr-valor">{dinheiro(p.total_centavos)}</span>
                  <span>
                    <strong>Entrega {dataCurta(p.previsao)}</strong>
                    <small>
                      {p.condicoes || "Pagamento não informado"} · Válida até{" "}
                      {dataCurta(p.validade)}
                    </small>
                  </span>
                  {!c.pedido_id && (
                    <button
                      disabled={ocupado || p.validade < hoje()}
                      onClick={() => {
                        setEscolha(p);
                        setNova(false);
                      }}
                    >
                      Escolher fornecedor
                    </button>
                  )}
                </div>
                <details>
                  <summary>Produtos e condições</summary>
                  {p.itens.map((i) => (
                    <div className="supr-linha" key={i.produto_id}>
                      <span>
                        {c.itens.find((x) => x.produto_id === i.produto_id)?.descricao}
                      </span>
                      <span>
                        {i.quantidade} × {dinheiro(i.custo_centavos)}
                      </span>
                    </div>
                  ))}
                  {p.observacoes && <p>{p.observacoes}</p>}
                </details>
              </div>
            ))}
            {escolha && !c.pedido_id && (
              <form
                className="supr-painel"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  let pedido = "";
                  if (
                    await executar(async () => {
                      pedido = await suprimentos.executar<string>(
                        w,
                        "escolher_proposta_compra",
                        {
                          p_cotacao: c.id,
                          p_proposta: escolha.id,
                          p_revisao: c.revisao,
                          p_motivo: f.get("motivo") || "",
                        },
                      );
                    })
                  )
                    abrirPedido(pedido);
                }}
              >
                <strong>
                  {escolha.fornecedor} · {dinheiro(escolha.total_centavos)}
                </strong>
                <label>
                  Motivo da escolha{" "}
                  {escolha.total_centavos === menor ? "(opcional)" : ""}
                  <input
                    name="motivo"
                    minLength={escolha.total_centavos > menor ? 3 : undefined}
                    maxLength={1000}
                    required={escolha.total_centavos > menor}
                    placeholder="Ex.: melhor prazo ou qualidade"
                  />
                </label>
                <p>Será criado um pedido com os produtos e custos desta proposta.</p>
                <div className="supr-barra">
                  <button className="botao-primario" disabled={ocupado}>
                    Confirmar e criar pedido
                  </button>
                  <button type="button" onClick={() => setEscolha(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
            <details>
              <summary>Histórico de propostas · {c.total_historico}</summary>
              {c.historico.map((p) => (
                <div className="supr-linha" key={p.id}>
                  <span>
                    {p.fornecedor} · Versão {p.versao}
                  </span>
                  <span>{dinheiro(p.total_centavos)}</span>
                  <small>
                    Entrega {dataCurta(p.previsao)} · {p.condicoes}
                  </small>
                </div>
              ))}
              <Paginacao
                pagina={pagina}
                total={c.total_historico}
                alterar={setPagina}
              />
            </details>
          </>
        )}
      </div>
    </Dialogo>
  );
}
function NovaProposta({
  c,
  fechar,
  operacao,
}: {
  c: Cotacao;
  fechar: () => void;
  operacao: ReturnType<typeof useSuprimentos>;
}) {
  const { w, erro, setErro, ocupado, executar } = operacao,
    [id] = useState(novoId),
    [fornecedor, setFornecedor] = useState(""),
    [custos, setCustos] = useState<Record<string, number>>({});
  return (
    <form
      className="supr-painel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!fornecedor) {
          setErro("Selecione um fornecedor da busca.");
          return;
        }
        const f = new FormData(e.currentTarget);
        if (
          await executar(() =>
            suprimentos.executar(w, "registrar_proposta_compra", {
              p_cotacao: c.id,
              p_id: id,
              p_revisao: c.revisao,
              p_dados: {
                fornecedor_id: fornecedor,
                previsao: f.get("previsao"),
                validade: f.get("validade"),
                condicoes: f.get("condicoes"),
                observacoes: f.get("observacoes"),
              },
              p_itens: c.itens.map((i) => ({
                produto_id: i.produto_id,
                quantidade: i.quantidade,
                custo_centavos: custos[i.produto_id],
              })),
            }),
          )
        )
          fechar();
      }}
    >
      <fieldset disabled={ocupado}>
        <EscolherFornecedor selecionar={setFornecedor} />
        <p className="supr-aviso">
          Registre o custo final de cada unidade, incluindo frete, impostos e descontos.
          Uma nova proposta do mesmo fornecedor preserva a versão anterior.
        </p>
        {c.itens.map((i) => (
          <div className="supr-linha" key={i.produto_id}>
            <span>
              <strong>{i.descricao}</strong>
              <small>
                {i.quantidade} {i.unidade}
              </small>
            </span>
            <label>
              Custo final por unidade (R$)
              <input
                type="number"
                required
                min="0"
                max="1000000"
                step="0.01"
                value={
                  custos[i.produto_id] === undefined ? "" : custos[i.produto_id] / 100
                }
                onChange={(e) =>
                  setCustos((v) => ({
                    ...v,
                    [i.produto_id]: Math.round(Number(e.target.value) * 100),
                  }))
                }
              />
            </label>
          </div>
        ))}
        <div className="supr-campos">
          <label>
            Previsão de entrega
            <input
              type="date"
              name="previsao"
              required
              min={hoje()}
              defaultValue={hoje()}
            />
          </label>
          <label>
            Proposta válida até
            <input
              type="date"
              name="validade"
              required
              min={hoje()}
              defaultValue={hoje()}
            />
          </label>
          <label>
            Pagamento
            <input name="condicoes" maxLength={1000} placeholder="Ex.: 30 / 60 dias" />
          </label>
        </div>
        <details>
          <summary>Observações (opcional)</summary>
          <label>
            Garantia, marca e condições adicionais
            <textarea name="observacoes" maxLength={2000} />
          </label>
        </details>
        {erro && <p role="alert">{erro}</p>}
        <div className="supr-barra">
          <button className="botao-primario">
            {ocupado ? "Salvando…" : "Salvar proposta"}
          </button>
          <button type="button" onClick={fechar}>
            Cancelar
          </button>
        </div>
      </fieldset>
    </form>
  );
}
