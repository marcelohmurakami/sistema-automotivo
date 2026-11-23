import { createContext, useContext } from "react";
import type { Ramo } from "../lib/ramos";
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
    "employee_reports",
  ],
};
export type Plano = keyof typeof recursosPorPlano;
export const nomesPlanos: Record<Plano, string> = {
  basic: "Básico",
  intermediate: "Intermediário",
  complete: "Completo",
};
export type OficinaAcesso = {
  ramo?: Ramo;
  especialidade?: string;
  padrao?: boolean;
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
  segundoFatorExigido?: boolean;
  usuario: string | null;
  email: string | null;
  oficina: OficinaAcesso | null;
  oficinas: OficinaAcesso[];
  permite: (recurso: string) => boolean;
  selecionarOficina: (id: string) => void;
  demonstrar: () => void;
  demonstrarRamo: (ramo: Ramo) => void;
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
