import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { rascunhosPendentesDoUsuario } from "../../lib/atendimentoOffline";

/** Envia somente documentos finalizados pelo usuário, enquanto o aplicativo está aberto. */
export function SincronizacaoDocumentosOffline() {
  const { usuario, oficina, demo } = useAcesso();
  const oficinaId = oficina?.id;
  const cache = useQueryClient();
  useEffect(() => {
    if (!usuario || !oficinaId || demo) return;
    let ativo = true,
      executando = false;
    const tentativas = new Map<string, number>();
    const enviar = async () => {
      if (!ativo || executando || !navigator.onLine) return;
      executando = true;
      try {
        const lista = await rascunhosPendentesDoUsuario(usuario, oficinaId);
        let alterou = false;
        for (const r of lista) {
          if (!ativo || !navigator.onLine) break;
          if (
            !r.documento ||
            !r.pronto_envio ||
            r.situacao === "sincronizado" ||
            Date.now() - (tentativas.get(r.id) || 0) < 30000
          )
            continue;
          tentativas.set(r.id, Date.now());
          try {
            const { sincronizarItemOffline } =
              await import("../../services/filaOffline");
            await sincronizarItemOffline(
              { tipo: "novo", id: r.id },
              usuario,
              oficinaId,
            );
            alterou = true;
          } catch {
            /* O erro e o documento permanecem na fila para conferência. */
          }
        }
        // Um lote sincronizado atualiza as telas uma única vez, não uma vez por OS.
        if (alterou) await cache.invalidateQueries();
      } catch {
        /* IndexedDB indisponível: a área offline mostra o erro ao usuário. */
      } finally {
        executando = false;
      }
    };
    const f = () => {
      void enviar();
    };
    const timer = window.setInterval(f, 30000);
    const inicial = window.setTimeout(f, 500);
    window.addEventListener("online", f);
    window.addEventListener("patio-offline-alterado", f);
    return () => {
      ativo = false;
      clearInterval(timer);
      clearTimeout(inicial);
      window.removeEventListener("online", f);
      window.removeEventListener("patio-offline-alterado", f);
    };
  }, [usuario, oficinaId, demo, cache]);
  return null;
}
