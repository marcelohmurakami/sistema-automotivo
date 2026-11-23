import { novoId } from "../lib/uuid";
import { rpc } from "../lib/rpc";

import { salvarOS } from "./ordensServico";
import { supabase, erroPublico } from "../lib/supabase";
import {
  validarDocumentoOffline,
  type ReciboDocumentoOffline,
} from "../lib/documentoOffline";
import {
  guardarRascunhoOffline,
  type RascunhoOffline,
} from "../lib/atendimentoOffline";
export async function sincronizarRascunho(
  r: RascunhoOffline,
  usuario: string,
  oficina: string,
) {
  if (r.usuario !== usuario || r.oficina !== oficina)
    throw new Error("Entre com a mesma conta e oficina do rascunho.");
  if (!navigator.onLine) throw new Error("Reconecte à internet para sincronizar.");
  if (r.documento) return sincronizarDocumento(r, oficina);
  const auto = !r.ramo || r.ramo === "automotivo";
  if (!r.os_id && (!r.cliente_id || (auto ? !r.veiculo_id : !r.objeto?.trim())))
    throw new Error(
      auto
        ? "Selecione cliente e veículo antes de sincronizar."
        : "Selecione o cliente e informe o equipamento ou local antes de sincronizar.",
    );
  const d = structuredClone(r);
  try {
    if (!d.os_id) {
      if (!auto) {
        d.objeto_id ||= novoId();
        await guardarRascunhoOffline(d);
        d.os_id = await rpc<string>("criar_rascunho_servico_offline", {
          p_oficina: oficina,
          p_id: d.id,
          p_objeto: d.objeto_id,
          p_dados: {
            cliente_id: d.cliente_id,
            nome: d.objeto,
            relato: d.relato,
            data_servico: d.data_servico,
          },
        });
      } else {
        const os = await salvarOS(
          false,
          oficina,
          {
            cliente_id: d.cliente_id,
            veiculo_id: d.veiculo_id,
            ...(d.data_servico ? { data_servico: d.data_servico } : {}),
            queixa_cliente: d.relato,
            quilometragem_entrada: d.quilometragem,
          },
          d.id,
        );
        d.os_id = os.id;
      }
      d.situacao = "parcial";
      await guardarRascunhoOffline(d);
    }
    for (const foto of d.fotos.filter((f) => !f.sincronizada)) {
      const blob = await (await fetch(foto.imagem)).blob();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const reserva = await rpc<{ id: string; caminho: string }>(
        auto ? "reservar_foto_os_offline" : "reservar_foto_servico_offline",
        {
          p_oficina: oficina,
          [auto ? "p_os" : "p_atendimento"]: d.os_id,
          p_chave: foto.id,
          p_hash: hash,
          p_fase: auto ? foto.fase : foto.fase === "after" ? "depois" : "antes",
          p_tamanho: blob.size,
          p_legenda: foto.legenda,
        },
      );
      const { error } = await supabase!.storage
        .from("workshop-files")
        .upload(reserva.caminho, blob, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (error && String((error as { statusCode?: string }).statusCode) !== "409")
        throw error;
      await rpc(auto ? "confirmar_foto_os" : "confirmar_foto_atendimento", {
        p_oficina: oficina,
        ...(auto ? {} : { p_atendimento: d.os_id }),
        p_arquivo: reserva.id,
      });
      foto.sincronizada = true;
      await guardarRascunhoOffline(d);
    }
    d.situacao = "sincronizado";
    d.erro = "";
    await guardarRascunhoOffline(d);
    return d;
  } catch (e) {
    d.erro = erroPublico(e);
    if (d.os_id) d.situacao = "parcial";
    await guardarRascunhoOffline(d);
    throw e;
  }
}

async function sincronizarDocumento(r: RascunhoOffline, oficina: string) {
  const d = structuredClone(r);
  if (!d.pronto_envio)
    throw Error("Conclua o preenchimento e clique em Salvar antes de enviar.");
  if (d.situacao === "sincronizado") return d;
  try {
    if (!d.pedido_documento) {
      validarDocumentoOffline(d.documento!);
      d.pedido_documento = structuredClone(d.documento!);
      await guardarRascunhoOffline(d);
    }
    const recibo = await rpc<ReciboDocumentoOffline>("sincronizar_documento_offline", {
      p_oficina: oficina,
      p_chave: d.id,
      p_documento: d.pedido_documento,
    });
    d.recibo = recibo;
    d.os_id = recibo.id;
    d.situacao = "sincronizado";
    d.erro = "";
    await guardarRascunhoOffline(d);
    window.dispatchEvent(new Event("patio-offline-alterado"));
    return d;
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    // Só libera edição quando o servidor confirmou que a transação não foi feita.
    if (["22023", "23514", "23503", "23505", "P0002", "23P01"].includes(codigo || "")) {
      delete d.pedido_documento;
      d.pronto_envio = false;
    }
    d.erro = erroPublico(e);
    await guardarRascunhoOffline(d);
    window.dispatchEvent(new Event("patio-offline-alterado"));
    throw e;
  }
}
