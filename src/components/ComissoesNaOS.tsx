import { dinheiro } from "../lib/formatacao";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BadgePercent } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { erroPublico } from "../lib/supabase";
import { hoje } from "../services/financeiro";
import { SecaoRecolhivel } from "./SecaoRecolhivel";

import type { OrdemServico } from "../services/ordensServico";
import {
  consultarComissoes,
  definirComissoesOS,
  textoRegra,
  situacaoComissao,
  type Comissao,
  type PainelComissoes,
} from "../services/comissoes";
import "./Comissoes.css";

export function ComissoesNaOS({ os }: { os: OrdemServico }) {
  const a = useAcesso(),
    [editando, setEditando] = useState(false);
  const permitido =
    a.permite("finance") && ["owner", "manager"].includes(a.oficina!.perfil);
  const q = useQuery({
    queryKey: ["comissoes", a.oficina!.id, "os", os.id, os.revisao],
    queryFn: () => consultarComissoes(a.oficina!.id, hoje(), hoje(), "", os.id),
    enabled: permitido && !a.demo,
    refetchInterval: 30000,
  });
  if (!permitido) return null;
  if (a.demo)
    return (
      <section className="os-secao">
        <h3>Comissões</h3>
        <p>
          Entre na conta da empresa para atribuir profissionais e acompanhar as
          comissões deste serviço.
        </p>
      </section>
    );
  const encerrada = ["delivered", "cancelled"].includes(os.situacao);
  return (
    <section className="comissoes os-secao" aria-label="Comissões desta OS">
      <div className="comissoes-topo">
        <div>
          <h3>
            <BadgePercent size={20} /> Comissão sobre a mão de obra
          </h3>
          <p>Escolha quem fez a mão de obra. As peças não entram no cálculo.</p>
        </div>
      </div>
      {q.isPending ? (
        <p>Carregando comissões…</p>
      ) : q.isError ? (
        <div role="alert" className="erro-formulario">
          {erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </div>
      ) : (
        q.data && (
          <>
            {editando ? (
              <Atribuicoes os={os} dados={q.data} fechar={() => setEditando(false)} />
            ) : (
              <>
                {!q.data.profissionais.length ? (
                  <div className="comissoes-vazio">
                    <h3>Cadastre os profissionais primeiro</h3>
                    <p>O proprietário escolhe as regras em Financeiro → Comissões.</p>
                  </div>
                ) : (
                  <>
                    {!q.data.itens.length ? (
                      <p className="texto-suave">
                        Nenhum profissional atribuído. Defina as comissões antes de
                        entregar a OS.
                      </p>
                    ) : (
                      <ResumoComissoes itens={q.data.itens} />
                    )}
                    {!encerrada && (
                      <button
                        className="botao-primario"
                        onClick={() => setEditando(true)}
                        disabled={
                          !os.itens.some(
                            (i) => i.tipo === "service" && i.situacao !== "cancelled",
                          )
                        }
                      >
                        {q.data.itens.length ? "Alterar comissão" : "Definir comissão"}
                      </button>
                    )}
                    {!encerrada &&
                      !os.itens.some(
                        (i) => i.tipo === "service" && i.situacao !== "cancelled",
                      ) && <p>Adicione um serviço à OS para atribuir uma comissão.</p>}
                  </>
                )}
                {encerrada && (
                  <p className="texto-suave">
                    OS encerrada: as regras e os profissionais registrados foram
                    preservados.
                  </p>
                )}
                <Link
                  className="botao-secundario"
                  to={`/financeiro?aba=comissoes&os=${os.id}`}
                >
                  Ver comissões no financeiro
                </Link>
              </>
            )}
          </>
        )
      )}
    </section>
  );
}

function ResumoComissoes({ itens }: { itens: Comissao[] }) {
  const grupos = new Map<string, Comissao[]>();
  for (const item of itens) {
    const grupo = grupos.get(item.profissional_id) ?? [];
    grupo.push(item);
    grupos.set(item.profissional_id, grupo);
  }
  return (
    <>
      {Array.from(grupos, ([id, comissoes]) => (
        <article className="comissao-regra" key={id}>
          <div>
            <strong>{comissoes[0].nome_profissional}</strong>
            <small>
              {comissoes.every((c) => textoRegra(c) === textoRegra(comissoes[0]))
                ? textoRegra(comissoes[0])
                : "Regras diferentes por serviço"}
            </small>
          </div>
          <strong>
            {dinheiro(comissoes.reduce((s, c) => s + c.prevista_centavos, 0))}
          </strong>
        </article>
      ))}
      <SecaoRecolhivel titulo="Avançado · conferir por serviço">
        {itens.map((c) => (
          <article className="comissao-regra" key={c.id}>
            <div>
              <strong>{c.descricao_servico}</strong>
              <span>{c.nome_profissional}</span>
              <small>{textoRegra(c)}</small>
              <small>{situacaoComissao(c)}</small>
            </div>
            <strong>{dinheiro(c.prevista_centavos)}</strong>
          </article>
        ))}
      </SecaoRecolhivel>
    </>
  );
}

function Atribuicoes({
  os,
  dados,
  fechar,
}: {
  os: OrdemServico;
  dados: PainelComissoes;
  fechar: () => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient();
  const [servicos] = useState(() =>
    os.itens.filter((i) => i.tipo === "service" && i.situacao !== "cancelled"),
  );
  const [revisao] = useState(os.revisao),
    [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false);
  const [escolhas, setEscolhas] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      servicos.map((i) => [
        i.id,
        dados.itens.find((c) => c.item_id === i.id)?.profissional_id ?? "",
      ]),
    ),
  );
  const profissionaisSelecionados = new Set(Object.values(escolhas));
  const todos =
    profissionaisSelecionados.size === 1 ? Object.values(escolhas)[0] : "diversos";
  const regrasSelecionadas = servicos.flatMap((i) => {
    const atual = dados.itens.find((c) => c.item_id === i.id);
    const regra =
      atual?.profissional_id === escolhas[i.id]
        ? atual
        : dados.profissionais.find((p) => p.id === escolhas[i.id]);
    return regra ? [textoRegra(regra)] : [];
  });
  const regras = [...new Set(regrasSelecionadas)];
  const trava = useRef(false);
  async function salvar() {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await definirComissoesOS(
        a.oficina!.id,
        os.id,
        revisao,
        servicos.map((i) => ({
          item_id: i.id,
          profissional_id: escolhas[i.id] || null,
        })),
      );
      await atualizarIntegracoes(qc, [
        "comissoes",
        "os-detalhe",
        "lucro-documento",
        "financeiro-historico",
      ]);
      fechar();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <form
      className="formulario-cliente"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <fieldset disabled={ocupado}>
        <label>
          Profissional da mão de obra
          <select
            aria-label="Profissional da mão de obra"
            value={todos}
            onChange={(e) =>
              setEscolhas(
                Object.fromEntries(servicos.map((i) => [i.id, e.target.value])),
              )
            }
          >
            <option value="">Sem comissão</option>
            {todos === "diversos" && (
              <option value="diversos" disabled>
                Distribuição por serviço
              </option>
            )}
            {dados.profissionais
              .filter((p) => p.ativo || p.id === todos)
              .map((p) => (
                <option key={p.id} value={p.id} disabled={!p.ativo}>
                  {p.nome}
                  {!p.ativo ? " (inativo)" : ""}
                </option>
              ))}
          </select>
        </label>
        <p className="comissao-resumo-simples" role="status">
          {todos === "diversos"
            ? "Serviços escolhidos individualmente. Confira em Avançado."
            : todos
              ? regras.length === 1
                ? `${regras[0]}. Aplicada a todos os serviços da OS.`
                : "Todos os serviços atribuídos. As regras já registradas foram preservadas; confira em Avançado."
              : "Escolha o profissional para aplicar a porcentagem dele a toda a mão de obra."}
        </p>
        <SecaoRecolhivel titulo="Avançado · selecionar serviços">
          {servicos.map((i) => {
            const atual = dados.itens.find((c) => c.item_id === i.id),
              regra =
                atual?.profissional_id === escolhas[i.id]
                  ? atual
                  : dados.profissionais.find((p) => p.id === escolhas[i.id]);
            return (
              <label className="comissao-atribuicao" key={i.id}>
                <strong>{i.descricao}</strong>
                <select
                  aria-label={`Profissional de ${i.descricao}`}
                  value={escolhas[i.id]}
                  onChange={(e) =>
                    setEscolhas((s) => ({ ...s, [i.id]: e.target.value }))
                  }
                >
                  <option value="">Sem comissão</option>
                  {dados.profissionais
                    .filter((p) => p.ativo || p.id === atual?.profissional_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {!p.ativo ? " (inativo)" : ""}
                      </option>
                    ))}
                </select>
                {regra && <small>{textoRegra(regra)}</small>}
              </label>
            );
          })}
          <p className="texto-suave">
            Atribua cada serviço ou deixe sem comissão. Peças não entram no cálculo.
          </p>
        </SecaoRecolhivel>
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro} Para carregar a versão atual, volte e abra novamente as atribuições.
          </p>
        )}
        <div className="comissao-acoes">
          <button type="button" className="botao-secundario" onClick={fechar}>
            Voltar
          </button>
          <button className="botao-primario" disabled={ocupado}>
            {ocupado ? "Salvando…" : "Salvar comissões"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
