import { novoId } from "../lib/uuid.ts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAcesso } from "../auth/contexto";
import { dinheiro } from "../lib/formatacao";
import type { NotaImportada } from "../lib/importacao";
import { vocabularioEstoque } from "../lib/interfaceRamo";
import { rpc } from "../lib/rpc";
import { erroPublico } from "../lib/supabase";

import { lerCatalogoDemo } from "../lib/catalogo";
import { usePagamentoAposRegistro } from "../lib/pagamentoAposRegistro";
import "../pages/OficinaAgil.css";
import { Dialogo } from "./Dialogo";
import { SelecaoCatalogo } from "./SelecaoCatalogo";
export function ImportarNfe() {
  const perguntarPagamento = usePagamentoAposRegistro();
  const a = useAcesso(),
    cache = useQueryClient(),
    [aberto, setAberto] = useState(false),
    [nota, setNota] = useState<NotaImportada | null>(null),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [conferido, setConferido] = useState(false),
    [resultado, setResultado] = useState(""),
    [chave, setChave] = useState(() => novoId());
  const termos = vocabularioEstoque(a.oficina?.ramo);
  const trava = useRef(false);
  const [nomesProdutos, setNomesProdutos] = useState<Record<string, string>>({});
  const total =
    nota?.itens.reduce((s, i) => s + Math.round(i.quantidade * i.custo_centavos), 0) ??
    0;
  return (
    <>
      <button className="botao-secundario" onClick={() => setAberto(true)}>
        Importar compra por XML
      </button>
      <Dialogo
        aberto={aberto}
        titulo="Conferir compra da NF-e"
        fechar={() => !busy && setAberto(false)}
        classe="dialogo-largo"
      >
        <div className="agil-pagina">
          <p>
            Leia a nota, vincule os itens e confira. Ao confirmar, a compra entra no
            estoque e gera uma conta a pagar.
          </p>
          <label>
            XML da NF-e
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              disabled={busy}
              onChange={async (e) => {
                if (trava.current) return;
                setErro("");
                setNota(null);
                setResultado("");
                setConferido(false);
                const f = e.target.files?.[0];
                if (!f) return;
                trava.current = true;
                setBusy(true);
                try {
                  if (f.size > 3_000_000) throw new Error("Arquivo maior que 3 MB.");
                  const { lerNFe } = await import("../lib/importacao");
                  const n = lerNFe(await f.text());
                  const encontrados = a.demo
                    ? n.itens.flatMap((i, indice) => {
                        const p = lerCatalogoDemo(a.oficina!.id).find(
                          (p) =>
                            p.tipo === "part" &&
                            !p.arquivado_em &&
                            p.unidade === i.unidade &&
                            p.descricao.toLowerCase() === i.descricao.toLowerCase(),
                        );
                        return p ? [{ indice, id: p.id }] : [];
                      })
                    : await rpc<{ indice: number; id: string }[]>("buscar_itens_nfe", {
                        p_oficina: a.oficina!.id,
                        p_itens: n.itens.map((i) => ({
                          descricao: i.descricao,
                          unidade: i.unidade,
                        })),
                      });
                  const porIndice = new Map(encontrados.map((x) => [x.indice, x.id]));
                  n.itens = n.itens.map((i, indice) => ({
                    ...i,
                    produto_id: porIndice.get(indice) || "",
                  }));
                  setNota(n);
                  setChave(novoId());
                } catch (e) {
                  setErro(erroPublico(e));
                } finally {
                  trava.current = false;
                  setBusy(false);
                }
              }}
            />
          </label>
          {nota && (
            <>
              <div className="agil-card">
                <h3>{nota.emitente.nome}</h3>
                <p>Documento: {nota.emitente.documento}</p>
                <small>NF-e {nota.chave_nfe}</small>
              </div>
              {nota.avisos.map((v) => (
                <p className="agil-alerta" key={v}>
                  {v}
                </p>
              ))}
              <div className="agil-grade">
                <label>
                  Data de entrada
                  <input
                    type="date"
                    value={nota.data}
                    onChange={(e) => {
                      setConferido(false);
                      setNota({ ...nota, data: e.target.value });
                    }}
                  />
                </label>
                <label>
                  Vencimento da conta
                  <input
                    type="date"
                    value={nota.vencimento}
                    onChange={(e) => setNota({ ...nota, vencimento: e.target.value })}
                  />
                </label>
              </div>
              {nota.itens.map((i, n) => (
                <div className="agil-card" key={n}>
                  <h3>
                    {n + 1}. {i.descricao}
                  </h3>
                  <small>
                    Código fornecedor: {i.codigo} · Unidade: {i.unidade}
                  </small>
                  <div className="agil-grade">
                    <SelecaoCatalogo
                      rotulo={termos.itemEstoque}
                      tipo="part"
                      unidade={i.unidade}
                      valor={i.produto_id}
                      nomeSelecionado={nomesProdutos[i.produto_id] || i.descricao}
                      opcaoVazia={"Cadastrar: " + termos.novo.toLowerCase()}
                      selecionar={(id, item) => {
                        setConferido(false);
                        if (item)
                          setNomesProdutos((v) => ({ ...v, [id]: item.descricao }));
                        setNota({
                          ...nota,
                          itens: nota.itens.map((v, k) =>
                            k === n ? { ...v, produto_id: id } : v,
                          ),
                        });
                      }}
                    />
                    <label>
                      Quantidade
                      <input
                        type="number"
                        min="0.001"
                        max="1000000"
                        step="0.001"
                        value={i.quantidade}
                        onChange={(e) => {
                          setConferido(false);
                          setNota({
                            ...nota,
                            itens: nota.itens.map((v, k) =>
                              k === n
                                ? { ...v, quantidade: Number(e.target.value) }
                                : v,
                            ),
                          });
                        }}
                      />
                    </label>
                    <label>
                      Custo unitário conferido (R$)
                      <input
                        type="number"
                        min={0}
                        max={1000000}
                        step="0.01"
                        value={i.custo_centavos / 100}
                        onChange={(e) => {
                          setConferido(false);
                          setNota({
                            ...nota,
                            itens: nota.itens.map((v, k) =>
                              k === n
                                ? {
                                    ...v,
                                    custo_centavos: Math.round(
                                      Number(e.target.value) * 100,
                                    ),
                                  }
                                : v,
                            ),
                          });
                        }}
                      />
                    </label>
                    {!i.produto_id && (
                      <label>
                        Preço de venda {termos.doItem} (R$)
                        <input
                          type="number"
                          min={0}
                          max={1000000}
                          step="0.01"
                          value={i.preco_venda_centavos / 100}
                          onChange={(e) =>
                            setNota({
                              ...nota,
                              itens: nota.itens.map((v, k) =>
                                k === n
                                  ? {
                                      ...v,
                                      preco_venda_centavos: Math.round(
                                        Number(e.target.value) * 100,
                                      ),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                  <p>
                    Total do item:{" "}
                    {dinheiro(Math.round(i.quantidade * i.custo_centavos))}
                  </p>
                </div>
              ))}
              <div className="agil-indicadores">
                <div>
                  <small>Total XML</small>
                  <strong>{dinheiro(nota.total_xml_centavos)}</strong>
                </div>
                <div>
                  <small>Entrará no estoque e financeiro</small>
                  <strong>{dinheiro(total)}</strong>
                </div>
              </div>
              <label className="agil-grupo">
                <input
                  type="checkbox"
                  checked={conferido}
                  onChange={(e) => setConferido(e.target.checked)}
                />
                <span>
                  Conferi fornecedor, produtos, unidades e valores
                  {total !== nota.total_xml_centavos
                    ? ". Estou ciente da diferença e registrei os ajustes necessários"
                    : ""}
                  .
                </span>
              </label>
              <button
                className="botao-primario"
                disabled={
                  !conferido ||
                  busy ||
                  a.demo ||
                  !nota.data ||
                  !nota.vencimento ||
                  total <= 0
                }
                onClick={async () => {
                  if (trava.current) return;
                  trava.current = true;
                  setBusy(true);
                  setErro("");
                  try {
                    const r = await rpc<{ repetida?: boolean; compra: string }>(
                      "importar_compra_nfe",
                      {
                        p_oficina: a.oficina!.id,
                        p_chave: chave,
                        p_dados: { ...nota, total_conferido_centavos: total },
                      },
                    );
                    setResultado(
                      r.repetida
                        ? "Esta nota já foi importada. Estoque e financeiro preservados."
                        : "Compra importada. Estoque atualizado e conta a pagar criada.",
                    );
                    setNota(null);
                    if (!r.repetida) {
                      setAberto(false);
                      perguntarPagamento({ tipo: "compra", id: r.compra });
                    }
                    await Promise.all(
                      [
                        "compras",
                        "estoque",
                        "financeiro",
                        "fornecedores",
                        "catalogo",
                      ].map((k) => cache.invalidateQueries({ queryKey: [k] })),
                    );
                  } catch (e) {
                    setErro(erroPublico(e));
                  } finally {
                    trava.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Registrando compra…" : "Confirmar compra e conta a pagar"}
              </button>
            </>
          )}
          {erro && (
            <p role="alert" className="agil-alerta">
              {erro}
            </p>
          )}
          {resultado && (
            <p role="status" className="agil-ok">
              {resultado}
            </p>
          )}
          {a.demo && <p>A importação ocorre na conta real.</p>}
        </div>
      </Dialogo>
    </>
  );
}
