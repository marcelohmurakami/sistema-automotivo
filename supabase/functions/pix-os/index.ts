import { createClient } from "npm:@supabase/supabase-js@2";
import {
  configuracaoPix,
  corpoCriacaoPix,
  chamarPix,
  pagamentoConferido,
} from "../_shared/pix.mjs";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
Deno.serve(async (req) => {
  const reply = (d: unknown, s = 200) =>
    Response.json(d, { status: s, headers: cors });
  if (req.method === "OPTIONS") return reply({});
  if (req.method !== "POST") return reply({ erro: "Método inválido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!,
      client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: {
          headers: { Authorization: req.headers.get("authorization") || "" },
        },
        auth: { persistSession: false },
      });
    const { data: user, error: authError } = await client.auth.getUser();
    if (authError || !user.user)
      return reply({ erro: "Entre na sua conta." }, 401);
    const d = await req.json();
    if (typeof d.oficina !== "string")
      return reply({ erro: "Oficina inválida." }, 400);
    const { data: acessos, error: acessoErro } = await client.rpc(
      "consultar_meu_acesso",
    );
    const acesso = acessos?.find(
      (o: { id: string; perfil: string; recursos: string[] }) =>
        o.id === d.oficina &&
        ["owner", "manager"].includes(o.perfil) &&
        o.recursos.includes("finance"),
    );
    if (acessoErro || !acesso)
      return reply({ erro: "Acesso ao financeiro indisponível." }, 403);
    const config = configuracaoPix((k: string) => Deno.env.get(k), d.oficina);
    if (d.acao === "configuracao")
      return reply({
        disponivel: !!config,
        ambiente: config?.ambiente ?? null,
      });
    if (!config)
      return reply(
        {
          erro: "O recebimento por Pix precisa ser conectado à conta da sua oficina. Os pagamentos manuais continuam disponíveis.",
        },
        503,
      );
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    let c;
    if (d.acao === "criar") {
      const { data, error } = await client.rpc("reservar_cobranca_pix", {
        p_oficina: d.oficina,
        p_titulo: d.titulo,
        p_chave: d.chave,
        p_valor: d.valor_centavos,
        p_email: d.email,
        p_ambiente: config.ambiente,
      });
      if (error) return reply({ erro: error.message }, 400);
      c = data;
    } else {
      const { data, error } = await admin
        .from("cobrancas_pix")
        .select("*")
        .eq("oficina_id", d.oficina)
        .eq("id", d.chave)
        .single();
      if (error) return reply({ erro: "Cobrança não encontrada." }, 404);
      c = data;
    }
    if (c.ambiente !== config.ambiente)
      return reply(
        {
          erro: "Cobrança de outro ambiente. Confira a configuração da oficina.",
        },
        409,
      );
    let pagamento;
    if (!c.provedor_id) {
      pagamento = await chamarPix(
        config,
        "/v1/payments",
        corpoCriacaoPix(c, config, url),
        "POST",
        c.id,
      );
    } else pagamento = await chamarPix(config, `/v1/payments/${c.provedor_id}`);
    if (d.acao === "cancelar" && pagamento.status === "pending")
      pagamento = await chamarPix(
        config,
        `/v1/payments/${pagamento.id}`,
        { status: "cancelled" },
        "PUT",
        c.id,
      );
    const conferido = pagamentoConferido(pagamento, c, config);
    const { error } = await admin.rpc("atualizar_cobranca_pix", {
      p_id: c.id,
      p_dados: conferido,
    });
    if (error) throw error;
    const { data, error: readError } = await client.rpc(
      "consultar_cobrancas_pix",
      { p_oficina: d.oficina, p_titulo: c.titulo_id },
    );
    if (readError) throw readError;
    return reply({ cobranca: data.find((p: { id: string }) => p.id === c.id) });
  } catch {
    return reply(
      {
        erro: "Não foi possível consultar o Pix. A cobrança será retomada com a mesma identificação; confira novamente antes de cobrar de outra forma.",
      },
      503,
    );
  }
});
