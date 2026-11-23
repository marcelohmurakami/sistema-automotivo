import { rpc } from "../lib/rpc";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { erroPublico } from "../lib/supabase";
import type { Vistoria } from "../services/produtividade";
import "./Documentos.css";
export function VistoriaPublica() {
  const [token] = useState(() => window.location.hash.slice(1)),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["vistoria-publica", token],
    enabled: !!token,
    queryFn: ({ signal }) =>
      rpc<{
        oficina: string;
        numero: number;
        veiculo: { modelo: string; placa: string };
        dados: Vistoria["dados"];
        confirmado_em: string | null;
        nome_confirmacao: string | null;
      }>("consultar_vistoria_publica", { p_token: token }, signal),
    retry: false,
  });
  return (
    <main className="site-publico">
      <section className="os-painel">
        <h1>Vistoria de entrada</h1>
        {!token || q.isError ? (
          <p role="alert">
            Link indisponível ou vencido. Solicite um novo link à oficina.
          </p>
        ) : q.isPending ? (
          <p>Carregando…</p>
        ) : (
          <>
            <h2>
              {q.data.oficina} · OS #{q.data.numero}
            </h2>
            <p>
              {q.data.veiculo.modelo} · {q.data.veiculo.placa}
            </p>
            <p>Combustível: {q.data.dados.combustivel}%</p>
            <p>Pertences: {q.data.dados.pertences || "Nenhum informado"}</p>
            <h3>Avarias registradas</h3>
            {q.data.dados.avarias.map((a, i) => (
              <p key={i}>
                {a.local}: {a.descricao}
              </p>
            ))}
            {!q.data.dados.avarias.length && <p>Nenhuma avaria descrita.</p>}
            {q.data.confirmado_em ? (
              <p role="status">Vistoria confirmada por {q.data.nome_confirmacao}.</p>
            ) : (
              <form
                className="documentos-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setErro("");
                  try {
                    await rpc("confirmar_vistoria", {
                      p_token: token,
                      p_nome: f.get("nome"),
                      p_confirmo: f.get("confirmo") === "on",
                    });
                    await q.refetch();
                  } catch (e) {
                    setErro(erroPublico(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <fieldset disabled={busy}>
                  <label>
                    Seu nome
                    <input name="nome" required minLength={2} maxLength={160} />
                  </label>
                  <label>
                    <input type="checkbox" name="confirmo" required />
                    Conferi as informações e confirmo esta vistoria de entrada.
                  </label>
                  <button className="botao-primario">Confirmar vistoria</button>
                </fieldset>
              </form>
            )}
          </>
        )}
        {erro && <p role="alert">{erro}</p>}
      </section>
    </main>
  );
}
