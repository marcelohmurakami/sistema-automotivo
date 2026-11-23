export function normalizarEntrada(envelope, configuracao, agora = Date.now()) {
  const esperado = String(configuracao.EVOLUTION_WEBHOOK_SECRET || "");
  const recebido = String(
    envelope.params?.secret || envelope.headers?.["x-webhook-secret"] || "",
  );
  if (!esperado || recebido !== esperado) return [];
  if (configuracao.EVOLUTION_INSTANCE !== "estudos-whatsapp")
    throw new Error("A instância autorizada é estudos-whatsapp.");
  const corpo = envelope.body || {};
  if ((corpo.instance || corpo.instanceName) !== "estudos-whatsapp") return [];
  if (
    !["MESSAGES_UPSERT", "MESSAGE_UPSERT"].includes(
      String(corpo.event || "")
        .toUpperCase()
        .replace(/[.-]/g, "_"),
    )
  )
    return [];
  const vistos = new Set();
  return (Array.isArray(corpo.data) ? corpo.data : [corpo.data]).flatMap(
    (entrada) => {
      if (!entrada || typeof entrada !== "object") return [];
      const chave = entrada.key || {};
      if (
        chave.fromMe === true ||
        String(chave.fromMe).toLowerCase() === "true"
      )
        return [];
      const candidatos = [chave.remoteJidAlt, chave.remoteJid].filter(
        (v) => typeof v === "string",
      );
      if (candidatos.some((v) => /@(g\.us|broadcast|newsletter)$/.test(v)))
        return [];
      const destino = candidatos.find((v) =>
        /^\d{10,15}@s\.whatsapp\.net$/.test(v),
      );
      if (!destino) return [];
      const id = String(chave.id || "");
      if (id.length < 4 || id.length > 200 || vistos.has(id)) return [];
      const timestamp = Number(entrada.messageTimestamp);
      if (
        Number.isFinite(timestamp) &&
        timestamp > 0 &&
        (timestamp * 1000 < agora - 10 * 60000 ||
          timestamp * 1000 > agora + 60000)
      )
        return [];
      let mensagem = entrada.message || {};
      for (let i = 0; i < 3; i++) {
        const interna =
          mensagem.ephemeralMessage?.message ||
          mensagem.viewOnceMessage?.message ||
          mensagem.viewOnceMessageV2?.message;
        if (!interna) break;
        mensagem = interna;
      }
      const texto = String(
        mensagem.conversation ||
          mensagem.extendedTextMessage?.text ||
          mensagem.imageMessage?.caption ||
          mensagem.videoMessage?.caption ||
          mensagem.buttonsResponseMessage?.selectedDisplayText ||
          mensagem.listResponseMessage?.singleSelectReply?.selectedRowId ||
          "",
      )
        .trim()
        .slice(0, 4000);
      const midia = mensagem.audioMessage
        ? "audio"
        : mensagem.imageMessage
          ? "imagem"
          : mensagem.videoMessage
            ? "video"
            : mensagem.documentMessage
              ? "documento"
              : mensagem.stickerMessage
                ? "figurinha"
                : "";
      if (!texto && !midia) return [];
      vistos.add(id);
      return [
        {
          id: `estudos-whatsapp:${destino}:${id}`,
          numero: destino.split("@")[0],
          texto,
          midia,
        },
      ];
    },
  );
}

export function prepararResposta(entrada) {
  const texto = entrada.texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const inicio = "*Oficina do Marcelo · atendimento automático*\n\n";
  let resposta;
  if (
    /^(oi|ola|opa|bom dia|boa tarde|boa noite|menu|inicio|0)[!.,\s]*$/.test(
      texto,
    )
  ) {
    resposta =
      "Olá! Como podemos ajudar?\n\n1 — Pedir orçamento\n2 — Consultar andamento do serviço\n3 — Solicitar agendamento\n4 — Falar com a oficina\n\nResponda com o número ou descreva o que precisa.";
  } else if (
    /^(1)$/.test(texto) ||
    /orcamento|quanto custa|preco|valor|revisao|freio|oleo|funilaria|pintura|alinhamento|motor/.test(
      texto,
    )
  ) {
    resposta =
      "Para a oficina preparar seu orçamento, envie em uma mensagem:\n• Seu nome\n• Modelo e ano do veículo\n• Serviço desejado ou o que está acontecendo\n\nSe ajudar, anexe uma foto. O valor e o prazo serão confirmados pela oficina após avaliar o pedido.";
  } else if (
    texto === "2" ||
    /andamento|ficou pronto|esta pronto|minha os|ordem de servico/.test(texto)
  ) {
    resposta =
      "Envie seu nome e o número da OS ou a placa do veículo. A oficina irá conferir o andamento nesta conversa.\n\nSe já recebeu um link de acompanhamento, você também pode consultá-lo. Não informamos dados de outros clientes por aqui.";
  } else if (
    texto === "3" ||
    /agendar|agendamento|marcar horario|horario|amanha/.test(texto)
  ) {
    resposta =
      "Para solicitar um horário, envie seu nome, modelo do veículo, serviço e o dia/período de preferência.\n\nA solicitação não é uma reserva: aguarde a confirmação de disponibilidade pela oficina.";
  } else if (
    texto === "4" ||
    /atendente|humano|falar com|reclamacao/.test(texto)
  ) {
    resposta =
      "Pode deixar sua dúvida ou solicitação nesta conversa para a equipe da oficina responder. O retorno humano depende da disponibilidade da equipe.\n\nNão envie senhas ou dados de cartão.";
  } else if (entrada.midia === "audio") {
    resposta =
      "Recebemos seu áudio nesta conversa. Este atendimento automático não transcreve áudio. Para adiantar, escreva o modelo do veículo e o que precisa, ou digite 4 para solicitar atendimento da oficina.";
  } else if (entrada.midia) {
    resposta =
      "Recebemos seu anexo nesta conversa. Para a oficina avaliar, informe por texto seu nome, modelo do veículo e o problema. A imagem, sozinha, não confirma diagnóstico nem orçamento.";
  } else if (/^(obrigad[oa]|valeu|ok|certo|entendi|sim)[!.,\s]*$/.test(texto)) {
    resposta =
      "Por nada! As informações ficam nesta conversa para a oficina conferir. Digite *menu* se precisar de outra opção.";
  } else if (/^(sair|parar|cancelar|pare|stop)[!.,\s]*$/.test(texto)) {
    resposta =
      "Tudo bem. Este atendimento responde apenas quando você nos escreve. Para cancelar um serviço ou horário já combinado, informe isso à equipe nesta conversa.";
  } else {
    resposta =
      "Recebemos sua mensagem nesta conversa. Para adiantar o atendimento, informe seu nome, modelo/ano do veículo e o serviço ou problema. A oficina precisa confirmar orçamento, prazo e disponibilidade.\n\nDigite *menu* para ver as opções ou *4* para solicitar atendimento da equipe.";
  }
  return { numero: entrada.numero, texto: inicio + resposta };
}
