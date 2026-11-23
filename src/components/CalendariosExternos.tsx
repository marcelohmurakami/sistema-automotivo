import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { rpc } from "../lib/rpc";
import { erroPublico } from "../lib/supabase";
import { Dialogo } from "./Dialogo";
import "./PlanejamentoOperacional.css";
type Assinatura = {
  id: string;
  nome: string;
  recurso: string;
  detalhes: boolean;
  criado_em: string;
};
export function CalendariosExternos() {
  const a = useAcesso();
  return a.demo || a.oficina?.perfil === "staff" ? null : (
    <Configuracao key={a.oficina!.id} />
  );
}
function Configuracao() {
  const a = useAcesso(),
    w = a.oficina!.id,
    [aberto, setAberto] = useState(false),
    [novo, setNovo] = useState(false),
    [url, setUrl] = useState(""),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [copiado, setCopiado] = useState(false),
    [pedido, setPedido] = useState({ id: "", token: "" });
  const gerenciar = (
    acao = "listar",
    id?: string,
    dados: Record<string, unknown> = {},
  ) =>
    rpc<{ itens: Assinatura[] }>("gerenciar_assinatura_calendario", {
      p_oficina: w,
      p_acao: acao,
      p_id: id ?? null,
      p_dados: dados,
    });
  const q = useQuery({
    queryKey: ["assinaturas-calendario", w],
    queryFn: () => gerenciar(),
    enabled: aberto,
  });
  return (
    <section className="plano-op">
      <details onToggle={(e) => setAberto(e.currentTarget.open)}>
        <summary>Google Calendar e Outlook</summary>
        <p>
          Acompanhe a agenda e os deslocamentos no seu calendário. Os horários são
          editados aqui no sistema; o aplicativo externo define a frequência de
          atualização.
        </p>
        <p>
          Inclui os últimos 30 dias e os próximos 12 meses. O link dá acesso de leitura
          a quem o receber. Você pode revogá-lo a qualquer momento.
        </p>
        {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
        {erro && !novo && <p role="alert">{erro}</p>}
        {q.data?.itens.map((s) => (
          <div className="plano-linha" key={s.id}>
            <span>
              <strong>{s.nome}</strong>
              <br />
              <small>
                {s.recurso || "Toda a equipe"} ·{" "}
                {s.detalhes ? "Com cliente e serviço" : "Somente horários ocupados"}
              </small>
            </span>
            <button
              className="botao-secundario"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErro("");
                try {
                  await gerenciar("revogar", s.id);
                  await q.refetch();
                  setUrl("");
                } catch (e) {
                  setErro(erroPublico(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Revogar link
            </button>
          </div>
        ))}
        <button
          className="botao-secundario"
          onClick={() => {
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            setPedido({
              id: crypto.randomUUID(),
              token: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
            });
            setUrl("");
            setErro("");
            setCopiado(false);
            setNovo(true);
          }}
        >
          Criar assinatura da agenda
        </button>
        <details>
          <summary>Como adicionar ao calendário</summary>
          <ol>
            <li>
              No Google Calendar, pelo computador: Outros calendários → + → Do URL. Cole
              o link e adicione.
            </li>
            <li>
              No Outlook: Adicionar calendário → Assinar da Web. Cole o link e confirme.
            </li>
          </ol>
          <p>
            Use a assinatura por URL para receber atualizações. Importar um arquivo .ics
            cria apenas uma cópia. Revogar interrompe novas consultas; cópias já
            baixadas devem ser removidas no calendário externo.
          </p>
          <a
            href="https://support.google.com/calendar/answer/37100?hl=pt-BR"
            target="_blank"
            rel="noreferrer"
          >
            Ajuda do Google
          </a>
          {" · "}
          <a
            href="https://support.microsoft.com/pt-br/office/importar-ou-assinar-um-calend%C3%A1rio-no-outlook-com-ou-outlook-na-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c"
            target="_blank"
            rel="noreferrer"
          >
            Ajuda do Outlook
          </a>
        </details>
      </details>
      {novo && (
        <Dialogo
          aberto
          titulo="Assinar a agenda"
          fechar={() => {
            if (!busy) {
              setNovo(false);
              setUrl("");
            }
          }}
        >
          {url ? (
            <div className="plano-op">
              <p>
                Guarde este link no calendário desejado. Ele será mostrado somente nesta
                criação.
              </p>
              <label>
                Link privado
                <input readOnly value={url} onFocus={(e) => e.target.select()} />
              </label>
              <button
                className="botao-primario"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopiado(true);
                  } catch {
                    setErro("Selecione o link acima e copie.");
                  }
                }}
              >
                {copiado ? "Link copiado" : "Copiar link"}
              </button>
              <a href={url} target="_blank" rel="noreferrer">
                Baixar arquivo da agenda (.ics)
              </a>
              {erro && <p role="alert">{erro}</p>}
            </div>
          ) : (
            <form
              className="plano-op"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setErro("");
                try {
                  await gerenciar("criar", pedido.id, {
                    token: pedido.token,
                    nome: f.get("nome"),
                    recurso: f.get("recurso"),
                    detalhes: f.has("detalhes"),
                  });
                  setUrl(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendario-externo?token=${pedido.token}`,
                  );
                  await q.refetch();
                } catch (err) {
                  setErro(erroPublico(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  Nome da assinatura
                  <input
                    name="nome"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Ex.: Minha agenda de visitas"
                  />
                </label>
                <label>
                  Equipe ou responsável (opcional)
                  <input
                    name="recurso"
                    maxLength={120}
                    placeholder="Nome exato da agenda; vazio inclui toda a equipe"
                  />
                </label>
                <label className="plano-check">
                  <input name="detalhes" type="checkbox" />
                  Incluir nome do cliente, serviço e destino
                </label>
                <p>
                  Por padrão, compartilha somente os horários ocupados. Esta assinatura
                  não permite alterar os agendamentos.
                </p>
                {erro && <p role="alert">{erro}</p>}
                <button className="botao-primario">
                  {busy ? "Criando…" : "Criar link privado"}
                </button>
              </fieldset>
            </form>
          )}
        </Dialogo>
      )}
    </section>
  );
}
