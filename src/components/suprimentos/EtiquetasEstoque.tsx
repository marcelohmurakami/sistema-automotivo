import { useState } from "react";
import { ScanLine, Printer } from "lucide-react";
import { LeitorEtiqueta } from "../LeitorEtiqueta";
import { DialogoLocalizacao as Dialogo } from "../localizacao/DialogoLocalizacao";
import { logisticaEstoque, type CodigoEstoque } from "../../services/logisticaEstoque";
import { suprimentos } from "../../services/suprimentos";
import type { ProdutoEstoque } from "../../services/estoque";
import { useSuprimentos } from "./helpers";
import { interpretarEtiqueta } from "../../lib/localizacaoFisica";
export function LerProduto({
  selecionar,
  produto,
  deposito,
  reserva,
  unidade = false,
}: {
  selecionar: (p: ProdutoEstoque, c: CodigoEstoque) => void;
  produto?: string;
  deposito?: string | null;
  reserva?: string | null;
  unidade?: boolean;
}) {
  const { w, erro, setErro, ocupado, executar } = useSuprimentos(),
    [ler, setLer] = useState(false),
    [itens, setItens] = useState<CodigoEstoque[] | null>(null);
  async function selecionarCodigo(c: CodigoEstoque) {
    if (produto && c.produto_id !== produto)
      throw new Error("Esta etiqueta pertence a outro produto.");
    if (
      unidade &&
      (!c.unidade_id ||
        c.estado !== "estoque" ||
        (c.reserva_id && c.reserva_id !== reserva))
    )
      throw new Error("Leia uma unidade disponível para esta operação.");
    if (unidade && deposito && c.deposito_id !== deposito)
      throw new Error("A unidade está em outro depósito.");
    const p = await suprimentos.produto(w, c.produto_id);
    selecionar(p, c);
    setItens(null);
  }
  async function escolher(c: CodigoEstoque) {
    await executar(() => selecionarCodigo(c), false);
  }
  return (
    <>
      <button
        type="button"
        className="botao-secundario"
        disabled={ocupado}
        onClick={() => {
          setErro("");
          setLer(true);
        }}
      >
        <ScanLine size={16} aria-hidden /> Ler código
      </button>
      {ler && (
        <LeitorEtiqueta
          fechar={() => setLer(false)}
          lido={async (texto) => {
            setLer(false);
            await executar(async () => {
              const v = interpretarEtiqueta(texto, window.location.origin);
              const encontrados = await logisticaEstoque.localizar(
                w,
                v.codigo || texto.trim(),
              );
              if (!encontrados.length)
                throw new Error(
                  "Código não encontrado nesta empresa. Confira o cadastro ou a etiqueta.",
                );
              if (encontrados.length === 1) await selecionarCodigo(encontrados[0]);
              else setItens(encontrados);
            }, false);
          }}
        />
      )}
      {itens && (
        <Dialogo aberto fechar={() => setItens(null)} titulo="Produto identificado">
          <div className="supr">
            {itens.map((c, i) => (
              <button
                type="button"
                className="supr-linha supr-clicavel"
                key={i}
                disabled={ocupado}
                onClick={() => void escolher(c)}
              >
                <span>
                  <strong>{c.descricao}</strong>
                  <small>
                    {c.serie ? `Série ${c.serie}` : `${c.disponivel} disponíveis`}
                    {c.imei ? ` · IMEI ${c.imei}` : ""}
                  </small>
                </span>
                <span>Selecionar →</span>
              </button>
            ))}
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
          </div>
        </Dialogo>
      )}
      {erro && !itens && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
    </>
  );
}
export function ImprimirEtiquetasEstoque({
  produto,
  descricao,
  unidades = [],
}: {
  produto: string;
  descricao: string;
  unidades?: string[];
}) {
  const { a, w, erro, ocupado, executar } = useSuprimentos(),
    [aberto, setAberto] = useState(false),
    [formato, setFormato] = useState<"a4" | "termica">("a4"),
    [copias, setCopias] = useState(1),
    [codigo, setCodigo] = useState("");
  return (
    <>
      <button
        type="button"
        className="botao-secundario"
        onClick={() => setAberto(true)}
      >
        <Printer size={16} aria-hidden /> Etiquetas
      </button>
      {aberto && (
        <Dialogo
          aberto
          titulo="Imprimir etiquetas"
          fechar={() => !ocupado && setAberto(false)}
        >
          <form
            className="supr"
            onSubmit={async (e) => {
              e.preventDefault();
              await executar(async () => {
                const ids = unidades.length ? unidades : [null];
                if (ids.length * copias > 50)
                  throw new Error("Gere até 50 etiquetas por vez.");
                const itens = [];
                for (const id of ids) {
                  const item = await logisticaEstoque.etiqueta(w, produto, id);
                  for (let i = 0; i < copias; i++) itens.push(item);
                }
                const { gerarEtiquetasEstoque } =
                  await import("../../services/pdfEtiquetasEstoque");
                gerarEtiquetasEstoque(itens, a.oficina!.nome, formato).save(
                  "etiquetas-estoque.pdf",
                );
              }, false);
            }}
          >
            <fieldset disabled={ocupado}>
              <strong>{descricao}</strong>
              <div className="supr-campos">
                <label>
                  Papel
                  <select
                    value={formato}
                    onChange={(e) => setFormato(e.target.value as typeof formato)}
                  >
                    <option value="a4">A4 · 10 etiquetas por página</option>
                    <option value="termica">Térmica · 80 × 50 mm</option>
                  </select>
                </label>
                <label>
                  Cópias por etiqueta
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={copias}
                    onChange={(e) => setCopias(Number(e.target.value))}
                    required
                  />
                </label>
              </div>
              <p className="texto-secundario">
                Imprima em tamanho real (100%). A etiqueta de série identifica uma
                unidade; a de produto identifica o modelo.
              </p>
              <button className="botao-primario">
                {ocupado ? "Preparando…" : "Baixar PDF para imprimir"}
              </button>
              <details>
                <summary>Vincular código do fabricante (opcional)</summary>
                <label>
                  Código existente
                  <input
                    maxLength={80}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!codigo.trim() || unidades.length > 1}
                  onClick={() =>
                    void executar(async () => {
                      await logisticaEstoque.etiqueta(
                        w,
                        produto,
                        unidades[0] ?? null,
                        codigo.trim(),
                      );
                      setCodigo("");
                    }, false)
                  }
                >
                  Vincular código
                </button>
              </details>
              {erro && (
                <p role="alert" className="erro-formulario">
                  {erro}
                </p>
              )}
            </fieldset>
          </form>
        </Dialogo>
      )}
    </>
  );
}
