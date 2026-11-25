import { consultarOS } from "./ordensServico";
import { moverOSNoMapa } from "./mapaOficina";
import { consultarDetalhesAtendimento } from "./servicosCompletos";
import { diaLocal, gravarServico } from "./servicos";
import { apresentacaoEntrega, registrarRetirada } from "../lib/assistenciaTecnica";
import { temAceiteServico, validarAceiteServico } from "../lib/aceiteServico";

/** Confirma a revisão atual e conserva a operação normal de entrega. */
export async function entregarAposCriacao(
  demo: boolean,
  oficina: string,
  tipo: "os" | "atendimento",
  id: string,
  recebedor: string,
) {
  if (tipo === "os") {
    const os = await consultarOS(demo, oficina, id);
    if (os.situacao === "delivered") return;
    if (os.situacao !== "ready" || os.arquivado_em)
      throw new Error("A situação da OS mudou. Confira os detalhes antes de entregar.");
    await moverOSNoMapa(demo, oficina, id, os.revisao, "avancar");
    return;
  }
  const { atendimento: atual } = await consultarDetalhesAtendimento(demo, oficina, id);
  if (atual.situacao !== "concluido")
    throw new Error(
      "A situação do serviço mudou. Confira os detalhes antes de entregar.",
    );
  const emCampo = temAceiteServico(atual);
  if (
    emCampo
      ? ["Aceito", "Aceito com ressalvas"].includes(
          atual.ficha_especialidade?.campos.situacao_aceite || "",
        )
      : apresentacaoEntrega(atual).confirmada
  )
    return;
  const novo = emCampo
    ? {
        ...atual,
        ficha_especialidade: {
          ...atual.ficha_especialidade!,
          campos: {
            ...atual.ficha_especialidade!.campos,
            situacao_aceite: "Aceito",
            aceite: recebedor.trim(),
            data_aceite: diaLocal(new Date()),
            ressalvas_aceite: "",
          },
        },
      }
    : registrarRetirada(atual, recebedor, atual.ficha_especialidade!.especialidade);
  validarAceiteServico(novo);
  await gravarServico(
    "salvar_atendimento_servico",
    oficina,
    {
      p_id: id,
      p_revisao: atual.revisao,
      p_dados: novo,
    },
    demo,
  );
}
