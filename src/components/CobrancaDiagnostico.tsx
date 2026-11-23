import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { rpc } from "../lib/rpc";
import { dinheiro } from "../lib/formatacao";
import { erroPublico } from "../lib/supabase";
export function CobrancaDiagnostico({
  documento,
  tipo,
}: {
  documento: string;
  tipo: "automotivo" | "servico";
}) {
  const a = useAcesso();
  const habilitado = !a.demo && a.permite("finance") && a.oficina?.perfil !== "staff";
  const q = useQuery({
    queryKey: ["taxa-diagnostico", a.oficina?.id, documento, tipo],
    enabled: habilitado,
    queryFn: ({ signal }) =>
      rpc<{
        titulo_id: string;
        valor_centavos: number;
        recebido_centavos: number;
        aberto_centavos: number;
        cancelado: boolean;
      } | null>(
        "consultar_taxa_diagnostico",
        {
          p_oficina: a.oficina!.id,
          p_documento: documento,
          p_tipo: tipo,
        },
        signal,
      ),
  });
  if (!habilitado) return null;
  if (q.isError)
    return (
      <p role="alert">
        {erroPublico(q.error)}{" "}
        <button type="button" onClick={() => void q.refetch()}>
          Conferir taxa novamente
        </button>
      </p>
    );
  if (!q.data || q.data.cancelado) return null;
  return (
    <div className="aviso-cliente">
      <strong>Diagnóstico: {dinheiro(q.data.valor_centavos)}</strong>
      <p>
        Recebido: {dinheiro(q.data.recebido_centavos)} · A receber:{" "}
        {dinheiro(q.data.aberto_centavos)}
      </p>
      <Link
        className="botao-secundario"
        to={`/financeiro?aba=contas&titulo=${q.data.titulo_id}`}
      >
        Receber / consultar taxa
      </Link>
    </div>
  );
}
