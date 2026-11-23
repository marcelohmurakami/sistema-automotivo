import { useState } from "react";
import type { AtendimentoServico } from "../services/servicos";
import { diaLocal } from "../services/servicos";
import { temAceiteServico, validarAceiteServico } from "../lib/aceiteServico";

export function AceiteServico({
  atendimento: a,
  ocupado,
  salvar,
}: {
  atendimento: AtendimentoServico;
  ocupado: boolean;
  salvar: (a: AtendimentoServico) => Promise<void>;
}) {
  const [editar, setEditar] = useState(false),
    [erro, setErro] = useState("");
  if (!temAceiteServico(a) || a.situacao !== "concluido") return null;
  const f = a.ficha_especialidade!,
    c = f.campos;
  return (
    <section className="atendimento-retirada">
      <div>
        <strong>Conferência do cliente · {c.situacao_aceite || "Pendente"}</strong>
        <p>
          {c.situacao_aceite && c.situacao_aceite !== "Pendente"
            ? `${c.aceite} · ${c.data_aceite?.split("-").reverse().join("/")}`
            : "Registre quem conferiu o serviço e eventuais ressalvas."}
        </p>
        {c.ressalvas_aceite && <p>{c.ressalvas_aceite}</p>}
      </div>
      {!editar ? (
        <button disabled={ocupado} onClick={() => setEditar(true)}>
          Registrar conferência / aceite
        </button>
      ) : (
        <form
          className="atendimento-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (ocupado) return;
            setErro("");
            const fd = new FormData(e.currentTarget);
            const novo = {
              ...a,
              ficha_especialidade: {
                ...f,
                campos: {
                  ...c,
                  ...Object.fromEntries(
                    [
                      "aceite",
                      "situacao_aceite",
                      "data_aceite",
                      "ressalvas_aceite",
                    ].map((k) => [k, String(fd.get(k) || "").trim()]),
                  ),
                },
              },
            };
            try {
              validarAceiteServico(novo);
              await salvar(novo);
              setEditar(false);
            } catch (err) {
              setErro(
                err instanceof Error
                  ? err.message
                  : "Não foi possível salvar a conferência.",
              );
            }
          }}
        >
          <label>
            Quem conferiu o serviço?
            <input
              name="aceite"
              required
              maxLength={1500}
              defaultValue={c.aceite || ""}
            />
          </label>
          <label>
            Resultado da conferência
            <select
              name="situacao_aceite"
              defaultValue={
                c.situacao_aceite && c.situacao_aceite !== "Pendente"
                  ? c.situacao_aceite
                  : "Aceito"
              }
            >
              <option>Aceito</option>
              <option>Aceito com ressalvas</option>
              <option>Não aceito</option>
            </select>
          </label>
          <label>
            Data da conferência
            <input
              type="date"
              name="data_aceite"
              required
              defaultValue={c.data_aceite || diaLocal(new Date())}
            />
          </label>
          <label>
            Ressalvas / motivo da recusa
            <textarea
              name="ressalvas_aceite"
              maxLength={1500}
              rows={2}
              defaultValue={c.ressalvas_aceite || ""}
            />
          </label>
          {erro && <p role="alert">{erro}</p>}
          <div className="atendimento-acoes">
            <button disabled={ocupado} className="botao-primario">
              Salvar conferência
            </button>
            <button type="button" disabled={ocupado} onClick={() => setEditar(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
