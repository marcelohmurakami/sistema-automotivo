import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { prepararModulo, prepararRota } from "../lib/prepararNavegacao";

export function PrepararNavegacao() {
  const a = useAcesso(),
    local = useLocation();
  const ramo = a.oficina?.ramo || (a.oficina ? "automotivo" : undefined);
  useEffect(() => {
    if (!a.usuario && !a.demo) return;
    // A primeira abertura pertence à rota e à validação de acesso. Antecipação aqui
    // concorria com esse carregamento; prepare somente o próximo gesto do usuário.
    if (!ramo) return;
    const antecipar = (evento: Event) => {
      if (!(evento.target instanceof Element)) return;
      const alvo = evento.target.closest<HTMLElement>(
        "a[href], [data-preparar-modulo]",
      );
      if (!alvo) return;
      if (alvo.dataset.prepararModulo) prepararModulo(alvo.dataset.prepararModulo);
      const href = alvo.getAttribute("href");
      if (href && !href.startsWith("#") && !alvo.hasAttribute("download"))
        prepararRota(href, ramo === "automotivo", true);
    };
    document.addEventListener("pointerover", antecipar, { passive: true });
    document.addEventListener("pointerdown", antecipar, { passive: true });
    document.addEventListener("focusin", antecipar);
    // No celular não há hover. Prepare só o formulário da tela atual, após o carregamento
    // principal e quando o navegador estiver ocioso; respeite economia de dados/rede 2G.
    const rede = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const telaDocumento = [
      "/",
      "/ordens-servico",
      "/atendimentos",
      "/orcamentos",
    ].includes(local.pathname);
    let ocioso: number | undefined;
    const tempo =
      telaDocumento &&
      !rede?.saveData &&
      !["slow-2g", "2g"].includes(rede?.effectiveType || "")
        ? window.setTimeout(() => {
            const carregar = () =>
              prepararModulo(
                ramo !== "automotivo"
                  ? "formularioServico"
                  : local.pathname === "/orcamentos"
                    ? "formularioOrcamento"
                    : "formularioOS",
              );
            if ("requestIdleCallback" in window)
              ocioso = window.requestIdleCallback(carregar, { timeout: 3000 });
            else carregar();
          }, 2000)
        : undefined;
    return () => {
      window.clearTimeout(tempo);
      if (ocioso !== undefined) window.cancelIdleCallback(ocioso);
      document.removeEventListener("pointerover", antecipar);
      document.removeEventListener("pointerdown", antecipar);
      document.removeEventListener("focusin", antecipar);
    };
  }, [a.usuario, a.demo, ramo, local.pathname, local.search]);
  return null;
}
