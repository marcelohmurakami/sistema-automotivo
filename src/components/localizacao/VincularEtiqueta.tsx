import { useRef, useState, type FormEvent } from "react";
import { ScanLine } from "lucide-react";
import { DialogoLocalizacao as Dialogo } from "./DialogoLocalizacao";
import { LeitorEtiqueta } from "../LeitorEtiqueta";
import { useAcesso } from "../../auth/contexto";
import { novoId } from "../../lib/uuid";
import { erroPublico } from "../../lib/supabase";
import {
  interpretarEtiqueta,
  ondeEsta,
  type ContextoFisico,
  type ItemFisico,
} from "../../lib/localizacaoFisica";
import { consultarItemFisico, vincularItensFisicos } from "../../services/localizacao";

export function VincularEtiqueta({
  contexto,
  fechar,
  salvo,
}: {
  contexto: ContextoFisico;
  fechar: () => void;
  salvo: () => void;
}) {
  const w = useAcesso().oficina!.id;
  const [codigo, setCodigo] = useState("");
  const [item, setItem] = useState<ItemFisico & { relacionados: ItemFisico[] }>();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [leitor, setLeitor] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState({ assinatura: "", chave: novoId() });
  const processando = useRef(false);
  async function localizar(texto: string) {
    if (processando.current) return;
    processando.current = true;
    setLeitor(false);
    setOcupado(true);
    setErro("");
    setItem(undefined);
    setSelecionados([]);
    try {
      const r = interpretarEtiqueta(texto, window.location.origin);
      if (r.tipo !== "item")
        throw new Error("Leia ou digite o código PTI da etiqueta do item.");
      setItem(await consultarItemFisico(w, r.codigo));
      setCodigo(r.codigo);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      processando.current = false;
      setOcupado(false);
    }
  }
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!item || processando.current) return;
    processando.current = true;
    const itens = [
      item,
      ...item.relacionados.filter((i) => selecionados.includes(i.id)),
    ];
    const assinatura = JSON.stringify(itens.map((i) => [i.id, i.revisao]));
    const chave = assinatura === tentativa.assinatura ? tentativa.chave : novoId();
    setTentativa({ assinatura, chave });
    setOcupado(true);
    setErro("");
    try {
      await vincularItensFisicos(
        w,
        itens,
        { tipo: contexto.tipo, id: contexto.id },
        chave,
      );
      salvo();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      processando.current = false;
      setOcupado(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={() => {
        if (!ocupado) fechar();
      }}
      titulo="Usar etiqueta existente"
    >
      <div className="loc-form">
        <p>
          Vincular a <strong>{contexto.titulo}</strong>
          {contexto.cliente && ` · ${contexto.cliente}`}. A etiqueta e o histórico
          anterior são preservados.
        </p>
        <form
          className="loc-acoes"
          onSubmit={(e) => {
            e.preventDefault();
            void localizar(codigo);
          }}
        >
          <label className="loc-crescer">
            Código da etiqueta
            <input
              value={codigo}
              maxLength={2048}
              disabled={ocupado}
              required
              onChange={(e) => {
                setCodigo(e.target.value);
                setItem(undefined);
              }}
              placeholder="PTI-…"
            />
          </label>
          <button className="botao-secundario" disabled={ocupado}>
            Localizar
          </button>
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado}
            onClick={() => setLeitor(true)}
          >
            <ScanLine size={18} /> Ler etiqueta
          </button>
        </form>
        {item && (
          <form className="loc-form" onSubmit={(e) => void salvar(e)}>
            <fieldset disabled={ocupado}>
              <strong>{item.descricao}</strong>
              <p>{ondeEsta(item)}</p>
              {item.numero && (
                <p>
                  Vínculo atual: {item.documento_rotulo || "OS"} #{item.numero}
                  {item.cliente_nome && ` · ${item.cliente_nome}`}
                </p>
              )}
              <p>
                O vínculo atual dos itens selecionados será substituído. A localização
                física permanece a mesma.
              </p>
              {!!item.relacionados.length && (
                <>
                  <h3>Vincular também</h3>
                  {item.relacionados.map((i) => (
                    <label className="loc-check" key={i.id}>
                      <input
                        type="checkbox"
                        checked={selecionados.includes(i.id)}
                        disabled={
                          selecionados.length >= 49 && !selecionados.includes(i.id)
                        }
                        onChange={(e) =>
                          setSelecionados((xs) =>
                            e.target.checked
                              ? [...xs, i.id]
                              : xs.filter((id) => id !== i.id),
                          )
                        }
                      />
                      <span>
                        {i.descricao}
                        <small>{ondeEsta(i)}</small>
                      </span>
                    </label>
                  ))}
                </>
              )}
              <button className="botao-primario">
                {ocupado
                  ? "Vinculando…"
                  : `Vincular ${1 + selecionados.length} ${selecionados.length ? "itens" : "item"}`}
              </button>
            </fieldset>
          </form>
        )}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {leitor && (
          <LeitorEtiqueta
            fechar={() => setLeitor(false)}
            lido={(c) => void localizar(c)}
          />
        )}
      </div>
    </Dialogo>
  );
}
