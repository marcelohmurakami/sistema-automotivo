import { execucaoDoUsuario } from "../lib/execucaoOffline";
import { rascunhoDoUsuario } from "../lib/atendimentoOffline";
import { sincronizarExecucao } from "./execucaoOffline";
import { sincronizarRascunho } from "./sincronizarOffline";

export type ItemFilaOffline = { tipo: "novo" | "execucao"; id: string };

/** Relê dentro da trava para que dois cliques/abas não criem duas ordens. */
export async function sincronizarItemOffline(
  item: ItemFilaOffline,
  usuario: string,
  oficina: string,
) {
  const executar = async () => {
    if (item.tipo === "novo") {
      const atual = await rascunhoDoUsuario(usuario, oficina, item.id);
      if (!atual) throw Error("Atendimento indisponível neste aparelho.");
      if (atual.situacao !== "sincronizado")
        await sincronizarRascunho(atual, usuario, oficina);
    } else {
      const atual = await execucaoDoUsuario(usuario, oficina, item.id);
      if (!atual) throw Error("Execução indisponível neste aparelho.");
      if (atual.pendente) await sincronizarExecucao(atual, usuario, oficina);
    }
  };
  const trava =
    item.tipo === "novo" ? `patio-sync-${item.id}` : `patio-execucao-${item.id}`;
  if (navigator.locks) await navigator.locks.request(trava, executar);
  else await executar();
}
