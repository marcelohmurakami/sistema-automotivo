import { novoId } from "../lib/uuid.ts";
import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Square, Sparkles } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { supabase, erroPublico } from "../lib/supabase";
import {
  conferirCaptura,
  reduzirFoto,
  type CapturaAtendimento,
} from "../lib/capturaAtendimento";
import "../pages/OficinaAgil.css";
type Reconhecimento = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export function AtendimentoExpresso({
  aplicar,
  compacto = false,
  aoSelecionarFoto,
  aoPrepararFoto,
}: {
  aplicar: (c: CapturaAtendimento) => void;
  compacto?: boolean;
  aoSelecionarFoto?: (imagem: string | null) => void;
  aoPrepararFoto?: (preparando: boolean) => void;
}) {
  const a = useAcesso(),
    [texto, setTexto] = useState(""),
    [foto, setFoto] = useState(""),
    [captura, setCaptura] = useState<CapturaAtendimento | null>(null),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [gravando, setGravando] = useState(false),
    [aviso, setAviso] = useState("");
  const voz = useRef<Reconhecimento | null>(null);
  const analiseEmCurso = useRef(false);
  const fotoAtual = useRef(0);
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  useEffect(() => () => voz.current?.abort(), []);
  function ditar() {
    setErro("");
    if (gravando) {
      voz.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => Reconhecimento;
      webkitSpeechRecognition?: new () => Reconhecimento;
    };
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) {
      setErro(
        "Ditado indisponível neste navegador. Use o microfone do teclado do celular ou digite abaixo.",
      );
      return;
    }
    const r = new C();
    voz.current = r;
    r.lang = "pt-BR";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) =>
      setTexto((t) =>
        (t + " " + Array.from(e.results, (x) => x[0].transcript).join(" "))
          .trim()
          .slice(0, 3000),
      );
    r.onerror = () => {
      setErro(
        "Não foi possível ouvir. Confira a permissão do microfone ou use o teclado.",
      );
      setGravando(false);
    };
    r.onend = () => setGravando(false);
    try {
      r.start();
      setGravando(true);
    } catch {
      setErro("Não foi possível iniciar o ditado.");
    }
  }
  async function analisar() {
    if (analiseEmCurso.current || preparandoFoto) return;
    analiseEmCurso.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      const { data, error } = await supabase!.functions.invoke("capturar-atendimento", {
        body: {
          oficina: a.oficina!.id,
          chave: novoId(),
          texto,
          imagem: foto || null,
        },
      });
      if (error) {
        let m =
          "A leitura assistida precisa de IA configurada e conexão à internet. Você pode usar o relato sem IA.";
        try {
          const v = await error.context?.json();
          if (v?.erro) m = v.erro;
        } catch {
          /* A função pode não estar publicada. */
        }
        throw new Error(m);
      }
      if (data.erro) throw new Error(data.erro);
      setCaptura(conferirCaptura(data.captura));
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      analiseEmCurso.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      className={`agil-detalhes ${compacto ? "atendimento-expresso-compacto" : ""}`}
    >
      <summary>Preencher por voz ou foto</summary>
      <p>Descreva o problema. Para ler placa ou KM, fotografe a placa ou o painel.</p>
      <label>
        Relato rápido
        <textarea
          value={texto}
          disabled={busy}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={3000}
          rows={3}
          placeholder="Ex.: cliente relata barulho ao frear; conferir pastilhas dianteiras…"
        />
      </label>
      <div className="agil-acoes">
        <button
          type="button"
          className="botao-secundario"
          onClick={ditar}
          disabled={busy}
        >
          {gravando ? <Square size={16} /> : <Mic size={16} />}{" "}
          {gravando ? "Parar ditado" : "Ditar relato"}
        </button>
        <button
          type="button"
          className="botao-secundario"
          disabled={!texto.trim() || busy}
          onClick={() => {
            aplicar({
              placa: null,
              quilometragem: null,
              relato: texto,
              itens: [],
            });
            setAviso("Relato incluído. Confira os dados abaixo.");
          }}
        >
          Usar relato
        </button>
      </div>
      <small>
        O ditado pode usar o serviço de voz do navegador. Você inicia e para a gravação.
      </small>
      <label>
        <span>
          <Camera size={16} /> Foto para leitura assistida
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const versaoFoto = ++fotoAtual.current;
            setPreparandoFoto(true);
            aoPrepararFoto?.(true);
            setErro("");
            try {
              const reduzida = await reduzirFoto(f);
              if (versaoFoto !== fotoAtual.current) return;
              setFoto(reduzida);
              aoSelecionarFoto?.(reduzida);
              setCaptura(null);
            } catch (e) {
              if (versaoFoto === fotoAtual.current) setErro(erroPublico(e));
            } finally {
              if (versaoFoto === fotoAtual.current) {
                setPreparandoFoto(false);
                aoPrepararFoto?.(false);
              }
            }
          }}
        />
      </label>
      {foto && (
        <div className="agil-fotos">
          <img src={foto} alt="Foto selecionada para conferência" />
          <button
            type="button"
            className="botao-secundario"
            disabled={busy}
            onClick={() => {
              fotoAtual.current++;
              setPreparandoFoto(false);
              setFoto("");
              aoSelecionarFoto?.(null);
              aoPrepararFoto?.(false);
              setCaptura(null);
            }}
          >
            Remover foto
          </button>
          {aoSelecionarFoto && (
            <small>Esta foto também será anexada à OS ao salvar.</small>
          )}
        </div>
      )}
      {a.permite("ai") ? (
        <>
          <small>
            A análise envia relato e foto à IA. Você revisa antes de aplicar.
          </small>
          <button
            type="button"
            className="botao-secundario"
            disabled={
              busy ||
              preparandoFoto ||
              gravando ||
              a.demo ||
              (!foto && texto.trim().length < 10)
            }
            onClick={() => void analisar()}
          >
            <Sparkles size={16} />{" "}
            {busy ? "Lendo informações…" : "Organizar e ler com IA"}
          </button>
        </>
      ) : (
        <small>
          A leitura de fotos e organização por IA estão no plano Completo. O ditado do
          relato continua disponível.
        </small>
      )}
      {captura && (
        <div className="agil-card">
          <h3>Confira antes de usar</h3>
          <div className="agil-grade">
            <label>
              Placa
              <input
                maxLength={7}
                value={captura.placa || ""}
                onChange={(e) =>
                  setCaptura({
                    ...captura,
                    placa: e.target.value.toUpperCase() || null,
                  })
                }
              />
            </label>
            <label>
              Quilometragem
              <input
                type="number"
                min={0}
                max={9999999}
                value={captura.quilometragem ?? ""}
                onChange={(e) =>
                  setCaptura({
                    ...captura,
                    quilometragem: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
          </div>
          <label>
            Relato
            <textarea
              maxLength={4000}
              value={captura.relato}
              onChange={(e) => setCaptura({ ...captura, relato: e.target.value })}
            />
          </label>
          {captura.itens.map((i, n) => (
            <label key={n}>
              Item {n + 1}
              <input
                value={i.descricao}
                maxLength={300}
                onChange={(e) =>
                  setCaptura({
                    ...captura,
                    itens: captura.itens.map((v, k) =>
                      k === n ? { ...v, descricao: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
          ))}
          <p>Preços não são inventados. Confira quantidade e valores no orçamento.</p>
          <button
            type="button"
            className="botao-primario"
            onClick={() => {
              try {
                aplicar(conferirCaptura(captura));
                setCaptura(null);
                setAviso(
                  "Dados incluídos. Confira cliente, veículo, quantidades e preços antes de salvar.",
                );
              } catch (e) {
                setErro(erroPublico(e));
              }
            }}
          >
            Conferi. Usar no atendimento
          </button>
        </div>
      )}
      {erro && (
        <p role="alert" className="agil-alerta">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
    </details>
  );
}
