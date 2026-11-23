import { createClient } from "npm:@supabase/supabase-js@2";
import { planejarTrajeto, validarPedido } from "./provedor.mjs";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const resposta = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);
  try {
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer "))
      return resposta({ erro: "Entre novamente no sistema." }, 401);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    );
    const { data: auth, error } = await db.auth.getUser();
    if (error || !auth.user)
      return resposta({ erro: "Entre novamente no sistema." }, 401);
    const reader = req.body?.getReader();
    if (!reader) return resposta({ erro: "Pedido vazio." }, 400);
    let size = 0,
      text = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        return resposta({ erro: "Pedido muito grande." }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const d = validarPedido(JSON.parse(text));
    const { error: acesso } = await db.rpc("autorizar_calculo_trajeto", {
      p_oficina: d.oficina,
    });
    if (acesso)
      return resposta(
        {
          erro:
            acesso.code === "22023"
              ? acesso.message
              : "Acesso indisponível para esta empresa.",
        },
        acesso.code === "22023" ? 429 : 403,
      );
    const key = Deno.env.get("OPENROUTESERVICE_API_KEY");
    if (!key)
      return resposta(
        {
          erro: "O cálculo automático ainda precisa ser ativado pela administração. Você pode planejar a visita informando os minutos manualmente.",
        },
        503,
      );
    return resposta(
      await planejarTrajeto(d, {
        key,
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(15000)]),
      }),
    );
  } catch (e) {
    const msg =
      e instanceof Error &&
      !(e instanceof SyntaxError) &&
      !(e instanceof TypeError) &&
      e.name !== "AbortError" &&
      e.name !== "TimeoutError"
        ? e.message
        : "Não foi possível calcular agora. Tente novamente ou informe os minutos manualmente.";
    return resposta({ erro: msg }, 400);
  }
});
