import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso, nomesPlanos, type Plano } from "../auth/contexto";
import { supabase } from "../lib/supabase";
type Dados = {
  habilitado: boolean;
  vinculada: boolean;
  ambiente: "teste" | "producao";
  precos: Record<Plano, number>;
  assinatura: null | {
    situacao: string;
    cancelar_no_fim: boolean;
    periodo_final: string | null;
  };
  eventos: {
    tipo: string;
    codigo_plano: Plano;
    situacao: string;
    criado_em: string;
  }[];
};
const estados: Record<string, string> = {
  active: "Ativa",
  trialing: "Em avaliação",
  past_due: "Pagamento atrasado",
  cancelled: "Cancelada",
  suspended: "Suspensa",
};
async function chamar(oficina: string, acao: string, plano?: Plano) {
  const { data, error } = await supabase!.functions.invoke("cobranca-oficina", {
    body: { oficina, acao, plano },
  });
  if (error) {
    let mensagem = "Não foi possível acessar a cobrança. Tente novamente mais tarde.";
    if (error.context instanceof Response) {
      try {
        const resposta = await error.context.json();
        if (typeof resposta.erro === "string") mensagem = resposta.erro;
      } catch {
        /* Não exibir resposta técnica. */
      }
    }
    throw new Error(mensagem);
  }
  if (
    acao === "consultar" &&
    (!data || typeof data.habilitado !== "boolean" || !Array.isArray(data.eventos))
  )
    throw new Error(
      "O serviço de cobrança retornou uma resposta incompleta. Tente novamente.",
    );
  return data;
}
export function CobrancaAssinatura() {
  const acesso = useAcesso(),
    oficina = acesso.oficina!;
  const [plano, setPlano] = useState<Plano>(oficina.codigo_plano);
  const [enviando, setEnviando] = useState(false),
    [erro, setErro] = useState("");
  const consulta = useQuery({
    queryKey: ["cobranca-provedor", oficina.id],
    queryFn: () => chamar(oficina.id, "consultar") as Promise<Dados>,
    enabled: !acesso.demo && oficina.perfil === "owner",
    retry: false,
    refetchInterval: 30000,
  });
  if (acesso.demo || oficina.perfil !== "owner") return null;
  async function abrir(acao: "checkout" | "portal") {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const resultado = await chamar(oficina.id, acao, plano);
      const url = new URL(resultado.url);
      if (
        url.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw new Error("Endereço de cobrança inválido.");
      window.location.assign(url.href);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a cobrança.");
      setEnviando(false);
    }
  }
  return (
    <section className="painel-cobranca" aria-label="Assinatura e pagamentos">
      <div className="sobretitulo">ASSINATURA DO PÁTIO</div>
      <h2>Plano e pagamentos</h2>
      {consulta.isPending ? (
        <p role="status">Consultando assinatura…</p>
      ) : consulta.isError ? (
        <p role="alert">
          Não foi possível consultar o serviço de cobrança.{" "}
          <button className="botao-texto" onClick={() => void consulta.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <>
          {!consulta.data.habilitado ? (
            <p>
              A contratação online está em preparação. Nenhuma cobrança será feita por
              esta tela enquanto o serviço não for configurado.
            </p>
          ) : (
            <>
              {consulta.data.ambiente === "teste" && (
                <p className="nota-demo">
                  Stripe em modo de teste. Utilize somente os dados de teste do
                  provedor; não há cobrança real.
                </p>
              )}
              {consulta.data.assinatura?.cancelar_no_fim && (
                <p>
                  Cancelamento agendado para{" "}
                  {consulta.data.assinatura.periodo_final
                    ? new Date(
                        consulta.data.assinatura.periodo_final,
                      ).toLocaleDateString("pt-BR")
                    : "o fim do período contratado"}
                  . O acesso permanece conforme a situação e a validade da assinatura.
                </p>
              )}
              <div className="campos-cobranca">
                <label>
                  Plano desejado
                  <select
                    disabled={enviando}
                    value={plano}
                    onChange={(e) => setPlano(e.target.value as Plano)}
                  >
                    {(Object.keys(nomesPlanos) as Plano[]).map((p) => (
                      <option key={p} value={p}>
                        {nomesPlanos[p]} ·{" "}
                        {(consulta.data.precos[p] / 100).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                        /mês
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="acoes-cobranca">
                <button
                  className="botao-primario"
                  disabled={enviando}
                  onClick={() => void abrir("checkout")}
                >
                  {enviando
                    ? "Abrindo…"
                    : consulta.data.ambiente === "teste"
                      ? "Abrir checkout de teste"
                      : "Contratar plano"}
                </button>
                {consulta.data.vinculada && (
                  <button
                    className="botao-secundario"
                    disabled={enviando}
                    onClick={() => void abrir("portal")}
                  >
                    Gerenciar assinatura
                  </button>
                )}
              </div>
              <p>
                Troca de plano, atualização do cartão, faturas e cancelamento ficam no
                portal de gerenciamento. Após pagar, aguarde a confirmação do provedor;
                voltar para esta página não confirma o pagamento.
              </p>
            </>
          )}
          {!!consulta.data.eventos.length && (
            <>
              <h3>Atualizações da assinatura</h3>
              <ul className="historico-cobranca">
                {consulta.data.eventos.map((e, i) => (
                  <li key={`${e.criado_em}-${i}`}>
                    <strong>
                      {nomesPlanos[e.codigo_plano]} ·{" "}
                      {estados[e.situacao] || "Atualizada"}
                    </strong>
                    <time dateTime={e.criado_em}>
                      {new Date(e.criado_em).toLocaleString("pt-BR")}
                    </time>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
    </section>
  );
}
