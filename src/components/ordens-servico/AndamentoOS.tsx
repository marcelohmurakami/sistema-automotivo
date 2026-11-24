import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCheck, Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialogo } from "../Dialogo";
import { motivosParada } from "../../lib/mapaOficina";
import { situacoesOS, type OrdemServico } from "../../services/ordensServico";
import type { AcaoRapidaMapa } from "../../services/mapaOficina";
import "./AndamentoOS.css";

export function AndamentoOS({
  os,
  ocupado,
  erro,
  avancar,
  operar,
  limparErro,
}: {
  os: OrdemServico;
  ocupado: boolean;
  erro: string;
  avancar: (situacao: string) => void;
  operar: (acao: AcaoRapidaMapa) => Promise<boolean>;
  limparErro: () => void;
}) {
  const [pausando, setPausando] = useState(false);
  const [motivo, setMotivo] = useState("parts");
  const [detalhes, setDetalhes] = useState("");
  const paradas = os.paradas.filter((p) => !p.encerrado_em);
  const pausada = paradas.length > 0;
  const encerrada =
    !!os.arquivado_em || ["delivered", "cancelled"].includes(os.situacao);
  const aguardandoAprovacao = !!os.orcamento_aguardando_id;
  const proxima = (
    {
      open: ["in_progress", "Iniciar serviço"],
      in_progress: ["quality_check", "Conferir serviço"],
      quality_check: ["ready", "Concluir serviço"],
      ready: ["delivered", "Registrar entrega"],
    } as Record<string, [string, string]>
  )[os.situacao];

  async function pausar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await operar({ acao: "parar", motivo, detalhes })) {
      setPausando(false);
      setDetalhes("");
    }
  }

  if (encerrada) return null;
  return (
    <>
      <section
        className={`os-andamento${pausada ? " os-andamento-pausado" : ""}`}
        aria-label="Andamento da OS"
      >
        <div className="os-andamento-etapa" aria-live="polite">
          <span>Etapa atual</span>
          <strong>{pausada ? "Serviço pausado" : situacoesOS[os.situacao]}</strong>
          {pausada && (
            <small>
              {paradas.length === 1
                ? motivosParada[paradas[0].motivo] || "Pendência em aberto"
                : `${paradas.length} pendências em aberto`}
            </small>
          )}
        </div>
        <div className="os-andamento-acoes">
          {aguardandoAprovacao ? (
            <Link
              className="botao-secundario"
              to={`/orcamentos?orcamento=${os.orcamento_aguardando_id}`}
            >
              Conferir aprovação <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : pausada ? (
            <button
              className="botao-primario"
              disabled={ocupado}
              onClick={() => void operar({ acao: "retomar" })}
            >
              <Play size={17} aria-hidden="true" /> Retomar serviço
            </button>
          ) : (
            proxima && (
              <button
                className="botao-primario"
                disabled={ocupado}
                onClick={() =>
                  os.situacao === "quality_check"
                    ? void operar({ acao: "concluir" })
                    : avancar(proxima[0])
                }
                title={
                  os.situacao === "quality_check"
                    ? "Conclui os itens e deixa a OS pronta para entrega."
                    : undefined
                }
              >
                {os.situacao === "quality_check" ? (
                  <CheckCheck size={18} aria-hidden="true" />
                ) : (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
                {proxima[1]}
              </button>
            )
          )}
          {!pausada && os.situacao !== "ready" && !aguardandoAprovacao && (
            <button
              className="botao-secundario os-andamento-pausar"
              disabled={ocupado}
              onClick={() => {
                limparErro();
                setPausando(true);
              }}
            >
              <Pause size={17} aria-hidden="true" /> Pausar serviço
            </button>
          )}
        </div>
        {pausada && (
          <details className="os-andamento-pendencias">
            <summary>Ver motivo da pausa</summary>
            <ul>
              {paradas.map((p) => (
                <li key={p.id}>{p.detalhes || motivosParada[p.motivo]}</li>
              ))}
            </ul>
            {aguardandoAprovacao && (
              <p>Aguardando a aprovação do orçamento para retomar.</p>
            )}
            {!aguardandoAprovacao && paradas.length > 1 && (
              <p>Retomar resolve todas as pendências acima.</p>
            )}
          </details>
        )}
      </section>
      <Dialogo
        aberto={pausando}
        fechar={() => !ocupado && setPausando(false)}
        titulo="Pausar serviço"
        classe="dialogo-pausar-os"
      >
        <form className="formulario-cliente" onSubmit={(e) => void pausar(e)}>
          <fieldset disabled={ocupado}>
            <label>
              Motivo da pausa
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {Object.entries(motivosParada).map(([valor, nome]) => (
                  <option key={valor} value={valor}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Detalhes (opcional)
              <textarea
                value={detalhes}
                onChange={(e) => setDetalhes(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder="Ex.: peça chega amanhã"
              />
            </label>
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <button className="botao-primario">
              {ocupado ? "Salvando…" : "Confirmar pausa"}
            </button>
          </fieldset>
        </form>
      </Dialogo>
    </>
  );
}
