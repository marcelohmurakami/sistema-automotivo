import { createClient } from "npm:@supabase/supabase-js@2";
import { conversar, validarEntrada, contextoTranscricao } from "./protocolo.mjs";
import { consultarProvedorIA, FalhaProvedorIA } from "./provedor.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const MAX_AUDIO = 10 * 1024 * 1024;
const MAX_BODY = MAX_AUDIO + 100_000;
const responder = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: cors });

// Limita inclusive requisições chunked, antes de interpretar JSON/multipart.
async function corpoLimitado(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("Pedido vazio.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw Error("Áudio muito grande. Grave até 90 segundos.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes, {
    headers: { "content-type": req.headers.get("content-type") || "application/json" },
  });
}

Deno.serve(async (req) => {
  const inicioPedido = Date.now();
  if (req.method === "OPTIONS") return new Response("", { headers: cors });
  if (req.method !== "POST") return responder({ erro: "Método inválido." }, 405);
  const key = Deno.env.get("OPENAI_API_KEY"),
    model = Deno.env.get("OPENAI_MODEL");
  if (!key || !model)
    return responder(
      {
        erro: "O assistente precisa ser ativado pelo administrador. Configure a integração de IA no servidor.",
      },
      503,
    );
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: req.headers.get("authorization") || "" } },
      auth: { persistSession: false },
    },
  );
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user)
    return responder({ erro: "Entre na sua conta para usar o assistente." }, 401);
  let entrada: ReturnType<typeof validarEntrada> | undefined;
  let iniciou = false;
  const rpc = async (nome: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(nome, args);
    if (error) {
      if (["42501", "22023", "PT409", "P0002", "23P01", "23514"].includes(error.code))
        throw Error(error.message);
      if (error.code === "PGRST202")
        throw Error("O assistente precisa da atualização do banco para funcionar.");
      throw Error("Não foi possível consultar o sistema. Tente novamente.");
    }
    return data;
  };
  try {
    const body = await corpoLimitado(req);
    let arquivo: File | null = null;
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await body.formData();
      const audio = form.get("audio");
      if (
        !(audio instanceof File) ||
        !audio.size ||
        audio.size > MAX_AUDIO ||
        !/^(audio\/(webm|mp4|mpeg|wav|x-wav|ogg)|video\/(webm|mp4))(;|$)/.test(
          audio.type,
        )
      )
        throw Error("Use áudio WebM, MP4, MP3, WAV ou Ogg de até 10 MB.");
      arquivo = audio;
      entrada = validarEntrada({
        ...JSON.parse(String(form.get("pedido"))),
        texto: "Pedido por áudio",
      });
    } else entrada = validarEntrada(await body.json());
    const turno = await rpc("iniciar_turno_assistente", {
      p_oficina: entrada.oficina,
      p_sessao: entrada.sessao,
      p_chave: entrada.chave,
    });
    if (turno.resposta) return responder(turno.resposta);
    iniciou = true;
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(105_000)]);
    let transcricao: string | null = null;
    let transcricaoMs = 0;
    if (arquivo) {
      const inicioTranscricao = Date.now();
      const form = new FormData();
      const ext = arquivo.type.includes("mp4")
        ? "m4a"
        : arquivo.type.includes("mpeg")
          ? "mp3"
          : arquivo.type.includes("ogg")
            ? "ogg"
            : arquivo.type.includes("wav")
              ? "wav"
              : "webm";
      form.append("file", arquivo, `pedido.${ext}`);
      form.append("model", Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-transcribe");
      form.append("language", "pt");
      form.append("prompt", contextoTranscricao(turno.empresa));
      const r = await consultarProvedorIA(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal,
        },
        { buscar: fetch },
      );
      const data = await r.json();
      if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 3000)
        throw Error(
          "Áudio sem fala reconhecível ou muito longo. Grave um pedido mais curto.",
        );
      transcricao = data.text.trim();
      entrada.texto = transcricao;
      transcricaoMs = Date.now() - inicioTranscricao;
    }
    const e = entrada;
    const result = await conversar({
      entrada: { ...e, propostaAnterior: turno.proposta_anterior },
      empresa: turno.empresa,
      signal,
      pedir: async (args: Record<string, unknown>) => {
        const r = await consultarProvedorIA(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            signal,
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...args,
              model,
              store: false,
              max_output_tokens: 6500,
            }),
          },
          { buscar: fetch },
        );
        return r.json();
      },
      executar: (nome: string, args: Record<string, unknown>) =>
        nome === "consultar"
          ? rpc("consultar_assistente", {
              p_oficina: e.oficina,
              p_tipo: args.tipo,
              p_busca: args.busca || "",
              p_id: args.id,
              p_cliente: args.cliente_id,
              p_inicio: args.inicio,
              p_fim: args.fim,
            })
          : rpc("preparar_assistente", {
              p_oficina: e.oficina,
              p_sessao: e.sessao,
              p_versao: turno.versao,
              p_acao: nome.replace("preparar_", ""),
              p_dados: args,
            }),
    });
    const resposta = {
      ...result,
      transcricao,
      desempenho: {
        ...result.desempenho,
        transcricao_ms: transcricaoMs,
        servidor_ms: Date.now() - inicioPedido,
      },
    };
    await rpc("concluir_turno_assistente", {
      p_oficina: e.oficina,
      p_sessao: e.sessao,
      p_chave: e.chave,
      p_resposta: resposta,
    });
    // Apenas medidas agregadas: sem texto, áudio, nomes, IDs ou credenciais.
    console.info("assistente_desempenho", {
      ...resposta.desempenho,
      servidor_ms: Date.now() - inicioPedido,
    });
    return responder(resposta);
  } catch (err) {
    const codigo = err instanceof FalhaProvedorIA ? err.codigo : undefined;
    const erro =
      err instanceof Error && err.name !== "AbortError" && err.name !== "TimeoutError"
        ? err.message
        : "O pedido demorou mais que o esperado. Confira o histórico antes de repetir uma confirmação.";
    if (iniciou && entrada) {
      try {
        await rpc("concluir_turno_assistente", {
          p_oficina: entrada.oficina,
          p_sessao: entrada.sessao,
          p_chave: entrada.chave,
          p_resposta: { erro, ...(codigo ? { codigo } : {}) },
        });
      } catch {
        /* Uma conversa mais recente tem prioridade. */
      }
    }
    return responder({ erro, ...(codigo ? { codigo } : {}) }, iniciou ? 503 : 400);
  }
});
