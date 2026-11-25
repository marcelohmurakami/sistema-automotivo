import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { PecasNaEntrega } from "./PecasNaEntrega";
import { faltaOrigemPeca } from "../lib/origemPecas";
import { erroPublico } from "../lib/supabase";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { consultarDetalhesAtendimento } from "../services/servicosCompletos";
import { entregarAposCriacao } from "../services/entregaAposCriacao";
import "./PagamentoAposRegistro.css";

export function EntregaAposCriacao({
  tipo,
  id,
  fechar,
  aoEntregar,
}: {
  tipo: "os" | "atendimento";
  id: string;
  fechar: () => void;
  aoEntregar: () => void;
}) {
  const a = useAcesso(),
    oficina = a.oficina!.id,
    qc = useQueryClient();
  const emCampo = ["manutencao_campo", "limpeza"].includes(a.oficina!.ramo || "");
  const [recebedor, setRecebedor] = useState<string>();
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const [conferirPecas, setConferirPecas] = useState(false);
  const trava = useRef(false);
  const q = useQuery({
    queryKey: ["destinatario-entrega-criacao", a.demo, oficina, id],
    queryFn: () => consultarDetalhesAtendimento(a.demo, oficina, id),
    enabled: tipo === "atendimento",
  });
  async function concluir() {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await entregarAposCriacao(
        a.demo,
        oficina,
        tipo,
        id,
        recebedor ?? q.data?.cliente.nome ?? "",
      );
      void atualizarIntegracoes(qc, []);
      setConferirPecas(false);
      aoEntregar();
    } catch (e) {
      if (tipo === "os" && faltaOrigemPeca(e)) setConferirPecas(true);
      else {
        setConferirPecas(false);
        setErro(erroPublico(e));
      }
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <>
      <Dialogo
        aberto={!conferirPecas}
        fechar={() => !trava.current && fechar()}
        titulo={
          emCampo
            ? "O cliente já conferiu e aceitou o serviço?"
            : "O serviço já foi entregue ao cliente?"
        }
        classe="dialogo-pagamento-registro"
      >
        <p>
          {emCampo
            ? "Se ainda não, o serviço continua aguardando o aceite."
            : "Se ainda não, a OS fica em Prontas, aguardando entrega."}
        </p>
        {tipo === "atendimento" && (
          <>
            {q.isPending ? (
              <p role="status">Consultando o cliente…</p>
            ) : q.isError ? (
              <p role="alert">
                {erroPublico(q.error)}{" "}
                <button onClick={() => void q.refetch()}>Tentar novamente</button>
              </p>
            ) : (
              <label className="entrega-criacao-destinatario">
                {emCampo ? "Quem conferiu o serviço?" : "Quem recebeu o equipamento?"}
                <input
                  maxLength={1500}
                  value={recebedor ?? q.data?.cliente.nome ?? ""}
                  onChange={(e) => setRecebedor(e.target.value)}
                  disabled={ocupado}
                />
              </label>
            )}
          </>
        )}
        {erro && <p role="alert">{erro}</p>}
        <div className="compra-acoes">
          <button
            className="botao-primario"
            disabled={
              ocupado ||
              (tipo === "atendimento" &&
                (!q.data || !(recebedor ?? q.data.cliente.nome).trim()))
            }
            onClick={() => void concluir()}
          >
            {ocupado
              ? "Salvando…"
              : emCampo
                ? "Sim, já foi aceito"
                : "Sim, já foi entregue"}
          </button>
          <button className="botao-secundario" disabled={ocupado} onClick={fechar}>
            Não, deixar aguardando
          </button>
        </div>
      </Dialogo>
      {conferirPecas && (
        <PecasNaEntrega
          osId={id}
          fechar={() => setConferirPecas(false)}
          continuar={concluir}
        />
      )}
    </>
  );
}
