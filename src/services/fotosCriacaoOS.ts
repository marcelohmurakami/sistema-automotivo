import {
  guardarRascunhoOffline,
  rascunhosPendentesDoUsuario,
  type FotoOffline,
  type RascunhoOffline,
} from "../lib/atendimentoOffline";
import { consultarOS, enviarFotoOS, type OrdemServico } from "./ordensServico";
import { sincronizarRascunho } from "./sincronizarOffline";

export async function guardarFotosCriacaoOS(
  usuario: string,
  oficina: string,
  os: OrdemServico,
  fotos: FotoOffline[],
) {
  const r: RascunhoOffline = {
    id: crypto.randomUUID(),
    usuario,
    oficina,
    ramo: "automotivo",
    cliente_id: os.cliente_id || "",
    veiculo_id: os.veiculo_id || "",
    relato: `Fotos da OS #${os.numero}`,
    quilometragem: null,
    fotos: structuredClone(fotos),
    atualizado: Date.now(),
    os_id: os.id,
    situacao: "parcial",
    erro: "Fotos aguardando envio.",
  };
  await guardarRascunhoOffline(r);
  return r;
}

export async function enviarFotosCriacaoOS(
  demo: boolean,
  usuario: string,
  oficina: string,
  os: OrdemServico,
  fotos: FotoOffline[],
  rascunho?: RascunhoOffline,
) {
  if (demo) {
    for (const f of fotos.filter((f) => !f.sincronizada)) {
      const blob = await (await fetch(f.imagem)).blob();
      await enviarFotoOS(
        true,
        oficina,
        os,
        new File([blob], `${f.id}.jpg`, { type: "image/jpeg" }),
        f.fase,
        f.legenda,
      );
      f.sincronizada = true;
    }
  } else {
    if (!rascunho || rascunho.os_id !== os.id)
      throw Error("Confira a OS das fotos antes de enviar.");
    await sincronizarRascunho(rascunho, usuario, oficina);
  }
  return consultarOS(demo, oficina, os.id);
}

export async function fotosPendentesOS(usuario: string, oficina: string, os: string) {
  return (await rascunhosPendentesDoUsuario(usuario, oficina)).filter(
    (r) => r.os_id === os && r.fotos.some((f) => !f.sincronizada),
  );
}
