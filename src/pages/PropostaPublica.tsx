import { rpc } from "../lib/rpc";
import { abatimentoDiagnostico } from "../lib/diagnosticoOrcamento";
import { ResumoTaxaDiagnostico } from "../components/TaxaDiagnostico";
import { dinheiro } from "../lib/formatacao";
import {
  gruposOrcamento,
  incluirDependencias,
  retirarGrupo,
  valorSelecionado,
} from "../lib/orcamentoInteligente";
import "./OficinaAgil.css";
import { FotosPropostaPublica } from "../components/FotosPropostaPublica";
import "./Documentos.css";
import { useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText } from "lucide-react";
import { type Proposta } from "../services/orcamentos";
import { ConteudoProposta } from "../components/ConteudoProposta";
import { erroPublico } from "../lib/supabase";
function observarLink(notificar: () => void) {
  window.addEventListener("hashchange", notificar);
  window.addEventListener("popstate", notificar);
  return () => {
    window.removeEventListener("hashchange", notificar);
    window.removeEventListener("popstate", notificar);
  };
}
const lerToken = () => window.location.hash.slice(1);
export function PropostaPublica() {
  const token = useSyncExternalStore(observarLink, lerToken, () => "");
  return <PropostaDoLink key={token} token={token} />;
}
function PropostaDoLink({ token }: { token: string }) {
  const [nome, setNome] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const respondendo = useRef(false);
  const gerandoPdf = useRef(false);
  const [pdfOcupado, setPdfOcupado] = useState(false);
  const [erroPdf, setErroPdf] = useState("");
  const consulta = useQuery({
    queryKey: ["proposta-publica", token],
    queryFn: ({ signal }) =>
      rpc<Proposta>("consultar_orcamento_publico", { p_token: token }, signal),
    retry: false,
    enabled: /^[0-9a-f]{64}$/.test(token),
    gcTime: 0,
    refetchInterval: 30000,
  });
  const [escolha, setEscolha] = useState<string[] | null>(null);
  const grupos = consulta.data ? gruposOrcamento(consulta.data.itens) : [];
  const escolhidos = escolha ?? grupos.map((g) => g.nome);
  const totalAntesDaTaxa = consulta.data
    ? valorSelecionado(
        consulta.data.itens,
        consulta.data.versao.desconto_centavos,
        escolhidos,
      ).total
    : 0;
  const totalEscolhido =
    totalAntesDaTaxa -
    abatimentoDiagnostico(consulta.data?.versao.taxa_diagnostico, totalAntesDaTaxa);
  async function responder(decisao: string) {
    if (respondendo.current) return;
    if (decisao === "approved" && !escolhidos.length) {
      setErro("Escolha ao menos um grupo.");
      return;
    }
    setErro("");
    respondendo.current = true;
    setOcupado(true);
    try {
      await rpc("responder_grupos_orcamento", {
        p_grupos: escolhidos,
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
      respondendo.current = false;
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
              disabled={pdfOcupado}
              onClick={async () => {
                if (gerandoPdf.current) return;
                gerandoPdf.current = true;
                setPdfOcupado(true);
                setErroPdf("");
                try {
                  const { gerarPdf } = await import("../services/pdfOrcamento");
                  gerarPdf(consulta.data, window.location.href).save(
                    `orcamento-${consulta.data.numero}.pdf`,
                  );
                } catch (e) {
                  setErroPdf(erroPublico(e));
                } finally {
                  gerandoPdf.current = false;
                  setPdfOcupado(false);
                }
              }}
            >
              {pdfOcupado ? "Gerando PDF…" : "Baixar orçamento em PDF"}
            </button>
            {erroPdf && <p role="alert">{erroPdf}</p>}
            {consulta.data.situacao === "awaiting_approval" ? (
              <section className="resposta-proposta">
                <h2>Podemos seguir com o serviço?</h2>
                <p>
                  Você está respondendo à versão {consulta.data.versao.numero_versao},
                  no valor de <strong>{dinheiro(totalEscolhido)}</strong>.
                </p>
                {grupos.map((g) => (
                  <label className="agil-grupo" key={g.nome}>
                    <input
                      type="checkbox"
                      checked={escolhidos.includes(g.nome)}
                      disabled={ocupado}
                      onChange={(e) => {
                        setConfirmo(false);
                        setErro("");
                        setEscolha(
                          e.target.checked
                            ? incluirDependencias(consulta.data!.itens, [
                                ...escolhidos,
                                g.nome,
                              ])
                            : retirarGrupo(consulta.data!.itens, escolhidos, g.nome),
                        );
                      }}
                    />
                    <span>
                      {g.nome}
                      <small>
                        {g.dependencias.length
                          ? `Necessita também: ${g.dependencias.join(", ")}`
                          : "Pode ser aprovado separadamente"}
                      </small>
                    </span>
                    <strong>{dinheiro(g.subtotal)}</strong>
                  </label>
                ))}
                <small>
                  O desconto é proporcional aos grupos escolhidos. Serviços não
                  selecionados ficam fora da autorização.
                </small>
                {!escolhidos.length && (
                  <p role="status">
                    Selecione ao menos um grupo para aprovar ou escolha recusar o
                    orçamento.
                  </p>
                )}
                <ResumoTaxaDiagnostico
                  taxa={consulta.data.versao.taxa_diagnostico}
                  total={totalAntesDaTaxa}
                />
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
                  Li os itens, o valor e as condições e confirmo minha decisão sobre
                  esta proposta.
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
                    disabled={
                      ocupado ||
                      !confirmo ||
                      !escolhidos.length ||
                      nome.trim().length < 2
                    }
                    onClick={() => void responder("approved")}
                  >
                    {ocupado ? "Registrando…" : "Aprovar serviços selecionados"}
                  </button>
                </div>
                <small>
                  O link é pessoal. A confirmação registra o nome informado, a decisão e
                  a data.
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
                <p>Sua resposta foi registrada. A oficina já pode consultá-la.</p>
              </section>
            )}
          </>
        )
      )}
      <footer>Orçamento de serviços e peças · Não é documento fiscal.</footer>
    </main>
  );
}
