import { useEffect, useState, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { novoId } from "../../lib/uuid";
import { erroPublico } from "../../lib/supabase";
import { ramos } from "../../lib/ramos";
import { diaLocal } from "../../services/servicos";
import { reduzirFoto } from "../../lib/capturaAtendimento";
import {
  guardarRascunhoOffline,
  excluirRascunhoOffline,
  novoRascunhoOffline,
  type BaseOffline,
  type RascunhoOffline,
} from "../../lib/atendimentoOffline";
import { Dialogo } from "../Dialogo";
import { AtendimentoExpresso } from "../AtendimentoExpresso";
import "../../pages/OficinaAgil.css";

export function NovosAtendimentosOffline({
  usuario,
  oficina,
  base,
  lista,
  online,
  ocupado,
  atualizar,
  sincronizar,
  avisar,
  apenasExistentes = false,
}: {
  usuario: string;
  oficina: string;
  base?: BaseOffline;
  lista: RascunhoOffline[];
  online: boolean;
  ocupado: boolean;
  atualizar: () => Promise<void>;
  sincronizar: (r: RascunhoOffline) => Promise<void>;
  avisar: (texto: string) => void;
  apenasExistentes?: boolean;
}) {
  const [edit, setEdit] = useState<RascunhoOffline | null>(null);
  const [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [dirty, setDirty] = useState(false);
  const emUso = ocupado || busy;
  const [agora] = useState(Date.now);
  const baseValida = base && agora - base.atualizado < 7 * 86400000;
  const baseEditor = base || {
    aux: { clientes: [], veiculos: [], vinculos: [], catalogo: [] },
  };
  useEffect(() => {
    if (!dirty) return;
    const proteger = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", proteger);
    return () => window.removeEventListener("beforeunload", proteger);
  }, [dirty]);
  const alterar = (valor: SetStateAction<RascunhoOffline | null>) => {
    setDirty(true);
    setEdit(valor);
  };
  async function salvar() {
    if (!edit || emUso) return;
    setBusy(true);
    setErro("");
    try {
      await guardarRascunhoOffline({ ...edit, atualizado: Date.now() });
      setEdit(null);
      setDirty(false);
      await atualizar();
      avisar("Atendimento e fotos salvos no aparelho.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setBusy(false);
    }
  }
  async function fechar() {
    if (dirty) await salvar();
    else setEdit(null);
  }
  if (apenasExistentes && !lista.length) return null;
  return (
    <section className="offline-novos" aria-label="Novos atendimentos no aparelho">
      <header className="offline-secao-cabecalho">
        <h2>
          {apenasExistentes
            ? "Atendimentos anteriores neste aparelho"
            : "Novos atendimentos"}
        </h2>
        {!apenasExistentes && (
          <button
            className="botao-primario"
            disabled={emUso || !baseValida}
            onClick={() => {
              setErro("");
              setDirty(false);
              setEdit({
                ...novoRascunhoOffline(usuario, oficina),
                ramo: base?.ramo || "automotivo",
                data_servico: diaLocal(new Date()),
              });
            }}
          >
            <Plus size={18} />
            Novo atendimento
          </button>
        )}
      </header>
      {!baseValida && (
        <p className="offline-ajuda">
          Prepare o aparelho com internet para iniciar novos atendimentos.
        </p>
      )}
      <div className="offline-lista">
        {lista.map((r) => (
          <article className="offline-registro" key={r.id}>
            <div className="offline-registro-info">
              <span className="plano-status">
                {r.situacao === "sincronizado"
                  ? "Enviado"
                  : r.situacao === "parcial"
                    ? "Fotos pendentes"
                    : "Novo · pendente de envio"}
              </span>
              <h3>
                {base?.aux.clientes.find((c) => c.id === r.cliente_id)?.nome ||
                  "Cliente a selecionar"}
              </h3>
              <p>
                {r.objeto ||
                  base?.aux.veiculos.find((v) => v.id === r.veiculo_id)?.modelo ||
                  ""}
              </p>
              <p className="offline-relato">{r.relato || "Sem anotações"}</p>
              {r.erro && <p role="alert">{r.erro}</p>}
            </div>
            <div className="offline-registro-acoes">
              {!r.os_id && (
                <button
                  className="botao-secundario"
                  disabled={emUso}
                  onClick={() => {
                    setEdit(structuredClone(r));
                    setDirty(false);
                    setErro("");
                  }}
                >
                  Continuar
                </button>
              )}
              {r.situacao !== "sincronizado" && (
                <button
                  className="botao-secundario"
                  disabled={emUso || !online}
                  onClick={() => void sincronizar(r)}
                >
                  {r.os_id ? "Enviar fotos" : "Criar OS e enviar"}
                </button>
              )}
              {r.os_id && online && (
                <Link
                  className="botao-secundario"
                  to={
                    r.ramo && r.ramo !== "automotivo"
                      ? "/atendimentos?atendimento=" + r.os_id
                      : "/ordens-servico?os=" + r.os_id
                  }
                >
                  Abrir OS
                </Link>
              )}
              <button
                className="offline-remover"
                disabled={emUso}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Remover este atendimento do aparelho? O que ainda não foi enviado será perdido. A OS já sincronizada será mantida.",
                    )
                  )
                    return;
                  setBusy(true);
                  setErro("");
                  try {
                    await excluirRascunhoOffline(usuario, oficina, r.id);
                    await atualizar();
                  } catch (e) {
                    setErro(erroPublico(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remover do aparelho
              </button>
            </div>
          </article>
        ))}
      </div>
      {!lista.length && baseValida && (
        <p className="offline-ajuda">
          Use “Novo atendimento” para guardar o relato e as fotos mesmo sem conexão.
        </p>
      )}
      {erro && !edit && <p role="alert">{erro}</p>}
      {edit && (
        <Dialogo
          aberto
          titulo="Atendimento guardado no aparelho"
          fechar={() => {
            if (!emUso) void fechar();
          }}
        >
          <form
            className="plano-op offline-formulario"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <fieldset disabled={emUso}>
              {(!edit.ramo || edit.ramo === "automotivo") && (
                <AtendimentoExpresso
                  aplicar={(c) =>
                    alterar({
                      ...edit,
                      relato: [
                        edit.relato,
                        c.relato,
                        c.placa ? `Placa lida: ${c.placa}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n")
                        .slice(0, 4000),
                      quilometragem: c.quilometragem ?? edit.quilometragem,
                    })
                  }
                />
              )}
              <div className="agil-grade">
                <label>
                  Cliente
                  <select
                    value={edit.cliente_id}
                    onChange={(e) =>
                      alterar({
                        ...edit,
                        cliente_id: e.target.value,
                        veiculo_id: "",
                      })
                    }
                  >
                    <option value="">Selecionar depois</option>
                    {baseEditor.aux.clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
                {!edit.ramo || edit.ramo === "automotivo" ? (
                  <label>
                    Veículo
                    <select
                      value={edit.veiculo_id}
                      onChange={(e) => alterar({ ...edit, veiculo_id: e.target.value })}
                    >
                      <option value="">Selecionar depois</option>
                      {baseEditor.aux.veiculos
                        .filter((v) =>
                          baseEditor.aux.vinculos.some(
                            (l) =>
                              l.veiculo_id === v.id && l.cliente_id === edit.cliente_id,
                          ),
                        )
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.placa} · {v.modelo}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    {ramos[edit.ramo].objeto}
                    <input
                      value={edit.objeto || ""}
                      maxLength={160}
                      onChange={(e) => alterar({ ...edit, objeto: e.target.value })}
                    />
                  </label>
                )}
              </div>
              <label>
                Relato e anotações
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={edit.relato}
                  onChange={(e) => alterar({ ...edit, relato: e.target.value })}
                />
              </label>
              <label>
                Data do atendimento
                <input
                  type="date"
                  required
                  value={edit.data_servico || diaLocal(new Date())}
                  onChange={(e) => alterar({ ...edit, data_servico: e.target.value })}
                />
              </label>
              {(!edit.ramo || edit.ramo === "automotivo") && (
                <label>
                  Quilometragem
                  <input
                    type="number"
                    min={0}
                    max={9999999}
                    value={edit.quilometragem ?? ""}
                    onChange={(e) =>
                      alterar({
                        ...edit,
                        quilometragem: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              )}
              <label>
                Fotos · até 12
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  disabled={edit.fotos.length >= 12}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setBusy(true);
                    try {
                      const imagem = await reduzirFoto(f);
                      alterar((v) =>
                        v
                          ? {
                              ...v,
                              fotos: [
                                ...v.fotos,
                                {
                                  id: novoId(),
                                  imagem,
                                  fase: "before",
                                  legenda: "",
                                  sincronizada: false,
                                },
                              ],
                            }
                          : v,
                      );
                    } catch (e) {
                      setErro(erroPublico(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              <div className="agil-fotos">
                {edit.fotos.map((f, n) => (
                  <div key={f.id}>
                    <img
                      loading="lazy"
                      decoding="async"
                      src={f.imagem}
                      alt={`Foto ${n + 1} do atendimento`}
                    />
                    <select
                      aria-label={`Fase da foto ${n + 1}`}
                      value={f.fase}
                      onChange={(e) =>
                        alterar({
                          ...edit,
                          fotos: edit.fotos.map((v) =>
                            v.id === f.id ? { ...v, fase: e.target.value } : v,
                          ),
                        })
                      }
                    >
                      <option value="before">Antes</option>
                      <option value="during">Durante</option>
                      <option value="after">Depois</option>
                    </select>
                    <input
                      aria-label={`Legenda da foto ${n + 1}`}
                      placeholder="Legenda"
                      maxLength={300}
                      value={f.legenda}
                      onChange={(e) =>
                        alterar({
                          ...edit,
                          fotos: edit.fotos.map((v) =>
                            v.id === f.id ? { ...v, legenda: e.target.value } : v,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        alterar({
                          ...edit,
                          fotos: edit.fotos.filter((v) => v.id !== f.id),
                        })
                      }
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </fieldset>
            {erro && <p role="alert">{erro}</p>}
            <button className="botao-primario" disabled={emUso}>
              {busy ? "Guardando…" : "Guardar neste aparelho"}
            </button>
            <small>
              {!edit.ramo || edit.ramo === "automotivo"
                ? "Cliente e veículo novos podem ser cadastrados ao reconectar. Depois, atualize o aparelho e selecione os cadastros no rascunho."
                : "Para um cliente novo, cadastre-o ao reconectar e atualize o aparelho. O equipamento ou local informado será cadastrado junto com a OS."}
            </small>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
