import { useState, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { dinheiro } from "../services/orcamentos";
import {
  baixarTitulo,
  contas,
  formas,
  hoje,
  historicoFinanceiro,
  estornarBaixa,
  consultarFinanceiroOS,
  prepararFinanceiroOS,
  combinarPagamentoOS,
  type TituloFinanceiro,
  type BaixaFinanceira,
} from "../services/financeiro";
import type { OrdemServico } from "../services/ordensServico";
import { Dialogo } from "./Dialogo";
import "../pages/Compras.css";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
export function PagamentosIntegrados({
  titulo,
  preparar,
  os,
}: {
  titulo: TituloFinanceiro | null;
  preparar?: () => Promise<TituloFinanceiro>;
  os?: OrdemServico;
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const [modal, setModal] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [estorno, setEstorno] = useState<BaixaFinanceira | null>(null),
    [chave, setChave] = useState(() => crypto.randomUUID());
  const trava = useRef(false);
  const h = useQuery({
    queryKey: ["financeiro-historico", a.demo, oficina, titulo?.id],
    queryFn: () => historicoFinanceiro(a.demo, oficina, titulo!.id),
    enabled: !!titulo && modal === "historico",
  });
  const pago = titulo?.baixado_centavos ?? 0,
    total = titulo?.valor_centavos ?? os?.total_centavos ?? 0,
    restante =
      titulo?.cancelado_em || os?.situacao === "cancelled" ? 0 : total - pago,
    receber = titulo?.natureza !== "pagar";
  const status =
    titulo?.cancelado_em || os?.situacao === "cancelled"
      ? "Cancelado"
      : total > 0 && restante === 0
        ? "Quitado"
        : pago > 0
          ? "Pago parcialmente"
          : titulo?.pagamento_combinado
            ? "Pagamento combinado"
            : "Em aberto";
  function abrir(m: string) {
    setErro("");
    setEstorno(null);
    setChave(crypto.randomUUID());
    setModal(m);
  }
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await atualizarIntegracoes(qc);
      setModal("");
      setAviso(
        "Pagamento atualizado. O financeiro já está com os novos valores.",
      );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function pagar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void executar(async () => {
      const t = preparar ? await preparar() : titulo!;
      await baixarTitulo(a.demo, oficina, t, {
        chave,
        valor_centavos: Math.round(Number(f.get("valor")) * 100),
        taxa_centavos: Math.round(Number(f.get("taxa") || 0) * 100),
        data: String(f.get("data")),
        conta: String(f.get("conta")),
        forma: String(f.get("forma")),
        observacao: String(f.get("observacao")),
      });
    });
  }
  return (
    <section className="pagamento-integrado">
      <div className="os-linha">
        <h3>{receber ? "Pagamento do cliente" : "Pagamento ao fornecedor"}</h3>
        <span
          className={"compra-selo " + (status === "Quitado" ? "quitado" : "")}
        >
          {status}
        </span>
      </div>
      <div className="pagamento-valores">
        <div>
          <span>Total</span>
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
      {titulo?.vencimento && (
        <p>
          {titulo.pagamento_combinado ? "Combinado para" : "Vencimento"}:{" "}
          {new Date(titulo.vencimento + "T12:00:00").toLocaleDateString(
            "pt-BR",
          )}
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
        {!titulo?.cancelado_em &&
          os?.situacao !== "cancelled" &&
          restante > 0 && (
            <button className="botao-primario" onClick={() => abrir("pagar")}>
              {receber ? "Receber pagamento" : "Registrar pagamento"}
            </button>
          )}
        {os && os.situacao !== "cancelled" && restante > 0 && (
          <button
            className="botao-secundario"
            onClick={() => abrir("combinar")}
          >
            Combinar data
          </button>
        )}
        {titulo && (
          <button
            className="botao-secundario"
            onClick={() => abrir("historico")}
          >
            Histórico de pagamentos
          </button>
        )}
        {os && <Link to={"/financeiro?os=" + os.id}>Ver no financeiro →</Link>}
      </div>
      <Dialogo
        aberto={!!modal}
        fechar={() => !ocupado && setModal("")}
        titulo={
          modal === "pagar"
            ? receber
              ? "Receber do cliente"
              : "Pagar fornecedor"
            : modal === "combinar"
              ? "Combinar pagamento"
              : "Histórico de pagamentos"
        }
      >
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {modal === "pagar" && (
          <form className="formulario-cliente" onSubmit={pagar}>
            <fieldset disabled={ocupado}>
              <p>
                Restante: <strong>{dinheiro(restante)}</strong>. Informe somente
                o valor pago agora.
              </p>
              <div className="dupla-campos">
                <label>
                  Valor pago (R$)
                  <input
                    name="valor"
                    type="number"
                    min="0.01"
                    max={restante / 100}
                    step="0.01"
                    defaultValue={(restante / 100).toFixed(2)}
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
                    {Object.entries(contas).map(([v, n]) => (
                      <option value={v} key={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Forma
                  <select name="forma">
                    {Object.entries(formas).map(([v, n]) => (
                      <option value={v} key={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {receber && (
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
        {modal === "combinar" && os && (
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(() =>
                combinarPagamentoOS(a.demo, oficina, os, String(f.get("data"))),
              );
            }}
          >
            <label>
              Cliente combinou pagar em
              <input
                name="data"
                type="date"
                defaultValue={titulo?.vencimento ?? hoje()}
                required
                disabled={ocupado}
              />
            </label>
            <p>
              Isso agenda a cobrança. Só marque como pago quando receber o
              dinheiro.
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
                      {new Date(b.data + "T12:00:00").toLocaleDateString(
                        "pt-BR",
                      )}{" "}
                      · {formas[b.forma]} · {contas[b.conta]}
                    </p>
                    {b.taxa_centavos > 0 && (
                      <p>Taxa: {dinheiro(b.taxa_centavos)}</p>
                    )}
                    <p>{b.observacao}</p>
                    {!b.estorno_de &&
                      !h.data.some((x) => x.estorno_de === b.id) && (
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
                  Estornar {dinheiro(estorno.valor_centavos)} devolve esse valor
                  ao saldo em aberto.
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
    </section>
  );
}
export function FinanceiroNaOS({ os }: { os: OrdemServico }) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["financeiro-os", a.demo, a.oficina!.id, os.id, os.revisao],
    queryFn: () => consultarFinanceiroOS(a.demo, a.oficina!.id, os.id),
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
