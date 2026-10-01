import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import {
  consultarIdentidade,
  salvarIdentidade,
  prepararLogo,
  type Identidade,
} from "../services/documentos";
import { erroPublico } from "../lib/supabase";
export function IdentidadeDocumentos() {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["identidade", a.demo, a.oficina!.id],
    queryFn: () => consultarIdentidade(a.demo, a.oficina!.id),
  });
  return (
    <section className="os-painel">
      <h2>Identidade nos documentos</h2>
      <p>Seu logo, sua cor e uma mensagem ao cliente.</p>
      {q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : q.data ? (
        <Editor key={q.dataUpdatedAt} inicial={q.data} />
      ) : (
        <p>Carregando…</p>
      )}
    </section>
  );
}
function Editor({ inicial }: { inicial: Identidade }) {
  const a = useAcesso(),
    cache = useQueryClient();
  const [d, setD] = useState(inicial),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="formulario-cliente"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErro("");
        try {
          await salvarIdentidade(a.demo, a.oficina!.id, d);
          setAviso(
            "Identidade salva. Novos documentos usarão esta apresentação.",
          );
          await cache.invalidateQueries({ queryKey: ["identidade"] });
        } catch (e) {
          setErro(erroPublico(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset
        disabled={busy || a.oficina?.perfil === "staff"}
        style={{ border: 0, padding: 0, display: "grid", gap: 16 }}
      >
        <label>
          Logo (PNG ou JPG, até 5 MB)
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setErro("");
              try {
                setD({ ...d, logo: await prepararLogo(f) });
              } catch (e) {
                setErro(erroPublico(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {d.logo && (
          <div>
            <img
              src={d.logo}
              alt="Logo da oficina"
              style={{
                maxWidth: 180,
                maxHeight: 90,
                background: "white",
                borderRadius: 12,
              }}
            />
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setD({ ...d, logo: "" })}
            >
              Remover logo
            </button>
          </div>
        )}
        <label>
          Cor dos documentos
          <input
            type="color"
            value={d.cor || "#244336"}
            onChange={(e) => setD({ ...d, cor: e.target.value })}
          />
        </label>
        <label>
          Mensagem no final do documento
          <textarea
            maxLength={300}
            value={d.rodape || ""}
            onChange={(e) => setD({ ...d, rodape: e.target.value })}
          />
        </label>
        <button className="botao-primario" disabled={busy}>
          Salvar identidade
        </button>
      </fieldset>
      {erro && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
    </form>
  );
}
