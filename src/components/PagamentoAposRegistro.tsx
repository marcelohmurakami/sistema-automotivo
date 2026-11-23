import { dinheiro } from "../lib/formatacao";
import { umMesDepois } from "../lib/vencimentoPagamento";
import { hoje } from "../services/financeiro";
import { useEffect, useState } from "react";
import { pagamentoDefinidoNaEntrega } from "../lib/decisaoPagamentoEntrega";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CalendarClock, Wallet, Coins } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { PagamentosIntegrados } from "./PagamentosIntegrados";
import { consultarOS } from "../services/ordensServico";
import { consultarCompra } from "../services/compras";
import { prepararPagamentoAtendimento } from "../services/pagamentoAtendimento";
import { consultarFinanceiroOS, prepararFinanceiroOS } from "../services/financeiro";

import { erroPublico } from "../lib/supabase";
import type {
  ContinuacaoPagamento,
  RegistroParaPagamento,
} from "../lib/pagamentoAposRegistro";
import "./PagamentoAposRegistro.css";

export function PerguntaPagamento({
  registro,
  fechar,
  continuacao,
}: {
  registro: RegistroParaPagamento;
  fechar: () => void;
  continuacao?: ContinuacaoPagamento;
}) {
  const a = useAcesso(),
    oficina = a.oficina!.id;
  const [acao, setAcao] = useState<"" | "pagar" | "parcial" | "combinar">("");
  const [concluido, setConcluido] = useState(false);
  const receber = registro.tipo !== "compra";
  const q = useQuery({
    queryKey: ["pagamento-apos-registro", a.demo, oficina, registro.tipo, registro.id],
    queryFn: async () => {
      if (registro.tipo === "atendimento") {
        return prepararPagamentoAtendimento(a.demo, oficina, registro.id);
      }
      if (registro.tipo === "os") {
        const [os, titulo] = await Promise.all([
          consultarOS(a.demo, oficina, registro.id),
          consultarFinanceiroOS(a.demo, oficina, registro.id),
        ]);
        return {
          os,
          mostrarDescontoNota: os.mostrar_desconto_nota === true,
          titulo,
          descricao: `OS #${os.numero} · ${os.dados_cliente.nome}`,
          total: os.total_centavos,
          cancelado: os.situacao === "cancelled" || !!os.arquivado_em,
        };
      }
      const compra = await consultarCompra(a.demo, oficina, registro.id);
      return {
        os: undefined,
        mostrarDescontoNota: false,
        titulo: compra.titulo,
        descricao: compra.nome_fornecedor,
        total: compra.titulo.valor_centavos,
        cancelado: !!compra.cancelado_em,
      };
    },
    staleTime: 0,
    gcTime: 0,
  });
  const dados = q.data;
  const pago = dados?.titulo?.baixado_centavos ?? 0;
  const restante = Math.max(0, (dados?.total ?? 0) - pago);
  const indisponivel = dados?.cancelado || dados?.titulo?.cancelado_em;
  const conferirEntrega = registro.contexto === "entrega";
  const conferindo = conferirEntrega && !concluido && !acao && q.isFetching;
  // Espera uma consulta atual, inclusive depois de recarregar ou trocar de aparelho.
  // A criação continua perguntando antes de imprimir, independentemente desta regra.
  const dispensar =
    conferirEntrega &&
    !concluido &&
    !acao &&
    !q.isFetching &&
    !q.isError &&
    !!dados &&
    pagamentoDefinidoNaEntrega(dados);
  useEffect(() => {
    if (dispensar) fechar();
  }, [dispensar, fechar]);
  return (
    <>
      {conferindo && <p role="status">Conferindo o pagamento já registrado…</p>}
      <Dialogo
        aberto={!acao && !conferindo && !dispensar}
        fechar={fechar}
        titulo={
          concluido
            ? "Financeiro atualizado"
            : receber
              ? "Como ficou o pagamento da OS?"
              : "Como ficou o pagamento da compra?"
        }
        classe="dialogo-pagamento-registro"
      >
        {concluido ? (
          <div className="pagamento-registro-concluido" role="status">
            <CheckCircle2 size={30} />
            <p>Registro salvo. Os valores já estão atualizados no financeiro.</p>
            <button className="botao-primario" onClick={fechar}>
              {continuacao?.rotulo ?? "Concluir"}
            </button>
          </div>
        ) : q.isPending ? (
          <p role="status">Consultando o pagamento…</p>
        ) : q.isError ? (
          <div role="alert">
            <p>{erroPublico(q.error)}</p>
            <button className="botao-secundario" onClick={() => void q.refetch()}>
              Tentar novamente
            </button>
            <button className="botao-secundario" onClick={fechar}>
              {continuacao?.rotuloAdiar ?? "Agora não"}
            </button>
          </div>
        ) : (
          dados && (
            <>
              <p className="pagamento-registro-descricao">{dados.descricao}</p>
              {indisponivel ? (
                <p>Este registro foi cancelado ou arquivado. Consulte o financeiro.</p>
              ) : restante <= 0 ? (
                <p role="status">
                  {dados.total <= 0
                    ? "Não há valor a registrar."
                    : "Tudo pago. O pagamento já está registrado no financeiro."}
                </p>
              ) : (
                <>
                  <div className="pagamento-registro-saldo">
                    <span>Falta {receber ? "receber" : "pagar"}</span>
                    <strong>{dinheiro(restante)}</strong>
                    {pago > 0 && (
                      <small>
                        {dinheiro(pago)} já {receber ? "recebidos" : "pagos"}
                      </small>
                    )}
                  </div>
                  <div className="pagamento-registro-opcoes">
                    <button onClick={() => setAcao("pagar")}>
                      <Wallet size={20} />
                      <span>
                        <strong>{receber ? "Já recebi" : "Já paguei"}</strong>
                        <small>Registrar o valor pago</small>
                      </span>
                    </button>
                    <button onClick={() => setAcao("parcial")}>
                      <Coins size={20} />
                      <span>
                        <strong>
                          {receber ? "Recebi uma parte" : "Paguei uma parte"}
                        </strong>
                        <small>O restante continua em aberto</small>
                      </span>
                    </button>
                    <button onClick={() => setAcao("combinar")}>
                      <CalendarClock size={20} />
                      <span>
                        <strong>{receber ? "A receber" : "A pagar"}</strong>
                        <small>Definir a data do pagamento</small>
                      </span>
                    </button>
                  </div>
                </>
              )}
              <button
                className="botao-secundario pagamento-registro-depois"
                onClick={fechar}
              >
                {restante > 0 && !indisponivel
                  ? (continuacao?.rotuloAdiar ?? "Agora não")
                  : (continuacao?.rotulo ?? "Fechar")}
              </button>
            </>
          )
        )}
      </Dialogo>
      {acao && dados && !indisponivel && (
        <PagamentosIntegrados
          key={acao}
          titulo={dados.titulo}
          os={dados.os}
          mostrarDescontoNotaInicial={dados.mostrarDescontoNota}
          atendimentoId={registro.tipo === "atendimento" ? registro.id : undefined}
          preparar={
            dados.os
              ? () => prepararFinanceiroOS(a.demo, oficina, dados.os!)
              : undefined
          }
          vencimentoInicial={
            receber
              ? dados.os?.vencimento_pagamento ||
                (registro.tipo === "atendimento"
                  ? dados.titulo?.vencimento
                  : undefined) ||
                umMesDepois(
                  dados.os?.concluido_em
                    ? new Intl.DateTimeFormat("en-CA", {
                        timeZone: "America/Sao_Paulo",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      }).format(new Date(dados.os.concluido_em))
                    : hoje(),
                )
              : undefined
          }
          pagamentoParcial={acao === "parcial"}
          somenteFormulario
          acaoInicial={acao === "combinar" ? "combinar" : "pagar"}
          valorInicial={acao === "parcial" ? "" : undefined}
          aoFechar={() => {
            setAcao("");
            void q.refetch();
          }}
          aoConcluir={() => {
            setConcluido(true);
            setAcao("");
          }}
        />
      )}
    </>
  );
}
