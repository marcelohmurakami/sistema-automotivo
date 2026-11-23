import { rpc } from "../lib/rpc";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { erroPublico } from "../lib/supabase";

export function DesistenciaAtendimento({
  tipo,
  id,
  revisao,
  aprovado = false,
  osVinculada = false,
  atualizar,
}: {
  tipo: "os" | "orcamento";
  id: string;
  revisao: number;
  aprovado?: boolean;
  osVinculada?: boolean;
  atualizar: () => Promise<unknown>;
}) {
  const a = useAcesso(),
    cache = useQueryClient();
  const confirmando = useRef(false);
  const [aberto, setAberto] = useState(false),
    [decisao, setDecisao] = useState("desistiu"),
    [motivo, setMotivo] = useState(""),
    [encerrar, setEncerrar] = useState(true),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  async function confirmar() {
    if (confirmando.current) return;
    confirmando.current = true;
    setOcupado(true);
    setErro("");
    try {
      if (a.demo)
        throw new Error(
          "Entre na conta da empresa para registrar a recusa ou desistência.",
        );
      await rpc("registrar_desistencia_atendimento", {
        p_oficina: a.oficina!.id,
        p_tipo: tipo,
        p_id: id,
        p_revisao: revisao,
        p_decisao: decisao,
        p_motivo: motivo.trim(),
        p_encerrar_os: encerrar,
      });
      setAberto(false);
      await Promise.all([
        atualizarIntegracoes(cache),
        cache.invalidateQueries({ queryKey: ["orcamentos"] }),
      ]);
      await atualizar();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      confirmando.current = false;
      setOcupado(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="botao-secundario"
        onClick={() => {
          setAberto(true);
          setMotivo("");
          setErro("");
          setDecisao("desistiu");
          setEncerrar(true);
        }}
      >
        Cliente não aprovou / desistiu
      </button>
      <Dialogo
        aberto={aberto}
        fechar={() => !ocupado && setAberto(false)}
        titulo="Registrar recusa ou desistência"
      >
        <div className="formulario-cliente">
          <label>
            O que aconteceu?
            <select
              value={decisao}
              disabled={ocupado}
              onChange={(e) => setDecisao(e.target.value)}
            >
              {!aprovado && (
                <option value="nao_aprovou">Cliente não aprovou o orçamento</option>
              )}
              <option value="desistiu">Cliente desistiu de realizar o serviço</option>
            </select>
          </label>
          <label>
            Motivo
            <textarea
              value={motivo}
              maxLength={1000}
              rows={3}
              disabled={ocupado}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: cliente decidiu adiar o conserto"
            />
          </label>
          <p>
            O histórico será preservado. Os links do orçamento serão desativados. Uma OS
            cancelada sai do mapa e deixa de gerar a cobrança automática do serviço.
          </p>
          {(tipo === "os" || (osVinculada && encerrar)) && (
            <p>
              Se já houve recebimento, acerte o pagamento na aba Financeiro antes de
              cancelar. Caso parte do serviço deva ser cobrada, ajuste os itens e
              conclua apenas o que foi realizado.
            </p>
          )}
          {tipo === "orcamento" && osVinculada && (
            <label>
              <input
                type="checkbox"
                checked={encerrar}
                disabled={ocupado}
                onChange={(e) => setEncerrar(e.target.checked)}
              />{" "}
              Encerrar também a OS vinculada a este orçamento
            </label>
          )}
          {tipo === "orcamento" && osVinculada && !encerrar && (
            <p>
              Somente o orçamento será encerrado. A OS continuará com a situação e os
              valores atuais.
            </p>
          )}
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <div className="acoes-formulario">
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado}
              onClick={() => setAberto(false)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="botao-primario"
              disabled={ocupado || motivo.trim().length < 3}
              onClick={() => void confirmar()}
            >
              {ocupado ? "Registrando…" : "Confirmar encerramento"}
            </button>
          </div>
        </div>
      </Dialogo>
    </>
  );
}
