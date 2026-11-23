import { createClient } from "npm:@supabase/supabase-js@2";
import {
  lerConfiguracaoCobranca,
  verificarAssinaturaStripe,
  idAssinaturaEvento,
  chamarStripe,
  projetarAssinatura,
} from "../_shared/cobranca.mjs";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Método inválido", { status: 405 });
  const config = lerConfiguracaoCobranca((nome: string) => Deno.env.get(nome));
  if (!config.habilitado)
    return new Response("Cobrança não configurada", { status: 503 });
  const corpo = await req.text();
  if (
    corpo.length > 262144 ||
    !(await verificarAssinaturaStripe(
      corpo,
      req.headers.get("stripe-signature"),
      config.webhook,
    ))
  )
    return new Response("Assinatura inválida", { status: 400 });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let oficina: string | undefined, reserva: string | undefined;
  try {
    const evento = JSON.parse(corpo);
    if (evento.livemode !== config.live || !/^evt_[A-Za-z0-9]+$/.test(evento.id))
      return new Response("Evento inválido", { status: 400 });
    const assinatura = idAssinaturaEvento(evento);
    if (!assinatura) return Response.json({ recebido: true, ignorado: true });
    if (
      typeof assinatura !== "string" ||
      !/^sub_[A-Za-z0-9]+$/.test(assinatura)
    )
      return new Response("Assinatura inválida", { status: 400 });
    const cliente = evento.data.object.customer;
    const { data: conta, error } = await admin
      .from("contas_cobranca")
      .select("oficina_id")
      .eq("cliente_provedor_id", cliente)
      .eq("ambiente", config.ambiente)
      .maybeSingle();
    if (error) throw error;
    if (!conta) return Response.json({ recebido: true, ignorado: true });
    oficina = conta.oficina_id;
    const { data: repetido, error: duplicado } = await admin
      .from("eventos_cobranca_provedor")
      .select("id")
      .eq("id", evento.id)
      .maybeSingle();
    if (duplicado) throw duplicado;
    if (repetido) return Response.json({ recebido: true, repetido: true });
    const { data: lock, error: ocupado } = await admin.rpc(
      "reservar_operacao_cobranca",
      { p_oficina: oficina, p_ambiente: config.ambiente },
    );
    if (ocupado) throw ocupado;
    reserva = lock.reserva;
    const atual = await chamarStripe(config, `subscriptions/${assinatura}`);
    const estado = projetarAssinatura(atual, oficina, cliente, config);
    const { error: fim } = await admin.rpc("aplicar_assinatura_provedor", {
      p_oficina: oficina,
      p_reserva: reserva,
      p_evento: evento.id,
      p_tipo: evento.type,
      p_cliente: cliente,
      p_assinatura: assinatura,
      p_plano: estado.plano,
      p_situacao: estado.situacao,
      p_periodo_final: estado.periodo_final,
      p_cancelar_no_fim: estado.cancelar_no_fim,
      p_ambiente: config.ambiente,
    });
    if (fim) throw fim;
    return Response.json({ recebido: true });
  } catch {
    // Retorno não-2xx solicita nova entrega do provedor. Não registra sucesso parcial.
    return new Response("Sincronização pendente; tente novamente", {
      status: 503,
    });
  } finally {
    if (oficina && reserva)
      await admin.rpc("liberar_operacao_cobranca", {
        p_oficina: oficina,
        p_reserva: reserva,
        p_ambiente: config.ambiente,
      });
  }
});
