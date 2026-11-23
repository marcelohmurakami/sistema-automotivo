import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { consultarDetalhesAtendimento } from "../services/servicosCompletos";
import { telefoneWhatsAppPronta } from "../lib/avisoOSPronta";
import { Dialogo } from "./Dialogo";
export function AvisoAtendimentoConcluido({ pausado = false }: { pausado?: boolean }) {
  const acesso = useAcesso(),
    [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const receber = (e: Event) => {
      const d = (e as CustomEvent<{ oficina: string; id: string }>).detail;
      if (d.oficina === acesso.oficina?.id) setId(d.id);
    };
    window.addEventListener("patio:atendimento-concluido", receber);
    return () => window.removeEventListener("patio:atendimento-concluido", receber);
  }, [acesso.oficina?.id]);
  const q = useQuery({
    queryKey: ["detalhes-atendimento", acesso.oficina?.id, id],
    queryFn: ({ signal }) =>
      consultarDetalhesAtendimento(acesso.demo, acesso.oficina!.id, id!, signal),
    enabled: !!id,
  });
  if (!id || pausado) return null;
  const nome = q.data?.cliente.nome,
    telefone = telefoneWhatsAppPronta(q.data?.cliente.telefone || undefined);
  const link = telefone
    ? `https://wa.me/${telefone}?text=${encodeURIComponent(`Olá${nome ? ", " + nome : ""}! Seu atendimento ${q.data?.atendimento.titulo || ""} foi concluído. Entre em contato para combinarmos os próximos passos.`)}`
    : null;
  return (
    <Dialogo
      aberto
      fechar={() => setId(null)}
      titulo="Avisar o cliente que o serviço foi concluído?"
    >
      {q.isPending ? (
        <p>Consultando o telefone…</p>
      ) : q.isError ? (
        <p role="alert">
          Não foi possível consultar o telefone. Você pode tentar novamente pela ficha
          do cliente.
        </p>
      ) : (
        <>
          <p>
            O atendimento foi concluído. Deseja abrir a conversa com{" "}
            {nome || "o cliente"} no WhatsApp?
          </p>
          {link ? (
            <>
              <p>Você revisa a mensagem e confirma o envio no WhatsApp.</p>
              <a
                className="botao-primario"
                href={link}
                target="_blank"
                rel="noreferrer"
                onClick={() => setId(null)}
              >
                Sim, abrir WhatsApp
              </a>
            </>
          ) : (
            <p>
              Cadastre um telefone com DDD na ficha do cliente para usar esta opção.
            </p>
          )}
        </>
      )}
      <button className="botao-secundario" onClick={() => setId(null)}>
        Agora não
      </button>
    </Dialogo>
  );
}
