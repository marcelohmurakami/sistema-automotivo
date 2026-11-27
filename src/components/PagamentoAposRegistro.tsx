import { dinheiro } from "../lib/formatacao";
import { umMesDepois } from "../lib/vencimentoPagamento";
import { hoje } from "../services/financeiro";
import { useState } from "react";
import { Link } from "react-router-dom";
import { situacaoPagamentoRegistro } from "../lib/decisaoPagamentoEntrega";
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
  consultarDocumento,
}: {
  registro: RegistroParaPagamento;
  fechar: () => void;
  continuacao?: ContinuacaoPagamento;
  consultarDocumento?: () => void;
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
  const situacao = dados ? situacaoPagamentoRegistro(dados) : undefined;
  const indisponivel = situacao === "cancelado";
  const conferirEntrega = registro.contexto === "entrega";
  const vencimentoCombinado = dados?.titulo?.pagamento_combinado
    ? dados.titulo.vencimento
    : undefined;
  const dataCombinada = vencimentoCombinado?.split("-").reverse().join("/");
  const conferindo = conferirEntrega && !concluido && !acao && q.isFetching;
  // A janela permanece visível durante a consulta e exige uma ação explícita.
  // Uma OS sem preço não equivale a uma OS paga, nem deve desaparecer em silêncio.
  return (
    <>
      <Dialogo
        aberto={!acao}
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
        ) : q.isPending || conferindo ? (
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
              ) : situacao === "sem_valor" ? (
                <div className="pagamento-registro-saldo" role="status">
                  <strong>
                    {receber ? "OS sem valor para receber" : "Compra sem valor a pagar"}
                  </strong>
                  <p>
                    O total está em R$ 0,00. Confira os itens e os valores antes de
                    registrar o pagamento.
                  </p>
                  {receber && consultarDocumento && (
                    <Link
                      className="botao-secundario"
                      to={
                        registro.tipo === "os"
                          ? `/ordens-servico?os=${registro.id}`
                          : `/atendimentos?atendimento=${registro.id}`
                      }
                      onClick={consultarDocumento}
                    >
                      Consultar OS
                    </Link>
                  )}
                </div>
              ) : situacao === "pago" ? (
                <p role="status">
                  Tudo pago. O pagamento já está registrado no financeiro.
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
                    {dataCombinada && <small>Combinado para {dataCombinada}</small>}
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
                  ? (continuacao?.rotuloAdiar ??
                    (conferirEntrega && dataCombinada
                      ? `Manter pagamento para ${dataCombinada}`
                      : "Agora não"))
                  : (continuacao?.rotulo ?? (conferirEntrega ? "Continuar" : "Fechar"))}
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
              ? vencimentoCombinado ||
                dados.os?.vencimento_pagamento ||
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
            if (
              registro.contexto === "criacao-pronta" ||
              registro.contexto === "entrega"
            ) {
              fechar();
              return;
            }
            setConcluido(true);
            setAcao("");
          }}
        />
      )}
    </>
  );
}
