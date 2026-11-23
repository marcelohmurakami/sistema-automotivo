import { useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { reduzirFoto } from "../../lib/capturaAtendimento";
import { erroPublico } from "../../lib/supabase";
import type { FotoOffline } from "../../lib/atendimentoOffline";
import "./FotosCriacaoOS.css";

export function FotosCriacaoOS({
  fotos,
  alterar,
  processando,
}: {
  fotos: FotoOffline[];
  alterar: (fotos: FotoOffline[]) => void;
  processando: (valor: boolean) => void;
}) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  async function adicionar(arquivos: File[]) {
    if (trava.current || !arquivos.length) return;
    if (fotos.length + arquivos.length > 12) {
      setErro("Adicione até 12 fotos por vez.");
      return;
    }
    trava.current = true;
    setOcupado(true);
    processando(true);
    setErro("");
    try {
      const novas: FotoOffline[] = [];
      for (const arquivo of arquivos)
        novas.push({
          id: crypto.randomUUID(),
          imagem: await reduzirFoto(arquivo),
          fase: "before",
          legenda: "Foto registrada na criação da OS",
          sincronizada: false,
        });
      alterar([...fotos, ...novas]);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
      processando(false);
    }
  }
  return (
    <section className="fotos-criacao-os" aria-label="Fotos do atendimento">
      <div>
        <h3>
          Fotos do atendimento <small>(opcional)</small>
        </h3>
        <p>As fotos ficam salvas na aba Fotos da OS.</p>
      </div>
      <div className="fotos-criacao-acoes">
        <label className="botao-secundario">
          <Camera size={18} /> Tirar foto
          <input
            className="sr-only"
            aria-label="Tirar foto do atendimento"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={ocupado}
            onChange={(e) => {
              void adicionar(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
        </label>
        <label className="botao-secundario">
          <ImagePlus size={18} /> Galeria
          <input
            className="sr-only"
            aria-label="Selecionar fotos do atendimento"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={ocupado}
            onChange={(e) => {
              void adicionar(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {ocupado && <p role="status">Preparando fotos…</p>}
      {erro && <p role="alert">{erro}</p>}
      {!!fotos.length && (
        <div className="fotos-criacao-grade">
          {fotos.map((f, i) => (
            <figure key={f.id}>
              <img src={f.imagem} alt={`Foto do atendimento ${i + 1}`} />
              <button
                className="botao-icone"
                type="button"
                aria-label={`Remover foto ${i + 1}`}
                disabled={ocupado}
                onClick={() => alterar(fotos.filter((x) => x.id !== f.id))}
              >
                <X size={18} />
              </button>
              <figcaption>Foto {i + 1}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
