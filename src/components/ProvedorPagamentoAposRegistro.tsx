import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { useAcesso } from "../auth/contexto";
import { AvisoOSPronta } from "./AvisoOSPronta";
import { AvisoAtendimentoConcluido } from "./AvisoAtendimentoConcluido";
import {
  ContextoPagamentoAposRegistro,
  type RegistroParaPagamento,
  type ContinuacaoPagamento,
} from "../lib/pagamentoAposRegistro";

const PerguntaPagamento = lazy(() =>
  import("./PagamentoAposRegistro").then((m) => ({
    default: m.PerguntaPagamento,
  })),
);
const EntregaAposCriacao = lazy(() =>
  import("./EntregaAposCriacao").then((m) => ({ default: m.EntregaAposCriacao })),
);

export function ProvedorPagamentoAposRegistro({ children }: { children: ReactNode }) {
  const acesso = useAcesso();
  const [solicitacao, setSolicitacao] = useState<{
    registro: RegistroParaPagamento;
    continuacao?: ContinuacaoPagamento;
  } | null>(null);
  const finalizada = useRef(false);
  const [entrega, setEntrega] = useState(false);
  const registro = solicitacao?.registro;
  const permitido = acesso.permite("finance") && acesso.oficina?.perfil !== "staff";
  function finalizar() {
    if (finalizada.current) return;
    finalizada.current = true;
    const proximo = solicitacao?.continuacao;
    setSolicitacao(null);
    // A janela de impressão é aberta pelo clique, preservando a permissão do navegador.
    proximo?.executar();
  }
  function fecharPagamento() {
    if (registro?.contexto === "criacao-pronta") setEntrega(true);
    else finalizar();
  }
  return (
    <ContextoPagamentoAposRegistro.Provider
      value={(valor, proximo) => {
        if (permitido || valor.contexto === "criacao-pronta") {
          finalizada.current = false;
          setEntrega(!permitido);
          setSolicitacao({ registro: valor, continuacao: proximo });
        } else {
          proximo?.executar();
        }
      }}
    >
      {children}
      <AvisoOSPronta pausado={!!registro} />
      <AvisoAtendimentoConcluido key={acesso.oficina?.id} pausado={!!registro} />
      {registro && permitido && !entrega && (
        <Suspense fallback={<p role="status">Preparando opções de pagamento…</p>}>
          <PerguntaPagamento
            key={`${registro.tipo}:${registro.id}`}
            registro={registro}
            continuacao={solicitacao?.continuacao}
            fechar={fecharPagamento}
          />
        </Suspense>
      )}
      {registro && entrega && registro.tipo !== "compra" && (
        <Suspense fallback={<p role="status">Preparando confirmação de entrega…</p>}>
          <EntregaAposCriacao
            key={`${registro.tipo}:${registro.id}`}
            tipo={registro.tipo}
            id={registro.id}
            fechar={finalizar}
          />
        </Suspense>
      )}
    </ContextoPagamentoAposRegistro.Provider>
  );
}
