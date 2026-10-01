import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { rpc } from "../services/orcamentos";
import { supabase, erroPublico } from "../lib/supabase";
import "./Documentos.css";
type Aviso = {
  id: string;
  mensagem: string;
  situacao: string;
  cliente: string;
  telefone: string | null;
  criado_em: string;
};
const status: Record<string, string> = {
  revisao: "Aguardando sua revisão",
  aprovado: "Aprovado para envio",
  enviando: "Enviando",
  enviado: "Enviado ao provedor",
  incerto: "Confira o envio no WhatsApp",
  cancelado: "Cancelado",
};
export function Automacoes() {
  const a = useAcesso();
  const [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [texto, setTexto] = useState(""),
    [sugestao, setSugestao] = useState("");
  const historico = useQuery({
    queryKey: ["sugestoes-ia", a.usuario, a.oficina!.id, a.demo],
    enabled: !a.demo,
    queryFn: () =>
      rpc<
        {
          id: string;
          situacao: string;
          criado_em: string;
          sugestao: string | null;
        }[]
      >("consultar_sugestoes_ia", { p_oficina: a.oficina!.id }),
  });
  const gerente = a.oficina?.perfil !== "staff";
  const q = useQuery({
    queryKey: ["automacoes", a.oficina!.id, a.demo],
    enabled: gerente,
    queryFn: async () =>
      a.demo
        ? []
        : rpc<Aviso[]>("consultar_automacoes", { p_oficina: a.oficina!.id }),
    refetchInterval: 30000,
  });
  async function revisar(aviso: Aviso, aprovar: boolean) {
    setBusy(true);
    setErro("");
    try {
      await rpc("revisar_aviso", {
        p_oficina: a.oficina!.id,
        p_id: aviso.id,
        p_aprovar: aprovar,
      });
      await q.refetch();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="documentos-pagina">
      <header className="titulo-pagina">
        <div>
          <div className="sobretitulo">MENOS DIGITAÇÃO, MAIS ATENDIMENTO</div>
          <h1>
            Assistente e automações<span>.</span>
          </h1>
          <p>
            Transforme anotações em explicações claras e revise os avisos aos
            clientes.
          </p>
        </div>
      </header>
      {erro && <p role="alert">{erro}</p>}
      <section className="os-painel">
        <h2>Escrever uma explicação com IA</h2>
        <p>
          Informe apenas o serviço e os fatos observados, sem nome, telefone ou
          placa. Revise a sugestão antes de usar; ela não altera a OS nem envia
          mensagens.
        </p>
        <form
          className="documentos-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErro("");
            setSugestao("");
            try {
              const { data, error } = await supabase!.functions.invoke(
                "assistente-oficina",
                {
                  body: {
                    oficina: a.oficina!.id,
                    chave: crypto.randomUUID(),
                    texto,
                  },
                },
              );
              if (error)
                throw new Error(
                  "IA indisponível. Confira a configuração do serviço e o limite diário.",
                );
              if (data.erro) throw new Error(data.erro);
              setSugestao(data.sugestao);
              await historico.refetch();
            } catch (e) {
              setErro(erroPublico(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            O que foi observado ou realizado?
            <textarea
              required
              minLength={10}
              maxLength={3000}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={5}
            />
          </label>
          <button
            className="botao-primario"
            disabled={busy || a.demo || !a.permite("ai")}
          >
            {busy ? "Processando…" : "Gerar sugestão"}
          </button>
          {a.demo && (
            <p>A IA funciona com a conta real e o serviço configurado.</p>
          )}
        </form>
        {sugestao && (
          <div>
            <h3>Sugestão para sua revisão</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{sugestao}</p>
            <button
              className="botao-secundario"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(sugestao);
                } catch {
                  setErro(
                    "Não foi possível copiar. Selecione o texto para copiar.",
                  );
                }
              }}
            >
              Copiar sugestão
            </button>
          </div>
        )}
      </section>
      {historico.data && historico.data.length > 0 && (
        <section className="os-painel">
          <h2>Suas últimas sugestões</h2>
          {historico.data.map((h) => (
            <details key={h.id}>
              <summary>
                {new Date(h.criado_em).toLocaleString("pt-BR")} ·{" "}
                {h.situacao === "succeeded"
                  ? "Concluída"
                  : h.situacao === "failed"
                    ? "Não concluída"
                    : "Em processamento"}
              </summary>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {h.sugestao || "Nenhuma sugestão disponível."}
              </p>
            </details>
          ))}
        </section>
      )}
      {gerente && (
        <section className="os-painel">
          <h2>Avisos aos clientes</h2>
          <p>
            Andamentos da OS geram avisos para revisão. O agendador n8n gera
            lembretes dos orçamentos sem resposta há um dia. Após aprovação, o
            envio depende do canal WhatsApp configurado e do destinatário
            autorizado.
          </p>
          {q.isError ? (
            <p role="alert">{erroPublico(q.error)}</p>
          ) : q.data?.length ? (
            q.data.map((v) => (
              <article className="os-painel" key={v.id}>
                <small>{status[v.situacao]}</small>
                <h3>{v.cliente}</h3>
                <p>{v.telefone || "Sem telefone cadastrado"}</p>
                <p>{v.mensagem}</p>
                {v.situacao === "revisao" && (
                  <div className="acoes-proposta">
                    <button
                      disabled={busy || !v.telefone}
                      className="botao-primario"
                      onClick={() => void revisar(v, true)}
                    >
                      Autorizar envio ao cliente
                    </button>
                    <button
                      disabled={busy}
                      className="botao-secundario"
                      onClick={() => void revisar(v, false)}
                    >
                      Cancelar aviso
                    </button>
                  </div>
                )}
                {v.situacao === "incerto" && (
                  <p>
                    Não há reenvio automático. Confira a conversa para evitar
                    mensagens duplicadas.
                  </p>
                )}
              </article>
            ))
          ) : (
            <p>Nenhum aviso por enquanto.</p>
          )}
        </section>
      )}
    </div>
  );
}
