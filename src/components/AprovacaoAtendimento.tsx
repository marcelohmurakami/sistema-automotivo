import { useMemo, useRef, useState } from "react";
import { ComprovanteAutorizacao } from "./ComprovanteAutorizacao";
import { Check, Copy, Link, X } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { tokenSeguro, basePublica, linkSomenteLocal } from "../services/orcamentos";
import { rpc } from "../lib/rpc";
import { erroPublico } from "../lib/supabase";
import { orcamentoRecusado } from "../lib/apresentacaoDocumentoServico";
import { dinheiro } from "../lib/formatacao";
import { gruposDoAtendimento, itensDaProposta } from "../lib/aprovacaoServicos";
import { SelecaoGruposAtendimento } from "./SelecaoGruposAtendimento";
import type {
  DetalhesAtendimento,
  PropostaAtendimento,
} from "../types/servicosCompletos";

type Operar = (nome: string, args: Record<string, unknown>) => Promise<unknown>;
export function AprovacaoAtendimento({
  d,
  executar,
  ocupado,
}: {
  d: DetalhesAtendimento;
  executar: Operar;
  ocupado: boolean;
}) {
  const acesso = useAcesso();
  const a = d.atendimento;
  const itens = useMemo(
    () => itensDaProposta(d.itens, a.titulo, a.valor_centavos, a.id),
    [d.itens, a.titulo, a.valor_centavos, a.id],
  );
  const [grupos, setGrupos] = useState(() =>
    gruposDoAtendimento(itens).map((g) => g.nome),
  );
  const [editados, setEditados] = useState(d.itens);
  const [nome, setNome] = useState(d.cliente.nome);
  const [canal, setCanal] = useState("presencial");
  const [confirmo, setConfirmo] = useState(false);
  const [link, setLink] = useState("");
  const [validade, setValidade] = useState(7);
  const [expira, setExpira] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const travaLink = useRef(false);
  const gruposEditados = useMemo(() => gruposDoAtendimento(editados), [editados]);
  const bloqueado = ocupado || processando;
  const alterados = useMemo(
    () => JSON.stringify(editados) !== JSON.stringify(d.itens),
    [editados, d.itens],
  );
  async function compartilhar() {
    if (travaLink.current || ocupado) return;
    travaLink.current = true;
    setErro("");
    setMensagem("");
    setProcessando(true);
    try {
      if (acesso.demo)
        throw Error(
          "O link para o cliente fica disponível na conta real. Você pode testar a aprovação abaixo.",
        );
      const segredo = await tokenSeguro();
      const r = await rpc<{ expira_em: string }>("gerar_link_proposta_atendimento", {
        p_oficina: acesso.oficina!.id,
        p_atendimento: a.id,
        p_revisao: a.revisao,
        p_hash_token: segredo.hash,
        p_validade_dias: validade,
      });
      setLink(`${basePublica()}/aprovar-servico#${segredo.token}`);
      setExpira(r.expira_em);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      travaLink.current = false;
      setProcessando(false);
    }
  }
  return (
    <div className="aprovacao-servico">
      <h3>Aprovação do orçamento</h3>
      {orcamentoRecusado(a) && (
        <p role="status">
          O cliente recusou a última proposta. Revise os itens ou gere um novo link para
          solicitar outra decisão. A resposta anterior está no histórico.
        </p>
      )}
      <p>
        O cliente pode aprovar pelo link, sem criar conta. Se ele já autorizou,
        selecione os grupos e registre a autorização abaixo.
      </p>
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {mensagem && <p role="status">{mensagem}</p>}
      <div className="aprovacao-link">
        <div className="aprovacao-acoes">
          <label>
            Validade do link{" "}
            <select
              value={validade}
              disabled={bloqueado}
              onChange={(e) => setValidade(Number(e.target.value))}
            >
              {[1, 3, 7, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "dia" : "dias"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="botao-primario"
            disabled={bloqueado || alterados}
            onClick={() => void compartilhar()}
          >
            <Link size={17} />
            {processando ? "Preparando…" : "Gerar link de aprovação"}
          </button>
        </div>
        {link && (
          <>
            <label>
              Link para o cliente
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <small>
              Válido até {new Date(expira).toLocaleString("pt-BR")}. Ao gerar outro
              link, o anterior deixa de funcionar.
            </small>
            {linkSomenteLocal() && (
              <p>
                O cliente só conseguirá abrir este link fora deste computador depois da
                publicação do sistema.
              </p>
            )}
            <div className="aprovacao-acoes">
              <button
                type="button"
                disabled={bloqueado}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setMensagem("Link copiado.");
                  } catch {
                    setErro("Selecione o link acima e copie para enviar ao cliente.");
                  }
                }}
              >
                <Copy size={16} />
                Copiar link
              </button>
              <a
                className="botao-secundario"
                href={link}
                target="_blank"
                rel="noreferrer"
              >
                Visualizar como cliente
              </a>
            </div>
          </>
        )}
        <button
          type="button"
          className="botao-discreto"
          disabled={bloqueado || acesso.demo}
          onClick={async () => {
            if (travaLink.current || ocupado) return;
            travaLink.current = true;
            setProcessando(true);
            setErro("");
            try {
              await rpc("revogar_links_proposta_atendimento", {
                p_oficina: acesso.oficina!.id,
                p_atendimento: a.id,
              });
              setLink("");
              setMensagem("Links anteriores revogados.");
            } catch (e) {
              setErro(erroPublico(e));
            } finally {
              travaLink.current = false;
              setProcessando(false);
            }
          }}
        >
          <X size={16} />
          Revogar links anteriores
        </button>
      </div>
      <SelecaoGruposAtendimento
        taxa={d.taxa_diagnostico}
        itens={itens}
        desconto={d.itens.length ? d.comercial.desconto_centavos || 0 : 0}
        selecionados={grupos}
        bloqueado={bloqueado || alterados}
        alterar={(g) => {
          setGrupos(g);
          setConfirmo(false);
        }}
      />
      <label>
        Quem autorizou?
        <input
          value={nome}
          maxLength={160}
          disabled={bloqueado}
          onChange={(e) => {
            setNome(e.target.value);
            setConfirmo(false);
          }}
        />
      </label>
      <label>
        Como o cliente autorizou?
        <select
          value={canal}
          disabled={bloqueado}
          onChange={(e) => {
            setCanal(e.target.value);
            setConfirmo(false);
          }}
        >
          <option value="presencial">Presencialmente</option>
          <option value="telefone">Telefone</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">E-mail</option>
        </select>
      </label>
      <label className="aprovacao-confirmar">
        <input
          type="checkbox"
          checked={confirmo}
          disabled={bloqueado || alterados}
          onChange={(e) => setConfirmo(e.target.checked)}
        />
        O cliente autorizou os grupos e o valor selecionados.
      </label>
      <button
        type="button"
        className="botao-primario"
        disabled={
          bloqueado ||
          alterados ||
          !confirmo ||
          !grupos.length ||
          nome.trim().length < 2
        }
        onClick={async () => {
          setErro("");
          try {
            await executar("registrar_autorizacao_atendimento", {
              p_canal: canal,
              p_revisao: a.revisao,
              p_grupos: grupos,
              p_nome: nome.trim(),
              p_confirmo: confirmo,
            });
          } catch (e) {
            setErro(erroPublico(e));
          }
        }}
      >
        <Check size={17} />
        {ocupado ? "Registrando…" : "Confirmar autorização e abrir OS"}
      </button>
      {!!editados.length && (
        <details>
          <summary>Organizar grupos de aprovação (opcional)</summary>
          <div className="aprovacao-editar-grupos">
            <p>
              Dê o mesmo nome de grupo ao serviço e aos materiais que precisam ser
              aprovados juntos. Sem grupo, o item fica em “Atendimento”.
            </p>
            {editados.map((i) => (
              <div key={i.id}>
                <strong>{i.descricao}</strong>
                <div className="atendimento-campos">
                  <label>
                    Grupo
                    <input
                      maxLength={100}
                      value={i.grupo_servico || ""}
                      placeholder="Atendimento"
                      disabled={bloqueado}
                      onChange={(e) =>
                        setEditados(
                          editados.map((x) =>
                            x.id === i.id ? { ...x, grupo_servico: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Depende de outro grupo
                    <select
                      value={i.depende_grupo || ""}
                      disabled={bloqueado}
                      onChange={(e) =>
                        setEditados(
                          editados.map((x) =>
                            x.id === i.id ? { ...x, depende_grupo: e.target.value } : x,
                          ),
                        )
                      }
                    >
                      <option value="">Independente</option>
                      {gruposEditados
                        .filter(
                          (g) => g.nome !== (i.grupo_servico?.trim() || "Atendimento"),
                        )
                        .map((g) => (
                          <option key={g.nome}>{g.nome}</option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
            ))}
            {alterados && (
              <p role="status">
                Salve os grupos para atualizar a seleção e gerar o link.
              </p>
            )}
            <button
              type="button"
              disabled={bloqueado || !alterados}
              onClick={async () => {
                setErro("");
                try {
                  await executar("salvar_itens_atendimento", {
                    p_revisao: a.revisao,
                    p_itens: editados,
                    p_desconto: d.comercial.desconto_centavos || 0,
                    p_custo_extra: d.comercial.custo_extra_centavos || 0,
                    p_motivo: d.comercial.motivo_custo || "",
                  });
                } catch (e) {
                  setErro(erroPublico(e));
                }
              }}
            >
              Salvar grupos
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

export function HistoricoPropostasAtendimento({
  propostas,
}: {
  propostas: PropostaAtendimento[];
}) {
  return (
    <div className="aprovacao-historico">
      {propostas.map((p) => (
        <article key={p.id}>
          <strong>
            Orçamento · revisão {p.revisao} ·{" "}
            {p.decisao === "aprovado"
              ? "Autorizado"
              : p.decisao === "recusado"
                ? "Recusado"
                : "Enviado para aprovação"}
          </strong>
          {p.confirmado_em && (
            <p>
              {p.nome_informado} · {new Date(p.confirmado_em).toLocaleString("pt-BR")} ·{" "}
              {p.origem === "equipe"
                ? "Registrado pela equipe"
                : p.origem === "portal"
                  ? "Área do cliente"
                  : "Link do cliente"}
            </p>
          )}
          <p>
            Proposta original: {dinheiro(p.documento.total_centavos)}
            {p.decisao === "aprovado" && (
              <>
                {" "}
                · Autorizado:{" "}
                <strong>{dinheiro(p.total_aprovado_centavos || 0)}</strong>
              </>
            )}
          </p>
          <details>
            <summary>Ver todos os itens da proposta original</summary>
            <ul>
              {p.documento.itens.map((i) => (
                <li key={i.id}>
                  {i.descricao} · {i.quantidade.toLocaleString("pt-BR")} {i.unidade} ·{" "}
                  {dinheiro(Math.round(i.quantidade * i.preco_centavos))}
                  {p.decisao &&
                    ` · ${p.grupos_aprovados?.includes(i.grupo_servico || "Atendimento") ? "Autorizado" : "Não autorizado"}`}
                </li>
              ))}
            </ul>
          </details>
          <ComprovanteAutorizacao comprovante={p.comprovante} />
        </article>
      ))}
    </div>
  );
}
