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

export function ProvedorPagamentoAposRegistro({ children }: { children: ReactNode }) {
  const acesso = useAcesso();
  const [solicitacao, setSolicitacao] = useState<{
    registro: RegistroParaPagamento;
    continuacao?: ContinuacaoPagamento;
  } | null>(null);
  const finalizada = useRef(false);
  const registro = solicitacao?.registro;
  const permitido = acesso.permite("finance") && acesso.oficina?.perfil !== "staff";
  function fechar() {
    if (finalizada.current) return;
    finalizada.current = true;
    const proximo = solicitacao?.continuacao;
    setSolicitacao(null);
    // A janela de impressão é aberta pelo clique, preservando a permissão do navegador.
    proximo?.executar();
  }
  return (
    <ContextoPagamentoAposRegistro.Provider
      value={(valor, proximo) => {
        if (permitido) {
          finalizada.current = false;
          setSolicitacao({ registro: valor, continuacao: proximo });
        } else {
          proximo?.executar();
        }
      }}
    >
      {children}
      <AvisoOSPronta pausado={!!registro && permitido} />
      <AvisoAtendimentoConcluido
        key={acesso.oficina?.id}
        pausado={!!registro && permitido}
      />
      {registro && permitido && (
        <Suspense fallback={<p role="status">Preparando opções de pagamento…</p>}>
          <PerguntaPagamento
            key={`${registro.tipo}:${registro.id}`}
            registro={registro}
            continuacao={solicitacao?.continuacao}
            fechar={fechar}
          />
        </Suspense>
      )}
    </ContextoPagamentoAposRegistro.Provider>
  );
}
