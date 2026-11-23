import { dinheiro } from "../lib/formatacao";
import { useState } from "react";
import { type ItemProposta } from "../services/orcamentos";
import { estimarMargem, gruposOrcamento } from "../lib/orcamentoInteligente";
import "../pages/OficinaAgil.css";
export function ExplicarItem({
  item,
  itens,
  alterar,
}: {
  item: ItemProposta;
  itens: ItemProposta[];
  alterar: (p: Partial<ItemProposta>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <details
      className="agil-detalhes"
      onToggle={(e) => {
        if (e.currentTarget.open) setAberto(true);
      }}
      onInvalidCapture={(e) => {
        e.currentTarget.open = true;
      }}
    >
      <summary>Detalhes e custo deste item (opcional)</summary>
      {aberto && (
        <>
          <div className="agil-grade">
            <label>
              Conjunto de serviços (opcional)
              <input
                maxLength={80}
                value={item.grupo_servico ?? "Atendimento"}
                placeholder="Ex.: Freios dianteiros"
                onChange={(e) => alterar({ grupo_servico: e.target.value })}
              />
            </label>
            <label>
              Prioridade (opcional)
              <select
                value={item.prioridade_servico ?? "recomendado"}
                onChange={(e) =>
                  alterar({
                    prioridade_servico: e.target
                      .value as ItemProposta["prioridade_servico"],
                  })
                }
              >
                <option value="urgente">Urgente</option>
                <option value="recomendado">Recomendado</option>
                <option value="preventivo">Preventivo</option>
              </select>
            </label>
            <label>
              Só realizar junto com (opcional)
              <select
                value={item.depende_grupo ?? ""}
                onChange={(e) => alterar({ depende_grupo: e.target.value })}
              >
                <option value="">Pode ser aprovado sozinho</option>
                {gruposOrcamento(itens)
                  .filter((g) => g.nome !== (item.grupo_servico || "Atendimento"))
                  .map((g) => (
                    <option key={g.nome}>{g.nome}</option>
                  ))}
              </select>
            </label>
            <label>
              Explique ao cliente (opcional)
              <textarea
                maxLength={1000}
                rows={2}
                placeholder="O que foi encontrado e por que recomendamos este serviço?"
                value={item.explicacao_cliente ?? ""}
                onChange={(e) => alterar({ explicacao_cliente: e.target.value })}
              />
            </label>
            <label>
              Custo da unidade (R$) · interno (opcional)
              <input
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                value={
                  item.custo_unitario_previsto_centavos == null
                    ? ""
                    : item.custo_unitario_previsto_centavos / 100
                }
                placeholder="Não informado"
                onChange={(e) =>
                  alterar({
                    custo_unitario_previsto_centavos:
                      e.target.value === ""
                        ? null
                        : Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </label>
            {item.tipo === "service" && (
              <>
                <label>
                  Tempo total previsto (min) (opcional)
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={item.minutos_previstos ?? 0}
                    onChange={(e) =>
                      alterar({ minutos_previstos: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Custo da hora (R$) · interno (opcional)
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step="0.01"
                    value={(item.custo_hora_centavos ?? 0) / 100}
                    onChange={(e) =>
                      alterar({
                        custo_hora_centavos: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
              </>
            )}
          </div>
          <small>
            Itens no mesmo grupo são aprovados juntos. Custos ficam somente na oficina.
          </small>
        </>
      )}
    </details>
  );
}
export function MargemOrcamento({
  itens,
  desconto,
  outros,
  alterar,
}: {
  itens: ItemProposta[];
  desconto: number;
  outros: number;
  alterar: (v: number) => void;
}) {
  const m = estimarMargem(itens, desconto, outros);
  return (
    <details className="agil-detalhes" open={m.saldo < 0}>
      <summary>
        {m.saldo < 0
          ? "Atenção: custo acima do preço"
          : "Quanto sobra neste orçamento?"}{" "}
        · {dinheiro(m.saldo)} estimados
      </summary>
      <div className="agil-indicadores">
        <div>
          <small>Venda com desconto</small>
          <strong>{dinheiro(m.receita)}</strong>
        </div>
        <div>
          <small>Custos previstos</small>
          <strong>{dinheiro(m.custo)}</strong>
        </div>
        <div className={m.saldo < 0 ? "agil-perigo" : ""}>
          <small>Sobra estimada</small>
          <strong>{dinheiro(m.saldo)}</strong>
          <span>
            {m.percentual === null
              ? "Sem receita"
              : `${m.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da venda`}
          </span>
        </div>
      </div>
      <label>
        Outros custos previstos (R$) (opcional)
        <input
          type="number"
          min={0}
          max={1000000}
          step="0.01"
          value={outros / 100}
          onChange={(e) => alterar(Math.round(Number(e.target.value) * 100))}
        />
      </label>
      <p>
        {m.faltantes
          ? `${m.faltantes} item(ns) ainda sem custo ou tempo completo. A estimativa está incompleta. `
          : ""}
        Estimativa antes das despesas e impostos não informados; não é lucro realizado e
        não gera lançamento financeiro.
      </p>
      <small>
        Desconto máximo para cobrir os custos informados: {dinheiro(m.limiteDesconto)}.
      </small>
    </details>
  );
}
