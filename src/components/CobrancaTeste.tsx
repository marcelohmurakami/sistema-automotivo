import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso, nomesPlanos, type Plano } from "../auth/contexto";
import { supabase, erroPublico } from "../lib/supabase";

type Acao = "aprovar" | "recusar" | "atrasar" | "cancelar";
type Dados = {
  habilitado: boolean;
  precos: Record<Plano, number>;
  eventos: {
    id: string;
    acao: Acao;
    codigo_plano: Plano;
    valor_centavos: number;
    situacao_resultante: string;
    criado_em: string;
  }[];
};
const nomes: Record<Acao, string> = {
  aprovar: "Pagamento aprovado",
  recusar: "Pagamento recusado",
  atrasar: "Assinatura em atraso",
  cancelar: "Assinatura cancelada",
};
const moeda = (valor: number) =>
  (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CobrancaTeste() {
  const acesso = useAcesso();
  const oficina = acesso.oficina!;
  const consultas = useQueryClient();
  const [plano, setPlano] = useState<Plano>(oficina.codigo_plano);
  const [acao, setAcao] = useState<Acao>("aprovar");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const consulta = useQuery({
    queryKey: ["cobranca-teste", oficina.id],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("consultar_cobranca_teste", {
        p_oficina: oficina.id,
      });
      if (error) throw error;
      return data as Dados;
    },
    enabled: !acesso.demo && oficina.perfil === "owner",
  });
  if (acesso.demo || oficina.perfil !== "owner") return null;
  if (consulta.isPending) return <p role="status">Consultando cobrança…</p>;
  if (consulta.isError)
    return (
      <p role="alert">
        Não foi possível consultar a cobrança.{" "}
        <button className="botao-texto" onClick={() => void consulta.refetch()}>
          Tentar novamente
        </button>
      </p>
    );
  if (!consulta.data.habilitado)
    return (
      <p className="texto-suave">
        Contratação comercial ainda não habilitada. Sua assinatura atual
        continua sendo validada pelo banco.
      </p>
    );
  const dados = consulta.data;
  async function confirmar() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    setSucesso("");
    try {
      const { error } = await supabase!.rpc("simular_cobranca", {
        p_oficina: oficina.id,
        p_chave: chave,
        p_acao: acao,
        p_plano: plano,
      });
      if (error) throw error;
      setConfirmando(false);
      setChave(crypto.randomUUID());
      setSucesso("Simulação registrada. Nenhum valor foi cobrado.");
      await acesso.atualizar();
      await consultas.invalidateQueries();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <section className="painel-cobranca" aria-label="Cobrança de homologação">
      <div className="sobretitulo">AMBIENTE DE TESTE · SEM COBRANÇA REAL</div>
      <h2>Teste sua assinatura</h2>
      <p>
        As simulações alteram o acesso desta oficina. Aprovar libera o plano por
        30 dias; atraso e cancelamento bloqueiam os módulos. Você pode voltar
        aqui e aprovar novamente para liberar o acesso. Uma recusa mantém a
        assinatura atual.
      </p>
      <div className="campos-cobranca">
        <label>
          Plano
          <select
            disabled={enviando || confirmando}
            value={plano}
            onChange={(e) => {
              setPlano(e.target.value as Plano);
              setChave(crypto.randomUUID());
            }}
          >
            {(Object.keys(nomesPlanos) as Plano[]).map((p) => (
              <option value={p} key={p}>
                {nomesPlanos[p]} · {moeda(dados.precos[p])}/mês
              </option>
            ))}
          </select>
        </label>
        <label>
          Cenário
          <select
            disabled={enviando || confirmando}
            value={acao}
            onChange={(e) => {
              setAcao(e.target.value as Acao);
              setChave(crypto.randomUUID());
            }}
          >
            {(Object.keys(nomes) as Acao[]).map((a) => (
              <option value={a} key={a}>
                {nomes[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {confirmando ? (
        <div className="nota-demo">
          <p>
            Confirmar “{nomes[acao]}” para {oficina.nome}?{" "}
            {acao === "aprovar" && `O plano será ${nomesPlanos[plano]}.`}
          </p>
          <div className="acoes-cobranca">
            <button
              className="botao-primario"
              onClick={() => void confirmar()}
              disabled={enviando}
            >
              {enviando ? "Registrando…" : "Confirmar simulação"}
            </button>
            <button
              className="botao-secundario"
              disabled={enviando}
              onClick={() => {
                setConfirmando(false);
                setChave(crypto.randomUUID());
                setErro("");
              }}
            >
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <button
          className="botao-primario"
          onClick={() => {
            setConfirmando(true);
            setSucesso("");
          }}
        >
          Simular cenário
        </button>
      )}
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {sucesso && <p role="status">{sucesso}</p>}
      <h3>Histórico de testes</h3>
      {!dados.eventos.length ? (
        <p>Nenhuma simulação registrada.</p>
      ) : (
        <ul className="historico-cobranca">
          {dados.eventos.map((e) => (
            <li key={e.id}>
              <strong>{nomes[e.acao]}</strong>
              <span>
                {nomesPlanos[e.codigo_plano]} · valor simulado{" "}
                {moeda(e.valor_centavos)}
              </span>
              <time dateTime={e.criado_em}>
                {new Date(e.criado_em).toLocaleString("pt-BR")}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
