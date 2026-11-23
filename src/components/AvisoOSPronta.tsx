import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import {
  eventoOSPronta,
  linkWhatsAppPronta,
  type AvisoOSPronta as Registro,
} from "../lib/avisoOSPronta";
import { consultarOS } from "../services/ordensServico";
import { erroPublico } from "../lib/supabase";
import { Dialogo } from "./Dialogo";
function Pergunta({ registro, fechar }: { registro: Registro; fechar: () => void }) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["aviso-os-pronta", a.demo, registro.oficina, registro.id],
    queryFn: ({ signal }) => consultarOS(a.demo, registro.oficina, registro.id, signal),
    staleTime: 0,
  });
  const o = q.data,
    link = o
      ? linkWhatsAppPronta(
          o.dados_cliente.telefone_e164,
          o.dados_cliente.nome ?? "",
          o.numero,
        )
      : null;
  return (
    <Dialogo aberto fechar={fechar} titulo="Avisar o cliente que está pronto?">
      {q.isPending ? (
        <p role="status">Buscando o telefone do cliente…</p>
      ) : q.isError ? (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button type="button" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <>
          <p>
            A OS <strong>#{o?.numero}</strong> está pronta. Deseja avisar{" "}
            <strong>{o?.dados_cliente.nome || "o cliente"}</strong> pelo WhatsApp?
          </p>
          {link ? (
            <>
              <p className="texto-suave">
                A conversa será aberta com a mensagem pronta. Você confirma o envio no
                WhatsApp.
              </p>
              <div className="compra-acoes">
                <a
                  className="botao-primario"
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={fechar}
                >
                  Sim, abrir WhatsApp
                </a>
                <button className="botao-secundario" onClick={fechar}>
                  Agora não
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                O cliente está sem um telefone válido. Cadastre o número com DDD na OS
                para poder avisá-lo.
              </p>
              <div className="compra-acoes">
                <Link
                  className="botao-secundario"
                  to={`/ordens-servico?os=${registro.id}`}
                  onClick={fechar}
                >
                  Abrir OS
                </Link>
                <button className="botao-secundario" onClick={fechar}>
                  Fechar
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Dialogo>
  );
}
export function AvisoOSPronta({ pausado = false }: { pausado?: boolean }) {
  const a = useAcesso(),
    [fila, setFila] = useState<Registro[]>([]);
  useEffect(() => {
    const receber = (e: Event) => {
      const r = (e as CustomEvent<Registro>).detail;
      if (r.oficina === a.oficina?.id)
        setFila((f) =>
          f.some((x) => x.id === r.id && x.oficina === r.oficina) ? f : [...f, r],
        );
    };
    window.addEventListener(eventoOSPronta, receber);
    return () => window.removeEventListener(eventoOSPronta, receber);
  }, [a.oficina?.id]);
  const atual = fila.find((r) => r.oficina === a.oficina?.id);
  return atual && !pausado ? (
    <Pergunta
      key={`${atual.oficina}:${atual.id}`}
      registro={atual}
      fechar={() => setFila((f) => f.filter((r) => r !== atual))}
    />
  ) : null;
}
