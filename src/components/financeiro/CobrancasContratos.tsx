import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../../auth/contexto";
import { dinheiro } from "../../lib/formatacao";
import { erroPublico } from "../../lib/supabase";
import { atualizarIntegracoes } from "../../lib/atualizarIntegracoes";
import {
  listarCobrancasContratos,
  faturarLoteContratos,
  type CobrancaContrato,
} from "../../services/contratos";
import { Dialogo } from "../Dialogo";
export function CobrancasContratos() {
  const a = useAcesso(),
    qc = useQueryClient();
  const [mes, setMes] = useState(() => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }),
    [pagina, setPagina] = useState(0),
    [pendentes, setPendentes] = useState(true),
    [ids, setIds] = useState<string[]>([]),
    [confirmar, setConfirmar] = useState(false),
    [lote, setLote] = useState<{ mes: string; itens: CobrancaContrato[] }>({
      mes: "",
      itens: [],
    }),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const trava = useRef(false);
  const q = useQuery({
    queryKey: ["contratos-cobrancas", a.oficina!.id, mes, pagina, pendentes],
    queryFn: () =>
      listarCobrancasContratos(a.oficina!.id, mes + "-01", pagina, pendentes),
    enabled: !a.demo && !!mes,
  });
  const selecionados = (q.data?.itens || []).filter(
      (c) => ids.includes(c.id) && !c.fechada,
    ),
    total = selecionados.reduce((s, c) => s + c.fatura.total, 0);
  if (a.demo)
    return <p>As cobranças dos contratos ficam disponíveis na conta da empresa.</p>;
  return (
    <section className="plano-op fin-ampliado cobrancas-contratos">
      <header className="plano-cabecalho">
        <div>
          <h2>Cobranças dos contratos</h2>
          <p>
            Feche o mês com os consumos conferidos. Vigência, reajustes e excedentes vêm
            de cada contrato.
          </p>
        </div>
        <Link className="botao-secundario" to="/contratos">
          Gerenciar contratos
        </Link>
      </header>
      <div className="plano-campos">
        <label>
          Mês do serviço
          <input
            type="month"
            required
            value={mes}
            onChange={(e) => {
              setMes(e.target.value);
              setPagina(0);
              setIds([]);
              setAviso("");
            }}
          />
        </label>
        <label>
          Mostrar
          <select
            value={pendentes ? "pendentes" : "todos"}
            onChange={(e) => {
              setPendentes(e.target.value === "pendentes");
              setPagina(0);
              setIds([]);
            }}
          >
            <option value="pendentes">Ainda não cobrados</option>
            <option value="todos">Todos do mês</option>
          </select>
        </label>
      </div>
      {q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : q.isPending ? (
        <p role="status">Calculando cobranças…</p>
      ) : (
        <>
          <div className="plano-acoes">
            <button
              className="botao-secundario"
              onClick={() =>
                setIds(q.data.itens.filter((c) => !c.fechada).map((c) => c.id))
              }
            >
              Selecionar pendentes da página
            </button>
            <button
              className="botao-primario"
              disabled={!selecionados.length || busy}
              onClick={() => {
                setLote({ mes, itens: selecionados });
                setConfirmar(true);
                setErro("");
              }}
            >
              Gerar {selecionados.length || ""} cobranças · {dinheiro(total)}
            </button>
          </div>
          <div className="plano-lista">
            {q.data.itens.map((c) => (
              <div className="plano-linha cobranca-linha" key={c.id}>
                <label className="plano-check cobranca-cliente">
                  <input
                    type="checkbox"
                    disabled={c.fechada || busy}
                    checked={ids.includes(c.id)}
                    onChange={(e) =>
                      setIds((s) =>
                        e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id),
                      )
                    }
                  />
                  <span>
                    <strong>{c.cliente}</strong>
                    <small className="fin-conta-detalhe">
                      {c.nome} · {c.fatura.inicio.split("-").reverse().join("/")} a{" "}
                      {c.fatura.fim.split("-").reverse().join("/")}
                    </small>
                  </span>
                </label>
                <span className="cobranca-valor">
                  <strong>{dinheiro(c.fatura.total)}</strong>
                  <small className="fin-conta-detalhe">
                    Mensalidade {dinheiro(c.fatura.mensalidade)} · Adicionais{" "}
                    {dinheiro(c.fatura.total - c.fatura.mensalidade)}
                  </small>
                </span>
                <span className="cobranca-situacao">
                  {c.fechada
                    ? c.cancelada
                      ? "Cobrança cancelada"
                      : !c.titulo_id
                        ? "Fechado sem cobrança"
                        : c.aberto === 0
                          ? "Pago"
                          : "A receber"
                    : "A conferir"}
                  {c.titulo_id && (
                    <Link
                      className="fin-conta-detalhe"
                      to={`/financeiro?titulo=${c.titulo_id}`}
                    >
                      Abrir cobrança →
                    </Link>
                  )}
                </span>
                <details className="cobranca-composicao">
                  <summary>Composição</summary>
                  <p>
                    Visitas excedentes: {dinheiro(c.fatura.excedente_visitas)} · Horas
                    excedentes: {dinheiro(c.fatura.excedente_horas)} · Materiais
                    excedentes: {dinheiro(c.fatura.excedente_materiais)} · Participação:{" "}
                    {dinheiro(c.fatura.participacao)}.
                  </p>
                  <p>
                    Vencimento: {c.fatura.vencimento.split("-").reverse().join("/")}
                  </p>
                </details>
              </div>
            ))}
            {!q.data.total && (
              <p>
                Nenhum contrato neste filtro. Confira também os meses anteriores para
                não deixar mensalidades pendentes.
              </p>
            )}
          </div>
          <div className="plano-acoes">
            <button
              disabled={!pagina || busy}
              onClick={() => {
                setPagina((p) => p - 1);
                setIds([]);
              }}
            >
              Anterior
            </button>
            <span>Página {pagina + 1}</span>
            <button
              disabled={(pagina + 1) * 30 >= q.data.total || busy}
              onClick={() => {
                setPagina((p) => p + 1);
                setIds([]);
              }}
            >
              Próxima
            </button>
          </div>
        </>
      )}
      {aviso && <p role="status">{aviso}</p>}
      <details>
        <summary>Como funciona a cobrança?</summary>
        <p className="texto-suave">
          Estas cobranças ficam em “A pagar e receber”. Não emitem boleto, não enviam
          mensagens e não registram recebimento automaticamente. Contratos já fechados
          não são cobrados outra vez.
        </p>
      </details>
      <Dialogo
        aberto={confirmar}
        titulo="Conferir cobranças do mês"
        fechar={() => !busy && setConfirmar(false)}
      >
        <form
          className="plano-op"
          onSubmit={async (e) => {
            e.preventDefault();
            if (trava.current || !lote.itens.length) return;
            trava.current = true;
            setBusy(true);
            setErro("");
            try {
              await faturarLoteContratos(
                a.oficina!.id,
                lote.mes + "-01",
                lote.itens.map(({ id, assinatura }) => ({ id, assinatura })),
              );
              setConfirmar(false);
              setIds([]);
              setAviso(
                "Competências fechadas. Os valores a cobrar estão no financeiro.",
              );
              await atualizarIntegracoes(qc, [
                "contratos-cobrancas",
                "financeiro",
                "financeiro-detalhe",
              ]);
            } catch (err) {
              setErro(erroPublico(err));
            } finally {
              trava.current = false;
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <p>
              {lote.itens.length} contratos · Total{" "}
              {dinheiro(lote.itens.reduce((s, c) => s + c.fatura.total, 0))}.
            </p>
            <label className="plano-check">
              <input type="checkbox" required />
              Conferi o consumo, as coberturas, os reajustes e os excedentes destes
              contratos.
            </label>
            <p>
              Após fechar, o consumo do mês não poderá ser alterado. Meses com valor
              zero serão fechados sem criar conta a receber.
            </p>
            <button className="botao-primario">Gerar cobranças</button>
            {erro && <p role="alert">{erro}</p>}
          </fieldset>
        </form>
      </Dialogo>
    </section>
  );
}
