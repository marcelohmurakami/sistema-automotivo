import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList } from "lucide-react";
import { rpc } from "../lib/rpc";
import { dinheiro } from "../lib/formatacao";
import { erroPublico } from "../lib/supabase";
import { estadosServico } from "../services/servicos";
import { gruposDoAtendimento, itensDaProposta } from "../lib/aprovacaoServicos";
import { SelecaoGruposAtendimento } from "./SelecaoGruposAtendimento";
import { ComprovanteAutorizacao } from "./ComprovanteAutorizacao";
import type {
  TaxaDiagnostico,
  ComprovanteAutorizacao as Comprovante,
} from "../lib/diagnosticoOrcamento";
export type AtendimentoCliente = {
  id: string;
  numero: number;
  titulo: string;
  situacao: keyof typeof estadosServico;
  data_servico: string;
  concluido_em: string | null;
  valor_centavos: number;
  resumo: string;
  revisao: number;
  objeto: string;
  itens: {
    id?: string;
    tipo?: "servico" | "material";
    grupo_servico?: string;
    depende_grupo?: string;
    descricao: string;
    quantidade: number;
    unidade: string;
    preco_centavos: number;
  }[];
  desconto_centavos: number;
  taxa_diagnostico?: TaxaDiagnostico;
  resposta?: {
    decisao: "aprovado" | "recusado";
    nome_informado: string;
    confirmado_em: string;
    total_aprovado_centavos: number;
    comprovante?: Comprovante;
  } | null;
};
export function AtendimentosCliente({
  oficina,
  itens,
}: {
  oficina: string;
  itens: AtendimentoCliente[];
}) {
  return (
    <div className="portal-servicos">
      <h3>Seus atendimentos</h3>
      {!itens.length ? (
        <p>Nenhum atendimento compartilhado até o momento.</p>
      ) : (
        itens.map((a) => (
          <Cartao key={`${a.id}:${a.revisao}`} a={a} oficina={oficina} />
        ))
      )}
    </div>
  );
}
function Cartao({ a, oficina }: { a: AtendimentoCliente; oficina: string }) {
  const itens = itensDaProposta(
    a.itens.map((i, n) => ({
      ...i,
      id: i.id || `${a.id}:${n}`,
      tipo: i.tipo || "servico",
    })),
    a.titulo,
    a.valor_centavos,
    a.id,
  );
  const [grupos, setGrupos] = useState(gruposDoAtendimento(itens).map((g) => g.nome));
  const [nome, setNome] = useState("");
  const qc = useQueryClient(),
    [confirmado, setConfirmado] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  async function aprovar(decisao: "aprovado" | "recusado") {
    if (!confirmado || ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await rpc("responder_meu_orcamento_servico", {
        p_oficina: oficina,
        p_atendimento: a.id,
        p_revisao: a.revisao,
        p_grupos: grupos,
        p_nome: nome.trim(),
        p_decisao: decisao,
        p_confirmo: confirmado,
      });
      await qc.invalidateQueries({ queryKey: ["meu-portal", oficina] });
    } catch (e) {
      setErro(erroPublico(e));
      await qc.invalidateQueries({ queryKey: ["meu-portal", oficina] });
    } finally {
      setOcupado(false);
    }
  }
  return (
    <article className="atendimento-publico">
      <header>
        <ClipboardList size={22} />
        <div>
          <h3>
            #{a.numero} · {a.titulo}
          </h3>
          <p>
            {a.objeto} · {a.data_servico.split("-").reverse().join("/")}
          </p>
        </div>
        <strong>{estadosServico[a.situacao]}</strong>
      </header>
      {a.resumo && <p className="atendimento-publico-resumo">{a.resumo}</p>}
      <details>
        <summary>Serviços, materiais e valores</summary>
        <ul>
          {a.itens.map((i, j) => (
            <li key={j}>
              <span>
                {i.descricao} · {i.quantidade.toLocaleString("pt-BR")} {i.unidade}
              </span>
              <strong>{dinheiro(Math.round(i.quantidade * i.preco_centavos))}</strong>
            </li>
          ))}
        </ul>
        {a.desconto_centavos > 0 && <p>Desconto: {dinheiro(a.desconto_centavos)}</p>}
        <p>
          <strong>Total: {dinheiro(a.valor_centavos)}</strong>
        </p>
      </details>
      {a.resposta && (
        <p role="status">
          {a.resposta.decisao === "aprovado"
            ? "Autorização registrada"
            : "Orçamento recusado"}{" "}
          por {a.resposta.nome_informado}, em{" "}
          {new Date(a.resposta.confirmado_em).toLocaleString("pt-BR")}.
        </p>
      )}
      <ComprovanteAutorizacao comprovante={a.resposta?.comprovante} />
      {a.situacao === "orcamento" && !a.resposta && (
        <div className="atendimento-publico-aprovar">
          <SelecaoGruposAtendimento
            taxa={a.taxa_diagnostico}
            itens={itens}
            desconto={a.itens.length ? a.desconto_centavos : 0}
            selecionados={grupos}
            bloqueado={ocupado}
            alterar={(g) => {
              setGrupos(g);
              setConfirmado(false);
            }}
          />
          <label>
            Seu nome completo
            <input
              autoComplete="name"
              maxLength={160}
              value={nome}
              disabled={ocupado}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
          <label className="aprovacao-confirmar">
            <input
              type="checkbox"
              checked={confirmado}
              disabled={ocupado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            Conferi os serviços e os valores selecionados e confirmo minha decisão.
          </label>
          <button
            className="botao-primario"
            disabled={
              !confirmado || ocupado || !grupos.length || nome.trim().length < 2
            }
            onClick={() => void aprovar("aprovado")}
          >
            <Check size={17} />
            {ocupado ? "Registrando…" : "Autorizar serviços selecionados"}
          </button>
          <button
            className="botao-secundario"
            disabled={!confirmado || ocupado || nome.trim().length < 2}
            onClick={() => void aprovar("recusado")}
          >
            Recusar orçamento
          </button>
        </div>
      )}
      {erro && <p role="alert">{erro}</p>}
    </article>
  );
}
