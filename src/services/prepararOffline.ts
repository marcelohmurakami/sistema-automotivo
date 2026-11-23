import type { OficinaAcesso } from "../auth/contexto";
import { rpc } from "../lib/rpc";
import { guardarBase } from "../lib/atendimentoOffline";
import { baixarBaseOffline } from "./orcamentos";
import { consultarIdentidade } from "./documentos";

/** Atualiza os cadastros locais sem substituir atendimentos ainda não enviados. */
export async function prepararNovosAtendimentos(
  usuario: string,
  oficina: OficinaAcesso,
) {
  const ramo = oficina.ramo || "automotivo";
  async function carregarObjetos() {
    const objetos: NonNullable<
      import("../lib/atendimentoOffline").BaseOffline["objetos"]
    > = [];
    if (ramo !== "automotivo") {
      let apos: { nome: string; id: string } | null = null;
      do {
        const pagina: { objetos: typeof objetos; proximo: typeof apos } = await rpc(
          "pagina_servicos",
          {
            p_oficina: oficina.id,
            p_filtros: { tela: "objetos" },
            p_apos: apos,
          },
        );
        objetos.push(...pagina.objetos);
        apos = pagina.proximo;
      } while (apos);
    }
    return objetos;
  }
  // Leituras independentes; só substitui a base após receber todos os cadastros.
  const [aux, identidade, objetos] = await Promise.all([
    baixarBaseOffline(false, oficina.id),
    consultarIdentidade(false, oficina.id),
    carregarObjetos(),
  ]);
  await guardarBase({
    id: `${usuario}:${oficina.id}`,
    usuario,
    oficina: oficina.id,
    nome: oficina.nome,
    atualizado: Date.now(),
    ramo,
    especialidade: oficina.especialidade,
    identidade,
    objetos,
    aux,
  });
}
