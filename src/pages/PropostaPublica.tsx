import { FotosPropostaPublica } from "../components/FotosPropostaPublica";
import "./Documentos.css";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText } from "lucide-react";
import { rpc, dinheiro, type Proposta } from "../services/orcamentos";
import { ConteudoProposta } from "../components/ConteudoProposta";
import { gerarPdf } from "../services/pdfOrcamento";
import { erroPublico } from "../lib/supabase";
export function PropostaPublica() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [nome, setNome] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const consulta = useQuery({
    queryKey: ["proposta-publica", token],
    queryFn: () =>
      rpc<Proposta>("consultar_orcamento_publico", { p_token: token }),
    retry: false,
    enabled: /^[0-9a-f]{64}$/.test(token),
    gcTime: 0,
    refetchInterval: 30000,
  });
  async function responder(decisao: string) {
    setErro("");
    setOcupado(true);
    try {
      await rpc("responder_orcamento", {
        p_token: token,
        p_nome: nome.trim(),
        p_decisao: decisao,
        p_confirmo: confirmo,
      });
      await consulta.refetch();
    } catch (e) {
      setErro(erroPublico(e));
      await consulta.refetch();
    } finally {
      setOcupado(false);
    }
  }
  return (
    <main className="pagina-proposta-publica">
      <header>
        <FileText size={22} />
        <strong>pátio.</strong>
        <span>Orçamento da sua oficina</span>
      </header>
      {!/^[0-9a-f]{64}$/.test(token) || consulta.isError ? (
        <section className="estado-acesso">
          <h1>Proposta indisponível</h1>
          <p>
            O link pode ter vencido, sido substituído ou cancelado. Peça um novo
            orçamento à oficina.
          </p>
        </section>
      ) : consulta.isPending ? (
        <p role="status">Carregando sua proposta…</p>
      ) : (
        consulta.data && (
          <>
            <FotosPropostaPublica token={token} />
            <ConteudoProposta q={consulta.data} />
            <button
              className="botao-secundario"
              onClick={() =>
                gerarPdf(consulta.data, window.location.href).save(
                  `orcamento-${consulta.data.numero}.pdf`,
                )
              }
            >
              Baixar orçamento em PDF
            </button>
            {consulta.data.situacao === "awaiting_approval" ? (
              <section className="resposta-proposta">
                <h2>Podemos seguir com o serviço?</h2>
                <p>
                  Você está respondendo à versão{" "}
                  {consulta.data.versao.numero_versao}, no valor de{" "}
                  <strong>
                    {dinheiro(consulta.data.versao.total_centavos)}
                  </strong>
                  .
                </p>
                <label>
                  Seu nome completo
                  <input
                    value={nome}
                    maxLength={160}
                    autoComplete="name"
                    disabled={ocupado}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </label>
                <label className="confirmar-proposta">
                  <input
                    type="checkbox"
                    checked={confirmo}
                    disabled={ocupado}
                    onChange={(e) => setConfirmo(e.target.checked)}
                  />
                  Li os itens, o valor e as condições e confirmo minha decisão
                  sobre esta proposta.
                </label>
                {erro && (
                  <p role="alert" className="erro-formulario">
                    {erro}
                  </p>
                )}
                <div className="acoes-formulario">
                  <button
                    className="botao-secundario"
                    disabled={ocupado || !confirmo || nome.trim().length < 2}
                    onClick={() => void responder("declined")}
                  >
                    Recusar orçamento
                  </button>
                  <button
                    className="botao-primario"
                    disabled={ocupado || !confirmo || nome.trim().length < 2}
                    onClick={() => void responder("approved")}
                  >
                    {ocupado ? "Registrando…" : "Aprovar orçamento"}
                  </button>
                </div>
                <small>
                  O link é pessoal. A confirmação registra o nome informado, a
                  decisão e a data.
                </small>
              </section>
            ) : (
              <section className="resposta-proposta">
                <CheckCircle2 size={28} />
                <h2>
                  {consulta.data.situacao === "approved"
                    ? "Orçamento aprovado"
                    : "Orçamento recusado"}
                </h2>
                <p>
                  Sua resposta foi registrada. A oficina já pode consultá-la.
                </p>
              </section>
            )}
          </>
        )
      )}
      <footer>Orçamento de serviços e peças · Não é documento fiscal.</footer>
    </main>
  );
}
