import { chaveEmpresaUsuario, resolverEmpresa } from "../lib/selecaoEmpresa";
import {
  limparOfflineUsuario,
  pendenciasOfflineUsuario,
} from "../lib/atendimentoOffline";
import { nomeOficinaDemo } from "../lib/armazenamentoLocal";
import { consultarSegundoFator } from "../services/segurancaConta";
import { repetirConsultaAcesso } from "./repeticaoConsultaAcesso";
import { ramoValido, ramos, type Ramo } from "../lib/ramos";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const [ramoDemo, setRamoDemo] = useState<Ramo>(() => {
    const v = sessionStorage.getItem("patio_ramo_demo");
    return ramoValido(v) ? v : "automotivo";
  });
  const [sessao, setSessao] = useState<Session | null>(null);
  const usuarioDaSessao = useRef<string | null | undefined>(undefined);
  const [iniciando, setIniciando] = useState(true);
  const [demo, setDemo] = useState(
    () => !supabase || sessionStorage.getItem("patio_demo") === "sim",
  );
  const [planoDemo, definirPlanoDemo] = useState<Plano>(() => {
    const salvo = sessionStorage.getItem("patio_plano_demo");
    return salvo === "basic" || salvo === "complete" ? salvo : "intermediate";
  });
  const [selecoes, setSelecoes] = useState<Record<string, string>>({});
  const chaveSelecao = chaveEmpresaUsuario(sessao?.user.id ?? null, demo);
  const selecionada = chaveSelecao
    ? (selecoes[chaveSelecao] ?? localStorage.getItem(chaveSelecao) ?? "")
    : "";
  function selecionarOficina(id: string) {
    if (!chaveSelecao) return;
    if (id) localStorage.setItem(chaveSelecao, id);
    setSelecoes((atual) => ({ ...atual, [chaveSelecao]: id }));
  }
  const [, atualizarEspecialidadeDemo] = useState(0);
  const [nomeDemo, setNomeDemo] = useState(nomeOficinaDemo);
  useEffect(() => {
    const atualizar = () => {
      atualizarEspecialidadeDemo((n) => n + 1);
      setNomeDemo(nomeOficinaDemo());
    };
    window.addEventListener("oficina-demo-alterada", atualizar);
    return () => window.removeEventListener("oficina-demo-alterada", atualizar);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_evento, sessaoNova) => {
      const usuario = sessaoNova?.user.id ?? null;
      // Logout em outra aba e troca de conta também precisam descartar o cache.
      // A renovação do token do mesmo usuário preserva os formulários em andamento.
      if (usuarioDaSessao.current !== undefined && usuarioDaSessao.current !== usuario)
        cache.clear();
      usuarioDaSessao.current = usuario;
      setSessao(sessaoNova);
      setIniciando(false);
    });
    return () => data.subscription.unsubscribe();
  }, [cache]);
  const seguranca = useQuery({
    queryKey: ["seguranca-sessao", sessao?.user.id],
    enabled: !!sessao && !demo,
    queryFn: consultarSegundoFator,
    refetchInterval: 30_000,
    retry: repetirConsultaAcesso,
    retryDelay: (tentativa) => (tentativa + 1) * 1000,
  });
  const consulta = useQuery({
    queryKey: ["acesso", sessao?.user.id],
    enabled:
      !!sessao &&
      !demo &&
      !!seguranca.data &&
      !seguranca.data.exigido &&
      !seguranca.isError,
    queryFn: async ({ signal }) => {
      const { data, error, status } = await supabase!
        .rpc("consultar_meu_acesso")
        .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(10_000)]))
        .retry(false);
      if (error) throw Object.assign(error, { status });
      return data as OficinaAcesso[];
    },
    refetchInterval: 30_000,
    staleTime: 0,
    retry: repetirConsultaAcesso,
    retryDelay: (tentativa) => (tentativa + 1) * 1000,
  });
  const oficinasDemo: OficinaAcesso[] = [
    {
      id: ramoDemo === "automotivo" ? "demonstracao" : `demo-${ramoDemo}`,
      ramo: ramoDemo,
      especialidade:
        localStorage.getItem(
          `patio_especialidade:${ramoDemo === "automotivo" ? "demonstracao" : `demo-${ramoDemo}`}`,
        ) || undefined,
      nome:
        ramoDemo === "automotivo" ? nomeDemo : `${ramos[ramoDemo].nome} · Demonstração`,
      perfil: "owner",
      codigo_plano: planoDemo,
      nome_plano: nomesPlanos[planoDemo],
      situacao: "active",
      valido_ate: null,
      recursos: recursosPorPlano[planoDemo],
    },
  ];
  // Negação de acesso é imediata; falha de conexão bloqueia ao esgotar a retentativa.
  const oficinas = demo ? oficinasDemo : consulta.isError ? [] : (consulta.data ?? []);
  const oficina = resolverEmpresa(oficinas, selecionada);
  return (
    <ContextoAcesso.Provider
      value={{
        demo,
        usuario: sessao?.user.id ?? null,
        email: sessao?.user.email ?? null,
        oficina,
        oficinas,
        segundoFatorExigido: !demo && seguranca.data?.exigido,
        carregando:
          !demo &&
          !!supabase &&
          (iniciando ||
            (!!sessao &&
              !seguranca.isError &&
              (seguranca.isPending ||
                (!seguranca.data?.exigido && consulta.isPending)))),
        erro:
          !demo && (seguranca.isError || consulta.isError)
            ? erroPublico(seguranca.error || consulta.error)
            : "",
        permite: (recurso) => !!oficina?.recursos.includes(recurso),
        selecionarOficina,
        definirPlanoDemo: (plano) => {
          sessionStorage.setItem("patio_plano_demo", plano);
          definirPlanoDemo(plano);
        },
        demonstrar: () => {
          sessionStorage.setItem("patio_ramo_demo", "automotivo");
          setRamoDemo("automotivo");
          cache.clear();
          sessionStorage.setItem("patio_demo", "sim");
          setDemo(true);
        },
        demonstrarRamo: (ramo) => {
          cache.clear();
          sessionStorage.setItem("patio_ramo_demo", ramo);
          sessionStorage.setItem("patio_demo", "sim");
          setRamoDemo(ramo);
          setDemo(true);
          selecionarOficina("");
        },
        usarContaReal: () => {
          cache.clear();
          sessionStorage.removeItem("patio_demo");
          setDemo(false);
          selecionarOficina("");
        },
        sair: async () => {
          if (sessao?.user.id && (await pendenciasOfflineUsuario(sessao.user.id))) {
            if (
              !window.confirm(
                "Há trabalho neste aparelho que ainda não foi enviado. Sair apagará esses registros locais. Cancele e sincronize antes de sair. Sair e descartar mesmo assim?",
              )
            )
              return;
          }
          if (sessao?.user.id) await limparOfflineUsuario(sessao.user.id);
          if (supabase && sessao) {
            const { error } = await supabase.auth.signOut({ scope: "local" });
            if (error) throw error;
          }
          cache.clear();
          sessionStorage.removeItem("patio_demo");
          setDemo(false);
          selecionarOficina("");
        },
        atualizar: demo
          ? async () => undefined
          : async () => {
              await seguranca.refetch();
              return consulta.refetch();
            },
      }}
    >
      {children}
    </ContextoAcesso.Provider>
  );
}
