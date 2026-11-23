import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import {
  consultarIdentidade,
  salvarIdentidade,
  prepararLogo,
  prepararQrPix,
  type Identidade,
} from "../services/documentos";
import { erroPublico } from "../lib/supabase";
import { ImagePlus, QrCode } from "lucide-react";
import "./IdentidadeDocumentos.css";
export function IdentidadeDocumentos({
  semCabecalho = false,
}: {
  semCabecalho?: boolean;
}) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["identidade", a.demo, a.oficina!.id],
    queryFn: ({ signal }) => consultarIdentidade(a.demo, a.oficina!.id, signal),
    refetchOnWindowFocus: false,
  });
  return (
    <section className="identidade-documentos">
      {!semCabecalho && <h2>Logo e identidade visual</h2>}
      {q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : q.data ? (
        <Editor key={`${a.demo}:${a.oficina!.id}`} inicial={q.data} />
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
      className="identidade-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErro("");
        setAviso("");
        try {
          await salvarIdentidade(a.demo, a.oficina!.id, d);
          setAviso("Logo e identidade salvas. O menu lateral já foi atualizado.");
          await cache.invalidateQueries({ queryKey: ["identidade"] });
        } catch (e) {
          setErro(erroPublico(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy || a.oficina?.perfil === "staff"}>
        <div className="identidade-arquivos">
          <div className="identidade-arquivo">
            <h3>Logo da empresa</h3>
            <p>Aparece no menu lateral e nos novos documentos.</p>
            <div className="identidade-previa">
              {d.logo ? (
                <img src={d.logo} alt="Prévia da logo da empresa" />
              ) : (
                <>
                  <ImagePlus size={30} aria-hidden="true" />
                  <span>Nenhuma logo adicionada</span>
                </>
              )}
            </div>
            <label>
              Logo (PNG ou JPG, até 5 MB)
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  e.target.value = "";
                  setBusy(true);
                  setErro("");
                  try {
                    const logo = await prepararLogo(f);
                    setD((atual) => ({ ...atual, logo }));
                  } catch (e) {
                    setErro(
                      e instanceof DOMException
                        ? "Não foi possível abrir esta imagem. Escolha outro arquivo PNG ou JPG."
                        : erroPublico(e),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {d.logo && (
              <button
                type="button"
                className="botao-secundario"
                onClick={() => setD({ ...d, logo: "" })}
              >
                Remover logo
              </button>
            )}
          </div>
          <div className="identidade-arquivo">
            <h3>
              QR Code Pix <small>(opcional)</small>
            </h3>
            <p>Use o QR Code do banco, sem valor fixo, para aparecer na OS.</p>
            <div className="identidade-previa">
              {d.pix_qr ? (
                <img src={d.pix_qr} alt="QR Code Pix cadastrado" />
              ) : (
                <>
                  <QrCode size={30} aria-hidden="true" />
                  <span>Nenhum QR Code adicionado</span>
                </>
              )}
            </div>
            <label>
              QR Code Pix da empresa (PNG ou JPG, até 5 MB)
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  e.target.value = "";
                  setBusy(true);
                  setErro("");
                  try {
                    const pix_qr = await prepararQrPix(f);
                    setD((atual) => ({ ...atual, pix_qr }));
                  } catch (e) {
                    setErro(erroPublico(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {d.pix_qr && (
              <button
                type="button"
                className="botao-secundario"
                onClick={() => setD({ ...d, pix_qr: "" })}
              >
                Remover QR Code Pix
              </button>
            )}
          </div>
        </div>
        <div className="identidade-personalizacao">
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
              rows={3}
              maxLength={300}
              value={d.rodape || ""}
              onChange={(e) => setD({ ...d, rodape: e.target.value })}
            />
          </label>
        </div>
        <div className="identidade-rodape">
          <button className="botao-primario" disabled={busy}>
            {busy ? "Salvando…" : "Salvar identidade"}
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
