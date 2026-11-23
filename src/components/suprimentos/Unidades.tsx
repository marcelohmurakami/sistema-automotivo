import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Dialogo } from "../Dialogo";
import { suprimentos, type UnidadeEstoque } from "../../services/suprimentos";
import { type ProdutoEstoque } from "../../services/estoque";
import { novoId } from "../../lib/uuid";
import { EstadoConsulta, Paginacao } from "./Comum";
import { useBusca, useSuprimentos, lerSeries } from "./helpers";
import "./Suprimentos.css";
import { EscolherDeposito } from "./Depositos";
import { logisticaEstoque } from "../../services/logisticaEstoque";
import { LerProduto, ImprimirEtiquetasEstoque } from "./EtiquetasEstoque";
const estados = {
  estoque: "Disponível",
  utilizado: "Utilizada",
  saida: "Saída",
  cancelado: "Entrada estornada",
};
export function SeletorUnidades({
  produto,
  selecionados,
  alterar,
  reserva,
  deposito = null,
}: {
  produto: string;
  selecionados: string[];
  alterar: (ids: string[]) => void;
  reserva?: string | null;
  deposito?: string | null;
}) {
  const { w } = useSuprimentos(),
    [busca, setBusca] = useState(""),
    [pag, setPag] = useState(0),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "unidades-deposito", w, produto, deposito, v, pag],
    queryFn: ({ signal }) =>
      logisticaEstoque.unidades(w, produto, deposito, v, pag, signal),
  });
  return (
    <div className="supr-unidades">
      <label>
        Buscar série ou IMEI
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPag(0);
          }}
        />
      </label>
      <EstadoConsulta loading={q.isPending} error={q.error} />
      <p>{selecionados.length} unidades selecionadas</p>
      <LerProduto
        produto={produto}
        deposito={deposito}
        reserva={reserva}
        unidade
        selecionar={(_, c) => {
          if (c.unidade_id && !selecionados.includes(c.unidade_id))
            alterar([...selecionados, c.unidade_id]);
        }}
      />
      {q.data?.itens.map((u) => {
        const livre =
          u.estado === "estoque" && (!u.reserva_id || u.reserva_id === reserva);
        return (
          <label className="supr-check" key={u.id}>
            <input
              type="checkbox"
              disabled={!livre}
              checked={selecionados.includes(u.id)}
              onChange={(e) =>
                alterar(
                  e.target.checked
                    ? [...selecionados, u.id]
                    : selecionados.filter((i) => i !== u.id),
                )
              }
            />
            <span>
              <strong>{u.serie}</strong>
              {u.imei && <small>IMEI {u.imei}</small>}
            </span>
            <small>{u.reserva_id ? "Reservada" : estados[u.estado]}</small>
          </label>
        );
      })}
      <Paginacao pagina={pag} total={q.data?.total ?? 0} alterar={setPag} />
    </div>
  );
}
export function UnidadesProduto({
  produto,
  fechar,
  unidadeInicial,
}: {
  produto: ProdutoEstoque;
  fechar: () => void;
  unidadeInicial?: string;
}) {
  const { w, erro, ocupado, executar } = useSuprimentos();
  const [busca, setBusca] = useState(""),
    [deposito, setDeposito] = useState<string | null>(null),
    [pag, setPag] = useState(0),
    [acao, setAcao] = useState<"entrada" | "saida" | null>(null),
    [texto, setTexto] = useState(""),
    [motivo, setMotivo] = useState(""),
    [selecionados, setSelecionados] = useState<string[]>([]),
    [unidade, setUnidade] = useState<string | null>(unidadeInicial ?? null),
    [chave, setChave] = useState(novoId),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "unidades", w, produto.id, v, pag],
    queryFn: ({ signal }) => suprimentos.unidades(w, produto.id, v, pag, signal),
  });
  const p = useQuery({
    queryKey: ["estoque", "unidades-produto", w, produto.id],
    queryFn: ({ signal }) => suprimentos.produto(w, produto.id, signal),
  });
  const hist = useQuery({
    queryKey: ["suprimentos", "unidade", w, unidade],
    queryFn: ({ signal }) => suprimentos.unidade(w, unidade!, signal),
    enabled: !!unidade,
  });
  return (
    <Dialogo
      aberto
      fechar={() => !ocupado && fechar()}
      titulo={`Unidades · ${produto.descricao}`}
    >
      <div className="supr">
        <div className="supr-barra">
          <ImprimirEtiquetasEstoque
            produto={produto.id}
            descricao={produto.descricao}
            unidades={unidade ? [unidade] : []}
          />
          <button
            disabled={ocupado}
            onClick={() => {
              setAcao("entrada");
              setChave(novoId());
            }}
          >
            Registrar entrada
          </button>
          <button
            disabled={ocupado}
            onClick={() => {
              setAcao("saida");
              setChave(novoId());
            }}
          >
            Registrar saída
          </button>
          <Link to="/compras?aba=pedidos">Receber pedido de fornecedor →</Link>
        </div>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {acao ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await executar(() =>
                  suprimentos.executar(w, "movimentar_estoque_deposito", {
                    p_deposito: deposito,
                    p_quantidade:
                      acao === "entrada"
                        ? lerSeries(texto).length
                        : selecionados.length,
                    p_produto: produto.id,
                    p_revisao: p.data?.revisao ?? produto.revisao,
                    p_chave: chave,
                    p_tipo: acao,
                    p_unidades: acao === "entrada" ? lerSeries(texto) : selecionados,
                    p_motivo: motivo,
                  }),
                )
              ) {
                setAcao(null);
                setTexto("");
                setMotivo("");
                setSelecionados([]);
              }
            }}
          >
            <fieldset disabled={ocupado}>
              <h3>
                {acao === "entrada" ? "Entrada de unidades" : "Saída de unidades"}
              </h3>
              <EscolherDeposito
                valor={deposito}
                produto={produto.id}
                alterar={(v) => {
                  setDeposito(v);
                  setSelecionados([]);
                }}
              />
              {acao === "entrada" ? (
                <label>
                  Séries ou IMEIs · uma unidade por linha
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    required
                    rows={5}
                    placeholder={"Série ABC123\nSérie ABC124; 123456789012345"}
                  />
                  <small>
                    Para informar os dois: série; IMEI. Compras a pagar devem ser
                    recebidas pelo pedido.
                  </small>
                </label>
              ) : (
                <SeletorUnidades
                  produto={produto.id}
                  deposito={deposito}
                  selecionados={selecionados}
                  alterar={setSelecionados}
                />
              )}
              <label>
                Motivo
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
              <div className="supr-barra">
                <button
                  className="botao-primario"
                  disabled={
                    acao === "entrada" ? !lerSeries(texto).length : !selecionados.length
                  }
                >
                  {ocupado ? "Salvando…" : "Confirmar movimentação"}
                </button>
                <button type="button" onClick={() => setAcao(null)}>
                  Cancelar
                </button>
              </div>
            </fieldset>
          </form>
        ) : (
          <>
            <label>
              Buscar série ou IMEI
              <input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPag(0);
                }}
              />
            </label>
            <EstadoConsulta loading={q.isPending} error={q.error} />
            {q.data?.itens.map((u) => (
              <button
                className="supr-linha supr-clicavel"
                key={u.id}
                onClick={() => setUnidade(u.id)}
              >
                <span>
                  <strong>{u.serie}</strong>
                  <small>{u.imei ? `IMEI ${u.imei}` : "Sem IMEI"}</small>
                </span>
                <span className="supr-selo">
                  {u.reserva_id ? "Reservada" : estados[u.estado]}
                </span>
                <span>Ver histórico →</span>
              </button>
            ))}
            {q.data?.total === 0 && (
              <p className="supr-vazio">Nenhuma unidade registrada.</p>
            )}
            <Paginacao pagina={pag} total={q.data?.total ?? 0} alterar={setPag} />
          </>
        )}
        {unidade && (
          <section className="supr-painel">
            <div className="supr-barra">
              <h3>Histórico da unidade</h3>
              <button onClick={() => setUnidade(null)}>Fechar histórico</button>
            </div>
            <EstadoConsulta loading={hist.isPending} error={hist.error} />
            {hist.data?.historico.map((h) => (
              <div className="supr-linha" key={h.id}>
                <span>{new Date(h.criado_em).toLocaleString("pt-BR")}</span>
                <span>
                  {h.dados.reserva_id ? "Reservada" : estados[h.dados.estado]}
                </span>
                <span>
                  <small>{h.dados.motivo}</small>
                  {h.dados.documento_id && (
                    <Link
                      to={
                        h.dados.ramo === "os"
                          ? `/ordens-servico?os=${h.dados.documento_id}`
                          : `/atendimentos?atendimento=${h.dados.documento_id}`
                      }
                    >
                      {h.dados.referencia || "Abrir atendimento"} →
                    </Link>
                  )}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </Dialogo>
  );
}
export function ConsultaUnidades({ fechar }: { fechar: () => void }) {
  const { w, erro, ocupado, executar } = useSuprimentos(),
    [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    [alvo, setAlvo] = useState<{ p: ProdutoEstoque; u: UnidadeEstoque } | null>(null),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "unidades", w, null, v, pagina],
    queryFn: ({ signal }) => suprimentos.unidades(w, null, v, pagina, signal),
  });
  if (alvo)
    return (
      <UnidadesProduto
        produto={alvo.p}
        unidadeInicial={alvo.u.id}
        fechar={() => setAlvo(null)}
      />
    );
  return (
    <Dialogo aberto fechar={fechar} titulo="Encontrar série ou IMEI">
      <div className="supr">
        <label>
          Série, IMEI ou produto
          <input
            autoFocus
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Digite ou use o leitor de código"
          />
        </label>
        <EstadoConsulta loading={q.isPending || busca !== v} error={q.error} />
        {erro && <p role="alert">{erro}</p>}
        {q.data?.itens.map((u) => (
          <button
            className="supr-linha supr-clicavel"
            disabled={ocupado || busca !== v}
            key={u.id}
            onClick={() =>
              void executar(async () => {
                setAlvo({ p: await suprimentos.produto(w, u.produto_id), u });
              }, false)
            }
          >
            <span>
              <strong>{u.serie}</strong>
              <small>
                {u.descricao}
                {u.imei && ` · IMEI ${u.imei}`}
              </small>
            </span>
            <span className="supr-selo">
              {u.reserva_id ? "Reservada" : estados[u.estado]}
            </span>
            <span>Histórico →</span>
          </button>
        ))}
        {q.data?.total === 0 && (
          <p className="supr-vazio">Nenhuma unidade encontrada.</p>
        )}
        <Paginacao pagina={pagina} total={q.data?.total ?? 0} alterar={setPagina} />
      </div>
    </Dialogo>
  );
}
