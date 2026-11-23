import { createClient } from "npm:@supabase/supabase-js@2";
import {
  configuracaoPix,
  assinaturaPixValida,
  chamarPix,
  pagamentoConferido,
} from "../_shared/pix.mjs";
Deno.serve(async (req) => {
  const reply = (s: number) =>
    new Response("", { status: s, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return reply(405);
  try {
    const url = new URL(req.url),
      oficina = url.searchParams.get("oficina"),
      id = url.searchParams.get("data.id");
    const config = configuracaoPix((k: string) => Deno.env.get(k), oficina);
    if (!config) return reply(503);
    if (
      !(await assinaturaPixValida({
        assinatura: req.headers.get("x-signature"),
        requestId: req.headers.get("x-request-id"),
        dataId: id,
        segredo: config.segredo_webhook,
      }))
    )
      return reply(401);
    const pagamento = await chamarPix(config, `/v1/payments/${id}`);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: c, error } = await admin
      .from("cobrancas_pix")
      .select("*")
      .eq("oficina_id", oficina)
      .eq("id", pagamento.external_reference)
      .maybeSingle();
    if (error) return reply(503);
    if (!c) return reply(200);
    const dados = pagamentoConferido(pagamento, c, config);
    const { error: save } = await admin.rpc("atualizar_cobranca_pix", {
      p_id: c.id,
      p_dados: dados,
    });
    return reply(save ? 503 : 200);
  } catch {
    return reply(503);
  }
});
