import { createContext, useContext } from "react";
export const recursosPorPlano = {
  basic: ["customers", "catalog", "simple_notes"],
  intermediate: [
    "customers",
    "catalog",
    "simple_notes",
    "quotes",
    "work_orders",
    "production_board",
    "service_media",
    "inventory",
    "finance",
    "reports",
  ],
  complete: [
    "customers",
    "catalog",
    "simple_notes",
    "quotes",
    "work_orders",
    "production_board",
    "service_media",
    "inventory",
    "finance",
    "reports",
    "website",
    "customer_portal",
    "parts_requests",
    "automations",
    "ai",
  ],
};
export type Plano = keyof typeof recursosPorPlano;
export const nomesPlanos: Record<Plano, string> = {
  basic: "Básico",
  intermediate: "Intermediário",
  complete: "Completo",
};
export type OficinaAcesso = {
  id: string;
  nome: string;
  perfil: "owner" | "manager" | "staff";
  codigo_plano: Plano;
  nome_plano: string;
  situacao: string;
  valido_ate: string | null;
  recursos: string[];
};
export type Acesso = {
  demo: boolean;
  carregando: boolean;
  erro: string;
  usuario: string | null;
  email: string | null;
  oficina: OficinaAcesso | null;
  oficinas: OficinaAcesso[];
  permite: (recurso: string) => boolean;
  selecionarOficina: (id: string) => void;
  demonstrar: () => void;
  usarContaReal: () => void;
  sair: () => Promise<void>;
  atualizar: () => Promise<unknown>;
  definirPlanoDemo: (plano: Plano) => void;
};
export const ContextoAcesso = createContext<Acesso | null>(null);
export function useAcesso() {
  const valor = useContext(ContextoAcesso);
  if (!valor) throw new Error("Contexto de acesso ausente.");
  return valor;
}
