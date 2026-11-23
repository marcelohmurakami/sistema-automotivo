import { useState } from "react";
import { Dialogo } from "../Dialogo";
import type { ProdutoEstoque } from "../../services/estoque";
import { suprimentos } from "../../services/suprimentos";
import { EscolherFornecedor } from "./Comum";
import { useSuprimentos } from "./helpers";
export function PlanejarEstoque({
  produto,
  fechar,
}: {
  produto: ProdutoEstoque;
  fechar: () => void;
}) {
  const { w, erro, ocupado, executar } = useSuprimentos(),
    [fornecedor, setFornecedor] = useState(produto.fornecedor_id ?? ""),
    [trocar, setTrocar] = useState(false);
  return (
    <Dialogo
      aberto
      fechar={() => !ocupado && fechar()}
      titulo={`Planejamento · ${produto.descricao}`}
    >
      <form
        className="supr"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await executar(() =>
              suprimentos.executar(w, "configurar_planejamento_estoque", {
                p_produto: produto.id,
                p_revisao: produto.revisao,
                p_dados: {
                  prazo_reposicao_dias: Number(f.get("prazo")),
                  cobertura_dias: Number(f.get("cobertura")),
                  seguranca: Number(f.get("seguranca")),
                  fornecedor_id: fornecedor || null,
                  rastreado: produto.rastreado || f.get("rastreado") === "on",
                },
              }),
            )
          )
            fechar();
        }}
      >
        <fieldset disabled={ocupado}>
          <div className="supr-campos">
            <label>
              Prazo de reposição (dias)
              <input
                name="prazo"
                type="number"
                min="0"
                max="365"
                step="1"
                defaultValue={produto.prazo_reposicao_dias ?? 7}
                required
              />
            </label>
            <label>
              Comprar para quantos dias?
              <input
                name="cobertura"
                type="number"
                min="1"
                max="365"
                step="1"
                defaultValue={produto.cobertura_dias ?? 30}
                required
              />
            </label>
            <label>
              Estoque de segurança ({produto.unidade})
              <input
                name="seguranca"
                type="number"
                min="0"
                max="1000000"
                step="0.001"
                defaultValue={produto.seguranca ?? 0}
                required
              />
            </label>
          </div>
          <p className="supr-aviso">
            A sugestão usa o consumo diário, o prazo do fornecedor e esta reserva de
            segurança. As quantidades já pedidas são descontadas.
          </p>
          {trocar || !fornecedor ? (
            <EscolherFornecedor selecionar={setFornecedor} obrigatorio={false} />
          ) : (
            <button type="button" onClick={() => setTrocar(true)}>
              Alterar fornecedor preferencial
            </button>
          )}
          <details>
            <summary>Série ou IMEI (opcional)</summary>
            <label className="supr-check">
              <input
                type="checkbox"
                name="rastreado"
                defaultChecked={produto.rastreado}
                disabled={!!produto.rastreado || (produto.saldo ?? 0) !== 0}
              />
              <span>Rastrear cada unidade por série ou IMEI</span>
            </label>
            <small>
              Ative com saldo zero, antes de receber as unidades. Depois, o histórico
              permanece vinculado a cada unidade.
            </small>
          </details>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <button className="botao-primario">
            {ocupado ? "Salvando…" : "Salvar planejamento"}
          </button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
