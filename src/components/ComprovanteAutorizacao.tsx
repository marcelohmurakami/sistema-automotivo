import { Download } from "lucide-react";
import { useState } from "react";
import { dinheiro } from "../lib/formatacao";
import { dataDocumento } from "../lib/documentoCliente";
import type { ComprovanteAutorizacao as Comprovante } from "../lib/diagnosticoOrcamento";
import "./ComprovanteAutorizacao.css";

export function ComprovanteAutorizacao({
  comprovante: p,
}: {
  comprovante?: Comprovante | null;
}) {
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  if (!p) return null;
  return (
    <section className="comprovante-autorizacao">
      <h3>Comprovante da resposta</h3>
      <p>
        <strong>{p.nome}</strong> · {dataDocumento(p.confirmado_em)} ·{" "}
        {p.origem === "equipe"
          ? "Registrado pela equipe"
          : p.origem === "portal"
            ? "Área do cliente"
            : "Link do cliente"}
      </p>
      <p>
        Versão {p.documento.versao ?? p.versao_id.slice(0, 8)} · Valor autorizado:{" "}
        <strong>{dinheiro(p.total_centavos)}</strong>
      </p>
      <p>{p.declaracao}</p>
      {!!p.taxa_diagnostico?.valor_centavos && (
        <p>
          Diagnóstico: <strong>{dinheiro(p.taxa_diagnostico.valor_centavos)}</strong>,
          cobrado separadamente. Abatimento registrado:{" "}
          <strong>{dinheiro(p.taxa_diagnostico.abatimento_centavos || 0)}</strong>.
        </p>
      )}
      {erro && <p role="alert">{erro}</p>}
      <button
        type="button"
        className="botao-secundario"
        disabled={gerando}
        onClick={async () => {
          setGerando(true);
          setErro("");
          try {
            const { gerarComprovanteAutorizacao } =
              await import("../services/pdfAutorizacao");
            gerarComprovanteAutorizacao(p).save(
              `autorizacao-${p.documento.numero}-${p.versao_id.slice(0, 8)}.pdf`,
            );
          } catch {
            setErro("Não foi possível gerar o PDF. Tente novamente.");
          } finally {
            setGerando(false);
          }
        }}
      >
        <Download size={17} />
        {gerando ? "Gerando PDF…" : "Baixar comprovante da resposta"}
      </button>
      <details>
        <summary>Identificação do comprovante</summary>
        <p style={{ overflowWrap: "anywhere" }}>{p.hash_sha256}</p>
        <small>
          Registro vinculado ao conteúdo desta versão. O nome informado pelo link é
          declarado pelo cliente; não é assinatura digital certificada.
        </small>
      </details>
    </section>
  );
}
