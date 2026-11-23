import { dinheiro } from "../lib/formatacao";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, Wallet } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { consultarContasClientes } from "../services/contasClientes";
import { consultarIdentidade } from "../services/documentos";
import {
  assinaturaConta,
  rankingDevedores,
  totaisConta,
  type ClienteDevedor,
  type ContasClientes,
} from "../lib/contasClientes";

import { dataDocumento } from "../lib/documentoCliente";
import { erroPublico } from "../lib/supabase";
import { Dialogo } from "./Dialogo";
import "./RankingDevedores.css";

export function RankingDevedores() {
  const a = useAcesso();
  const [busca, setBusca] = useState(""),
    [ordem, setOrdem] = useState("aberto"),
    [atrasados, setAtrasados] = useState(false),
    [limite, setLimite] = useState(10);
  const [conta, setConta] = useState<{
    cliente: ClienteDevedor;
    dados: ContasClientes;
  } | null>(null);
  const q = useQuery({
    queryKey: ["contas-clientes", a.demo, a.oficina!.id],
    queryFn: () => consultarContasClientes(a.demo, a.oficina!.id),
    enabled:
      a.permite("finance") && a.permite("reports") && a.oficina!.perfil !== "staff",
  });
  const ranking = useMemo(() => (q.data ? rankingDevedores(q.data) : []), [q.data]);
  const indice = useMemo(
    () =>
      ranking.map((c) => ({
        cliente: c,
        texto:
          `${c.nome} ${c.telefone} ${c.ordens.map((o) => `${o.numero} ${o.veiculo} ${o.placa}`).join(" ")}`.toLocaleLowerCase(),
      })),
    [ranking],
  );
  const filtrados = useMemo(() => {
    const termo = busca.toLocaleLowerCase();
    return indice
      .filter(
        ({ cliente: c, texto }) =>
          (!atrasados || c.vencido > 0) && texto.includes(termo),
      )
      .map((i) => i.cliente)
      .sort((a, b) =>
        ordem === "vencido" ? b.vencido - a.vencido || b.aberto - a.aberto : 0,
      );
  }, [indice, atrasados, busca, ordem]);
  if (!a.permite("finance") || !a.permite("reports") || a.oficina!.perfil === "staff")
    return null;
  return (
    <section
      id="ranking-devedores"
      className="devedores-painel"
      aria-label="Clientes com saldo em aberto"
    >
      <header className="devedores-topo">
        <div>
          <h2>
            <Wallet size={21} /> Clientes com saldo em aberto
          </h2>
          <p>
            Maiores saldos das OS, do maior para o menor. Clique no cliente para montar
            a conta.
          </p>
        </div>
        <button
          className="botao-secundario"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
          aria-label="Atualizar saldos dos clientes"
        >
          <RefreshCw size={16} />
        </button>
      </header>
      <div className="devedores-filtros">
        <label>
          Buscar cliente ou OS
          <input
            value={busca}
            placeholder="Nome, telefone, número ou veículo"
            onChange={(e) => {
              setBusca(e.target.value);
              setLimite(10);
            }}
          />
        </label>
        <label>
          Ordenar por
          <select value={ordem} onChange={(e) => setOrdem(e.target.value)}>
            <option value="aberto">Maior saldo em aberto</option>
            <option value="vencido">Maior valor vencido</option>
          </select>
        </label>
        <label className="devedores-check">
          <input
            type="checkbox"
            checked={atrasados}
            onChange={(e) => setAtrasados(e.target.checked)}
          />{" "}
          Somente com atraso
        </label>
      </div>
      <p className="devedores-nota">
        Saldo atual de todos os períodos, independente das datas do relatório. Contas
        provisórias e receitas sem vínculo com OS ficam fora deste ranking.
      </p>
      {q.isError ? (
        <p role="alert">Não foi possível consultar os saldos. {erroPublico(q.error)}</p>
      ) : !q.data ? (
        <p role="status">Consultando contas…</p>
      ) : (
        <>
          <div className="devedores-resumo">
            <span>
              <strong>{filtrados.length}</strong> clientes / contas
            </span>
            <span>
              Em aberto{" "}
              <strong>{dinheiro(filtrados.reduce((s, c) => s + c.aberto, 0))}</strong>
            </span>
            <span className="devedores-atraso">
              Vencido{" "}
              <strong>{dinheiro(filtrados.reduce((s, c) => s + c.vencido, 0))}</strong>
            </span>
          </div>
          {!filtrados.length ? (
            <p className="devedores-vazio">
              {ranking.length
                ? "Nenhum cliente para estes filtros."
                : "Nenhuma OS com saldo em aberto."}
            </p>
          ) : (
            <ol className="devedores-lista">
              {filtrados.slice(0, limite).map((c, i) => (
                <li key={c.chave}>
                  <button
                    className="devedores-cliente"
                    onClick={() => setConta({ cliente: c, dados: q.data! })}
                    aria-label={`Montar conta de ${c.nome}${c.avulso ? `, OS ${c.ordens[0].numero}` : ""}`}
                  >
                    <span className="devedores-posicao">{i + 1}</span>
                    <span className="devedores-nome">
                      <strong>{c.nome}</strong>
                      <small>
                        {c.ordens.length} OS em aberto
                        {c.avulso ? ` · Sem cadastro · OS #${c.ordens[0].numero}` : ""}
                      </small>
                    </span>
                    <span className="devedores-valor">
                      <strong>{dinheiro(c.aberto)}</strong>
                      <small className={c.vencido ? "devedores-atraso" : ""}>
                        {c.vencido ? `${dinheiro(c.vencido)} vencidos` : "Sem atraso"}
                      </small>
                    </span>
                    <span className="devedores-acao">
                      <Download size={16} /> Montar conta
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {filtrados.length > limite && (
            <button className="botao-secundario" onClick={() => setLimite(limite + 20)}>
              Mostrar mais clientes
            </button>
          )}
        </>
      )}
      {conta && (
        <ContaClienteModal
          key={a.oficina!.id + conta.cliente.chave}
          inicial={conta}
          fechar={() => setConta(null)}
        />
      )}
    </section>
  );
}

function ContaClienteModal({
  inicial,
  fechar,
}: {
  inicial: { cliente: ClienteDevedor; dados: ContasClientes };
  fechar: () => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient();
  const [dados, setDados] = useState(inicial.dados),
    [selecionadas, setSelecionadas] = useState<string[]>(
      inicial.cliente.ordens.map((o) => o.id),
    );
  const [busy, setBusy] = useState(false),
    [aviso, setAviso] = useState(""),
    [erro, setErro] = useState("");
  const travado = useRef(false),
    ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);
  const ordens = useMemo(
    () => dados.ordens.filter((o) => o.chave_cliente === inicial.cliente.chave),
    [dados.ordens, inicial.cliente.chave],
  );
  const idsSelecionados = useMemo(() => new Set(selecionadas), [selecionadas]);
  const escolha = useMemo(
    () => ordens.filter((o) => idsSelecionados.has(o.id)),
    [ordens, idsSelecionados],
  );
  const totais = useMemo(() => totaisConta(escolha), [escolha]);
  async function gerar() {
    if (travado.current || !escolha.length) return;
    travado.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      const novos = await consultarContasClientes(a.demo, a.oficina!.id);
      if (!ativo.current) return;
      qc.setQueryData(["contas-clientes", a.demo, a.oficina!.id], novos);
      const atuais = novos.ordens.filter(
        (o) => o.chave_cliente === inicial.cliente.chave && idsSelecionados.has(o.id),
      );
      setDados(novos);
      if (assinaturaConta(escolha) !== assinaturaConta(atuais)) {
        setSelecionadas(atuais.map((o) => o.id));
        setAviso(
          "As contas foram atualizadas desde a seleção. Confira os novos valores e clique em Baixar conta em PDF novamente.",
        );
        return;
      }
      const [identidade, { gerarPdfContaCliente }] = await Promise.all([
        consultarIdentidade(a.demo, a.oficina!.id),
        import("../services/pdfContaCliente"),
      ]);
      if (!ativo.current) return;
      const nome = inicial.cliente.nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .slice(0, 65);
      gerarPdfContaCliente(atuais, identidade, novos.consultado_em, novos.hoje).save(
        `conta-${nome}-${novos.hoje}.pdf`,
      );
      setAviso("PDF gerado com as OS selecionadas. Pronto para enviar ao cliente.");
    } catch (e) {
      if (ativo.current) setErro(erroPublico(e));
    } finally {
      travado.current = false;
      if (ativo.current) setBusy(false);
    }
  }
  return (
    <Dialogo
      aberto
      titulo={`Conta de ${inicial.cliente.nome}`}
      fechar={fechar}
      classe="conta-cliente-dialogo"
    >
      <p className="devedores-nota">
        Selecione as OS que entram no PDF. Pagamentos recebidos já estão descontados.
      </p>
      <div className="conta-cliente-selecao">
        <strong>
          {escolha.length} de {ordens.length} OS selecionadas
        </strong>
        <button
          className="botao-secundario"
          disabled={busy || !ordens.length}
          onClick={() =>
            setSelecionadas(
              escolha.length === ordens.length ? [] : ordens.map((o) => o.id),
            )
          }
        >
          {escolha.length === ordens.length ? "Desmarcar todas" : "Selecionar todas"}
        </button>
      </div>
      <div className="conta-cliente-ordens">
        {ordens.map((o) => (
          <label
            className={`conta-cliente-os ${idsSelecionados.has(o.id) ? "selecionada" : ""}`}
            key={o.id}
          >
            <input
              type="checkbox"
              disabled={busy}
              checked={idsSelecionados.has(o.id)}
              aria-label={`Incluir OS ${o.numero}`}
              onChange={(e) =>
                setSelecionadas(
                  e.target.checked
                    ? [...selecionadas, o.id]
                    : selecionadas.filter((id) => id !== o.id),
                )
              }
            />
            <span className="conta-cliente-descricao">
              <strong>
                OS #{o.numero} <small>· {dataDocumento(o.data, false)}</small>
              </strong>
              <span>{[o.veiculo, o.placa].filter(Boolean).join(" · ")}</span>
              {o.servicos && <small>{o.servicos}</small>}
              <small>
                Valor {dinheiro(o.total_centavos)} · Recebido{" "}
                {dinheiro(o.pago_centavos)}
              </small>
              <small className={o.vencido_centavos ? "devedores-atraso" : ""}>
                {o.titulos.filter((t) => t.aberto_centavos > 0).length > 1
                  ? "Primeiro vencimento"
                  : "Vencimento"}
                : {dataDocumento(o.vencimento, false)}
                {o.vencido_centavos
                  ? ` · ${dinheiro(o.vencido_centavos)} vencidos`
                  : ""}
              </small>
            </span>
            <strong className="conta-cliente-saldo">
              {dinheiro(o.aberto_centavos)}
              <small>em aberto</small>
            </strong>
          </label>
        ))}
      </div>
      {!ordens.length && <p>Nenhuma OS permanece em aberto para este cliente.</p>}
      <div className="conta-cliente-total">
        <span>
          Total selecionado<strong>{dinheiro(totais.aberto)}</strong>
        </span>
        <small>
          Vencido: {dinheiro(totais.vencido)}
          <br />A vencer / hoje: {dinheiro(totais.aberto - totais.vencido)}
        </small>
      </div>
      {aviso && (
        <p role="status" className="conta-cliente-aviso">
          {aviso}
        </p>
      )}
      {erro && <p role="alert">{erro}</p>}
      <footer className="conta-cliente-rodape">
        <small>
          Posição em {dataDocumento(dados.consultado_em)}.<br />O saldo será conferido
          antes de gerar o arquivo.
        </small>
        <button
          className="botao-primario"
          disabled={busy || !escolha.length}
          onClick={() => void gerar()}
        >
          <Download size={17} />
          {busy ? "Conferindo saldos…" : "Baixar conta em PDF"}
        </button>
      </footer>
    </Dialogo>
  );
}
