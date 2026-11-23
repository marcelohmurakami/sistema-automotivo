import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import type { ParcelaFinanceira } from "../../lib/parcelasFinanceiras";
import { ParcelasFinanceiras } from "../ParcelasFinanceiras";
import {
  categorias,
  categoriasReceber,
  categoriasPagar,
  type TituloFinanceiro,
} from "../../services/financeiro";
export function FormularioTituloFinanceiro({
  titulo,
  ocupado,
  modal,
  historicoCarregando,
  temBaixas,
  parcelado,
  setParcelado,
  parcelas,
  setParcelas,
  totalParcelamento,
  setTotalParcelamento,
  primeiroVencimento,
  setPrimeiroVencimento,
  enviarTitulo,
}: {
  titulo: TituloFinanceiro;
  ocupado: boolean;
  modal: string;
  historicoCarregando: boolean;
  temBaixas: boolean;
  parcelado: boolean;
  setParcelado: (v: boolean) => void;
  parcelas: ParcelaFinanceira[];
  setParcelas: (v: ParcelaFinanceira[]) => void;
  totalParcelamento: number;
  setTotalParcelamento: (v: number) => void;
  primeiroVencimento: string;
  setPrimeiroVencimento: (v: string) => void;
  enviarTitulo: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="formulario-cliente fin-form-titulo"
      onSubmit={enviarTitulo}
      onInvalidCapture={(e) => {
        const detalhes = (e.target as HTMLElement).closest("details");
        if (detalhes) detalhes.open = true;
      }}
    >
      {titulo.natureza === "pagar" && titulo.ordem_servico_id && (
        <p className="fin-explica-pecas">
          Lance somente custos deste serviço.{" "}
          <b>Peças do estoque já são descontadas automaticamente</b> ao entregar a OS,
          pelo custo registrado no consumo. Para conferir as peças,{" "}
          <Link to={`/ordens-servico?os=${titulo.ordem_servico_id}`}>abra a OS</Link>.
        </p>
      )}
      <fieldset disabled={ocupado || (modal === "editar" && historicoCarregando)}>
        <label>
          Descrição
          <input
            name="descricao"
            autoFocus
            required
            minLength={3}
            maxLength={200}
            defaultValue={titulo.descricao}
          />
        </label>
        <div className="dupla-campos">
          <label>
            Categoria
            <select
              name="categoria"
              defaultValue={titulo.categoria}
              disabled={
                titulo.automatico ||
                !!titulo.comissao_id ||
                !!titulo.compra_id ||
                temBaixas
              }
            >
              {(titulo.natureza === "receber"
                ? categoriasReceber
                : titulo.ordem_servico_id
                  ? [
                      "pecas_externas",
                      "terceiros",
                      "outras_despesas",
                      ...(modal === "editar" &&
                      !["pecas_externas", "terceiros", "outras_despesas"].includes(
                        titulo.categoria,
                      )
                        ? [titulo.categoria]
                        : []),
                    ]
                  : categoriasPagar
              ).map((c) => (
                <option key={c} value={c}>
                  {titulo.ordem_servico_id && c === "outras_despesas"
                    ? "Outros custos diretos deste serviço"
                    : titulo.ordem_servico_id && c === "pecas_externas"
                      ? "Peças compradas por fora para esta OS"
                      : categorias[c]}
                </option>
              ))}
              {titulo.natureza === "pagar" && titulo.ordem_servico_id && (
                <option disabled value="estoque_automatico">
                  Peças do estoque · calculadas automaticamente
                </option>
              )}
            </select>
          </label>
          <label>
            Valor total (R$)
            <input
              name="valor"
              onFocus={(e) => e.currentTarget.select()}
              type="number"
              inputMode="decimal"
              min={titulo.compra_id && titulo.credito_fornecedor_centavos ? 0 : 0.01}
              max="100000000"
              step="0.01"
              required
              defaultValue={
                modal === "editar"
                  ? titulo.valor_centavos / 100
                  : titulo.valor_centavos / 100 || ""
              }
              onChange={(e) =>
                setTotalParcelamento(Math.round(e.target.valueAsNumber * 100))
              }
              readOnly={
                titulo.automatico ||
                !!titulo.comissao_id ||
                !!titulo.compra_id ||
                temBaixas
              }
            />
          </label>
        </div>
        <label>
          {parcelado ? "Primeiro vencimento" : "Vencimento"}
          <input
            type="date"
            name="vencimento"
            required
            defaultValue={titulo.vencimento}
            onChange={(e) => setPrimeiroVencimento(e.target.value)}
          />
        </label>
        <p className="texto-suave">Salvar a conta não movimenta dinheiro.</p>
        {modal === "novo" && (
          <>
            <label className="fin-titulo-parcelar">
              <input
                type="checkbox"
                checked={parcelado}
                onChange={(e) => setParcelado(e.target.checked)}
              />
              Dividir em parcelas
            </label>
            {parcelado && (
              <ParcelasFinanceiras
                total={totalParcelamento}
                primeira={primeiroVencimento}
                parcelas={parcelas}
                alterar={setParcelas}
              />
            )}
          </>
        )}
        <details
          className="fin-titulo-detalhes"
          open={modal === "editar" && !!(titulo.pessoa || titulo.observacoes)}
        >
          <summary>Mais detalhes (opcional)</summary>
          <label>
            Data para o resultado
            <input
              type="date"
              name="competencia"
              required
              defaultValue={titulo.competencia}
              readOnly={
                titulo.automatico ||
                !!titulo.comissao_id ||
                !!titulo.compra_id ||
                temBaixas
              }
            />
            <small>Quando a venda ou a despesa aconteceu.</small>
          </label>
          <label>
            {titulo.natureza === "receber" ? "Cliente / pessoa" : "Fornecedor / pessoa"}
            <input
              name="pessoa"
              maxLength={200}
              readOnly={!!titulo.comissao_id}
              defaultValue={titulo.pessoa}
            />
          </label>
          <label>
            Observações
            <textarea
              name="observacoes"
              maxLength={2000}
              defaultValue={titulo.observacoes}
            />
          </label>
        </details>
        {titulo.ordem_servico_id && (
          <p className="aviso-cliente">Este lançamento está vinculado à OS.</p>
        )}
        <div className="fin-titulo-acoes">
          <button className="botao-secundario" type="submit">
            {ocupado ? "Salvando…" : parcelado ? "Criar parcelas" : "Salvar lançamento"}
          </button>
          {modal === "novo" && !parcelado && (
            <button
              className="botao-primario"
              type="submit"
              name="continuar"
              value="baixar"
            >
              {ocupado
                ? "Salvando…"
                : `Salvar e ${titulo.natureza === "receber" ? "receber" : "pagar"}`}
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
