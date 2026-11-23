import { rpc } from "../lib/rpc";
import { useState } from "react";
import { useAcesso } from "../auth/contexto";
import { especialidades, especialidadePadrao } from "../lib/especialidades";
import { perfilAtendimento } from "../lib/perfisAtendimento";

import { erroPublico } from "../lib/supabase";

export function EspecialidadeEmpresa() {
  const a = useAcesso();
  return <Editor key={a.oficina!.id} />;
}
function Editor() {
  const a = useAcesso();
  const [valor, setValor] = useState(
    a.oficina?.especialidade || especialidadePadrao(a.oficina?.ramo),
  );
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  return (
    <form
      className="gestao-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setOcupado(true);
        setErro("");
        setAviso("");
        try {
          if (a.demo) {
            localStorage.setItem(`patio_especialidade:${a.oficina!.id}`, valor);
            window.dispatchEvent(new Event("oficina-demo-alterada"));
          } else
            await rpc("salvar_especialidade_empresa", {
              p_oficina: a.oficina!.id,
              p_especialidade: valor,
            });
          await a.atualizar();
          setAviso(
            "Especialidade atualizada. Os tipos já registrados nos serviços foram preservados.",
          );
        } catch (e) {
          setErro(erroPublico(e));
        } finally {
          setOcupado(false);
        }
      }}
    >
      <fieldset disabled={ocupado || a.oficina?.perfil === "staff"}>
        <label>
          Especialidade da empresa
          <select value={valor} onChange={(e) => setValor(e.target.value)} required>
            {Object.entries(especialidades)
              .filter(([, v]) => v.ramo === (a.oficina?.ramo || "automotivo"))
              .map(([id, v]) => (
                <option key={id} value={id}>
                  {v.nome}
                </option>
              ))}
          </select>
        </label>
        <p className="texto-suave">{perfilAtendimento(valor).foco}.</p>
        {a.oficina?.ramo !== "automotivo" && (
          <p className="texto-suave">
            A especialidade define o padrão. Ao abrir um atendimento, você pode escolher
            outro subsetor deste mesmo ramo.
          </p>
        )}
        <details className="configuracoes-etapas">
          <summary>Ver etapas sugeridas para esta especialidade</summary>
          <ol>
            {perfilAtendimento(valor).etapas.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ol>
          <p>
            Novos atendimentos recebem a ficha desta especialidade. As fichas já salvas
            preservam o perfil original.
          </p>
        </details>
        <div className="configuracoes-form-rodape">
          <button className="botao-primario">
            {ocupado ? "Salvando…" : "Salvar especialidade"}
          </button>
        </div>
      </fieldset>
      {erro && (
        <p className="erro-formulario" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="aviso-cliente" role="status">
          {aviso}
        </p>
      )}
    </form>
  );
}
