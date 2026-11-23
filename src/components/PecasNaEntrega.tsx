import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { SelecaoRapida } from "./SelecaoRapida";
import {
  listarEstoque,
  lerEstoqueDemo,
  type ProdutoEstoque,
} from "../services/estoque";
import { suprimentos } from "../services/suprimentos";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { consultarOS, operarOS, type OrdemServico } from "../services/ordensServico";
import {
  pecasSemOrigem,
  validarOrigensPecas,
  type EscolhaOrigem,
} from "../lib/origemPecas";
import { erroPublico } from "../lib/supabase";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import "./PecasNaEntrega.css";

export function PecasNaEntrega({
  osId,
  fechar,
  continuar,
}: {
  osId: string;
  fechar: () => void;
  continuar: (os: OrdemServico) => Promise<void>;
}) {
  const a = useAcesso(),
    qc = useQueryClient();
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaOrigem>>({});
  const [selecionados, setSelecionados] = useState<Record<string, ProdutoEstoque>>({});
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const trava = useRef(false);
  const q = useQuery({
    queryKey: ["pecas-entrega", a.demo, a.oficina!.id, osId],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const os = await consultarOS(a.demo, a.oficina!.id, osId, signal);
      const ids = [
        ...new Set(
          os.itens
            .filter((i) => i.tipo === "part")
            .map((i) => i.produto_estoque_id || i.item_catalogo_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const produtos: ProdutoEstoque[] = [];
      // Só verifica os vínculos desta OS, nunca percorre todo o estoque.
      for (let inicio = 0; inicio < ids.length; inicio += 4) {
        signal.throwIfAborted();
        const lote = await Promise.all(
          ids.slice(inicio, inicio + 4).map(async (id) => {
            if (a.demo)
              return lerEstoqueDemo().produtos.find((p) => p.id === id) || null;
            try {
              return await suprimentos.produto(a.oficina!.id, id, signal);
            } catch (e) {
              if (
                e &&
                typeof e === "object" &&
                "message" in e &&
                e.message === "Produto indisponível."
              )
                return null;
              throw e;
            }
          }),
        );
        produtos.push(...lote.filter((p): p is ProdutoEstoque => !!p));
      }
      return { os, produtos };
    },
    retry: false,
  });
  const pecas = q.data ? pecasSemOrigem(q.data.os, q.data.produtos) : [];
  return (
    <Dialogo
      aberto
      fechar={() => !trava.current && fechar()}
      titulo="Conferir peças para entregar"
      classe="dialogo-pecas-entrega"
    >
      <p>Informe de onde vieram estas peças. A entrega continua por aqui.</p>
      {q.isPending && <p role="status">Carregando peças…</p>}
      {q.isError && (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button className="botao-secundario" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {q.data && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (trava.current) return;
            trava.current = true;
            setOcupado(true);
            setErro("");
            void (async () => {
              try {
                validarOrigensPecas(pecas, escolhas, [
                  ...q.data.produtos,
                  ...Object.values(selecionados),
                ]);
                let atual = await consultarOS(a.demo, a.oficina!.id, osId);
                if (atual.revisao !== q.data.os.revisao)
                  throw new Error(
                    "Esta OS foi alterada. Confira as peças atualizadas e tente novamente.",
                  );
                for (const item of pecas) {
                  const escolha = escolhas[item.id];
                  await operarOS(
                    a.demo,
                    a.oficina!.id,
                    atual,
                    "vincular_estoque_item_os",
                    {
                      p_item: item.id,
                      p_origem: escolha.origem,
                      p_produto: escolha.origem === "estoque" ? escolha.produto : null,
                      p_revisao: atual.revisao,
                    },
                  );
                  atual = await consultarOS(a.demo, a.oficina!.id, osId);
                }
                await continuar(atual);
              } catch (e) {
                setErro(erroPublico(e));
                await q.refetch();
              } finally {
                await atualizarIntegracoes(qc);
                trava.current = false;
                setOcupado(false);
              }
            })();
          }}
        >
          <fieldset disabled={ocupado} className="pecas-entrega-lista">
            {pecas.map((item) => (
              <fieldset key={item.id} className="peca-entrega">
                <legend>
                  {item.descricao}{" "}
                  <small>
                    · {item.quantidade} {item.unidade}
                  </small>
                </legend>
                <div className="peca-entrega-origens">
                  {(
                    [
                      ["estoque", "Estoque da oficina"],
                      ["cliente", "Trazida pelo cliente"],
                      ["externa", "Compra avulsa"],
                    ] as const
                  ).map(([origem, nome]) => (
                    <label key={origem}>
                      <input
                        type="radio"
                        name={`origem-${item.id}`}
                        required
                        value={origem}
                        checked={escolhas[item.id]?.origem === origem}
                        onChange={() =>
                          setEscolhas((v) => ({
                            ...v,
                            [item.id]: { origem, produto: v[item.id]?.produto },
                          }))
                        }
                      />
                      {nome}
                    </label>
                  ))}
                </div>
                {escolhas[item.id]?.origem === "estoque" ? (
                  <EscolherPecaEntrega
                    item={item}
                    valor={escolhas[item.id]?.produto ?? ""}
                    selecionado={selecionados[item.id]}
                    selecionar={(p) => {
                      if (p) setSelecionados((v) => ({ ...v, [item.id]: p }));
                      setEscolhas((v) => ({
                        ...v,
                        [item.id]: { origem: "estoque", produto: p?.id || "" },
                      }));
                    }}
                  />
                ) : (
                  escolhas[item.id] && (
                    <small>Não será feita baixa no estoque para esta peça.</small>
                  )
                )}
              </fieldset>
            ))}
            {!pecas.length && (
              <p>As peças já estão conferidas. Você pode continuar a entrega.</p>
            )}
            {erro && (
              <p className="erro-formulario" role="alert">
                {erro}
              </p>
            )}
            <div className="acoes-formulario">
              <button type="button" className="botao-secundario" onClick={fechar}>
                Voltar
              </button>
              <button className="botao-primario">
                {ocupado ? "Salvando…" : "Salvar e concluir entrega"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </Dialogo>
  );
}

function EscolherPecaEntrega({
  item,
  valor,
  selecionado,
  selecionar,
}: {
  item: OrdemServico["itens"][number];
  valor: string;
  selecionado?: ProdutoEstoque;
  selecionar: (p: ProdutoEstoque | undefined) => void;
}) {
  const a = useAcesso();
  const [busca, setBusca] = useState("");
  const termo = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: ["estoque", a.demo, a.oficina!.id, "peca-entrega", termo],
    queryFn: ({ signal }) =>
      listarEstoque(a.demo, a.oficina!.id, termo, "controlados", 0, signal),
  });
  const produtos = [
    ...(selecionado ? [selecionado] : []),
    ...(q.data?.itens || []),
  ].filter(
    (p, i, lista) =>
      p.saldo !== null &&
      !p.arquivado_em &&
      p.unidade === item.unidade &&
      lista.findIndex((x) => x.id === p.id) === i,
  );
  return (
    <SelecaoRapida
      rotulo={`Peça no estoque · ${item.descricao}`}
      valor={valor}
      obrigatorio
      placeholder="Buscar pelo nome ou código…"
      aoBuscar={setBusca}
      carregando={q.isFetching || termo !== busca}
      erro={q.isError ? erroPublico(q.error) : undefined}
      opcoes={produtos.map((p) => ({
        id: p.id,
        nome: p.descricao,
        detalhe: `${p.codigo || "Sem código"} · saldo ${p.saldo} ${p.unidade}`,
      }))}
      selecionar={(id) => selecionar(produtos.find((p) => p.id === id))}
    />
  );
}
