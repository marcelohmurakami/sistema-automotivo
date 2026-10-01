import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  const reply = (d: unknown, status = 200) =>
    Response.json(d, { status, headers: cors });
  if (req.method !== "POST") return reply({ erro: "Método inválido" }, 405);
  try {
    const { token } = await req.json();
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      return reply({ erro: "Proposta indisponível" }, 404);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await db.rpc("fotos_proposta_publica", {
      p_token: token,
    });
    if (error) return reply({ erro: "Proposta indisponível" }, 404);
    const fotos = [];
    for (const f of data) {
      const { data: link, error: e } = await db.storage
        .from("workshop-files")
        .createSignedUrl(f.caminho, 60);
      if (e) throw e;
      fotos.push({ legenda: f.legenda, url: link.signedUrl });
    }
    return reply({ fotos });
  } catch {
    return reply({ erro: "Não foi possível consultar as fotos" }, 503);
  }
});
