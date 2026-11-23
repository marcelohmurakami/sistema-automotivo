import { useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { dinheiro } from "../../lib/formatacao";
import { previaBaixaFinanceira } from "../../lib/previaBaixaFinanceira";
import {
  contas as contasPadrao,
  formas,
  hoje,
  type TituloFinanceiro,
} from "../../services/financeiro";
export function FormularioBaixaFinanceira({
  titulo,
  ocupado,
  enviarBaixa,
  contas = contasPadrao,
}: {
  titulo: TituloFinanceiro;
  ocupado: boolean;
  enviarBaixa: (e: FormEvent<HTMLFormElement>) => void;
  contas?: Record<string, string>;
}) {
  const [valor, setValor] = useState(titulo.aberto_centavos);
  const [taxa, setTaxa] = useState(0);
  const [forma, setForma] = useState(
    titulo.forma_prevista && formas[titulo.forma_prevista]
      ? titulo.forma_prevista
      : "pix",
  );
  const [conta, setConta] = useState(() => {
    const preferida = titulo.forma_prevista === "dinheiro" ? "caixa" : "banco";
    return contas[preferida] ? preferida : Object.keys(contas)[0] || "";
  });
  const cartao = forma === "credito" || forma === "debito";
  const contaSelecionada = contas[conta] ? conta : Object.keys(contas)[0] || "";
  const receber = titulo.natureza === "receber";
  const previa = previaBaixaFinanceira(
    titulo.aberto_centavos,
    valor,
    receber ? taxa : 0,
    titulo.natureza,
  );
  return (
    <form className="formulario-cliente fin-form-baixa" onSubmit={enviarBaixa}>
      <fieldset disabled={ocupado}>
        <div className="fin-baixa-resumo" data-natureza={titulo.natureza}>
          <span className="fin-baixa-icone">
            {receber ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
          </span>
          <div>
            <span>{titulo.descricao}</span>
            <small>Saldo a {receber ? "receber" : "pagar"}</small>
          </div>
          <strong>{dinheiro(titulo.aberto_centavos)}</strong>
        </div>
        <div className="dupla-campos">
          <label>
            Valor {receber ? "recebido" : "pago"} agora (R$)
            <input
              name="valor"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              type="number"
              inputMode="decimal"
              min="0.01"
              max={titulo.aberto_centavos / 100}
              step="0.01"
              required
              defaultValue={titulo.aberto_centavos / 100}
              onChange={(e) => setValor(Math.round(e.target.valueAsNumber * 100))}
            />
          </label>
          <label>
            Data
            <input
              name="data"
              type="date"
              max={hoje()}
              required
              defaultValue={hoje()}
            />
          </label>
        </div>
        <div className="dupla-campos">
          <label>
            Onde o dinheiro movimentou?
            <select
              name="conta"
              value={contaSelecionada}
              onChange={(e) => setConta(e.target.value)}
            >
              {Object.entries(contas).map(([k, n]) => (
                <option value={k} key={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Forma
            <select
              name="forma"
              value={forma}
              onChange={(e) => {
                const novaForma = e.target.value;
                setForma(novaForma);
                setTaxa(0);
                if (["caixa", "banco"].includes(conta))
                  setConta(
                    contas[novaForma === "dinheiro" ? "caixa" : "banco"]
                      ? novaForma === "dinheiro"
                        ? "caixa"
                        : "banco"
                      : conta,
                  );
              }}
            >
              {Object.entries(formas).map(([k, n]) => (
                <option value={k} key={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!contaSelecionada && (
          <p role="status">
            Ative ou cadastre uma conta em Contas bancárias para registrar o dinheiro.
          </p>
        )}
        {titulo.natureza === "receber" && (
          <details key={forma} className="fin-baixa-observacao" open={cartao}>
            <summary>
              {cartao
                ? "Taxa do cartão (opcional)"
                : "Taxa deste recebimento (opcional)"}
            </summary>
            <label>
              Taxa descontada deste recebimento (R$)
              <input
                name="taxa"
                type="number"
                inputMode="decimal"
                min="0"
                max={Number.isSafeInteger(valor) && valor > 0 ? (valor - 1) / 100 : 0}
                step="0.01"
                value={Number.isFinite(taxa) ? taxa / 100 : ""}
                onChange={(e) =>
                  setTaxa(
                    e.target.value === ""
                      ? 0
                      : Math.round(e.target.valueAsNumber * 100),
                  )
                }
              />
              <small>
                Desconto do banco ou cartão. A prévia abaixo já desconta essa taxa. A
                taxa deve ser menor que o valor recebido.
              </small>
            </label>
          </details>
        )}
        <details className="fin-baixa-observacao">
          <summary>Adicionar observação (opcional)</summary>
          <label>
            Observação
            <textarea name="observacao" maxLength={1000} rows={2} />
          </label>
        </details>
        {previa && (
          <div className="fin-baixa-previa" aria-live="polite">
            <div>
              <span>{receber ? "Entrada líquida no caixa" : "Saída do caixa"}</span>
              <strong>{dinheiro(previa.liquido)}</strong>
            </div>
            <div>
              <span>
                {valor === titulo.aberto_centavos
                  ? "Após confirmar"
                  : "Ainda ficará em aberto"}
              </span>
              <strong>
                {valor === titulo.aberto_centavos
                  ? "Conta quitada"
                  : dinheiro(previa.restante)}
              </strong>
            </div>
          </div>
        )}
        <button className="botao-primario" disabled={!previa || !contaSelecionada}>
          {ocupado ? "Registrando…" : "Confirmar registro"}
        </button>
      </fieldset>
    </form>
  );
}
