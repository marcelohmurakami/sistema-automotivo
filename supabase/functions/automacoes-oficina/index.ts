import { createClient } from "npm:@supabase/supabase-js@2";
// Configuração por oficina no servidor. Nunca use a instância do salão implicitamente.
type Canal = {
  oficina: string;
  url: string;
  instancia: string;
  chave: string;
  destinatarios: string[];
  habilitado: boolean;
};
Deno.serve(async (req) => {
  const segredo = Deno.env.get("AUTOMOTIVO_AGENDADOR_SECRET");
  if (
    req.method !== "POST" ||
    !segredo ||
    req.headers.get("x-automotivo-secret") !== segredo
  )
    return new Response("Não autorizado", { status: 401 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  try {
    const { error } = await db.rpc("processar_lembretes_automaticos");
    if (error) throw error;
    const canais: Canal[] = JSON.parse(
      Deno.env.get("AUTOMOTIVO_CANAIS_JSON") || "[]",
    );
    let enviados = 0,
      incertos = 0;
    for (const c of canais) {
      if (
        !c.habilitado ||
        !c.url.startsWith("https://") ||
        !c.instancia ||
        !c.chave ||
        !c.destinatarios?.length
      )
        continue;
      const { data: a, error: e } = await db.rpc("reservar_aviso_automatico", {
        p_oficina: c.oficina,
      });
      if (e) throw e;
      if (!a) continue;
      let sucesso = false;
      try {
        if (!c.destinatarios.includes(a.telefone))
          throw new Error("fora_da_lista_autorizada");
        const r = await fetch(
          `${c.url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(c.instancia)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: c.chave },
            signal: AbortSignal.timeout(20000),
            body: JSON.stringify({
              number: a.telefone.replace(/\D/g, ""),
              text: a.mensagem,
            }),
          },
        );
        const resposta = await r.json();
        sucesso = r.ok && typeof resposta?.key?.id === "string";
      } catch {
        /* Resultado incerto nunca é reenviado automaticamente. */
      }
      const { error: fim } = await db.rpc("concluir_aviso_automatico", {
        p_id: a.id,
        p_tentativa: a.tentativa,
        p_sucesso: sucesso,
      });
      if (fim) throw fim;
      if (sucesso) enviados++;
      else incertos++;
    }
    return Response.json({ enviados, incertos });
  } catch {
    return Response.json(
      { erro: "Processamento incompleto. Consulte a fila antes de reenviar." },
      { status: 503 },
    );
  }
});
