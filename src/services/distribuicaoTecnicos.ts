import { rpc } from "../lib/rpc";
import { supabase } from "../lib/supabase";

export type PontoDistribuicao = [number, number];
export type PerfilDistribuicao = {
  id: string;
  nome: string;
  recurso_id: string | null;
  funcionario_id: string | null;
  ativo: boolean;
  habilidades: string[];
  ferramentas: string[];
  regioes: string[];
  base_endereco: string;
  base_ponto: PontoDistribuicao | null;
  jornada: { dia: number; inicio: string; fim: string }[];
  bloqueios: { inicio: string; fim: string; motivo: string }[];
  revisao: number;
};
export type CriteriosDistribuicao = {
  perfil_id?: string;
  habilidades: string[];
  ferramentas: string[];
  regiao: string;
  materiais: { produto_id: string; quantidade: number; nome?: string }[];
};
export type CandidatoTecnico = {
  id: string;
  nome: string;
  recurso_id: string | null;
  apto: boolean;
  motivos: string[];
  avisos: string[];
  distancia_km: number | null;
  carga_minutos: number;
  origem: string;
  origem_ponto: PontoDistribuicao | null;
};
export type ResultadoDistribuicao = {
  candidatos: CandidatoTecnico[];
  materiais_faltantes: {
    produto_id: string;
    nome: string;
    necessario: number;
    disponivel: number;
  }[];
  verificado_em: string;
};
export type ConfiguracaoDistribuicao = {
  perfis: PerfilDistribuicao[];
  recursos: { id: string; nome: string; ativo: boolean }[];
  funcionarios: { id: string; nome: string }[];
};
export const listarDistribuicao = (oficina: string, signal?: AbortSignal) =>
  rpc<ConfiguracaoDistribuicao>(
    "consultar_distribuicao_agenda",
    {
      p_oficina: oficina,
    },
    signal,
  );
export const salvarPerfilDistribuicao = (oficina: string, perfil: PerfilDistribuicao) =>
  rpc<string>("salvar_perfil_distribuicao", {
    p_oficina: oficina,
    p_id: perfil.id,
    p_dados: perfil,
    p_revisao: perfil.revisao || null,
  });
export const sugerirTecnico = (oficina: string, dados: Record<string, unknown>) =>
  rpc<ResultadoDistribuicao>("sugerir_tecnico_agenda", {
    p_oficina: oficina,
    p_dados: dados,
  });
export const textosDistribuicao = (texto: string) => [
  ...new Set(
    texto
      .split(/[;,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
export function dadosDistribuicao(
  form: FormData,
): CriteriosDistribuicao | Record<string, never> {
  return JSON.parse(String(form.get("distribuicao") || "{}"));
}
export async function localizarBase(oficina: string, endereco: string) {
  if (!supabase) throw Error("Conecte-se para localizar o endereço.");
  const { data, error } = await supabase.functions.invoke("planejar-trajeto", {
    body: { oficina, origem: endereco, destino: endereco, retorno: false },
  });
  if (error) {
    let mensagem =
      "Não foi possível localizar. Você pode configurar a equipe pelas regiões atendidas.";
    if (error.context instanceof Response) {
      try {
        const r = await error.context.json();
        if (typeof r.erro === "string") mensagem = r.erro;
      } catch {
        /* Resposta sem JSON. */
      }
    }
    throw Error(mensagem);
  }
  return (data.origens || []) as { nome: string; ponto: PontoDistribuicao }[];
}
