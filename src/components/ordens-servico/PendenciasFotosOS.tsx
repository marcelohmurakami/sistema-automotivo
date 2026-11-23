import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { erroPublico } from "../../lib/supabase";

export function PendenciasFotosOS({ osId }: { osId: string }) {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const chave = ["fotos-os-pendentes", a.usuario, oficina, osId];
  const q = useQuery({
    queryKey: chave,
    enabled: !a.demo,
    queryFn: async () => {
      const { fotosPendentesOS } = await import("../../services/fotosCriacaoOS");
      return fotosPendentesOS(a.usuario!, oficina, osId);
    },
  });
  const enviar = useMutation({
    mutationFn: async () => {
      const { sincronizarRascunho } = await import("../../services/sincronizarOffline");
      for (const r of q.data || []) await sincronizarRascunho(r, a.usuario!, oficina);
    },
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: chave }),
        qc.invalidateQueries({ queryKey: ["os-detalhe", a.demo, oficina, osId] }),
      ]);
    },
  });
  if (a.demo || !q.data?.length) return null;
  return (
    <div className="aviso-cliente" role="status">
      <strong>Fotos aguardando envio</strong>
      <p>
        A OS está salva. As fotos estão guardadas neste aparelho até o envio ser
        confirmado.
      </p>
      <button
        className="botao-secundario"
        disabled={enviar.isPending}
        onClick={() => enviar.mutate()}
      >
        {enviar.isPending ? "Enviando fotos…" : "Tentar enviar fotos novamente"}
      </button>
      {enviar.isError && <p role="alert">{erroPublico(enviar.error)}</p>}
    </div>
  );
}
