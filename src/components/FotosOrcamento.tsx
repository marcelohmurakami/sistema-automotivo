import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { supabase, erroPublico } from "../lib/supabase";
import { rpc } from "../services/orcamentos";
type Foto = {
  id: string;
  arquivo_id: string;
  legenda: string;
  caminho: string;
  situacao: string;
};
export function FotosOrcamento({
  versao,
  rascunho,
}: {
  versao: string;
  rascunho: boolean;
}) {
  const a = useAcesso(),
    qc = useQueryClient();
  const [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [legenda, setLegenda] = useState("");
  const q = useQuery({
    queryKey: ["fotos-orcamento", a.oficina!.id, versao, a.demo],
    queryFn: async () =>
      a.demo
        ? []
        : rpc<Foto[]>("listar_fotos_orcamento", {
            p_oficina: a.oficina!.id,
            p_versao: versao,
          }),
  });
  async function enviar(file: File) {
    setBusy(true);
    setErro("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error("Use JPG, PNG ou WebP de até 10 MB.");
      const f = await rpc<{ id: string; caminho: string }>(
        "reservar_foto_orcamento",
        {
          p_oficina: a.oficina!.id,
          p_versao: versao,
          p_nome: file.name,
          p_mime: file.type,
          p_tamanho: file.size,
          p_legenda: legenda,
        },
      );
      const { error } = await supabase!.storage
        .from("workshop-files")
        .upload(f.caminho, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      await rpc("confirmar_foto_orcamento", {
        p_oficina: a.oficina!.id,
        p_arquivo: f.id,
      });
      setLegenda("");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      await qc.invalidateQueries({ queryKey: ["fotos-orcamento"] });
      setBusy(false);
    }
  }
  return (
    <section className="os-painel">
      <h3>Fotos das peças e problemas</h3>
      {rascunho && (
        <>
          <p>
            Até 20 fotos por versão. As fotos ficam preservadas após emitir.
          </p>
          {a.demo ? (
            <p>Entre na conta real para anexar fotos.</p>
          ) : (
            <>
              <label>
                Legenda
                <input
                  maxLength={500}
                  value={legenda}
                  onChange={(e) => setLegenda(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Adicionar foto
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void enviar(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )}
        </>
      )}
      {(erro || q.isError) && (
        <p role="alert">{erro || erroPublico(q.error)}</p>
      )}
      <div className="documentos-grade">
        {q.data?.map((f) => (
          <figure key={f.id}>
            {f.situacao === "ready" ? (
              <ImagemFoto caminho={f.caminho} legenda={f.legenda} />
            ) : (
              <p>Envio incompleto. Remova e tente novamente.</p>
            )}
            <figcaption>{f.legenda}</figcaption>
            {rascunho && (
              <button
                className="botao-secundario"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErro("");
                  try {
                    await rpc("remover_foto_orcamento", {
                      p_oficina: a.oficina!.id,
                      p_anexo: f.id,
                    });
                    await qc.invalidateQueries({
                      queryKey: ["fotos-orcamento"],
                    });
                  } catch (e) {
                    setErro(erroPublico(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remover foto
              </button>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
function ImagemFoto({
  caminho,
  legenda,
}: {
  caminho: string;
  legenda: string;
}) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["foto-orcamento-url", a.usuario, a.oficina!.id, caminho],
    queryFn: async () => {
      const { data, error } = await supabase!.storage
        .from("workshop-files")
        .createSignedUrl(caminho, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 120000,
    refetchInterval: 180000,
  });
  return q.data ? (
    <img
      src={q.data}
      alt={legenda || "Foto anexada ao orçamento"}
      style={{
        width: "100%",
        maxHeight: 240,
        objectFit: "contain",
        borderRadius: 12,
      }}
    />
  ) : (
    <p>
      {q.isError ? "Não foi possível carregar a foto." : "Carregando foto…"}
    </p>
  );
}
