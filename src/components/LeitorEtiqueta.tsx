import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { DialogoLocalizacao as Dialogo } from "./localizacao/DialogoLocalizacao";
import "../pages/Localizacao.css";

/** A câmera é iniciada apenas por ação explícita; o arquivo nunca é enviado. */
export function LeitorEtiqueta({
  fechar,
  lido,
}: {
  fechar: () => void;
  lido: (codigo: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const controle = useRef<{ stop: () => void } | null>(null);
  const geracao = useRef(0);
  const [camera, setCamera] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [codigo, setCodigo] = useState("");
  function parar() {
    geracao.current++;
    controle.current?.stop();
    controle.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
  }
  useEffect(
    () => () => {
      geracao.current++;
      controle.current?.stop();
    },
    [],
  );
  function concluir(texto: string) {
    parar();
    lido(texto);
  }
  async function iniciar() {
    setErro("");
    setOcupado(true);
    setCamera(true);
    const tentativa = ++geracao.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Use HTTPS para permitir a câmera ou leia uma foto da etiqueta.",
        );
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (tentativa !== geracao.current || !video.current) return;
      const controls = await new BrowserMultiFormatReader().decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current,
        (resultado) => {
          if (resultado && tentativa === geracao.current) concluir(resultado.getText());
        },
      );
      if (tentativa !== geracao.current) controls.stop();
      else controle.current = controls;
    } catch (e) {
      if (tentativa === geracao.current) {
        parar();
        setCamera(false);
        setErro(
          e instanceof Error && e.message.startsWith("Use HTTPS")
            ? e.message
            : "Não foi possível abrir a câmera. Confira a permissão ou use uma foto / código digitado.",
        );
      }
    } finally {
      setOcupado(false);
    }
  }
  async function foto(arquivo?: File) {
    if (!arquivo) return;
    parar();
    setCamera(false);
    setErro("");
    if (arquivo.size > 12 * 1024 * 1024) {
      setErro("Use uma imagem de até 12 MB.");
      return;
    }
    setOcupado(true);
    const tentativa = geracao.current;
    const url = URL.createObjectURL(arquivo);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const r = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      if (tentativa === geracao.current) concluir(r.getText());
    } catch {
      if (tentativa === geracao.current)
        setErro(
          "Não encontrei um código legível. Fotografe a etiqueta inteira, com boa iluminação.",
        );
    } finally {
      URL.revokeObjectURL(url);
      setOcupado(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={() => {
        parar();
        fechar();
      }}
      titulo="Ler etiqueta"
    >
      <div className="loc-form">
        <p>
          Leia o QR da etiqueta ou o código de barras / número de série do fabricante.
        </p>
        <video
          ref={video}
          muted
          playsInline
          className={`loc-camera ${camera ? "" : "oculto"}`}
          aria-label="Câmera para leitura da etiqueta"
        />
        <div className="loc-acoes">
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado || camera}
            onClick={() => void iniciar()}
          >
            <Camera size={18} /> Abrir câmera
          </button>
          {camera && (
            <button
              type="button"
              className="botao-secundario"
              onClick={() => {
                parar();
                setCamera(false);
              }}
            >
              Parar câmera
            </button>
          )}
          <label className="botao-secundario loc-arquivo">
            <ImagePlus size={18} /> Ler foto
            <input
              type="file"
              accept="image/*"
              disabled={ocupado}
              onChange={(e) => {
                void foto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (codigo.trim()) concluir(codigo);
          }}
          className="loc-form"
        >
          <label>
            Código da etiqueta
            <input
              value={codigo}
              maxLength={2048}
              autoFocus
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Digite ou use o leitor USB / Bluetooth"
            />
          </label>
          <button className="botao-primario" disabled={!codigo.trim() || ocupado}>
            Localizar
          </button>
        </form>
        {ocupado && <p role="status">Preparando leitura…</p>}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <small>A leitura só consulta. Nenhum item é movido automaticamente.</small>
      </div>
    </Dialogo>
  );
}
