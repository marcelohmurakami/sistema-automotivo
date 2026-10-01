import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase, erroPublico } from "../lib/supabase";
import {
  ContextoAcesso,
  nomesPlanos,
  recursosPorPlano,
  type OficinaAcesso,
  type Plano,
} from "./contexto";
export function ProvedorAcesso({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [iniciando, setIniciando] = useState(true);
  const [demo, setDemo] = useState(
    () => !supabase || sessionStorage.getItem("patio_demo") === "sim",
  );
  const [planoDemo, definirPlanoDemo] = useState<Plano>(() => {
    const salvo = sessionStorage.getItem("patio_plano_demo");
    return salvo === "basic" || salvo === "complete" ? salvo : "intermediate";
  });
  const [selecionada, selecionarOficina] = useState("");
  const [nomeDemo, setNomeDemo] = useState(
    () =>
      JSON.parse(localStorage.getItem("patio_configuracoes_demo") || "{}")
        .nome || "Oficina do Marcelo",
  );
  useEffect(() => {
    const atualizar = () =>
      setNomeDemo(
        JSON.parse(localStorage.getItem("patio_configuracoes_demo") || "{}")
          .nome || "Oficina do Marcelo",
      );
    window.addEventListener("oficina-demo-alterada", atualizar);
    return () => window.removeEventListener("oficina-demo-alterada", atualizar);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_evento, sessaoNova) => {
      setSessao(sessaoNova);
      setIniciando(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const consulta = useQuery({
    queryKey: ["acesso", sessao?.user.id],
    enabled: !!sessao && !demo,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("consultar_meu_acesso");
      if (error) throw error;
      return data as OficinaAcesso[];
    },
    refetchInterval: 30_000,
    staleTime: 0,
    retry: false,
  });
  const oficinasDemo: OficinaAcesso[] = [
    {
      id: "demonstracao",
      nome: nomeDemo,
      perfil: "owner",
      codigo_plano: planoDemo,
      nome_plano: nomesPlanos[planoDemo],
      situacao: "active",
      valido_ate: null,
      recursos: recursosPorPlano[planoDemo],
    },
  ];
  // Em erro de autorização/conexão, não manter permissões antigas na interface.
  const oficinas = demo
    ? oficinasDemo
    : consulta.isError
      ? []
      : (consulta.data ?? []);
  const oficina =
    oficinas.find((o) => o.id === selecionada) ?? oficinas[0] ?? null;
  return (
    <ContextoAcesso.Provider
      value={{
        demo,
        usuario: sessao?.user.id ?? null,
        email: sessao?.user.email ?? null,
        oficina,
        oficinas,
        carregando:
          !demo &&
          !!supabase &&
          (iniciando || (!!sessao && consulta.isPending)),
        erro: !demo && consulta.isError ? erroPublico(consulta.error) : "",
        permite: (recurso) => !!oficina?.recursos.includes(recurso),
        selecionarOficina,
        definirPlanoDemo: (plano) => {
          sessionStorage.setItem("patio_plano_demo", plano);
          definirPlanoDemo(plano);
        },
        demonstrar: () => {
          cache.clear();
          sessionStorage.setItem("patio_demo", "sim");
          setDemo(true);
        },
        usarContaReal: () => {
          cache.clear();
          sessionStorage.removeItem("patio_demo");
          setDemo(false);
          selecionarOficina("");
        },
        sair: async () => {
          if (supabase && sessao) {
            const { error } = await supabase.auth.signOut({ scope: "local" });
            if (error) throw error;
          }
          cache.clear();
          sessionStorage.removeItem("patio_demo");
          setDemo(false);
          selecionarOficina("");
        },
        atualizar: demo ? async () => undefined : consulta.refetch,
      }}
    >
      {children}
    </ContextoAcesso.Provider>
  );
}
