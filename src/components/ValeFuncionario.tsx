import { novoId } from "../lib/uuid.ts";
import { dinheiro } from "../lib/formatacao";
import { useRef, useState, type FormEvent } from "react";
import { useAcesso } from "../auth/contexto";

import { hoje } from "../services/financeiro";
import {
  abaterValeFuncionario,
  saldoVale,
  type RegistroFuncionario,
} from "../services/funcionarios";
export function ValeFuncionario({
  r,
  funcionario,
  ocupado,
  executar,
}: {
  r: RegistroFuncionario;
  funcionario: string;
  ocupado: boolean;
  executar: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const a = useAcesso(),
    [aberto, setAberto] = useState(false),
    chave = useRef(novoId());
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void executar(() =>
      abaterValeFuncionario(a.demo, a.oficina!.id, funcionario, r, {
        id: chave.current,
        valor_centavos: Math.round(Number(d.get("valor")) * 100),
        data: String(d.get("data")),
        descricao: String(d.get("descricao")),
      }),
    );
  }
  return (
    <div>
      <p>
        <strong>
          Valor: {dinheiro(r.valor_centavos ?? 0)} · Saldo pendente:{" "}
          {r.situacao === "cancelado" ? "Cancelado" : dinheiro(saldoVale(r))}
        </strong>
      </p>
      {(r.abatimentos ?? []).map((p) => (
        <p key={p.id}>
          {p.data.split("-").reverse().join("/")} · {dinheiro(p.valor_centavos)} ·{" "}
          {p.descricao}
        </p>
      ))}
      {r.situacao === "pendente" && (
        <>
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado}
            onClick={() => {
              chave.current = novoId();
              setAberto(!aberto);
            }}
          >
            Registrar devolução / abatimento
          </button>
          {aberto && (
            <form
              className="formulario-cliente funcionario-registro-form"
              onSubmit={salvar}
            >
              <fieldset disabled={ocupado}>
                <div className="dupla-campos">
                  <label>
                    Valor (R$)
                    <input
                      type="number"
                      name="valor"
                      min="0.01"
                      max={saldoVale(r) / 100}
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    Data
                    <input
                      name="data"
                      type="date"
                      min={r.inicio}
                      max={hoje()}
                      defaultValue={hoje()}
                      required
                    />
                  </label>
                </div>
                <label>
                  Descrição
                  <input
                    name="descricao"
                    maxLength={500}
                    required
                    placeholder="Ex.: devolução em dinheiro ou desconto combinado"
                  />
                </label>
                <button className="botao-primario">Salvar abatimento</button>
              </fieldset>
            </form>
          )}
        </>
      )}
    </div>
  );
}
