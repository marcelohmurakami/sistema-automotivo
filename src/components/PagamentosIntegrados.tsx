import { novoId } from "../lib/uuid.ts";
import { useContasBancarias } from "../lib/useContasBancarias";
import { dinheiro } from "../lib/formatacao";
import { CobrancaPix } from "./CobrancaPix";
import { useMemo, useState, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";

import {
  baixarTitulo,
  formas,
  hoje,
  historicoFinanceiro,
  estornarBaixa,
  consultarFinanceiroOS,
  prepararFinanceiroOS,
  combinarPagamentoOS,
  combinarPagamentoTitulo,
  type TituloFinanceiro,
  type BaixaFinanceira,
} from "../services/financeiro";
import type { OrdemServico } from "../services/ordensServico";
import { Dialogo } from "./Dialogo";
import "../pages/Compras.css";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { useDesconto } from "../lib/useDesconto";
import { CampoDesconto } from "./CampoDesconto";
import "./DescontoRecebimento.css";
export function PagamentosIntegrados({
  titulo,
  preparar,
  os,
  atendimentoId,
  acaoInicial = "",
  somenteFormulario = false,
  valorInicial,
  vencimentoInicial,
  pagamentoParcial = false,
  aoConcluir,
  aoFechar,
  rotulo,
  mostrarDescontoNotaInicial = false,
}: {
  titulo: TituloFinanceiro | null;
  preparar?: () => Promise<TituloFinanceiro>;
  os?: OrdemServico;
  atendimentoId?: string;
  acaoInicial?: "" | "pagar" | "combinar";
  somenteFormulario?: boolean;
  valorInicial?: "";
  vencimentoInicial?: string;
  pagamentoParcial?: boolean;
  aoConcluir?: () => void;
  aoFechar?: () => void;
  rotulo?: string;
  mostrarDescontoNotaInicial?: boolean;
}) {
  const { contas, ativas } = useContasBancarias();
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const [modal, setModal] = useState<string>(acaoInicial),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [estorno, setEstorno] = useState<BaixaFinanceira | null>(null),
    [chave, setChave] = useState(() => novoId());
  const trava = useRef(false);
  const [formaPagamento, setFormaPagamento] = useState(titulo?.forma_prevista || "pix");
  const h = useQuery({
    queryKey: ["financeiro-historico", a.demo, oficina, titulo?.id],
    queryFn: ({ signal }) => historicoFinanceiro(a.demo, oficina, titulo!.id, signal),
    enabled: !!titulo && modal === "historico",
  });
  const baixasEstornadas = useMemo(
    () => new Set(h.data?.map((b) => b.estorno_de).filter(Boolean)),
    [h.data],
  );
  const pago = titulo?.baixado_centavos ?? 0,
    total = titulo?.valor_centavos ?? os?.total_centavos ?? 0,
    restante = titulo?.cancelado_em || os?.situacao === "cancelled" ? 0 : total - pago,
    receber = titulo?.natureza !== "pagar";
  const recebeTaxa =
    receber && (formaPagamento === "credito" || formaPagamento === "debito");
  const permiteDesconto =
    receber &&
    !!(os || atendimentoId || (titulo?.automatico && titulo.ordem_servico_id));
  const desconto = useDesconto(restante);
  const [mostrarDescontoNota, setMostrarDescontoNota] = useState(
    os?.mostrar_desconto_nota ?? mostrarDescontoNotaInicial,
  );
  const abatimento = permiteDesconto ? desconto.centavos : 0;
  const saldoComDesconto = restante - abatimento;
  const [valorPago, setValorPago] = useState<string | undefined>(valorInicial);
  const controleDesconto = {
    ...desconto,
    alterarValor: (valor: number | "") => {
      desconto.alterarValor(valor);
      if (!pagamentoParcial) setValorPago(undefined);
    },
    alterarTipo: (tipo: "percentual" | "valor") => {
      desconto.alterarTipo(tipo);
      if (!pagamentoParcial) setValorPago(undefined);
    },
  };
  const status =
    titulo?.cancelado_em || os?.situacao === "cancelled"
      ? "Cancelado"
      : (total > 0 || (titulo?.credito_fornecedor_centavos ?? 0) > 0) && restante === 0
        ? "Quitado"
        : pago > 0
          ? "Pago parcialmente"
          : titulo?.pagamento_combinado
            ? "Pagamento combinado"
            : "Em aberto";
  function abrir(m: string) {
    setErro("");
    setEstorno(null);
    setChave(novoId());
    setFormaPagamento(titulo?.forma_prevista || "pix");
    desconto.reiniciar();
    setMostrarDescontoNota(os?.mostrar_desconto_nota ?? mostrarDescontoNotaInicial);
    setValorPago(valorInicial);
    setModal(m);
  }
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await atualizarIntegracoes(qc, [
        "financeiro",
        "financeiro-detalhe",
        "compra",
        "financeiro-os",
        "financeiro-historico",
        "pagamento-apos-registro",
        "os-detalhe",
        "detalhes-atendimento",
      ]);
      setModal("");
      setAviso("Pagamento atualizado. O financeiro já está com os novos valores.");
      aoConcluir?.();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function pagar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!Number.isSafeInteger(abatimento) || abatimento < 0 || saldoComDesconto <= 0) {
      setErro("O desconto deve deixar um valor maior que zero para receber.");
      return;
    }
    const f = new FormData(e.currentTarget);
    void executar(async () => {
      const t = preparar ? await preparar() : titulo!;
      await baixarTitulo(a.demo, oficina, t, {
        chave,
        valor_centavos: Math.round(Number(f.get("valor")) * 100),
        taxa_centavos: recebeTaxa ? Math.round(Number(f.get("taxa") || 0) * 100) : 0,
        data: String(f.get("data")),
        conta: String(f.get("conta")),
        forma: String(f.get("forma")),
        observacao: String(f.get("observacao")),
        desconto_centavos: abatimento,
        ...(abatimento > 0 ? { mostrar_desconto_nota: mostrarDescontoNota } : {}),
        saldo_antes_desconto_centavos: restante,
        vencimento_restante: pagamentoParcial
          ? String(f.get("vencimento_restante"))
          : undefined,
      });
    });
  }
  return (
    <>
      {!somenteFormulario && (
        <section className="pagamento-integrado">
          <div className="os-linha">
            <h3>
              {rotulo || (receber ? "Pagamento do cliente" : "Pagamento ao fornecedor")}
            </h3>
            <span className={"compra-selo " + (status === "Quitado" ? "quitado" : "")}>
              {status}
            </span>
          </div>
          <div className="pagamento-valores">
            <div>
              <span>
                {titulo?.credito_fornecedor_centavos
                  ? "Total após abatimento"
                  : "Total"}
              </span>
              <strong>{dinheiro(total)}</strong>
            </div>
            <div>
              <span>Já pago</span>
              <strong>{dinheiro(pago)}</strong>
            </div>
            <div>
              <span>Falta {receber ? "receber" : "pagar"}</span>
              <strong>{dinheiro(restante)}</strong>
            </div>
          </div>
          {!!titulo?.credito_fornecedor_centavos && (
            <p className="texto-suave">
              Compra: {dinheiro(total + titulo.credito_fornecedor_centavos)} · Crédito
              do fornecedor: {dinheiro(titulo.credito_fornecedor_centavos)}
            </p>
          )}
          {titulo?.vencimento && (
            <p>
              {titulo.pagamento_combinado ? "Combinado para" : "Vencimento"}:{" "}
              {new Date(titulo.vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
              {restante > 0 && titulo.vencimento < hoje() ? " · Em atraso" : ""}
            </p>
          )}
          {os && !["delivered", "cancelled"].includes(os.situacao) && (
            <p className="texto-suave">
              Pode receber um sinal agora. O dinheiro entra no caixa; a receita do
              serviço entra no resultado na entrega.
            </p>
          )}
          {aviso && <p role="status">{aviso}</p>}
          <div className="compra-acoes">
            {receber && os && os.situacao !== "cancelled" && (
              <CobrancaPix titulo={titulo} preparar={preparar} restante={restante} />
            )}
            {!titulo?.cancelado_em && os?.situacao !== "cancelled" && restante > 0 && (
              <button className="botao-primario" onClick={() => abrir("pagar")}>
                {receber ? "Receber pagamento" : "Registrar pagamento"}
              </button>
            )}
            {(os || titulo?.compra_id) &&
              !titulo?.cancelado_em &&
              os?.situacao !== "cancelled" &&
              restante > 0 && (
                <button className="botao-secundario" onClick={() => abrir("combinar")}>
                  Combinar data
                </button>
              )}
            {titulo && (
              <button className="botao-secundario" onClick={() => abrir("historico")}>
                Histórico de pagamentos
              </button>
            )}
            {os && <Link to={"/financeiro?os=" + os.id}>Ver no financeiro →</Link>}
          </div>
        </section>
      )}
      <Dialogo
        aberto={!!modal}
        fechar={() => {
          if (!ocupado) {
            setModal("");
            aoFechar?.();
          }
        }}
        titulo={
          modal === "pagar"
            ? receber
              ? "Registrar recebimento"
              : "Registrar pagamento"
            : modal === "combinar"
              ? "Combinar pagamento"
              : "Histórico de pagamentos"
        }
      >
        {somenteFormulario && titulo && (
          <p>
            <strong>{titulo.descricao}</strong>
          </p>
        )}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {modal === "pagar" && (
          <form className="formulario-cliente" onSubmit={pagar}>
            <fieldset disabled={ocupado}>
              <p>
                Restante: <strong>{dinheiro(restante)}</strong>. Informe somente o valor
                pago agora.
              </p>
              {permiteDesconto && (
                <div className="recebimento-desconto">
                  <CampoDesconto
                    controle={controleDesconto}
                    nota={
                      controleDesconto.centavos > 0
                        ? {
                            mostrar: mostrarDescontoNota,
                            alterar: setMostrarDescontoNota,
                          }
                        : undefined
                    }
                  />
                  <div className="recebimento-desconto-total" aria-live="polite">
                    <span>Saldo com desconto</span>
                    <strong>{dinheiro(Math.max(0, saldoComDesconto))}</strong>
                    <small>Aplicado ao valor que falta pagar.</small>
                  </div>
                </div>
              )}
              <div className="dupla-campos">
                <label>
                  Valor pago (R$)
                  <input
                    name="valor"
                    onFocus={(e) => e.currentTarget.select()}
                    type="number"
                    min="0.01"
                    max={
                      Math.max(0, saldoComDesconto - (pagamentoParcial ? 1 : 0)) / 100
                    }
                    step="0.01"
                    value={
                      valorPago ?? (Math.max(0, saldoComDesconto) / 100).toFixed(2)
                    }
                    onChange={(e) => setValorPago(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Data do pagamento
                  <input
                    name="data"
                    type="date"
                    max={hoje()}
                    defaultValue={hoje()}
                    required
                  />
                </label>
              </div>
              <div className="dupla-campos">
                <label>
                  Conta
                  <select name="conta" defaultValue="banco">
                    {Object.entries(ativas).map(([v, n]) => (
                      <option value={v} key={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Forma
                  <select
                    name="forma"
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value)}
                  >
                    {Object.entries(formas).map(([v, n]) => (
                      <option value={v} key={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {pagamentoParcial && (
                <label>
                  Vencimento do restante
                  <input
                    name="vencimento_restante"
                    type="date"
                    required
                    defaultValue={vencimentoInicial ?? titulo?.vencimento ?? hoje()}
                  />
                </label>
              )}
              {recebeTaxa && (
                <label>
                  Taxa da maquininha (R$)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="taxa"
                    defaultValue="0"
                  />
                </label>
              )}
              <label>
                Observação
                <input
                  name="observacao"
                  maxLength={1000}
                  placeholder="Ex.: sinal via Pix"
                />
              </label>
              <button className="botao-primario" disabled={ocupado}>
                {ocupado ? "Registrando…" : "Confirmar pagamento"}
              </button>
            </fieldset>
          </form>
        )}
        {modal === "combinar" && (os || titulo) && (
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(() =>
                os
                  ? combinarPagamentoOS(a.demo, oficina, os, String(f.get("data")))
                  : combinarPagamentoTitulo(
                      a.demo,
                      oficina,
                      titulo!,
                      String(f.get("data")),
                    ),
              );
            }}
          >
            <label>
              {receber ? "Receber em" : "Pagar em"}
              <input
                name="data"
                type="date"
                defaultValue={vencimentoInicial ?? titulo?.vencimento ?? hoje()}
                required
                disabled={ocupado}
              />
            </label>
            <p>
              {receber
                ? "O valor ficará a receber nessa data, sem registrar entrada no caixa."
                : "O valor ficará a pagar nessa data, sem registrar saída do caixa."}
            </p>
            <button className="botao-primario" disabled={ocupado}>
              Salvar data combinada
            </button>
          </form>
        )}
        {modal === "historico" && (
          <>
            {h.isPending ? (
              <p>Carregando pagamentos…</p>
            ) : h.isError ? (
              <p role="alert">{erroPublico(h.error)}</p>
            ) : !h.data.length ? (
              <p>Nenhum pagamento registrado.</p>
            ) : (
              <ol className="os-historico">
                {h.data.map((b) => (
                  <li key={b.id}>
                    <strong>
                      {b.estorno_de ? "Estorno" : "Pagamento"} ·{" "}
                      {dinheiro(b.valor_centavos)}
                    </strong>
                    <p>
                      {new Date(b.data + "T12:00:00").toLocaleDateString("pt-BR")} ·{" "}
                      {formas[b.forma]} · {contas[b.conta]}
                    </p>
                    {b.taxa_centavos > 0 && <p>Taxa: {dinheiro(b.taxa_centavos)}</p>}
                    {!b.estorno_de && !!b.desconto_centavos && (
                      <p>Desconto na OS: {dinheiro(b.desconto_centavos)}</p>
                    )}
                    <p>{b.observacao}</p>
                    {!b.estorno_de && !baixasEstornadas.has(b.id) && (
                      <button
                        className="botao-secundario"
                        disabled={ocupado}
                        onClick={() => setEstorno(b)}
                      >
                        Estornar este pagamento
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {estorno && (
              <form
                className="formulario-cliente"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void executar(() =>
                    estornarBaixa(
                      a.demo,
                      oficina,
                      estorno,
                      hoje(),
                      String(f.get("motivo")),
                    ),
                  );
                }}
              >
                <p>
                  Estornar {dinheiro(estorno.valor_centavos)} devolve esse valor ao
                  saldo em aberto.
                  {!!estorno.desconto_centavos &&
                    " O desconto concedido na OS será mantido."}
                </p>
                <label>
                  Motivo do estorno
                  <input
                    name="motivo"
                    minLength={3}
                    maxLength={1000}
                    required
                    disabled={ocupado}
                  />
                </label>
                <button className="botao-primario" disabled={ocupado}>
                  Confirmar estorno
                </button>
              </form>
            )}
          </>
        )}
      </Dialogo>
    </>
  );
}
export function FinanceiroNaOS({ os }: { os: OrdemServico }) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["financeiro-os", a.demo, a.oficina!.id, os.id, os.revisao],
    queryFn: ({ signal }) =>
      consultarFinanceiroOS(a.demo, a.oficina!.id, os.id, signal),
    refetchInterval: 30000,
  });
  if (q.isPending) return <p>Consultando pagamentos…</p>;
  if (q.isError) return <p role="alert">{erroPublico(q.error)}</p>;
  return (
    <PagamentosIntegrados
      titulo={q.data}
      os={os}
      preparar={() => prepararFinanceiroOS(a.demo, a.oficina!.id, os)}
    />
  );
}
