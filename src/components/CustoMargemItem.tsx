import { useEffect, useRef, useState } from "react";
import { dinheiro } from "../lib/formatacao";
import { SecaoRecolhivel } from "./SecaoRecolhivel";
import "./LucroServico.css";

export function CustoMargemItem({
  custo,
  preco,
  quantidade = 1,
  desconto = 0,
  alterar,
  nome,
  estoque = false,
  aberta = false,
}: {
  custo: number | null | undefined;
  preco: number;
  quantidade?: number;
  desconto?: number;
  alterar: (valor: number | null) => void;
  nome?: string;
  estoque?: boolean;
  aberta?: boolean;
}) {
  const venda = Math.max(0, Math.round((preco || 0) * (quantidade || 0)) - desconto);
  const total = custo == null ? null : Math.round(custo * (quantidade || 0));
  const margem = total === null ? null : venda - total;
  return (
    <SecaoRecolhivel
      titulo="Custos e margem (opcional)"
      classe="custo-item-opcional"
      aberta={aberta}
    >
      <label>
        Custo direto por unidade (R$)
        <input
          name={nome}
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          inputMode="decimal"
          value={custo == null ? "" : custo / 100}
          placeholder="Não informado"
          onChange={(e) =>
            alterar(
              e.target.value === "" ? null : Math.round(e.target.valueAsNumber * 100),
            )
          }
        />
      </label>
      <small>
        {estoque
          ? "Referência da peça. Na OS, vale o custo do consumo; ajuste em Lucro e custos."
          : "Insumos e execução deste item. Não repita materiais, horas, comissões ou despesas já lançados."}{" "}
        Vazio: não informado. Zero: sem custo direto.
      </small>
      <dl className="lucro-valores">
        <div>
          <dt>Custo dos itens ({quantidade})</dt>
          <dd>{total === null ? "Não informado" : dinheiro(total)}</dd>
        </div>
        <div data-negativo={margem != null && margem < 0}>
          <dt>Margem após custo direto{desconto > 0 ? " e desconto" : ""}</dt>
          <dd>
            {margem === null ? (
              "Informe o custo"
            ) : (
              <>
                {dinheiro(margem)}
                {venda > 0 && (
                  <small>
                    {" "}
                    ·{" "}
                    {((margem / venda) * 100).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}
                    %
                  </small>
                )}
              </>
            )}
          </dd>
        </div>
      </dl>
      <small>Custos internos. Comissões, taxas e despesas entram no lucro da OS.</small>
    </SecaoRecolhivel>
  );
}

/** Adapta formulários nativos sem alterar seu contrato de FormData. */
export function CustoMargemCadastro({
  custoInicial,
  precoInicial,
  nome = "custo",
  estoque = false,
}: {
  custoInicial?: number | null;
  precoInicial: number;
  nome?: string;
  estoque?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [custo, setCusto] = useState(custoInicial ?? null);
  const [preco, setPreco] = useState(precoInicial);
  useEffect(() => {
    const form = ref.current?.closest("form");
    const atualizar = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.name === "preco")
        setPreco(Math.round(e.target.valueAsNumber * 100) || 0);
    };
    form?.addEventListener("input", atualizar);
    return () => form?.removeEventListener("input", atualizar);
  }, []);
  return (
    <div ref={ref}>
      <CustoMargemItem
        custo={custo}
        preco={preco}
        alterar={setCusto}
        nome={nome}
        estoque={estoque}
      />
    </div>
  );
}
