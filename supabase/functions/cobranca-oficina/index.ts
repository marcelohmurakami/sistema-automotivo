import { createClient } from "npm:@supabase/supabase-js@2";
import {
  lerConfiguracaoCobranca,
  precosTeste,
  conferirPreco,
  chamarStripe,
} from "../_shared/cobranca.mjs";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (dados: unknown, status = 200) =>
  Response.json(dados, { status, headers: cors });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  if (req.method !== "POST") return reply({ erro: "Método inválido." }, 405);
  const config = lerConfiguracaoCobranca((nome: string) => Deno.env.get(nome));
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("authorization") || "" },
      },
      auth: { persistSession: false },
    },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let reserva: string | undefined, oficina: string | undefined;
  try {
    const { data: user, error: authError } = await client.auth.getUser();
    if (authError || !user.user)
      return reply({ erro: "Entre na sua conta." }, 401);
    const corpo = await req.text();
    if (corpo.length > 4096)
      return reply({ erro: "Solicitação inválida." }, 400);
    const entrada = JSON.parse(corpo);
    oficina = entrada.oficina;
    if (typeof oficina !== "string" || !/^[0-9a-f-]{36}$/i.test(oficina))
      return reply({ erro: "Oficina inválida." }, 400);
    const { data: consulta, error: acesso } = await client.rpc(
      "consultar_cobranca",
      { p_oficina: oficina, p_ambiente: config.ambiente },
    );
    if (acesso)
      return reply(
        { erro: "Somente o proprietário pode administrar a assinatura." },
        403,
      );
    if (entrada.acao === "consultar")
      return reply({
        ...consulta,
        habilitado: config.habilitado,
        ambiente: config.ambiente,
        precos: config.valores,
      });
    if (!config.habilitado)
      return reply(
        { erro: "A cobrança ainda não foi ativada pelo administrador." },
        503,
      );
    if (!["checkout", "portal"].includes(entrada.acao))
      return reply({ erro: "Operação inválida." }, 400);
    if (
      entrada.acao === "checkout" &&
      !Object.hasOwn(precosTeste, entrada.plano)
    )
      return reply({ erro: "Plano inválido." }, 400);
    const { data: conta, error: lock } = await admin.rpc(
      "reservar_operacao_cobranca",
      {
        p_oficina: oficina,
        p_usuario: user.user.id,
        p_ambiente: config.ambiente,
        p_plano: entrada.acao === "checkout" ? entrada.plano : null,
      },
    );
    if (lock)
      return reply(
        {
          erro:
            lock.code === "PT409"
              ? lock.message
              : "Não foi possível preparar sua assinatura.",
        },
        409,
      );
    reserva = conta.reserva;
    let cliente = conta.cliente_provedor_id;
    if (!cliente) {
      if (entrada.acao === "portal")
        return reply(
          { erro: "Ainda não existe uma conta de cobrança vinculada." },
          409,
        );
      const novo = await chamarStripe(
        config,
        "customers",
        { "metadata[oficina_id]": oficina },
        `patio-cliente-${config.ambiente}-${oficina}`,
      );
      if (novo.livemode !== config.live) throw new Error("ambiente_invalido");
      cliente = novo.id;
      const { error } = await admin.rpc("vincular_cliente_cobranca", {
        p_oficina: oficina,
        p_reserva: reserva,
        p_cliente: cliente,
        p_ambiente: config.ambiente,
      });
      if (error) throw error;
    }
    if (entrada.acao === "portal") {
      const sessao = await chamarStripe(config, "billing_portal/sessions", {
        customer: cliente,
        return_url: `${config.origem}/planos`,
        configuration: config.portal,
      });
      if (new URL(sessao.url).origin !== "https://billing.stripe.com")
        throw new Error("url_invalida");
      return reply({ url: sessao.url });
    }
    // Consulta ao provedor sob a mesma reserva: impede uma segunda assinatura
    // mesmo quando o pagamento ocorreu antes de o webhook chegar ao banco.
    const existentes = await chamarStripe(
      config,
      `subscriptions?customer=${encodeURIComponent(cliente)}&status=all&limit=100`,
    );
    if (
      existentes.has_more ||
      existentes.data.some(
        (s: { status: string }) =>
          !["canceled", "incomplete_expired"].includes(s.status),
      )
    )
      return reply(
        {
          erro: "Você já possui uma assinatura no provedor. Use Gerenciar assinatura para trocar o plano ou regularizar o pagamento.",
        },
        409,
      );
    const preco = await chamarStripe(
      config,
      `prices/${config.precos[entrada.plano]}`,
    );
    conferirPreco(preco, entrada.plano, config);
    const sessao = await chamarStripe(
      config,
      "checkout/sessions",
      {
        mode: "subscription",
        customer: cliente,
        locale: "pt-BR",
        client_reference_id: oficina,
        "line_items[0][price]": config.precos[entrada.plano],
        "line_items[0][quantity]": 1,
        "subscription_data[metadata][oficina_id]": oficina,
        success_url: `${config.origem}/planos?retorno=checkout`,
        cancel_url: `${config.origem}/planos?retorno=cancelado`,
        expires_at: Math.floor(
          new Date(conta.checkout_expira_em).getTime() / 1000,
        ),
      },
      `patio-checkout-${conta.checkout_chave}`,
    );
    if (
      sessao.livemode !== config.live ||
      new URL(sessao.url).origin !== "https://checkout.stripe.com"
    )
      throw new Error("checkout_invalido");
    return reply({ url: sessao.url });
  } catch {
    return reply(
      {
        erro: "Não foi possível acessar a cobrança agora. Tente novamente; seu plano só muda após a confirmação do provedor.",
      },
      503,
    );
  } finally {
    if (reserva && oficina)
      await admin.rpc("liberar_operacao_cobranca", {
        p_oficina: oficina,
        p_reserva: reserva,
        p_ambiente: config.ambiente,
      });
  }
});
