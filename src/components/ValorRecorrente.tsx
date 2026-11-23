import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import {
  confirmarValorRecorrente,
  type TituloFinanceiro,
} from "../services/financeiro";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { erroPublico } from "../lib/supabase";

export function ValorRecorrente({
  titulo,
  aoAtualizar,
}: {
  titulo: TituloFinanceiro;
  aoAtualizar: (t: TituloFinanceiro) => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const trava = useRef(false);
  if (!titulo.valor_variavel || titulo.cancelado_em || titulo.baixado_centavos > 0)
    return null;
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trava.current) return;
    const valor = Math.round(
      Number(new FormData(e.currentTarget).get("valor_mes")) * 100,
    );
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const t = await confirmarValorRecorrente(a.demo, a.oficina!.id, titulo, valor);
      aoAtualizar(t);
      await atualizarIntegracoes(qc, [
        "recorrencias",
        "financeiro",
        "financeiro-detalhe",
      ]);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <details
      className="recorrencia-valor-mes"
      open={!titulo.valor_confirmado_em}
      key={`${titulo.id}:${titulo.revisao}`}
    >
      <summary>
        {titulo.valor_confirmado_em
          ? "Valor do mês confirmado · alterar"
          : "Conta variável · confirme o valor deste mês"}
      </summary>
      <p>
        Referência: {titulo.competencia.slice(0, 7).split("-").reverse().join("/")}.
        Altere somente este lançamento. Os outros meses e a previsão da recorrência
        permanecem iguais.
      </p>
      <form className="formulario-cliente" onSubmit={salvar}>
        <label>
          Valor total deste mês (R$)
          <input
            name="valor_mes"
            type="number"
            min="0.01"
            max="100000000"
            step="0.01"
            required
            defaultValue={(titulo.valor_centavos / 100).toFixed(2)}
            disabled={ocupado}
          />
        </label>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <button className="botao-primario" disabled={ocupado}>
          {ocupado ? "Salvando…" : "Confirmar valor deste mês"}
        </button>
      </form>
    </details>
  );
}
