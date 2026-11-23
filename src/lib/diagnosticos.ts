import { novoId } from "./uuid.ts";
export type Diagnostico = {
  id: string;
  quando: string;
  tipo: "tela" | "javascript" | "promessa" | "consulta";
  codigo: string;
  modulo: string;
  versao: string;
  online: boolean;
};
const chave = "patio_diagnosticos_v1";
const modulos = new Set([
  "atendimentos",
  "agenda",
  "objetos",
  "clientes",
  "orcamentos",
  "ordens-servico",
  "financeiro",
  "estoque",
  "compras",
  "relatorios",
  "garantias",
  "funcionarios",
  "meu-site",
  "entrar",
  "cadastro",
  "planos",
  "configuracoes",
]);
export function codigoDiagnostico(erro: unknown): string {
  if (
    erro &&
    typeof erro === "object" &&
    "code" in erro &&
    typeof erro.code === "string" &&
    /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(erro.code)
  )
    return erro.code;
  if (erro instanceof TypeError) return "TYPE";
  if (erro instanceof Error && erro.name === "AbortError") return "TIMEOUT";
  return "INESPERADO";
}
export function lerDiagnosticos(): Diagnostico[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(chave) || "[]");
    return Array.isArray(v) ? v.slice(-50) : [];
  } catch {
    return [];
  }
}
export function registrarDiagnostico(tipo: Diagnostico["tipo"], erro: unknown) {
  // Nunca guarda mensagem/stack, URLs completas, parâmetros, pessoas ou dados do atendimento.
  const rota = window.location.pathname.split("/")[1];
  const d: Diagnostico = {
    id: novoId(),
    quando: new Date().toISOString(),
    tipo,
    codigo: codigoDiagnostico(erro),
    modulo: modulos.has(rota) ? rota : "publico",
    versao: import.meta.env.VITE_RELEASE_ID || "local",
    online: navigator.onLine,
  };
  try {
    const dados = lerDiagnosticos();
    const ultimo = dados.at(-1);
    if (
      ultimo &&
      ultimo.codigo === d.codigo &&
      ultimo.modulo === d.modulo &&
      Date.parse(d.quando) - Date.parse(ultimo.quando) < 5000
    )
      return;
    sessionStorage.setItem(chave, JSON.stringify([...dados, d].slice(-50)));
  } catch {
    /* Diagnóstico não pode impedir o atendimento. */
  }
}
export function instalarDiagnosticos() {
  window.addEventListener("error", (e) => registrarDiagnostico("javascript", e.error));
  window.addEventListener("unhandledrejection", (e) =>
    registrarDiagnostico("promessa", e.reason),
  );
}
