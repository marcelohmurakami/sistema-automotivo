import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { useContasBancarias } from "../../lib/useContasBancarias";
import { dinheiro } from "../../lib/formatacao";
import { novoId } from "../../lib/uuid";
import { erroPublico } from "../../lib/supabase";
import { atualizarIntegracoes } from "../../lib/atualizarIntegracoes";
import {
  salvarContaBancaria,
  registrarSaldoInicialConta,
  type ContaBancaria,
} from "../../services/contasBancarias";
import { hoje, transferirFinanceiro } from "../../services/financeiro";
import { Dialogo } from "../Dialogo";
export function ContasBancarias() {
  const a = useAcesso(),
    q = useContasBancarias(),
    qc = useQueryClient();
  const [edit, setEdit] = useState<ContaBancaria | null>(null),
    [nova, setNova] = useState(false),
    [transferir, setTransferir] = useState(false),
    [saldo, setSaldo] = useState<ContaBancaria | null>(null),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [aviso, setAviso] = useState("");
  const trava = useRef(false),
    chave = useRef(novoId());
  async function acao(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    try {
      await fn();
      await atualizarIntegracoes(qc, ["contas-bancarias", "financeiro"]);
      setEdit(null);
      setTransferir(false);
      setSaldo(null);
      setAviso("Registro salvo.");
      chave.current = novoId();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setBusy(false);
      trava.current = false;
    }
  }
  function movimento(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void acao(async () => {
      const valor = Math.round(Number(f.get("valor")) * 100),
        data = String(f.get("data"));
      if (saldo) {
        await registrarSaldoInicialConta(
          a.demo,
          a.oficina!.id,
          chave.current,
          saldo,
          valor,
          data,
        );
      } else
        await transferirFinanceiro(
          a.demo,
          a.oficina!.id,
          chave.current,
          valor,
          data,
          String(f.get("origem")),
          String(f.get("destino")),
        );
    });
  }
  return (
    <section className="plano-op fin-ampliado">
      <header className="plano-cabecalho">
        <div>
          <h2>Contas e saldos</h2>
          <p>
            Identifique onde o dinheiro está. Os valores são os registros do sistema.
          </p>
        </div>
        <div className="plano-acoes">
          <button
            className="botao-primario"
            disabled={!q.data || busy}
            onClick={() => {
              setNova(true);
              setEdit({
                codigo: novoId(),
                nome: "",
                tipo: "banco",
                banco: "",
                agencia: "",
                numero: "",
                ativo: true,
                revisao: 0,
                saldo: 0,
              });
            }}
          >
            Nova conta
          </button>
          <button
            className="botao-secundario"
            disabled={!q.data || busy}
            onClick={() => {
              chave.current = novoId();
              setTransferir(true);
            }}
          >
            Registrar transferência
          </button>
        </div>
      </header>
      {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
      {aviso && <p role="status">{aviso}</p>}
      {erro && <p role="alert">{erro}</p>}
      {q.isPending && <p role="status">Consultando contas e saldos…</p>}
      <div className="plano-lista">
        {(q.data || []).map((c) => (
          <article className="plano-linha banco-linha" key={c.codigo}>
            <span>
              <strong>{c.nome}</strong>
              <small className="fin-conta-detalhe">
                {[
                  c.banco,
                  c.agencia && `Ag. ${c.agencia}`,
                  c.numero && `Conta ${c.numero}`,
                  !c.ativo && "Arquivada",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <strong>{dinheiro(c.saldo)}</strong>
            <div className="plano-acoes">
              <button
                className="botao-secundario"
                onClick={() => {
                  setNova(false);
                  setEdit(c);
                }}
              >
                Editar
              </button>
              {c.ativo && (
                <button
                  className="botao-secundario"
                  onClick={() => {
                    chave.current = novoId();
                    setSaldo(c);
                  }}
                >
                  Informar saldo inicial
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <Dialogo
        aberto={!!edit}
        titulo={nova ? "Nova conta" : "Editar conta"}
        fechar={() => !busy && setEdit(null)}
      >
        {edit && (
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              void acao(() => salvarContaBancaria(a.demo, a.oficina!.id, edit, nova));
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Nome para identificar
                <input
                  required
                  maxLength={100}
                  value={edit.nome}
                  onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                />
              </label>
              <label>
                Tipo
                <select
                  value={edit.tipo}
                  disabled={["caixa", "banco"].includes(edit.codigo)}
                  onChange={(e) =>
                    setEdit({ ...edit, tipo: e.target.value as "caixa" | "banco" })
                  }
                >
                  <option value="banco">Banco / conta digital</option>
                  <option value="caixa">Dinheiro em caixa</option>
                </select>
              </label>
              {edit.tipo === "banco" && (
                <>
                  <label>
                    Banco (opcional)
                    <input
                      maxLength={100}
                      value={edit.banco}
                      onChange={(e) => setEdit({ ...edit, banco: e.target.value })}
                    />
                  </label>
                  <div className="dupla-campos">
                    <label>
                      Agência (opcional)
                      <input
                        maxLength={30}
                        value={edit.agencia}
                        onChange={(e) => setEdit({ ...edit, agencia: e.target.value })}
                      />
                    </label>
                    <label>
                      Número da conta (opcional)
                      <input
                        maxLength={40}
                        value={edit.numero}
                        onChange={(e) => setEdit({ ...edit, numero: e.target.value })}
                      />
                    </label>
                  </div>
                </>
              )}
              {!nova && !["caixa", "banco"].includes(edit.codigo) && (
                <label className="plano-check">
                  <input
                    type="checkbox"
                    checked={edit.ativo}
                    onChange={(e) => setEdit({ ...edit, ativo: e.target.checked })}
                  />
                  Disponível para novos pagamentos
                </label>
              )}
              <button className="botao-primario">Salvar conta</button>
              {erro && <p role="alert">{erro}</p>}
            </fieldset>
          </form>
        )}
      </Dialogo>
      <Dialogo
        aberto={transferir || !!saldo}
        titulo={
          saldo ? `Saldo inicial · ${saldo.nome}` : "Registrar transferência realizada"
        }
        fechar={() => {
          if (!busy) {
            setTransferir(false);
            setSaldo(null);
          }
        }}
      >
        <form
          key={`${saldo?.codigo || "transferencia"}:${transferir}`}
          className="formulario-cliente"
          onSubmit={movimento}
        >
          <fieldset disabled={busy}>
            <p>
              {saldo
                ? "Informe somente o saldo anterior que ainda não foi registrado. Não use para corrigir pagamentos já lançados."
                : "Registra uma transferência que você já fez. Não envia dinheiro ao banco e não altera o lucro."}
            </p>
            {!saldo && (
              <div className="dupla-campos">
                <label>
                  Conta de origem
                  <select name="origem" defaultValue="caixa" required>
                    {Object.entries(q.ativas).map(([id, n]) => (
                      <option key={id} value={id}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Conta de destino
                  <select name="destino" defaultValue="banco" required>
                    {Object.entries(q.ativas).map(([id, n]) => (
                      <option key={id} value={id}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <label>
              Valor (R$){saldo && <small>Use valor negativo para saldo devedor.</small>}
              <input
                name="valor"
                type="number"
                step="0.01"
                min={saldo ? undefined : 0.01}
                required
              />
            </label>
            <label>
              Data
              <input
                name="data"
                type="date"
                required
                defaultValue={hoje()}
                max={hoje()}
              />
            </label>
            <button className="botao-primario">Confirmar registro</button>
            {erro && <p role="alert">{erro}</p>}
          </fieldset>
        </form>
      </Dialogo>
    </section>
  );
}
