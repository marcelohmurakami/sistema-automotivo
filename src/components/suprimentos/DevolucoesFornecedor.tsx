import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DialogoLocalizacao as Dialogo } from "../localizacao/DialogoLocalizacao";
import { fornecimento, type DevolucaoFornecedor } from "../../services/fornecimento";
import { suprimentos } from "../../services/suprimentos";
import type { ProdutoEstoque } from "../../services/estoque";
import { novoId } from "../../lib/uuid";
import { dinheiro } from "../../lib/formatacao";
import {
  EscolherFornecedor,
  EscolherProduto,
  EstadoConsulta,
  Paginacao,
} from "./Comum";
import { EscolherDeposito } from "./Depositos";
import { SeletorUnidades } from "./Unidades";
import {
  useBusca,
  useSuprimentos,
  numero,
  dataCurta,
  passoProduto,
  lerSeries,
} from "./helpers";
const estados = {
  aberto: "A preparar",
  enviado: "Enviada",
  analise: "Em análise",
  resolvido: "Resolvida",
  encerrado: "Encerrada",
};
const eventos: Record<string, string> = {
  devolucao_aberta: "Devolução registrada",
  acompanhar: "Acompanhamento atualizado",
  credito: "Crédito concedido",
  sem_reposicao: "Sem reposição",
  reposicao: "Reposição recebida",
  reposicao_avulsa: "Reposição recebida",
  credito_aplicado: "Crédito usado na conta",
  credito_estornado: "Uso do crédito desfeito",
  encerrar: "Acompanhamento encerrado",
};
export function DevolucoesFornecedor({
  abrirPedido,
}: {
  abrirPedido: (id: string) => void;
}) {
  const { w } = useSuprimentos(),
    [busca, setBusca] = useState(""),
    [situacao, setSituacao] = useState("abertas"),
    [pag, setPag] = useState(0),
    [id, setId] = useState<string | null>(null),
    [novo, setNovo] = useState(false),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "devolucoes", w, v, pag, situacao],
    queryFn: ({ signal }) => fornecimento.devolucoes(w, v, pag, situacao, signal),
  });
  return (
    <section className="supr-painel">
      <div className="supr-barra">
        <div>
          <h2>Devoluções e créditos</h2>
          <small>Acompanhe a resposta do fornecedor até resolver cada item.</small>
        </div>
        <button className="botao-primario" onClick={() => setNovo(true)}>
          + Nova devolução
        </button>
      </div>
      <div className="supr-campos">
        <label>
          Buscar devolução
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPag(0);
            }}
            placeholder="Produto, fornecedor ou protocolo"
          />
        </label>
        <label>
          Mostrar
          <select
            value={situacao}
            onChange={(e) => {
              setSituacao(e.target.value);
              setPag(0);
            }}
          >
            <option value="abertas">Em acompanhamento</option>
            <option value="credito">Com crédito disponível</option>
            <option value="todas">Todas</option>
          </select>
        </label>
      </div>
      <EstadoConsulta loading={q.isPending} error={q.error} />
      {q.data?.itens.map((d) => (
        <button
          className="supr-linha supr-clicavel"
          key={d.id}
          onClick={() => setId(d.id)}
        >
          <span>
            <strong>{d.descricao}</strong>
            <small>
              {d.fornecedor}
              {d.protocolo ? ` · ${d.protocolo}` : ""}
            </small>
          </span>
          <span>
            <strong>
              {numero(d.pendente)} {d.unidade} pendentes
            </strong>
            <small>
              {d.credito_centavos > d.usado_centavos
                ? `Crédito: ${dinheiro(d.credito_centavos - d.usado_centavos)}`
                : dataCurta(d.prazo)}
            </small>
          </span>
          <span className="supr-selo">{estados[d.estado]}</span>
          <span>→</span>
        </button>
      ))}
      {q.data?.total === 0 && (
        <p className="supr-vazio">
          Nenhuma devolução nesta seleção. Devoluções registradas em pedidos aparecem
          aqui automaticamente.
        </p>
      )}
      <Paginacao pagina={pag} total={q.data?.total ?? 0} alterar={setPag} />
      {novo && (
        <NovaDevolucao
          fechar={() => setNovo(false)}
          salvo={(v) => {
            setNovo(false);
            setId(v);
          }}
        />
      )}
      {id && (
        <DetalheDevolucao
          id={id}
          fechar={() => setId(null)}
          abrirPedido={(v) => {
            setId(null);
            abrirPedido(v);
          }}
        />
      )}
    </section>
  );
}
function NovaDevolucao({
  fechar,
  salvo,
}: {
  fechar: () => void;
  salvo: (id: string) => void;
}) {
  const { w, erro, ocupado, executar } = useSuprimentos(),
    [id] = useState(novoId),
    [fornecedor, setFornecedor] = useState(""),
    [produto, setProduto] = useState<ProdutoEstoque | null>(null),
    [deposito, setDeposito] = useState<string | null>(null),
    [ids, setIds] = useState<string[]>([]);
  return (
    <Dialogo
      aberto
      titulo="Devolver produto ao fornecedor"
      fechar={() => !ocupado && fechar()}
    >
      <form
        className="supr"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!produto) return;
          const f = new FormData(e.currentTarget);
          if (
            await executar(() =>
              suprimentos.executar(w, "abrir_devolucao_fornecedor", {
                p_id: id,
                p_fornecedor: fornecedor,
                p_produto: produto.id,
                p_deposito: deposito,
                p_quantidade: produto.rastreado
                  ? ids.length
                  : Number(f.get("quantidade")),
                p_revisao: produto.revisao,
                p_motivo: f.get("motivo"),
                p_unidades: produto.rastreado ? ids : null,
              }),
            )
          )
            salvo(id);
        }}
      >
        <fieldset disabled={ocupado}>
          <p>
            Para uma compra feita por pedido, use “Devolver para reposição” no pedido.
            Aqui você registra outras devoluções do estoque.
          </p>
          <EscolherFornecedor selecionar={setFornecedor} />
          <EscolherProduto
            selecionar={(p) => {
              setProduto(p);
              setIds([]);
            }}
          />
          {produto && (
            <>
              <h3>{produto.descricao}</h3>
              <EscolherDeposito
                produto={produto.id}
                valor={deposito}
                alterar={(v) => {
                  setDeposito(v);
                  setIds([]);
                }}
              />
              {produto.rastreado ? (
                <SeletorUnidades
                  produto={produto.id}
                  deposito={deposito}
                  selecionados={ids}
                  alterar={setIds}
                />
              ) : (
                <label>
                  Quantidade a devolver
                  <input
                    name="quantidade"
                    type="number"
                    min={passoProduto(produto.unidade)}
                    step={passoProduto(produto.unidade)}
                    defaultValue={1}
                    required
                  />
                </label>
              )}
            </>
          )}
          <label>
            Motivo da devolução
            <textarea name="motivo" minLength={3} maxLength={1000} required />
          </label>
          <small>
            Ao confirmar, os produtos saem do depósito e passam a ser acompanhados com o
            fornecedor.
          </small>
          {erro && (
            <p className="erro-formulario" role="alert">
              {erro}
            </p>
          )}
          <button
            className="botao-primario"
            disabled={!produto || !fornecedor || (produto.rastreado && !ids.length)}
          >
            Confirmar devolução
          </button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
function DetalheDevolucao({
  id,
  fechar,
  abrirPedido,
}: {
  id: string;
  fechar: () => void;
  abrirPedido: (id: string) => void;
}) {
  const operacao = useSuprimentos();
  const { w, erro, ocupado, executar } = operacao,
    [pag, setPag] = useState(0),
    [acao, setAcao] = useState<string | null>(null),
    [estorno, setEstorno] = useState<DevolucaoFornecedor["aplicacoes"][number] | null>(
      null,
    );
  const q = useQuery({
      queryKey: ["suprimentos", "devolucao", w, id, pag],
      queryFn: ({ signal }) => fornecimento.devolucao(w, id, pag, signal),
    }),
    d = q.data;
  return (
    <Dialogo
      aberto
      titulo="Acompanhamento da devolução"
      fechar={() => !ocupado && fechar()}
    >
      <div className="supr">
        <EstadoConsulta loading={q.isPending} error={q.error} />
        {erro && !acao && !estorno && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {d && (
          <>
            <div className="supr-barra">
              <div>
                <h3>{d.descricao}</h3>
                <small>
                  {d.fornecedor} · {estados[d.estado]}
                  {d.protocolo ? ` · ${d.protocolo}` : ""}
                </small>
              </div>
              {d.pedido_id && (
                <button disabled={ocupado} onClick={() => abrirPedido(d.pedido_id!)}>
                  Abrir pedido →
                </button>
              )}
            </div>
            <div className="supr-metrica">
              <span>
                <small>A resolver</small>
                <b>
                  {numero(d.pendente)} {d.unidade}
                </b>
              </span>
              <span>
                <small>Substituídos</small>
                <b>{numero(d.substituido)}</b>
              </span>
              <span>
                <small>Crédito disponível</small>
                <b>{dinheiro(d.credito_centavos - d.usado_centavos)}</b>
              </span>
            </div>
            <p>{d.motivo}</p>
            {d.observacoes && <p>{d.observacoes}</p>}
            <small>
              Prazo: {dataCurta(d.prazo)} · Devolvidos: {numero(d.quantidade)} · Com
              crédito: {numero(d.creditado)} · Sem reposição: {numero(d.sem_reposicao)}
            </small>
            <div className="supr-barra">
              {d.estado !== "encerrado" && (
                <>
                  {d.pendente > 0 && (
                    <>
                      <button disabled={ocupado} onClick={() => setAcao("acompanhar")}>
                        Registrar envio / análise
                      </button>
                      <button
                        disabled={ocupado}
                        onClick={() =>
                          d.pedido_id ? abrirPedido(d.pedido_id) : setAcao("reposicao")
                        }
                      >
                        Receber substituição
                      </button>
                      <button disabled={ocupado} onClick={() => setAcao("credito")}>
                        Registrar crédito
                      </button>
                      <button
                        disabled={ocupado}
                        onClick={() => setAcao("sem_reposicao")}
                      >
                        Sem reposição
                      </button>
                    </>
                  )}
                  <button
                    disabled={ocupado || d.pendente > 0}
                    onClick={() => setAcao("encerrar")}
                  >
                    Encerrar acompanhamento
                  </button>
                </>
              )}
              {d.credito_centavos > d.usado_centavos && (
                <button
                  className="botao-primario"
                  disabled={ocupado}
                  onClick={() => {
                    setPag(0);
                    setAcao("aplicar");
                  }}
                >
                  Usar crédito em uma conta
                </button>
              )}
            </div>
            {acao && (
              <AcaoDevolucao
                key={acao + d.revisao}
                d={d}
                operacao={operacao}
                acao={acao}
                fechar={() => setAcao(null)}
                pagina={pag}
                alterarPagina={setPag}
              />
            )}
            <details>
              <summary>Histórico e créditos utilizados</summary>
              {d.aplicacoes.map((m) => (
                <div className="supr-linha" key={m.id}>
                  <span>
                    <strong>
                      {dinheiro(m.valor_centavos)} ·{" "}
                      {m.estorno_de
                        ? "Uso desfeito"
                        : m.estornado
                          ? "Aplicação estornada"
                          : "Abatimento na conta"}
                    </strong>
                    <small>{m.motivo}</small>
                  </span>
                  {!m.estorno_de && !m.estornado && (
                    <button disabled={ocupado} onClick={() => setEstorno(m)}>
                      Desfazer uso
                    </button>
                  )}
                </div>
              ))}
              {d.historico.map((h) => (
                <div className="supr-linha" key={h.id}>
                  <span>
                    <strong>{eventos[h.tipo] ?? "Atualização registrada"}</strong>
                    <small>{new Date(h.criado_em).toLocaleString("pt-BR")}</small>
                    {typeof h.dados.observacoes === "string" && (
                      <small>{h.dados.observacoes}</small>
                    )}
                    {typeof h.dados.quantidade === "number" && (
                      <small>Quantidade: {numero(h.dados.quantidade)}</small>
                    )}
                  </span>
                </div>
              ))}
              <Paginacao
                pagina={pag}
                total={Math.max(d.total_historico, d.aplicacoes.length)}
                alterar={setPag}
              />
            </details>
            {estorno && (
              <Dialogo
                aberto
                titulo="Desfazer uso do crédito"
                fechar={() => !ocupado && setEstorno(null)}
              >
                <form
                  className="supr"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const motivo = new FormData(e.currentTarget).get("motivo");
                    if (
                      await executar(() =>
                        suprimentos.executar(w, "aplicar_credito_fornecedor", {
                          p_id: novoId(),
                          p_devolucao: d.id,
                          p_titulo: estorno.titulo_id,
                          p_valor: estorno.valor_centavos,
                          p_revisao: d.revisao,
                          p_motivo: motivo,
                          p_estorno: estorno.id,
                        }),
                      )
                    )
                      setEstorno(null);
                  }}
                >
                  <p>
                    {dinheiro(estorno.valor_centavos)} voltará ao crédito disponível e à
                    conta a pagar.
                  </p>
                  <label>
                    Motivo
                    <input name="motivo" minLength={3} maxLength={1000} required />
                  </label>
                  {erro && <p role="alert">{erro}</p>}
                  <button className="botao-primario" disabled={ocupado}>
                    Confirmar estorno
                  </button>
                </form>
              </Dialogo>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
function AcaoDevolucao({
  operacao,
  d,
  acao,
  fechar,
  pagina,
  alterarPagina,
}: {
  operacao: ReturnType<typeof useSuprimentos>;
  d: DevolucaoFornecedor;
  acao: string;
  fechar: () => void;
  pagina: number;
  alterarPagina: (v: number) => void;
}) {
  const { w, erro, ocupado, executar } = operacao,
    [chave] = useState(novoId),
    [deposito, setDeposito] = useState<string | null>(null),
    [titulo, setTitulo] = useState("");
  const nomes: Record<string, string> = {
    acompanhar: "Envio e análise",
    credito: "Crédito concedido pelo fornecedor",
    sem_reposicao: "Concluir sem reposição",
    reposicao: "Receber substituição sem cobrança",
    encerrar: "Encerrar acompanhamento",
    aplicar: "Abater crédito na conta",
  };
  return (
    <form
      className="supr-painel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const sucesso = await executar(() =>
          acao === "aplicar"
            ? suprimentos.executar(w, "aplicar_credito_fornecedor", {
                p_id: chave,
                p_devolucao: d.id,
                p_titulo: titulo,
                p_valor: Math.round(Number(f.get("valor")) * 100),
                p_revisao: d.revisao,
                p_motivo: f.get("observacoes"),
              })
            : acao === "reposicao"
              ? suprimentos.executar(w, "repor_devolucao_fornecedor", {
                  p_id: d.id,
                  p_revisao: d.revisao,
                  p_chave: chave,
                  p_deposito: deposito,
                  p_quantidade: d.rastreado
                    ? lerSeries(String(f.get("series"))).length
                    : Number(f.get("quantidade")),
                  p_unidades: d.rastreado ? lerSeries(String(f.get("series"))) : null,
                })
              : suprimentos.executar(w, "atualizar_devolucao_fornecedor", {
                  p_id: d.id,
                  p_revisao: d.revisao,
                  p_acao: acao,
                  p_dados: {
                    estado: f.get("estado"),
                    protocolo: f.get("protocolo"),
                    prazo: f.get("prazo"),
                    observacoes: f.get("observacoes"),
                    quantidade: Number(f.get("quantidade")),
                    credito_centavos: Math.round(Number(f.get("valor")) * 100),
                  },
                }),
        );
        if (sucesso) fechar();
      }}
    >
      <fieldset disabled={ocupado}>
        <div className="supr-barra">
          <h3>{nomes[acao]}</h3>
          <button type="button" onClick={fechar}>
            Cancelar
          </button>
        </div>
        {acao === "acompanhar" && (
          <>
            <label>
              Situação
              <select name="estado" defaultValue={d.estado}>
                <option value="aberto">A preparar</option>
                <option value="enviado">Enviada ao fornecedor</option>
                <option value="analise">Em análise pelo fornecedor</option>
              </select>
            </label>
            <div className="supr-campos">
              <label>
                Protocolo (opcional)
                <input name="protocolo" maxLength={160} defaultValue={d.protocolo} />
              </label>
              <label>
                Previsão de resposta (opcional)
                <input name="prazo" type="date" defaultValue={d.prazo ?? ""} />
              </label>
            </div>
          </>
        )}
        {acao === "reposicao" && (
          <EscolherDeposito valor={deposito} alterar={setDeposito} />
        )}
        {["credito", "sem_reposicao", "reposicao"].includes(acao) &&
          (acao === "reposicao" && d.rastreado ? (
            <label>
              Séries recebidas · uma por linha
              <textarea name="series" required placeholder="Série; IMEI (opcional)" />
            </label>
          ) : (
            <label>
              Quantidade resolvida
              <input
                name="quantidade"
                type="number"
                defaultValue={d.pendente}
                min={passoProduto(d.unidade)}
                max={d.pendente}
                step={passoProduto(d.unidade)}
                required
              />
            </label>
          ))}
        {acao === "aplicar" && (
          <>
            <label>
              Conta de compra
              <select
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
              >
                <option value="">Selecione a conta</option>
                {d.contas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.documento || t.descricao} · {dinheiro(t.aberto_centavos)} ·{" "}
                    {dataCurta(t.vencimento)}
                  </option>
                ))}
              </select>
            </label>
            {!d.contas.length && (
              <p>
                Não há contas a pagar deste fornecedor nesta página. O crédito
                continuará disponível.
              </p>
            )}
            <Paginacao
              pagina={pagina}
              total={d.total_contas}
              alterar={(v) => {
                setTitulo("");
                alterarPagina(v);
              }}
            />
          </>
        )}
        {["credito", "aplicar"].includes(acao) && (
          <label>
            {acao === "credito" ? "Valor total concedido (R$)" : "Valor a abater (R$)"}
            <input
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              max={
                acao === "aplicar"
                  ? Math.min(
                      d.credito_centavos - d.usado_centavos,
                      d.contas.find((t) => t.id === titulo)?.aberto_centavos ?? 0,
                    ) / 100
                  : 100000000
              }
              required
            />
          </label>
        )}
        {acao !== "reposicao" && (
          <label>
            {acao === "acompanhar"
              ? "Observações (opcional)"
              : "Justificativa / confirmação do fornecedor"}
            <textarea
              name="observacoes"
              minLength={acao === "acompanhar" ? 0 : 3}
              maxLength={1000}
              required={acao !== "acompanhar"}
            />
          </label>
        )}
        {acao === "credito" && (
          <small>
            O crédito ficará disponível para uso. Nenhuma conta será abatida
            automaticamente.
          </small>
        )}
        {acao === "sem_reposicao" && (
          <small>
            Use somente quando o fornecedor não devolverá o produto nem concederá
            crédito. A quantidade será encerrada como perda.
          </small>
        )}
        {erro && (
          <p className="erro-formulario" role="alert">
            {erro}
          </p>
        )}
        <button className="botao-primario" disabled={acao === "aplicar" && !titulo}>
          {ocupado ? "Salvando…" : "Confirmar registro"}
        </button>
      </fieldset>
    </form>
  );
}
