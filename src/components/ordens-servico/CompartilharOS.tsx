import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, MessageCircle, Share2 } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import { Dialogo } from "../Dialogo";
import { erroPublico, supabase } from "../../lib/supabase";
import { documentoDaOS } from "../../lib/documentoCliente";
import { consultarClienteDemo, normalizarTelefone } from "../../services/clientes";
import { consultarIdentidade } from "../../services/documentos";
import type { OrdemServico } from "../../services/ordensServico";

export function CompartilharOS({ os }: { os: OrdemServico }) {
  const a = useAcesso();
  const [aberto, setAberto] = useState(false),
    [telefone, setTelefone] = useState<string | null>(null);
  const [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [aviso, setAviso] = useState("");
  const q = useQuery({
    queryKey: ["compartilhar-os", a.demo, a.oficina!.id, os.id, os.revisao],
    enabled: aberto,
    staleTime: 0,
    queryFn: async () => {
      const [identidade, { gerarPdfOrdemServico }, cliente] = await Promise.all([
        consultarIdentidade(a.demo, a.oficina!.id),
        import("../../services/pdfOrdemServico"),
        !os.cliente_id
          ? Promise.resolve(null)
          : a.demo
            ? Promise.resolve(consultarClienteDemo(os.cliente_id))
            : supabase!
                .from("clientes")
                .select("telefone_e164")
                .eq("oficina_id", a.oficina!.id)
                .eq("id", os.cliente_id)
                .maybeSingle()
                .then(({ data, error }) => {
                  if (error) throw error;
                  return data;
                }),
      ]);
      const pdf = gerarPdfOrdemServico(documentoDaOS(os, identidade));
      return {
        arquivo: new File([pdf.output("blob")], `OS-${os.numero}.pdf`, {
          type: "application/pdf",
        }),
        telefone: cliente?.telefone_e164 ?? os.dados_cliente.telefone_e164 ?? "",
      };
    },
  });
  const numero = telefone ?? q.data?.telefone ?? "";
  let validado = "";
  try {
    validado = normalizarTelefone(numero).replace(/\D/g, "");
  } catch {
    /* Validação no clique. */
  }
  const link = validado
    ? `https://wa.me/${validado}?text=${encodeURIComponent(`Olá${os.dados_cliente.nome ? `, ${os.dados_cliente.nome}` : ""}! Segue a ordem de serviço #${os.numero}.`)}`
    : "";
  const nativo =
    !!q.data &&
    typeof navigator.share === "function" &&
    !!navigator.canShare?.({ files: [q.data.arquivo] });
  function baixar() {
    if (!q.data) return;
    const url = URL.createObjectURL(q.data.arquivo),
      el = document.createElement("a");
    el.href = url;
    el.download = q.data.arquivo.name;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function compartilhar() {
    if (ocupado || !q.data) return;
    if (!validado) {
      setErro("Informe um WhatsApp válido com DDD.");
      return;
    }
    setErro("");
    setAviso("");
    setOcupado(true);
    try {
      if (nativo) {
        await navigator.share({
          files: [q.data.arquivo],
          title: `OS #${os.numero}`,
          text: `Ordem de serviço #${os.numero} · ${os.dados_cliente.nome}`,
        });
        setAviso(
          "Compartilhamento concluído no celular. Confira a conversa no WhatsApp.",
        );
      } else {
        baixar();
        window.open(link, "_blank", "noopener,noreferrer");
        setAviso("PDF baixado. Anexe o arquivo à conversa do WhatsApp para enviar.");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setErro("Não foi possível compartilhar. Baixe o PDF e abra a conversa abaixo.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <button
        className="botao-secundario os-compartilhar"
        aria-label="Compartilhar no WhatsApp"
        onClick={() => {
          setAberto(true);
          setErro("");
          setAviso("");
          setTelefone(null);
        }}
      >
        <MessageCircle size={18} />{" "}
        <span className="os-acao-desktop">Compartilhar no WhatsApp</span>
        <span className="os-acao-mobile" aria-hidden="true">
          WhatsApp
        </span>
      </button>
      <Dialogo
        aberto={aberto}
        fechar={() => !ocupado && setAberto(false)}
        titulo={`Compartilhar OS #${os.numero}`}
        classe="dialogo-compartilhar-os"
      >
        <div className="formulario-cliente os-compartilhar-conteudo">
          <p>
            <strong>{os.dados_cliente.nome}</strong> · PDF da OS
          </p>
          {q.isPending && <p role="status">Preparando PDF…</p>}
          {q.isError && (
            <p role="alert">
              {erroPublico(q.error)}{" "}
              <button onClick={() => void q.refetch()}>Tentar novamente</button>
            </p>
          )}
          <label>
            WhatsApp do cliente
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(DDD) 99999-9999"
              value={numero}
              disabled={ocupado}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </label>
          {!q.isPending && !q.data?.telefone && (
            <small>Número usado só neste envio.</small>
          )}
          <p className="texto-suave">
            {nativo
              ? "No celular, escolha WhatsApp e o contato. Use Abrir conversa para localizar o número."
              : "Baixe o PDF e anexe na conversa que será aberta."}
          </p>
          <button
            className="botao-primario"
            disabled={!q.data || ocupado}
            onClick={() => void compartilhar()}
          >
            <Share2 size={18} />
            {ocupado
              ? "Compartilhando…"
              : nativo
                ? "Compartilhar PDF"
                : "Baixar PDF e abrir WhatsApp"}
          </button>
          {q.data && (
            <div className="os-compartilhar-alternativas">
              <button className="botao-secundario" onClick={baixar}>
                <Download size={16} /> Baixar PDF
              </button>
              {link && (
                <a
                  className="botao-secundario"
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={16} /> Abrir conversa
                </a>
              )}
            </div>
          )}
          {erro && <p role="alert">{erro}</p>}
          {aviso && <p role="status">{aviso}</p>}
        </div>
      </Dialogo>
    </>
  );
}
