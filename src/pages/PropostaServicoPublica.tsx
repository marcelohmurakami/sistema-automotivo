import { useState, useSyncExternalStore } from "react";
import { ComprovanteAutorizacao } from "../components/ComprovanteAutorizacao";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText } from "lucide-react";
import { rpc } from "../lib/rpc";
import { erroPublico } from "../lib/supabase";
import { dinheiro } from "../lib/formatacao";
import { gruposDoAtendimento } from "../lib/aprovacaoServicos";
import { SelecaoGruposAtendimento } from "../components/SelecaoGruposAtendimento";
import type { PropostaAtendimento } from "../types/servicosCompletos";

function observar(notificar: () => void) {
  window.addEventListener("hashchange", notificar);
  window.addEventListener("popstate", notificar);
  return () => {
    window.removeEventListener("hashchange", notificar);
    window.removeEventListener("popstate", notificar);
  };
}
export function PropostaServicoPublica() {
  const token = useSyncExternalStore(
    observar,
    () => window.location.hash.slice(1),
    () => "",
  );
  return <PropostaDoLink key={token} token={token} />;
}
function PropostaDoLink({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["proposta-servico-publica", token],
    queryFn: () =>
      rpc<PropostaAtendimento>("consultar_proposta_atendimento", { p_token: token }),
    enabled: /^[0-9a-f]{64}$/.test(token),
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  });
  return (
    <main className="proposta-servico-publica">
      <header>
        <FileText size={26} />
        <strong>{q.data?.documento.empresa.nome || "Orçamento de serviços"}</strong>
      </header>
      {!/^[0-9a-f]{64}$/.test(token) || q.isError ? (
        <section>
          <h1>Orçamento indisponível</h1>
          <p>
            O link pode ter vencido, sido substituído ou revogado. Peça um novo link à
            empresa.
          </p>
        </section>
      ) : q.isPending ? (
        <p role="status">Carregando orçamento…</p>
      ) : (
        q.data && (
          <Conteudo
            key={`${q.data.id}:${q.data.decisao || "pendente"}`}
            proposta={q.data}
            token={token}
            atualizar={async () => {
              await q.refetch();
            }}
          />
        )
      )}
      <footer>Orçamento de serviços e materiais · Não é documento fiscal.</footer>
    </main>
  );
}
function Conteudo({
  proposta: p,
  token,
  atualizar,
}: {
  proposta: PropostaAtendimento;
  token: string;
  atualizar: () => Promise<void>;
}) {
  const d = p.documento;
  const [grupos, setGrupos] = useState(
    p.grupos_aprovados || gruposDoAtendimento(d.itens).map((g) => g.nome),
  );
  const [nome, setNome] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  async function responder(decisao: "aprovado" | "recusado") {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await rpc("responder_link_proposta_atendimento", {
        p_token: token,
        p_nome: nome.trim(),
        p_decisao: decisao,
        p_grupos: grupos,
        p_confirmo: confirmo,
      });
      await atualizar();
    } catch (e) {
      setErro(erroPublico(e));
      await atualizar();
    } finally {
      setOcupado(false);
    }
  }
  return (
    <>
      <section className="aprovacao-servico">
        <h1>Orçamento #{d.numero}</h1>
        <strong>{d.cliente}</strong>
        <p>
          {d.objeto} · {d.data_servico.split("-").reverse().join("/")}
        </p>
        <p>{d.titulo}</p>
        {d.resumo && <p>{d.resumo}</p>}
        {p.expira_em && !p.decisao && (
          <small>Responda até {new Date(p.expira_em).toLocaleString("pt-BR")}.</small>
        )}
        <p>
          Proposta completa: <strong>{dinheiro(d.total_centavos)}</strong>
        </p>
      </section>
      <section className="aprovacao-servico">
        {p.decisao ? (
          <>
            <CheckCircle2 size={28} />
            <h2>
              {p.decisao === "aprovado"
                ? "Autorização registrada"
                : "Orçamento recusado"}
            </h2>
            <p>
              {p.nome_informado} · {new Date(p.confirmado_em!).toLocaleString("pt-BR")}
            </p>
            <p>A empresa já pode consultar sua resposta.</p>
          </>
        ) : (
          <>
            <h2>Quais serviços podemos realizar?</h2>
            <p>
              Escolha os grupos. O total abaixo considera somente o que você autorizar.
            </p>
          </>
        )}
        <SelecaoGruposAtendimento
          taxa={d.taxa_diagnostico}
          itens={d.itens}
          desconto={d.desconto_centavos}
          selecionados={grupos}
          bloqueado={ocupado || !!p.decisao}
          alterar={(g) => {
            setGrupos(g);
            setConfirmo(false);
            setErro("");
          }}
        />
        <ComprovanteAutorizacao comprovante={p.comprovante} />
        {!p.decisao && (
          <>
            {!grupos.length && (
              <p role="status">
                Selecione ao menos um grupo para aprovar ou escolha recusar o orçamento.
              </p>
            )}
            <label className="campo-nome">
              Seu nome completo
              <input
                autoComplete="name"
                value={nome}
                maxLength={160}
                disabled={ocupado}
                onChange={(e) => setNome(e.target.value)}
              />
            </label>
            <label className="aprovacao-confirmar">
              <input
                type="checkbox"
                checked={confirmo}
                disabled={ocupado}
                onChange={(e) => setConfirmo(e.target.checked)}
              />
              Conferi os itens e os valores e confirmo minha decisão.
            </label>
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <div className="aprovacao-acoes">
              <button
                className="botao-secundario"
                disabled={ocupado || !confirmo || nome.trim().length < 2}
                onClick={() => void responder("recusado")}
              >
                Recusar orçamento
              </button>
              <button
                className="botao-primario"
                disabled={
                  ocupado || !confirmo || !grupos.length || nome.trim().length < 2
                }
                onClick={() => void responder("aprovado")}
              >
                {ocupado ? "Registrando…" : "Autorizar serviços selecionados"}
              </button>
            </div>
            <small>
              Os grupos não selecionados ficam fora da autorização. O desconto é
              proporcional. Este link permite responder em seu nome; compartilhe somente
              com quem pode decidir.
            </small>
          </>
        )}
      </section>
    </>
  );
}
