import { useState } from "react";
import "./PlanejamentoOperacional.css";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { rpc } from "../lib/rpc";
import { erroPublico } from "../lib/supabase";
import { Dialogo } from "./Dialogo";
type Registro = {
  id: string;
  anotacoes: string;
  iniciado_em: string | null;
  finalizado_em: string | null;
  criado_em: string;
};
const data = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR") : "Não registrado";
export function RegistrosAparelho({ documento }: { documento: string }) {
  const a = useAcesso(),
    [aberto, setAberto] = useState(false),
    [pagina, setPagina] = useState(0);
  const q = useQuery({
    queryKey: ["execucoes-aparelho", a.oficina?.id, documento, pagina],
    enabled: aberto && !!a.oficina,
    queryFn: ({ signal }) =>
      rpc<Registro[]>(
        "consultar_execucoes_aparelho",
        {
          p_oficina: a.oficina!.id,
          p_documento: documento,
          p_pagina: pagina,
        },
        signal,
      ),
  });
  return (
    <>
      <button
        type="button"
        className="botao-secundario"
        onClick={() => setAberto(true)}
      >
        Registros do aparelho
      </button>
      {aberto && (
        <Dialogo
          aberto
          titulo="Execuções registradas no aparelho"
          fechar={() => setAberto(false)}
        >
          <div className="plano-op">
            {q.isPending && <p>Carregando registros…</p>}
            {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
            {q.data?.length === 0 && <p>Nenhuma execução sincronizada.</p>}
            {q.data?.map((r) => (
              <article key={r.id}>
                <strong>Enviado em {data(r.criado_em)}</strong>
                <p>
                  Início: {data(r.iniciado_em)} · Fim: {data(r.finalizado_em)}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {r.anotacoes || "Sem anotações."}
                </p>
              </article>
            ))}
            <div className="plano-acoes">
              <button
                type="button"
                disabled={!pagina || q.isFetching}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={(q.data?.length || 0) < 30 || q.isFetching}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </Dialogo>
      )}
    </>
  );
}
