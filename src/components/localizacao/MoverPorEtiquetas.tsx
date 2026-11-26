import { useEffect, useRef, useState, type FormEvent } from "react";
import { ScanLine, Trash2 } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import {
  interpretarEtiqueta,
  ondeEsta,
  type ItemFisico,
} from "../../lib/localizacaoFisica";
import { assinaturaMovimento, incluirEtiqueta } from "../../lib/filaEtiquetas";
import { novoId } from "../../lib/uuid";
import { erroPublico } from "../../lib/supabase";
import {
  consultarItemFisico,
  movimentarItensFisicos,
} from "../../services/localizacao";
import { DialogoLocalizacao } from "./DialogoLocalizacao";
import { SeletorLocal } from "./ControlesLocalizacao";
import { LeitorEtiqueta } from "../LeitorEtiqueta";

export function MoverPorEtiquetas({
  fechar,
  salvo,
  localInicial = "",
}: {
  fechar: () => void;
  salvo: (itens: ItemFisico[]) => void;
  localInicial?: string;
}) {
  const w = useAcesso().oficina!.id;
  const [local, setLocal] = useState(localInicial);
  const [fila, setFila] = useState<ItemFisico[]>([]);
  const [codigo, setCodigo] = useState("");
  const [leitor, setLeitor] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const consulta = useRef<AbortController | null>(null);
  const trava = useRef(false);
  const tentativa = useRef({ assinatura: "", chave: "" });
  useEffect(() => () => consulta.current?.abort(), []);

  async function adicionar(texto: string) {
    if (consulta.current || trava.current) return;
    const abort = new AbortController();
    consulta.current = abort;
    setLeitor(false);
    setBuscando(true);
    setErro("");
    setAviso("");
    try {
      const leitura = interpretarEtiqueta(texto, window.location.origin);
      if (leitura.tipo !== "item")
        throw new Error("Leia o QR ou digite o código PTI da etiqueta do item.");
      const repetido = fila.find((i) => i.codigo === leitura.codigo);
      if (repetido) {
        setAviso(`${repetido.descricao} já está na lista.`);
      } else {
        const item = await consultarItemFisico(w, leitura.codigo, abort.signal);
        if (abort.signal.aborted) return;
        const proxima = incluirEtiqueta(fila, item);
        setFila(proxima);
        setAviso(`${item.descricao} adicionado. ${proxima.length} na lista.`);
      }
      setCodigo("");
    } catch (e) {
      if (!abort.signal.aborted) setErro(erroPublico(e));
    } finally {
      if (!abort.signal.aborted) {
        setBuscando(false);
        campo.current?.focus();
      }
      consulta.current = null;
    }
  }
  async function mover(e: FormEvent) {
    e.preventDefault();
    if (trava.current || consulta.current || !fila.length || !local) return;
    trava.current = true;
    setSalvando(true);
    setErro("");
    const assinatura = assinaturaMovimento(fila, local);
    if (tentativa.current.assinatura !== assinatura)
      tentativa.current = { assinatura, chave: novoId() };
    try {
      const itens = await movimentarItensFisicos(
        w,
        fila,
        "mover",
        local,
        "",
        "",
        tentativa.current.chave,
      );
      salvo(itens);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }
  return (
    <DialogoLocalizacao
      aberto
      titulo="Mover por etiquetas"
      fechar={() => {
        if (!salvando) fechar();
      }}
    >
      <div className="loc-form">
        <p>Escolha o destino e leia os itens. Confira a lista antes de confirmar.</p>
        <fieldset disabled={salvando}>
          <SeletorLocal valor={local} alterar={setLocal} obrigatorio />
          <form
            className="loc-leitura-lote"
            onSubmit={(e) => {
              e.preventDefault();
              void adicionar(codigo);
            }}
          >
            <label className="loc-crescer">
              Etiqueta do item
              <input
                ref={campo}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Leia ou digite PTI-…"
                autoComplete="off"
                maxLength={2048}
                disabled={buscando || fila.length >= 50}
              />
            </label>
            <button
              className="botao-secundario"
              disabled={buscando || !codigo.trim() || fila.length >= 50}
            >
              {buscando ? "Localizando…" : "Adicionar"}
            </button>
            <button
              type="button"
              className="botao-secundario"
              disabled={buscando || fila.length >= 50}
              onClick={() => setLeitor(true)}
            >
              <ScanLine size={18} /> Ler QR
            </button>
          </form>
          {aviso && (
            <p className="loc-aviso" role="status">
              {aviso}
            </p>
          )}
          {!!fila.length && (
            <>
              <strong>{fila.length} de 50 itens</strong>
              <ul className="loc-fila">
                {fila.map((i) => (
                  <li key={i.id}>
                    <div>
                      <strong>{i.descricao}</strong>
                      <small>{ondeEsta(i)}</small>
                    </div>
                    <button
                      type="button"
                      className="botao-icone"
                      aria-label={`Remover ${i.descricao} da lista`}
                      disabled={buscando}
                      onClick={() => setFila((xs) => xs.filter((x) => x.id !== i.id))}
                    >
                      <Trash2 size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <form onSubmit={(e) => void mover(e)}>
          <button
            className="botao-primario loc-confirmar"
            disabled={salvando || buscando || !local || !fila.length}
          >
            {salvando
              ? "Movendo…"
              : `Confirmar mudança de ${fila.length} ${fila.length === 1 ? "item" : "itens"}`}
          </button>
        </form>
        {leitor && (
          <LeitorEtiqueta
            fechar={() => setLeitor(false)}
            lido={(c) => void adicionar(c)}
          />
        )}
      </div>
    </DialogoLocalizacao>
  );
}
