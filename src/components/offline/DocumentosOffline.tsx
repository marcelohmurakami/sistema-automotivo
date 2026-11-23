import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Printer, FileText } from "lucide-react";
import { dinheiro } from "../../lib/formatacao";
import { erroPublico } from "../../lib/supabase";
import {
  documentoParaImprimirOffline,
  novoDocumentoOffline,
  totaisDocumentoOffline,
  type DocumentoOffline,
} from "../../lib/documentoOffline";
import {
  guardarRascunhoOffline,
  excluirRascunhoOffline,
  novoRascunhoOffline,
  type BaseOffline,
  type RascunhoOffline,
} from "../../lib/atendimentoOffline";

import { componenteSobDemanda } from "../../lib/componenteSobDemanda";
const EditorDocumento = componenteSobDemanda(async () => ({
  default: (await import("./EditorDocumentoOffline")).EditorDocumentoOffline,
}));

export function DocumentosOffline({
  usuario,
  oficina,
  base,
  lista,
  ocupado,
  atualizar,
  sincronizar,
}: {
  usuario: string;
  oficina: string;
  base?: BaseOffline;
  lista: RascunhoOffline[];
  ocupado: boolean;
  atualizar: () => Promise<void>;
  sincronizar: (r: RascunhoOffline) => Promise<void>;
}) {
  const [edit, setEdit] = useState<RascunhoOffline | null>(null),
    [erro, setErro] = useState("");
  const [agora] = useState(Date.now);
  const recentes = !!base && agora - base.atualizado < 7 * 86400000;
  async function novo(tipo: DocumentoOffline["tipo"]) {
    if (!base) return;
    const r = {
      ...novoRascunhoOffline(usuario, oficina),
      ramo: base.ramo,
      documento: novoDocumentoOffline(base, tipo),
      pronto_envio: false,
    };
    try {
      await guardarRascunhoOffline(r);
      setEdit(r);
      await atualizar();
    } catch (e) {
      setErro(erroPublico(e));
    }
  }
  function imprimir(r: RascunhoOffline, aberta?: Window) {
    if (!base) return;
    try {
      const documento = documentoParaImprimirOffline(r, base);
      const janela = aberta || window.open("", "_blank");
      if (!janela) throw Error("Permita abrir a janela de impressão.");
      void import("../../services/impressaoDocumentoCliente")
        .then(({ imprimirDocumentoCliente }) =>
          imprimirDocumentoCliente(janela, documento),
        )
        .catch((e) => setErro(erroPublico(e)));
    } catch (e) {
      aberta?.close();
      setErro(erroPublico(e));
    }
  }
  return (
    <section className="offline-novos" aria-label="OS e orçamentos neste aparelho">
      <header className="offline-secao-cabecalho">
        <div>
          <h2>OS e orçamentos</h2>
          <p className="offline-ajuda">Preencha e imprima. Envio ao reconectar.</p>
        </div>
        <div className="offline-registro-acoes">
          <button
            className="botao-primario"
            disabled={ocupado || !recentes}
            onClick={() => void novo("os")}
          >
            <Plus size={17} />
            Nova OS
          </button>
          <button
            className="botao-secundario"
            disabled={ocupado || !recentes}
            onClick={() => void novo("orcamento")}
          >
            <FileText size={17} />
            Novo orçamento
          </button>
        </div>
      </header>
      {!recentes && (
        <p className="offline-ajuda">
          Use “Preparar aparelho” com internet para baixar os cadastros.
        </p>
      )}
      {erro && (
        <p role="alert" className="offline-erro">
          {erro}
        </p>
      )}
      <div className="offline-lista">
        {lista
          .filter((r) => r.documento)
          .map((r) => {
            const d = r.documento!,
              t = totaisDocumentoOffline(d),
              ref = r.recibo
                ? `#${r.recibo.numero}`
                : `LOCAL-${r.id.slice(0, 8).toUpperCase()}`;
            const rota =
              r.ramo === "automotivo"
                ? d.tipo === "os"
                  ? "/ordens-servico?os="
                  : "/orcamentos?orcamento="
                : "/atendimentos?atendimento=";
            return (
              <article className="offline-registro" key={r.id}>
                <div className="offline-registro-info">
                  <span className="plano-status">
                    {r.situacao === "sincronizado"
                      ? "Enviado"
                      : r.pedido_documento
                        ? "Confirmando envio"
                        : r.pronto_envio
                          ? "Aguardando conexão"
                          : "Em preenchimento"}
                  </span>
                  <h3>
                    {d.tipo === "os" ? "OS" : "Orçamento"} {ref} ·{" "}
                    {d.cliente.nome || "Novo cliente"}
                  </h3>
                  <p>{d.bem.nome || "Identificação a preencher"}</p>
                  <p>
                    {d.itens.length} itens · <strong>{dinheiro(t.total)}</strong>
                  </p>
                  {r.erro && <p role="alert">{r.erro}</p>}
                </div>
                <div className="offline-registro-acoes">
                  {!r.recibo && !r.pedido_documento && (
                    <button
                      className="botao-secundario"
                      disabled={ocupado}
                      onClick={async () => {
                        try {
                          const copia = structuredClone(r);
                          copia.pronto_envio = false;
                          await guardarRascunhoOffline(copia);
                          setEdit(copia);
                          await atualizar();
                        } catch (e) {
                          setErro(erroPublico(e));
                        }
                      }}
                    >
                      Continuar
                    </button>
                  )}
                  <button
                    className="botao-secundario"
                    disabled={!d.itens.length}
                    onClick={() => imprimir(r)}
                  >
                    <Printer size={17} />
                    Imprimir
                  </button>
                  {r.recibo && navigator.onLine && (
                    <Link className="botao-secundario" to={rota + r.recibo.id}>
                      Abrir no sistema
                    </Link>
                  )}
                  {r.pronto_envio && r.situacao !== "sincronizado" && (
                    <button
                      className="botao-secundario"
                      disabled={ocupado || !navigator.onLine}
                      onClick={() => void sincronizar(r)}
                    >
                      Enviar agora
                    </button>
                  )}
                  {(!r.pedido_documento || r.situacao === "sincronizado") && (
                    <button
                      className="offline-remover"
                      disabled={ocupado}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Remover a cópia deste aparelho? O que ainda não foi enviado será perdido.",
                          )
                        )
                          return;
                        try {
                          await excluirRascunhoOffline(usuario, oficina, r.id);
                          await atualizar();
                        } catch (e) {
                          setErro(erroPublico(e));
                        }
                      }}
                    >
                      Remover do aparelho
                    </button>
                  )}
                </div>
              </article>
            );
          })}
      </div>
      {edit && base && (
        <EditorDocumento
          key={edit.id}
          registro={edit}
          base={base}
          fechar={() => setEdit(null)}
          atualizar={atualizar}
          imprimir={imprimir}
        />
      )}
    </section>
  );
}
