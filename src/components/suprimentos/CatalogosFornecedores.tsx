import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DialogoLocalizacao as Dialogo } from "../localizacao/DialogoLocalizacao";
import { fornecimento, type ItemCatalogoFornecedor } from "../../services/fornecimento";
import { suprimentos } from "../../services/suprimentos";
import { novoId } from "../../lib/uuid";
import { dinheiro } from "../../lib/formatacao";
import { hoje } from "../../services/financeiro";
import { baixarCSV } from "../../lib/csv";
import {
  prepararCatalogoFornecedor,
  disponibilidadesCatalogo,
  type LinhaCatalogoFornecedor,
} from "../../lib/catalogoFornecedor";
import {
  EscolherFornecedor,
  EscolherProduto,
  EstadoConsulta,
  Paginacao,
} from "./Comum";
import { useBusca, useSuprimentos, dataCurta, passoProduto } from "./helpers";
export function CatalogosFornecedores({
  abrirPedido,
}: {
  abrirPedido: (id: string) => void;
}) {
  const { w, erro, ocupado, executar } = useSuprimentos(),
    [busca, setBusca] = useState(""),
    [pag, setPag] = useState(0),
    [fornecedor, setFornecedor] = useState(""),
    [disponibilidade, setDisponibilidade] = useState("todas"),
    [importar, setImportar] = useState(false),
    [vincular, setVincular] = useState<ItemCatalogoFornecedor | null>(null),
    [pedir, setPedir] = useState<ItemCatalogoFornecedor | null>(null),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "catalogos", w, v, pag, fornecedor, disponibilidade],
    queryFn: () =>
      fornecimento.catalogo(w, v, pag, fornecedor || null, disponibilidade),
  });
  return (
    <section className="supr-painel">
      <div className="supr-barra">
        <div>
          <h2>Catálogos de fornecedores</h2>
          <small>Consulte os arquivos recebidos e aproveite os preços no pedido.</small>
        </div>
        <button className="botao-primario" onClick={() => setImportar(true)}>
          Importar catálogo CSV
        </button>
      </div>
      <div className="supr-campos">
        <label>
          Buscar no catálogo
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPag(0);
            }}
            placeholder="Produto, código, marca ou aplicação"
          />
        </label>
        <label>
          Disponibilidade
          <select
            value={disponibilidade}
            onChange={(e) => {
              setDisponibilidade(e.target.value);
              setPag(0);
            }}
          >
            <option value="todas">Todas</option>
            {Object.entries(disponibilidadesCatalogo).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details>
        <summary>Filtrar fornecedor (opcional)</summary>
        <EscolherFornecedor
          obrigatorio={false}
          selecionar={(v) => {
            setFornecedor(v);
            setPag(0);
          }}
        />
      </details>
      <EstadoConsulta loading={q.isPending} error={q.error} />
      {erro && (
        <p className="erro-formulario" role="alert">
          {erro}
        </p>
      )}
      {q.data?.itens.map((c) => (
        <div className="supr-linha" key={c.id}>
          <span>
            <strong>{c.descricao}</strong>
            <small>
              {c.fornecedor} · {c.codigo}
              {c.marca ? ` · ${c.marca}` : ""}
            </small>
            {c.aplicacao && <small>{c.aplicacao}</small>}
            <small>
              Arquivo de {dataCurta(c.data_catalogo)} · {c.arquivo}
            </small>
            {c.produto_descricao && <small>No estoque: {c.produto_descricao}</small>}
          </span>
          <span>
            <strong>
              {dinheiro(c.preco_centavos)} / {c.unidade}
            </strong>
            <small>
              {disponibilidadesCatalogo[c.disponibilidade]}
              {c.quantidade_disponivel !== null
                ? ` · ${c.quantidade_disponivel} ${c.unidade}`
                : ""}
              {c.prazo_dias !== null ? ` · ${c.prazo_dias} dias` : ""}
            </small>
          </span>
          <div className="supr-barra">
            <button onClick={() => setVincular(c)}>
              {c.produto_id ? "Alterar vínculo" : "Vincular ao estoque"}
            </button>
            <button
              className="botao-primario"
              disabled={!c.produto_id || c.disponibilidade === "indisponivel"}
              onClick={() => setPedir(c)}
            >
              Criar pedido
            </button>
          </div>
        </div>
      ))}
      {q.data?.total === 0 && (
        <p className="supr-vazio">
          Importe um catálogo do fornecedor para consultar produtos, preços e
          aplicações. Nenhum fornecedor está conectado automaticamente.
        </p>
      )}
      <Paginacao pagina={pag} total={q.data?.total ?? 0} alterar={setPag} />
      <small>
        Preço e disponibilidade são os informados no arquivo, sem consulta em tempo
        real. Confirme-os com o fornecedor.
      </small>
      {importar && <ImportarCatalogo fechar={() => setImportar(false)} />}
      {vincular && (
        <Dialogo
          aberto
          titulo="Vincular ao estoque"
          fechar={() => !ocupado && setVincular(null)}
        >
          <div className="supr">
            <h3>{vincular.descricao}</h3>
            <p>
              Escolha um produto já cadastrado ou crie um novo, sem dar entrada em
              estoque.
            </p>
            <EscolherProduto
              selecionar={(p) =>
                void executar(async () => {
                  await suprimentos.executar(w, "vincular_catalogo_fornecedor", {
                    p_id: vincular.id,
                    p_revisao: vincular.revisao,
                    p_produto: p.id,
                  });
                  setVincular(null);
                })
              }
            />
            <button
              disabled={ocupado}
              onClick={() =>
                void executar(async () => {
                  await suprimentos.executar(w, "vincular_catalogo_fornecedor", {
                    p_id: vincular.id,
                    p_revisao: vincular.revisao,
                  });
                  setVincular(null);
                })
              }
            >
              Cadastrar novo produto sem saldo
            </button>
            {erro && <p role="alert">{erro}</p>}
          </div>
        </Dialogo>
      )}
      {pedir && (
        <PedidoDoCatalogo
          item={pedir}
          fechar={() => setPedir(null)}
          salvo={(id) => {
            setPedir(null);
            abrirPedido(id);
          }}
        />
      )}
    </section>
  );
}
function ImportarCatalogo({ fechar }: { fechar: () => void }) {
  const { w, erro, setErro, ocupado, executar } = useSuprimentos(),
    [fornecedor, setFornecedor] = useState(""),
    [linhas, setLinhas] = useState<LinhaCatalogoFornecedor[]>([]),
    [arquivo, setArquivo] = useState(""),
    [id, setId] = useState(novoId),
    [data, setData] = useState(hoje),
    [substituir, setSubstituir] = useState(false);
  return (
    <Dialogo
      aberto
      titulo="Importar catálogo do fornecedor"
      fechar={() => !ocupado && fechar()}
    >
      <form
        className="supr"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await executar(() =>
              suprimentos.executar(w, "importar_catalogo_fornecedor", {
                p_id: id,
                p_fornecedor: fornecedor,
                p_arquivo: arquivo,
                p_data: data,
                p_itens: linhas,
                p_substituir: substituir,
              }),
            )
          )
            fechar();
        }}
      >
        <fieldset disabled={ocupado}>
          <EscolherFornecedor
            selecionar={(v) => {
              setFornecedor(v);
              setId(novoId());
            }}
          />
          <div className="supr-campos">
            <label>
              Data do catálogo
              <input
                type="date"
                min="2000-01-01"
                max={hoje()}
                required
                value={data}
                onChange={(e) => {
                  setData(e.target.value);
                  setId(novoId());
                }}
              />
            </label>
            <label>
              Arquivo CSV · até 500 linhas
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  setLinhas([]);
                  setErro("");
                  setId(novoId());
                  if (!f) return;
                  await executar(async () => {
                    if (f.size > 3000000) throw new Error("Use arquivo de até 3 MB.");
                    setLinhas(prepararCatalogoFornecedor(await f.text()));
                    setArquivo(f.name);
                  }, false);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() =>
              baixarCSV(
                [
                  [
                    "codigo",
                    "descricao",
                    "preco",
                    "unidade",
                    "aplicacao",
                    "marca",
                    "disponibilidade",
                    "quantidade_disponivel",
                    "prazo_dias",
                  ],
                  [
                    "ABC-001",
                    "Material de exemplo",
                    "25,50",
                    "un",
                    "Uso informado pelo fornecedor",
                    "Marca",
                    "disponivel",
                    "10",
                    "3",
                  ],
                ],
                "modelo-catalogo-fornecedor.csv",
              )
            }
          >
            Baixar planilha modelo
          </button>
          {linhas.length > 0 && (
            <section className="supr-painel">
              <h3>{linhas.length} produtos conferidos</h3>
              {linhas.slice(0, 5).map((l) => (
                <div className="supr-linha" key={l.codigo}>
                  <span>
                    <strong>{l.descricao}</strong>
                    <small>
                      {l.codigo} · {l.aplicacao}
                    </small>
                  </span>
                  <strong>{dinheiro(l.preco_centavos)}</strong>
                </div>
              ))}
              {linhas.length > 5 && (
                <small>Mais {linhas.length - 5} produtos no arquivo.</small>
              )}
            </section>
          )}
          <label className="supr-check">
            <input
              type="checkbox"
              checked={substituir}
              onChange={(e) => {
                setSubstituir(e.target.checked);
                setId(novoId());
              }}
            />{" "}
            Este é o catálogo completo: marcar itens ausentes como indisponíveis
          </label>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <button className="botao-primario" disabled={!fornecedor || !linhas.length}>
            {ocupado ? "Importando…" : "Confirmar importação"}
          </button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
function PedidoDoCatalogo({
  item,
  fechar,
  salvo,
}: {
  item: ItemCatalogoFornecedor;
  fechar: () => void;
  salvo: (id: string) => void;
}) {
  const { w, erro, ocupado, executar } = useSuprimentos(),
    [id] = useState(novoId);
  return (
    <Dialogo
      aberto
      titulo="Criar pedido do catálogo"
      fechar={() => !ocupado && fechar()}
    >
      <form
        className="supr"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await executar(() =>
              suprimentos.executar(w, "pedir_itens_catalogo", {
                p_id: id,
                p_referencia: f.get("referencia"),
                p_itens: [
                  {
                    id: item.id,
                    revisao: item.revisao,
                    quantidade: Number(f.get("quantidade")),
                  },
                ],
              }),
            )
          )
            salvo(id);
        }}
      >
        <fieldset disabled={ocupado}>
          <h3>{item.descricao}</h3>
          <p>
            {item.fornecedor} · {dinheiro(item.preco_centavos)} / {item.unidade}
          </p>
          <label>
            Nome do pedido
            <input
              name="referencia"
              defaultValue={`Reposição · ${item.descricao}`.slice(0, 160)}
              maxLength={160}
              required
            />
          </label>
          <label>
            Quantidade
            <input
              name="quantidade"
              type="number"
              defaultValue={1}
              min={passoProduto(item.unidade)}
              step={passoProduto(item.unidade)}
              max={1000000}
              required
            />
          </label>
          <small>
            Preço do catálogo de {dataCurta(item.data_catalogo)}. O pedido será
            registrado para acompanhar a compra; o saldo entra ao receber os produtos.
          </small>
          {erro && <p role="alert">{erro}</p>}
          <button className="botao-primario">Confirmar pedido</button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
