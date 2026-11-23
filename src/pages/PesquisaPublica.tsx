import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Star, CheckCircle2 } from "lucide-react";
import { rpc } from "../lib/rpc";
import { erroPublico } from "../lib/supabase";
import "./QualidadeAvancada.css";
export function PesquisaPublica() {
  const { token = "" } = useParams();
  const q = useQuery({
    queryKey: ["pesquisa-publica", token],
    enabled: !!token,
    queryFn: ({ signal }) =>
      rpc<{ empresa: string; respondida: boolean } | null>(
        "consultar_pesquisa_publica",
        { p_token: token },
        signal,
      ),
    retry: false,
  });
  const [nota, setNota] = useState(0),
    [comentario, setComentario] = useState(""),
    [recusa, setRecusa] = useState(false),
    [salvando, setSalvando] = useState(false),
    [feito, setFeito] = useState(false),
    [erro, setErro] = useState("");
  return (
    <main className="qa-publica">
      <section className="qa-pesquisa-card">
        {q.isLoading ? (
          <p role="status">Abrindo pesquisa…</p>
        ) : q.isError ? (
          <>
            <h1>Não foi possível abrir agora</h1>
            <p role="alert">Confira sua conexão e tente novamente.</p>
            <button onClick={() => void q.refetch()} className="botao-primario">
              Tentar novamente
            </button>
          </>
        ) : !q.data ? (
          <>
            <h1>Pesquisa indisponível</h1>
            <p>Este link expirou ou foi revogado. Entre em contato com a empresa.</p>
          </>
        ) : feito || q.data.respondida ? (
          <>
            <CheckCircle2 size={40} />
            <h1>Obrigado pela sua avaliação!</h1>
            <p>Sua resposta foi registrada.</p>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!nota || salvando) return;
              setSalvando(true);
              setErro("");
              try {
                await rpc("responder_pesquisa_qualidade", {
                  p_token: token,
                  p_nota: nota,
                  p_comentario: comentario,
                  p_recusa_contato: recusa,
                });
                setFeito(true);
              } catch (e) {
                setErro(erroPublico(e));
              } finally {
                setSalvando(false);
              }
            }}
          >
            <p>{q.data.empresa}</p>
            <h1>Como foi seu atendimento?</h1>
            <p>De muito insatisfeito a muito satisfeito.</p>
            <fieldset disabled={salvando}>
              <legend>Sua nota</legend>
              <div className="qa-notas">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className={nota === n ? "selecionada" : ""}>
                    <input
                      type="radio"
                      name="nota"
                      value={n}
                      checked={nota === n}
                      onChange={() => setNota(n)}
                      required
                      aria-label={`Nota ${n}`}
                    />
                    <Star size={24} fill={nota >= n ? "currentColor" : "none"} />
                    <span>{n}</span>
                  </label>
                ))}
              </div>
              <label>
                Quer contar mais? (opcional)
                <textarea
                  maxLength={2000}
                  rows={4}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="O que foi bom e o que podemos melhorar?"
                />
              </label>
              <label className="qa-checkbox">
                <input
                  type="checkbox"
                  checked={recusa}
                  onChange={(e) => setRecusa(e.target.checked)}
                />
                Não quero receber novos convites de pesquisa.
              </label>
              <p className="qa-ajuda">
                A empresa verá esta avaliação para melhorar o atendimento. Sua resposta
                não será publicada.
              </p>
              {erro && <p role="alert">{erro}</p>}
              <button className="botao-primario" disabled={!nota || salvando}>
                {salvando ? "Enviando…" : "Enviar avaliação"}
              </button>
            </fieldset>
          </form>
        )}
      </section>
    </main>
  );
}
