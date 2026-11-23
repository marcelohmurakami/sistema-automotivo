import { createClient } from "npm:@supabase/supabase-js@2";
import { gerarSugestaoOleo } from "./gerar.ts";

Deno.serve(async (req) => {
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return reply({ erro: "Método inválido" }, 405);
  const segredo = Deno.env.get("AUTOMOTIVO_AGENDADOR_SECRET");
  if (!segredo || req.headers.get("x-automotivo-secret") !== segredo) return reply({ erro: "Não autorizado" }, 401);
  const key = Deno.env.get("OPENAI_API_KEY"), modelo = Deno.env.get("OPENAI_MODEL");
  if (!key || !modelo) return reply({ erro: "Configure a IA para gerar as sugestões." }, 503);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: tarefa, error } = await admin.rpc("reservar_recontato_oleo");
  if (error) return reply({ erro: "Não foi possível consultar a fila." }, 503);
  if (!tarefa) return reply({ processados: 0 });
  try {
    const sugestao = await gerarSugestaoOleo(tarefa.previsao, key, modelo);
    const { error: falha } = await admin.rpc("concluir_recontato_oleo", { p_os: tarefa.id, p_tentativa: tarefa.tentativa, p_sugestao: sugestao, p_modelo: modelo });
    if (falha) throw falha;
    return reply({ processados: 1 });
  } catch {
    await admin.rpc("concluir_recontato_oleo", { p_os: tarefa.id, p_tentativa: tarefa.tentativa, p_sugestao: null, p_modelo: modelo });
    return reply({ erro: "Sugestão não concluída. A previsão continua disponível na empresa." }, 503);
  }
});
