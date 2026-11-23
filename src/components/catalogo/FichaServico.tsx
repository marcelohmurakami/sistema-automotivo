import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import { consultarFichaServico } from "../../services/catalogo";
import { dinheiro } from "../../lib/formatacao";
import { erroPublico } from "../../lib/supabase";
import type { ItemCatalogo } from "../../lib/catalogo";
import { Dialogo } from "../Dialogo";
import { SecaoRecolhivel } from "../SecaoRecolhivel";
import "./FichaServico.css";

export function FichaServico({
  id,
  fechar,
  editar,
}: {
  id: string;
  fechar: () => void;
  editar: (item: ItemCatalogo) => void;
}) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["catalogo", a.demo, a.oficina!.id, "ficha", id],
    queryFn: ({ signal }) => consultarFichaServico(a.demo, a.oficina!.id, id, signal),
  });
  const i = q.data;
  return (
    <Dialogo
      aberto
      fechar={fechar}
      titulo="Detalhes do serviço"
      classe="dialogo-ficha-servico"
    >
      {q.isPending && <p role="status">Carregando serviço…</p>}
      {q.isError && (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </p>
      )}
      {i && (
        <div className="ficha-servico">
          <header>
            <h3>{i.descricao}</h3>
            <span>
              {i.arquivado_em ? "Arquivado" : "Serviço ativo"} · por {i.unidade}
            </span>
          </header>
          <dl className="ficha-servico-valores">
            <div>
              <dt>Preço de venda</dt>
              <dd>{dinheiro(i.preco_padrao_centavos)}</dd>
            </div>
            {a.oficina?.perfil !== "staff" && (
              <>
                <div>
                  <dt>Custo direto</dt>
                  <dd>
                    {i.custo_centavos == null
                      ? "Não informado"
                      : dinheiro(i.custo_centavos)}
                  </dd>
                </div>
                <div>
                  <dt>Margem após custo direto</dt>
                  <dd>
                    {i.custo_centavos == null ? (
                      "Informe os custos"
                    ) : (
                      <>
                        {dinheiro(i.preco_padrao_centavos - i.custo_centavos)}
                        {i.preco_padrao_centavos > 0 && (
                          <small>
                            {(
                              ((i.preco_padrao_centavos - i.custo_centavos) /
                                i.preco_padrao_centavos) *
                              100
                            ).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                            %
                          </small>
                        )}
                      </>
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>
          {i.ficha?.duracao_minutos && (
            <p>
              Tempo previsto: <strong>{i.ficha.duracao_minutos} minutos</strong>
            </p>
          )}
          {i.ficha?.notas ? (
            <section>
              <h4>Detalhes e orientações</h4>
              <p className="ficha-servico-notas">{i.ficha.notas}</p>
            </section>
          ) : (
            <p className="texto-suave">
              Adicione orientações, duração e custos na edição, se precisar.
            </p>
          )}
          {!!i.ficha?.custos.length && (
            <section>
              <h4>O que compõe o custo</h4>
              <dl className="ficha-servico-custos">
                {i.ficha.custos.map((c, n) => (
                  <div key={n}>
                    <dt>{c.descricao}</dt>
                    <dd>{dinheiro(c.valor_centavos)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <p className="texto-suave">
            O custo é aplicado por unidade nos novos serviços da OS e descontado do
            lucro. Descontos, comissões, taxas e demais despesas aparecem em Lucro e
            custos da OS. O preço cobrado do cliente não muda.
          </p>
          <button className="botao-primario" onClick={() => editar(i)}>
            Editar serviço e custos
          </button>
        </div>
      )}
    </Dialogo>
  );
}

export function DetalhesServicoEditor({
  item,
  alterar,
  podeCustos,
}: {
  item: ItemCatalogo;
  alterar: (i: ItemCatalogo) => void;
  podeCustos: boolean;
}) {
  const ficha = item.ficha || { notas: "", duracao_minutos: null, custos: [] };
  const [detalhar, setDetalhar] = useState(ficha.custos.length > 0);
  const custo = item.custo_centavos;
  function custos(linhas: typeof ficha.custos) {
    alterar({
      ...item,
      custo_centavos: linhas.length
        ? linhas.reduce((s, c) => s + c.valor_centavos, 0)
        : null,
      ficha: { ...ficha, custos: linhas },
    });
  }
  return (
    <>
      <SecaoRecolhivel titulo="Detalhes do serviço (opcional)">
        <label>
          Orientações e detalhes
          <textarea
            aria-label="Orientações e detalhes"
            value={ficha.notas}
            maxLength={6000}
            rows={4}
            placeholder="O que está incluído, cuidados e orientações para a equipe"
            onChange={(e) =>
              alterar({ ...item, ficha: { ...ficha, notas: e.target.value } })
            }
          />
        </label>
        <label>
          Tempo previsto (minutos)
          <input
            aria-label="Tempo previsto"
            type="number"
            min={1}
            max={43200}
            step={1}
            value={ficha.duracao_minutos ?? ""}
            onChange={(e) =>
              alterar({
                ...item,
                ficha: {
                  ...ficha,
                  duracao_minutos:
                    e.target.value === "" ? null : e.target.valueAsNumber,
                },
              })
            }
          />
        </label>
      </SecaoRecolhivel>
      {podeCustos && (
        <SecaoRecolhivel
          titulo="Custos e margem (opcional)"
          classe="ficha-servico-custeio"
        >
          <label>
            Como informar os custos
            <select
              aria-label="Como informar os custos"
              value={detalhar ? "detalhado" : "total"}
              onChange={(e) => {
                const detalhado = e.target.value === "detalhado";
                setDetalhar(detalhado);
                alterar({
                  ...item,
                  ficha: {
                    ...ficha,
                    custos: detalhado
                      ? [{ descricao: "Custo direto", valor_centavos: custo ?? 0 }]
                      : [],
                  },
                });
              }}
            >
              <option value="total">Informar o custo total</option>
              <option value="detalhado">Detalhar os custos</option>
            </select>
          </label>
          {detalhar ? (
            <>
              <div className="ficha-custos-editor">
                {ficha.custos.map((c, n) => (
                  <div className="ficha-custo-linha" key={n}>
                    <label>
                      Custo {n + 1}
                      <input
                        aria-label={`Descrição do custo ${n + 1}`}
                        required
                        maxLength={160}
                        value={c.descricao}
                        placeholder="Ex.: insumo de limpeza, material, terceiro"
                        onChange={(e) =>
                          custos(
                            ficha.custos.map((x, j) =>
                              j === n ? { ...x, descricao: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Valor (R$)
                      <input
                        aria-label={`Valor do custo ${n + 1}`}
                        type="number"
                        min={0}
                        max={1000000}
                        step="0.01"
                        required
                        value={c.valor_centavos / 100}
                        onChange={(e) =>
                          custos(
                            ficha.custos.map((x, j) =>
                              j === n
                                ? {
                                    ...x,
                                    valor_centavos: Math.round(
                                      e.target.valueAsNumber * 100,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`Remover custo ${n + 1}`}
                      className="botao-secundario"
                      onClick={() => custos(ficha.custos.filter((_, j) => j !== n))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="botao-secundario"
                disabled={ficha.custos.length >= 40}
                onClick={() =>
                  custos([...ficha.custos, { descricao: "", valor_centavos: 0 }])
                }
              >
                <Plus size={16} /> Adicionar custo
              </button>
            </>
          ) : (
            <label>
              Custo direto por unidade (R$)
              <input
                aria-label="Custo direto por unidade"
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                value={custo == null ? "" : custo / 100}
                placeholder="Não informado"
                onChange={(e) =>
                  alterar({
                    ...item,
                    custo_centavos:
                      e.target.value === ""
                        ? null
                        : Math.round(e.target.valueAsNumber * 100),
                    ficha,
                  })
                }
              />
            </label>
          )}
          <dl className="ficha-servico-valores">
            <div>
              <dt>Custo por {item.unidade || "serviço"}</dt>
              <dd>{custo == null ? "Não informado" : dinheiro(custo)}</dd>
            </div>
            <div>
              <dt>Margem após custo direto</dt>
              <dd>
                {custo == null
                  ? "Informe os custos"
                  : dinheiro(item.preco_padrao_centavos - custo)}
              </dd>
            </div>
          </dl>
          <small>
            Custos internos, aplicados automaticamente nos novos itens da OS. Não repita
            peças, horas, comissões ou despesas já lançadas separadamente. Para uma OS
            existente, ajuste em Lucro e custos.
          </small>
        </SecaoRecolhivel>
      )}
    </>
  );
}
