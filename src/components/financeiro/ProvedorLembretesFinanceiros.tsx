import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { useAgora } from "../../lib/useAgora";
import { erroPublico } from "../../lib/supabase";
import {
  atualizarLembretesFinanceiros,
  conferenciaPendente,
  consultarLembretesFinanceiros,
} from "../../services/lembretesFinanceiros";
import { ContextoLembretes, type AlvoAdiamento } from "./contextoLembretes";
import "./LembretesFinanceiros.css";
const Painel = lazy(() =>
  import("./PainelLembretesFinanceiros").then((m) => ({
    default: m.PainelLembretesFinanceiros,
  })),
);

export function ProvedorLembretesFinanceiros({ children }: { children: ReactNode }) {
  const a = useAcesso(),
    qc = useQueryClient(),
    agora = useAgora();
  const permitido = !!a.oficina && a.permite("finance") && a.oficina.perfil !== "staff";
  const oficina = a.oficina?.id ?? "",
    usuario = a.usuario ?? "demo";
  const [iniciado, setIniciado] = useState(false),
    [tela, setTela] = useState(""),
    [pagina, setPagina] = useState(0);
  const [alvo, setAlvo] = useState<AlvoAdiamento>(),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const trava = useRef(false);
  useEffect(() => {
    if (!permitido) return;
    // Não disputa a primeira renderização e as consultas principais da página.
    const timer = window.setTimeout(() => setIniciado(true), 1500);
    return () => window.clearTimeout(timer);
  }, [permitido]);
  const q = useQuery({
    queryKey: ["lembretes-financeiros", a.demo, oficina, usuario, pagina],
    queryFn: ({ signal }) =>
      consultarLembretesFinanceiros(a.demo, oficina, usuario, pagina, signal),
    enabled: permitido && iniciado,
    staleTime: 60000,
    refetchInterval: 60000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  function abrir(nova: string) {
    setIniciado(true);
    setPagina(0);
    setErro("");
    setTela(nova);
  }
  function adiar(novo?: AlvoAdiamento) {
    setAlvo(novo);
    abrir("adiar");
  }
  async function salvar(
    acao: Parameters<typeof atualizarLembretesFinanceiros>[3],
    dados: Record<string, unknown> = {},
  ) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await atualizarLembretesFinanceiros(a.demo, oficina, usuario, acao, dados);
      if (acao === "adiar_item" || acao === "reativar")
        void qc.invalidateQueries({ queryKey: ["alertas", a.demo, oficina, usuario] });
      await qc.invalidateQueries({
        queryKey: ["lembretes-financeiros", a.demo, oficina, usuario],
      });
      setTela("");
    } catch (e) {
      setErro(erroPublico(e));
      if (!tela) setTela("pendencias");
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  const dados = permitido && !q.isError ? q.data : undefined;
  return (
    <ContextoLembretes.Provider
      value={{
        permitido,
        dados,
        agora,
        conferencia: !!dados && conferenciaPendente(dados.preferencias, agora),
        abrir,
        adiar,
        conferir: () => void salvar("conferir"),
        ocupado,
      }}
    >
      {children}
      {permitido && tela && (
        <Suspense
          fallback={
            <p className="lembrete-carregando" role="status">
              Abrindo lembretes…
            </p>
          }
        >
          <Painel
            tela={tela}
            dados={dados}
            alvo={alvo}
            ocupado={ocupado}
            erro={erro || (q.isError ? erroPublico(q.error) : "")}
            pagina={pagina}
            mudarPagina={setPagina}
            carregando={q.isFetching}
            recarregar={() => void q.refetch()}
            fechar={() => {
              if (!trava.current) setTela("");
            }}
            abrir={abrir}
            adiar={adiar}
            salvar={salvar}
          />
        </Suspense>
      )}
    </ContextoLembretes.Provider>
  );
}
