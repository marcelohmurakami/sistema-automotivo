import { componenteSobDemanda } from "../lib/componenteSobDemanda";
import { useState } from "react";
import type { SecaoSuprimentos } from "../lib/navegacaoCompras";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { suprimentos, type ItemSolicitado } from "../services/suprimentos";
import { dinheiro } from "../lib/formatacao";
const NovoPedido = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/NovoPedido")).NovoPedido,
}));
const DetalhePedido = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/DetalhePedido")).DetalhePedido,
}));
const DevolucoesFornecedor = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/DevolucoesFornecedor"))
    .DevolucoesFornecedor,
}));
const CatalogosFornecedores = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/CatalogosFornecedores"))
    .CatalogosFornecedores,
}));
const DetalheCotacao = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/Cotacoes")).DetalheCotacao,
}));
const PlanejarEstoque = componenteSobDemanda(async () => ({
  default: (await import("../components/suprimentos/PlanejarEstoque")).PlanejarEstoque,
}));
import { EstadoConsulta, Paginacao } from "../components/suprimentos/Comum";
import { useBusca, dataCurta, numero } from "../components/suprimentos/helpers";
import type { ProdutoEstoque } from "../services/estoque";
import "../components/suprimentos/Suprimentos.css";
import "../pages/Compras.css";
export function Suprimentos({
  aba,
  alterarAba,
}: {
  aba: SecaoSuprimentos;
  alterarAba: (aba: SecaoSuprimentos) => void;
}) {
  const a = useAcesso(),
    w = a.oficina!.id;
  const [filtro, setFiltro] = useState({ aba, busca: "", pagina: 0 });
  const busca = filtro.aba === aba ? filtro.busca : "";
  const pagina = filtro.aba === aba ? filtro.pagina : 0;
  const setBusca = (busca: string) => setFiltro({ aba, busca, pagina: 0 });
  const setPagina = (pagina: number) =>
    setFiltro((f) => ({ aba, busca: f.aba === aba ? f.busca : "", pagina }));
  const [dias, setDias] = useState(90),
    [novo, setNovo] = useState<"pedido" | "cotacao" | null>(null),
    [pedido, setPedido] = useState<string | null>(null),
    [cotacao, setCotacao] = useState<string | null>(null),
    [iniciais, setIniciais] = useState<ItemSolicitado[]>([]),
    [planejar, setPlanejar] = useState<ProdutoEstoque | null>(null),
    [selecionados, setSelecionados] = useState<Record<string, ItemSolicitado>>({});
  const v = useBusca(busca),
    habilitado = !a.demo && a.oficina!.perfil !== "staff";
  const ps = useQuery({
      queryKey: ["suprimentos", "pedidos", w, v, pagina],
      queryFn: ({ signal }) => suprimentos.pedidos(w, v, pagina, signal),
      enabled: habilitado && aba === "pedidos",
    }),
    cs = useQuery({
      queryKey: ["suprimentos", "cotacoes", w, v, pagina],
      queryFn: ({ signal }) => suprimentos.cotacoes(w, v, pagina, signal),
      enabled: habilitado && aba === "cotacoes",
    }),
    ss = useQuery({
      queryKey: ["suprimentos", "sugestoes", w, v, pagina, dias],
      queryFn: ({ signal }) => suprimentos.sugestoes(w, v, pagina, dias, signal),
      enabled: habilitado && aba === "sugestoes",
    });
  if (!habilitado)
    return (
      <div className="supr">
        <h2>Pedidos e reposição</h2>
        <p>
          {a.demo
            ? "Entre em uma empresa para controlar pedidos, reservas e unidades."
            : "Esta tela está disponível para quem gerencia as compras."}
        </p>
        <Link to="/estoque">Voltar ao estoque</Link>
      </div>
    );
  const q = aba === "pedidos" ? ps : aba === "cotacoes" ? cs : ss;
  return (
    <div className="supr">
      {aba === "devolucoes" ? (
        <DevolucoesFornecedor abrirPedido={setPedido} />
      ) : aba === "catalogos" ? (
        <CatalogosFornecedores abrirPedido={setPedido} />
      ) : (
        <section className="supr-painel">
          <div className="supr-barra">
            <label>
              Buscar
              <input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(0);
                }}
                placeholder={
                  aba === "sugestoes" ? "Produto ou código" : "Nome ou fornecedor"
                }
              />
            </label>
            {aba === "sugestoes" ? (
              <label>
                Consumo dos últimos
                <select
                  value={dias}
                  onChange={(e) => {
                    setDias(Number(e.target.value));
                    setPagina(0);
                    setSelecionados({});
                  }}
                >
                  {[30, 60, 90, 180, 365].map((d) => (
                    <option key={d} value={d}>
                      {d} dias
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <button
                className="botao-primario"
                onClick={() => {
                  setIniciais([]);
                  setNovo(aba === "pedidos" ? "pedido" : "cotacao");
                }}
              >
                {aba === "pedidos" ? "+ Novo pedido" : "+ Nova cotação"}
              </button>
            )}
          </div>
          <EstadoConsulta loading={q.isPending} error={q.error} />
          {aba === "pedidos" &&
            ps.data?.itens.map((p) => (
              <button
                className="supr-linha supr-clicavel"
                key={p.id}
                onClick={() => setPedido(p.id)}
              >
                <span>
                  <strong>{p.referencia}</strong>
                  <small>
                    {p.fornecedor} · {dataCurta(p.previsao)}
                  </small>
                </span>
                <span className="supr-selo">
                  {p.cancelado
                    ? "Encerrado"
                    : p.pendente > 0
                      ? `${numero(p.pendente)} ${p.pendente === 1 ? "item pendente" : "itens pendentes"}`
                      : "Recebido"}
                </span>
                <strong>{dinheiro(p.total_centavos)}</strong>
                <span aria-hidden>→</span>
              </button>
            ))}
          {aba === "cotacoes" &&
            cs.data?.itens.map((c) => (
              <button
                className="supr-linha supr-clicavel"
                key={c.id}
                onClick={() => setCotacao(c.id)}
              >
                <span>
                  <strong>{c.titulo}</strong>
                  <small>{c.fornecedores} fornecedores</small>
                </span>
                <span className="supr-selo">
                  {c.pedido_id ? "Pedido criado" : "Em comparação"}
                </span>
                <span aria-hidden>→</span>
              </button>
            ))}
          {aba === "sugestoes" && (
            <>
              {Object.keys(selecionados).length > 0 && (
                <div className="supr-barra">
                  <strong>{Object.keys(selecionados).length} selecionados</strong>
                  <button
                    className="botao-primario"
                    onClick={() => {
                      setIniciais(Object.values(selecionados));
                      setNovo("pedido");
                    }}
                  >
                    Criar pedido
                  </button>
                  <button
                    onClick={() => {
                      setIniciais(Object.values(selecionados));
                      setNovo("cotacao");
                    }}
                  >
                    Comparar fornecedores
                  </button>
                </div>
              )}
              {ss.data?.itens.map((s) => (
                <div className="supr-linha" key={s.item_catalogo_id}>
                  <div>
                    <label className="supr-check">
                      <input
                        type="checkbox"
                        checked={!!selecionados[s.item_catalogo_id]}
                        onChange={(e) =>
                          setSelecionados((v) => {
                            const x = { ...v };
                            if (e.target.checked)
                              x[s.item_catalogo_id] = {
                                produto_id: s.item_catalogo_id,
                                descricao: s.descricao,
                                unidade: s.unidade,
                                quantidade: s.sugerido || 1,
                                custo_centavos: s.custo_centavos,
                              };
                            else delete x[s.item_catalogo_id];
                            return x;
                          })
                        }
                      />
                      <span>
                        <strong>{s.descricao}</strong>
                        <small>
                          {numero(s.disponivel)} livres · {numero(s.reservado)}{" "}
                          reservados · {numero(s.em_pedidos)} a receber
                        </small>
                      </span>
                    </label>
                  </div>
                  <span>
                    <strong>
                      {s.sugerido > 0
                        ? `Comprar ${numero(s.sugerido)} ${s.unidade}`
                        : "Estoque suficiente"}
                    </strong>
                    <small>
                      {numero(s.consumo)} usados em {dias} dias
                    </small>
                  </span>
                  <button onClick={() => setPlanejar({ ...s, id: s.item_catalogo_id })}>
                    Planejamento
                  </button>
                  <details>
                    <summary>Como foi calculado</summary>
                    <p>
                      Média de {numero(s.media_diaria)} por dia ×{" "}
                      {s.prazo_reposicao_dias} dias de reposição, mais{" "}
                      {numero(s.seguranca)} de segurança. Compra para {s.cobertura_dias}{" "}
                      dias adicionais. Desconta estoque livre e pedidos em aberto.
                    </p>
                    <small>
                      {s.consumo === 0
                        ? "Sem consumo no período: usa apenas o mínimo e a segurança cadastrados."
                        : `Fornecedor: ${s.fornecedor_nome || "não definido"}`}
                    </small>
                  </details>
                </div>
              ))}
            </>
          )}
          {q.data?.total === 0 && (
            <p className="supr-vazio">
              {aba === "pedidos"
                ? "Nenhum pedido. Crie um para acompanhar as próximas entregas."
                : aba === "cotacoes"
                  ? "Nenhuma cotação. Compare as propostas antes de comprar."
                  : "Nenhum produto encontrado. Cadastre produtos com controle de estoque."}
            </p>
          )}
          <Paginacao pagina={pagina} total={q.data?.total ?? 0} alterar={setPagina} />
        </section>
      )}
      {novo && (
        <NovoPedido
          cotacao={novo === "cotacao"}
          iniciais={iniciais}
          fechar={() => setNovo(null)}
          salvo={(id) => {
            if (novo === "cotacao") {
              alterarAba("cotacoes");
              setCotacao(id);
            } else {
              alterarAba("pedidos");
              setPedido(id);
            }
            setNovo(null);
            setSelecionados({});
          }}
        />
      )}
      {pedido && <DetalhePedido id={pedido} fechar={() => setPedido(null)} />}
      {cotacao && (
        <DetalheCotacao
          id={cotacao}
          fechar={() => setCotacao(null)}
          abrirPedido={(id) => {
            setCotacao(null);
            setPedido(id);
            alterarAba("pedidos");
          }}
        />
      )}
      {planejar && (
        <PlanejarEstoque produto={planejar} fechar={() => setPlanejar(null)} />
      )}
    </div>
  );
}
