import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../../auth/contexto";
import { useContasBancarias } from "../../lib/useContasBancarias";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { erroPublico } from "../../lib/supabase";
import { dinheiro } from "../../lib/formatacao";
import { novoId } from "../../lib/uuid";
import { baixarCSV } from "../../lib/csv";
import {
  lerCsvExtrato,
  lerExtrato,
  detectarColunasExtrato,
  type ColunasExtrato,
  type ExtratoLido,
} from "../../lib/extratoBancario";
import {
  consultarConciliacao,
  importarExtrato,
  detalharConciliacao,
  resolverConciliacao,
  movimentosSemExtrato,
  type LinhaExtrato,
  type MovimentoConciliacao,
  type EstadoConciliacao,
} from "../../services/conciliacao";
import { Dialogo } from "../Dialogo";
import "./ConciliacaoBancaria.css";
const nomes: Record<EstadoConciliacao, string> = {
  pendente: "A conferir",
  conciliado: "Conciliado",
  ignorado: "Ignorado com motivo",
};
const data = (s: string) => s.split("-").reverse().join("/");

export function ConciliacaoBancaria({ inicio, fim }: { inicio: string; fim: string }) {
  const a = useAcesso();
  const { lista: contas } = useContasBancarias();
  const bancos = contas.filter((c) => c.tipo === "banco");
  const [escolhida, setConta] = useState(""),
    [estado, setEstado] = useState("pendente"),
    [pagina, setPagina] = useState(0),
    [importar, setImportar] = useState(false),
    [semExtrato, setSemExtrato] = useState(false),
    [atual, setAtual] = useState<LinhaExtrato | null>(null),
    [aviso, setAviso] = useState("");
  const conta = escolhida || bancos[0]?.codigo || "";
  const q = useQuery({
    queryKey: ["conciliacao", a.oficina!.id, conta, inicio, fim, estado, pagina],
    queryFn: ({ signal }) =>
      consultarConciliacao(a.oficina!.id, conta, inicio, fim, estado, pagina, signal),
    enabled: !a.demo && !!conta,
  });
  if (a.demo) return <p>Importe e confira extratos na conta da sua empresa.</p>;
  const r = q.data?.resumo;
  return (
    <section className="plano-op fin-ampliado conciliacao">
      <header className="plano-cabecalho">
        <div>
          <h2>Conciliação bancária</h2>
          <p>Confira o extrato com os recebimentos e pagamentos registrados.</p>
        </div>
        <button
          className="botao-primario"
          disabled={!conta || !bancos.find((c) => c.codigo === conta)?.ativo}
          onClick={() => setImportar(true)}
        >
          Importar extrato
        </button>
      </header>
      <div className="plano-campos">
        <label>
          Conta bancária
          <select
            value={conta}
            onChange={(e) => {
              setConta(e.target.value);
              setPagina(0);
            }}
          >
            {bancos.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nome}
                {c.ativo ? "" : " · inativa"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mostrar
          <select
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPagina(0);
            }}
          >
            <option value="pendente">A conferir</option>
            <option value="conciliado">Conciliados</option>
            <option value="ignorado">Ignorados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>
      {r && (
        <>
          <div className="conc-resumo">
            <span>
              <strong>{r.pendentes}</strong>A conferir
            </span>
            <span>
              <strong>{r.conciliados}</strong>Conciliados
            </span>
            <span>
              <strong>{r.sem_extrato}</strong>Movimentos do sistema sem vínculo
              <button
                className="botao-secundario"
                disabled={!r.sem_extrato}
                onClick={() => setSemExtrato(true)}
              >
                Conferir movimentos
              </button>
            </span>
          </div>
          <p className="texto-suave">
            Movimentação líquida no período: extrato {dinheiro(r.movimento_extrato)} ·
            sistema {dinheiro(r.movimento_sistema)}. Estes são movimentos, não o saldo
            da conta.{" "}
            {r.ignorados > 0 &&
              `${r.ignorados} itens ignorados continuam visíveis no filtro.`}
          </p>
        </>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : q.isPending ? (
        <p role="status">Carregando extrato…</p>
      ) : (
        <div className="plano-lista">
          {q.data?.itens.map((l) => (
            <button
              key={l.id}
              className="conc-linha conc-movimento"
              onClick={() => setAtual(l)}
            >
              <span className="conc-data">{data(l.data)}</span>
              <span className="conc-identidade">
                <strong>{l.descricao}</strong>
                <small>{nomes[l.estado]}</small>
              </span>
              <strong className="conc-valor" data-negativo={l.valor < 0}>
                {dinheiro(l.valor)}
              </strong>
              <span className="conc-seta" aria-hidden>
                →
              </span>
            </button>
          ))}
          {q.data?.total === 0 && (
            <p>
              Nenhuma movimentação neste filtro. Importe o extrato ou altere o período.
            </p>
          )}
        </div>
      )}
      <div className="plano-acoes">
        <button disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
          Anterior
        </button>
        <span>Página {pagina + 1}</span>
        <button
          disabled={!q.data || (pagina + 1) * 50 >= q.data.total}
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima
        </button>
        <Link to="/financeiro?aba=resultado">Exportações para o contador</Link>
      </div>
      {importar && (
        <Importacao
          conta={conta}
          nomeConta={bancos.find((c) => c.codigo === conta)?.nome || ""}
          fechar={() => setImportar(false)}
          concluido={(s) => {
            setAviso(s);
            setImportar(false);
            void q.refetch();
          }}
        />
      )}
      {semExtrato && (
        <SemExtrato
          key={conta}
          conta={conta}
          inicio={inicio}
          fim={fim}
          fechar={() => setSemExtrato(false)}
        />
      )}
      {atual && (
        <Conferencia
          key={atual.id}
          linha={atual}
          fechar={() => {
            setAtual(null);
            void q.refetch();
          }}
        />
      )}
    </section>
  );
}

function SemExtrato({
  conta,
  inicio,
  fim,
  fechar,
}: {
  conta: string;
  inicio: string;
  fim: string;
  fechar: () => void;
}) {
  const a = useAcesso(),
    [pagina, setPagina] = useState(0);
  const q = useQuery({
    queryKey: ["conciliacao-sem-extrato", a.oficina!.id, conta, inicio, fim, pagina],
    queryFn: ({ signal }) =>
      movimentosSemExtrato(a.oficina!.id, conta, inicio, fim, pagina, signal),
  });
  return (
    <Dialogo
      aberto
      titulo="Movimentos do sistema sem extrato vinculado"
      fechar={fechar}
    >
      <div className="plano-op conciliacao">
        <p>
          Confira se a conta e a data foram registradas corretamente e se o extrato
          deste período já foi importado.
        </p>
        {q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : q.isPending ? (
          <p role="status">Consultando movimentos…</p>
        ) : (
          <>
            <div className="plano-lista">
              {q.data.itens.map((b) => (
                <Link
                  className="conc-linha conc-movimento"
                  key={b.id}
                  to={`/financeiro?titulo=${b.titulo_id}`}
                >
                  <span className="conc-data">{data(b.data)}</span>
                  <span className="conc-identidade">
                    <strong>{b.descricao}</strong>
                    <small>
                      {b.pessoa}
                      {b.estorno_de ? " · Estorno" : ""}
                    </small>
                  </span>
                  <strong className="conc-valor">{dinheiro(b.valor)}</strong>
                  <span className="conc-seta" aria-hidden>
                    →
                  </span>
                </Link>
              ))}
              {!q.data.total && (
                <p>
                  Todos os movimentos do sistema neste período têm extrato vinculado.
                </p>
              )}
            </div>
            <div className="plano-acoes">
              <button disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <span>Página {pagina + 1}</span>
              <button
                disabled={(pagina + 1) * 50 >= q.data.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </div>
    </Dialogo>
  );
}

function Importacao({
  conta,
  nomeConta,
  fechar,
  concluido,
}: {
  conta: string;
  nomeConta: string;
  fechar: () => void;
  concluido: (s: string) => void;
}) {
  const a = useAcesso(),
    [texto, setTexto] = useState(""),
    [nome, setNome] = useState(""),
    [cab, setCab] = useState<string[]>([]),
    [col, setCol] = useState<ColunasExtrato>({
      data: 0,
      descricao: 1,
      valor: 2,
      id: -1,
    }),
    [previa, setPrevia] = useState<ExtratoLido | null>(null),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false);
  const chave = useRef(novoId()),
    trava = useRef(false);
  async function arquivo(f: File) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    setPrevia(null);
    setCab([]);
    setTexto("");
    try {
      if (f.size > 2 * 1024 * 1024) throw Error("Use um arquivo de até 2 MB.");
      const bytes = await f.arrayBuffer();
      let t = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (t.includes("\uFFFD")) t = new TextDecoder("windows-1252").decode(bytes);
      t = t.replace(/^\ufeff/, "");
      setTexto(t);
      setNome(f.name.slice(0, 180));
      chave.current = novoId();
      if (/<OFX[\s>]/i.test(t)) setPrevia(await lerExtrato(t));
      else {
        const c = lerCsvExtrato(t)[0];
        setCab(c);
        setCol(detectarColunasExtrato(c));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialogo aberto titulo="Importar extrato bancário" fechar={() => !busy && fechar()}>
      <form
        className="plano-op"
        onSubmit={async (e) => {
          e.preventDefault();
          if (trava.current || !previa) return;
          trava.current = true;
          setBusy(true);
          setErro("");
          try {
            const r = await importarExtrato(
              a.oficina!.id,
              chave.current,
              conta,
              nome,
              previa.linhas,
            );
            concluido(
              `${r.novos} movimentos importados; ${r.repetidos} já existentes. Ajuste o período da consulta se necessário.`,
            );
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
            Destino: <strong>{nomeConta}</strong>. Aceita OFX e CSV em reais, até 2.000
            movimentos / 2 MB.
          </p>
          <label>
            Arquivo
            <input
              type="file"
              accept=".ofx,.csv,.txt"
              required
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void arquivo(f);
              }}
            />
          </label>
          <button
            type="button"
            className="botao-secundario"
            onClick={() =>
              baixarCSV(
                [
                  ["Data", "Descrição", "Valor", "Identificador"],
                  ["01/10/2026", "Exemplo de recebimento", "100,00", "exemplo-1"],
                  ["02/10/2026", "Exemplo de despesa", "-25,00", "exemplo-2"],
                ],
                "modelo-extrato.csv",
              )
            }
          >
            Baixar modelo CSV
          </button>
          {!!cab.length && !previa && (
            <>
              <p>
                Selecione as colunas. Saídas precisam ter valor negativo; entradas,
                positivo.
              </p>
              <div className="plano-campos">
                {(["data", "descricao", "valor", "id"] as const).map((k) => (
                  <label key={k}>
                    {
                      {
                        data: "Data",
                        descricao: "Descrição",
                        valor: "Valor com sinal",
                        id: "Identificador do banco (opcional)",
                      }[k]
                    }
                    <select
                      value={col[k]}
                      onChange={(e) => setCol({ ...col, [k]: Number(e.target.value) })}
                    >
                      {k === "id" && (
                        <option value={-1}>Arquivo sem identificador</option>
                      )}
                      {k !== "id" && <option value={-1}>Selecione a coluna</option>}
                      {cab.map((c, i) => (
                        <option key={i} value={i}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="botao-secundario"
                onClick={async () => {
                  if (trava.current) return;
                  trava.current = true;
                  setErro("");
                  setBusy(true);
                  try {
                    setPrevia(await lerExtrato(texto, col));
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : "Confira o arquivo.");
                  } finally {
                    trava.current = false;
                    setBusy(false);
                  }
                }}
              >
                Conferir importação
              </button>
            </>
          )}
          {previa && (
            <>
              <p>
                <strong>{previa.linhas.length} movimentações</strong>
                {previa.conta && ` · Conta no arquivo: ${previa.conta}`}
                {previa.banco && ` · Banco: ${previa.banco}`}
              </p>
              {previa.semIdentificador && (
                <p className="aviso-cliente">
                  Há movimentos sem identificador bancário. A repetição será detectada
                  por data, valor, descrição e ocorrência. Prefira OFX com
                  identificadores. Em arquivos sobrepostos, descrições diferentes podem
                  repetir movimentos; lançamentos idênticos podem ser tratados como já
                  importados. Confira a quantidade após importar.
                </p>
              )}
              <div className="plano-lista">
                {previa.linhas.slice(0, 5).map((l) => (
                  <div className="conc-linha conc-movimento" key={l.identificador}>
                    <span className="conc-data">{data(l.data)}</span>
                    <span className="conc-identidade">{l.descricao}</span>
                    <strong className="conc-valor">{dinheiro(l.valor)}</strong>
                  </div>
                ))}
              </div>
              <small>
                Prévia dos primeiros {Math.min(5, previa.linhas.length)} movimentos.
              </small>
              <label className="plano-check">
                <input type="checkbox" required />
                Conferi a conta de destino, as datas e o sinal dos valores.
              </label>
              <button className="botao-primario">
                {busy ? "Importando…" : "Importar para conferir"}
              </button>
              <p>Importar não registra pagamentos nem quita contas.</p>
            </>
          )}
          {erro && <p role="alert">{erro}</p>}
        </fieldset>
      </form>
    </Dialogo>
  );
}

function Conferencia({ linha, fechar }: { linha: LinhaExtrato; fechar: () => void }) {
  const a = useAcesso(),
    qc = useQueryClient(),
    [inicio, setInicio] = useState(() => {
      const d = new Date(linha.data + "T12:00:00");
      d.setDate(d.getDate() - 3);
      return d.toISOString().slice(0, 10);
    }),
    [fim, setFim] = useState(() => {
      const d = new Date(linha.data + "T12:00:00");
      d.setDate(d.getDate() + 3);
      return d.toISOString().slice(0, 10);
    }),
    [busca, setBusca] = useState(""),
    termo = useBuscaDebounced(busca),
    [pagina, setPagina] = useState(0),
    [selecionados, setSelecionados] = useState<MovimentoConciliacao[]>([]),
    [motivo, setMotivo] = useState(""),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [acao, setAcao] = useState<EstadoConciliacao>("conciliado");
  const trava = useRef(false);
  const q = useQuery({
    queryKey: [
      "conciliacao-detalhe",
      a.oficina!.id,
      linha.id,
      inicio,
      fim,
      termo,
      pagina,
    ],
    queryFn: ({ signal }) =>
      detalharConciliacao(a.oficina!.id, linha.id, inicio, fim, termo, pagina, signal),
  });
  const l = q.data?.linha || linha,
    total = selecionados.reduce((s, b) => s + b.valor, 0);
  async function salvar(estado: EstadoConciliacao) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    try {
      await resolverConciliacao(
        a.oficina!.id,
        l,
        estado,
        estado === "conciliado" ? selecionados.map((x) => x.id) : [],
        motivo,
      );
      await qc.invalidateQueries({ queryKey: ["conciliacao"] });
      fechar();
    } catch (e) {
      setErro(erroPublico(e));
      void q.refetch();
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialogo aberto titulo="Conferir movimentação" fechar={() => !busy && fechar()}>
      <div className="plano-op conciliacao">
        <strong>
          {data(l.data)} · {l.descricao} · {dinheiro(l.valor)}
        </strong>
        <p>{nomes[l.estado]}</p>
        {q.isPending ? (
          <p role="status">Buscando lançamentos…</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : l.estado === "pendente" ? (
          <>
            <div className="plano-campos">
              <label>
                Movimentos desde
                <input
                  type="date"
                  value={inicio}
                  onChange={(e) => {
                    setInicio(e.target.value);
                    setPagina(0);
                  }}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={fim}
                  onChange={(e) => {
                    setFim(e.target.value);
                    setPagina(0);
                  }}
                />
              </label>
              <label>
                Buscar no financeiro
                <input
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPagina(0);
                  }}
                  placeholder="Cliente ou descrição"
                />
              </label>
            </div>
            <p>
              Selecione o pagamento correspondente ou os movimentos que compõem este
              valor. As sugestões usam valor e proximidade da data; confira o cliente.
            </p>
            <div className="plano-lista">
              {q.data?.candidatos.map((b) => (
                <label className="conc-linha conc-selecao" key={b.id}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={selecionados.some((s) => s.id === b.id)}
                    onChange={(e) =>
                      setSelecionados((s) =>
                        e.target.checked ? [...s, b] : s.filter((x) => x.id !== b.id),
                      )
                    }
                  />
                  <span className="conc-identidade">
                    <strong>{b.descricao}</strong>
                    <small>
                      {b.pessoa} · {data(b.data)}
                      {b.estorno_de ? " · Estorno" : ""}
                      {b.sugestao ? " · Possível correspondência" : ""}
                    </small>
                  </span>
                  <strong className="conc-valor">{dinheiro(b.valor)}</strong>
                </label>
              ))}
              {!q.data?.total && (
                <p>
                  Nenhum movimento disponível. Amplie as datas ou registre o pagamento
                  que falta.
                </p>
              )}
            </div>
            <div className="plano-acoes">
              <button
                disabled={!pagina || busy}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </button>
              <span>Página {pagina + 1}</span>
              <button
                disabled={!q.data || (pagina + 1) * 50 >= q.data.total || busy}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
            <p>
              <strong>
                {selecionados.length} selecionados · {dinheiro(total)}
              </strong>{" "}
              · Diferença: {dinheiro(l.valor - total)}
            </p>
            <div className="plano-acoes">
              <button
                className="botao-primario"
                disabled={busy || !selecionados.length || total !== l.valor}
                onClick={() => void salvar("conciliado")}
              >
                Conciliar selecionados
              </button>
              <button
                className="botao-secundario"
                disabled={busy || !selecionados.length}
                onClick={() => setSelecionados([])}
              >
                Limpar seleção
              </button>
              <button
                className="botao-secundario"
                disabled={busy}
                onClick={() => setAcao("ignorado")}
              >
                Ignorar com motivo
              </button>
            </div>
            <details>
              <summary>Falta um pagamento ou existe diferença?</summary>
              <p>
                Registre o recebimento, pagamento ou taxa na conta correta. Se o
                pagamento já existe, confira a conta e a data antes de repetir. Depois
                volte aqui.
              </p>
              <div className="plano-acoes">
                <Link to="/financeiro?aba=contas">
                  Conferir contas a pagar e receber
                </Link>
                <Link
                  to={`/financeiro?novo=${l.valor > 0 ? "receber" : "pagar"}&aba=contas`}
                >
                  Novo lançamento
                </Link>
              </div>
            </details>
          </>
        ) : (
          <>
            <p>{l.motivo}</p>
            {q.data?.vinculados.map((b) => (
              <Link
                className="conc-linha"
                key={b.id}
                to={`/financeiro?titulo=${b.titulo_id}`}
              >
                <span className="conc-identidade">{b.descricao}</span>
                <strong className="conc-valor">{dinheiro(b.valor)}</strong>
              </Link>
            ))}
            <button
              className="botao-secundario"
              disabled={busy}
              onClick={() => setAcao("pendente")}
            >
              Desfazer conferência
            </button>
          </>
        )}
        {acao !== "conciliado" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void salvar(acao);
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Motivo para {acao === "ignorado" ? "ignorar" : "desfazer"}
                <input
                  required
                  minLength={3}
                  maxLength={1000}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
              <button className="botao-primario">Confirmar</button>
              <button
                type="button"
                className="botao-secundario"
                onClick={() => setAcao("conciliado")}
              >
                Cancelar
              </button>
            </fieldset>
          </form>
        )}
        {!!q.data?.historico.length && (
          <details>
            <summary>Histórico da conferência</summary>
            {q.data.historico.map((h) => (
              <p key={h.id}>
                {new Date(h.criado_em).toLocaleString("pt-BR")} · {nomes[h.estado]} ·{" "}
                {h.motivo || `${h.baixas.length} movimentos vinculados`}
              </p>
            ))}
          </details>
        )}
        {erro && <p role="alert">{erro}</p>}
      </div>
    </Dialogo>
  );
}
