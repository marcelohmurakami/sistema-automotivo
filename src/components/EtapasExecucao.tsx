import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { rpc } from "../lib/rpc";
import { dinheiro } from "../lib/formatacao";
import { perfilAtendimento } from "../lib/perfisAtendimento";
import { useAgora } from "../lib/useAgora";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";

import type { OrdemServico } from "../services/ordensServico";
import {
  consultarEtapas,
  salvarEtapa,
  novaEtapa,
  type EtapaExecucao,
} from "../services/oficinaAgil";
import { listarFornecedores } from "../services/compras";
import { Dialogo } from "./Dialogo";
import "../pages/OficinaAgil.css";
const nomes: Record<string, string> = {
  pendente: "A fazer",
  em_andamento: "Em execução",
  aguardando_terceiro: "Com terceiro",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export function EtapasExecucao({
  os,
  atualizar,
}: {
  os: OrdemServico;
  atualizar: () => void;
}) {
  const agora = useAgora();
  const a = useAcesso(),
    cache = useQueryClient(),
    [edit, setEdit] = useState<EtapaExecucao | null>(null),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [busca, setBusca] = useState("");
  const trava = useRef(false);
  const perfil = perfilAtendimento(
    os.ficha_especialidade?.especialidade || a.oficina?.especialidade,
    a.oficina?.ramo,
  );
  const q = useQuery({
    queryKey: ["etapas-execucao", a.oficina!.id, os.id],
    queryFn: ({ signal }) => consultarEtapas(a.oficina!.id, os.id, signal),
    enabled: !a.demo,
    refetchInterval: 30000,
  });
  const termoConsulta1 = useBuscaDebounced(busca);
  const f = useQuery({
    queryKey: ["fornecedores-etapas", a.oficina!.id, termoConsulta1],
    queryFn: ({ signal }) =>
      listarFornecedores(false, a.oficina!.id, termoConsulta1, false, 0, signal),
    enabled: !!edit && !a.demo && a.permite("inventory"),
  });
  const encerrada = ["delivered", "cancelled"].includes(os.situacao),
    lista = q.data ?? [],
    concluidas = lista.filter((e) =>
      ["concluida", "cancelada"].includes(e.situacao),
    ).length;
  async function gravar(acao: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    try {
      await acao();
      await Promise.all(
        ["etapas-execucao", "mapa-oficina", "financeiro", "financeiro-os", "os"].map(
          (k) => cache.invalidateQueries({ queryKey: [k] }),
        ),
      );
      setEdit(null);
      atualizar();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  if (a.demo)
    return (
      <p>
        Etapas compartilhadas e serviços terceirizados estão disponíveis na conta real.
      </p>
    );
  return (
    <section className="agil-pagina">
      <header className="agil-cabecalho">
        <div>
          <h2>Etapas e terceiros</h2>
          <p>Acompanhe o serviço, os responsáveis e os terceiros.</p>
        </div>
        <div className="agil-acoes">
          {!lista.length && (
            <button
              className="botao-secundario"
              disabled={busy || encerrada}
              onClick={() =>
                void gravar(() =>
                  rpc("modelo_etapas_especialidade", {
                    p_oficina: a.oficina!.id,
                    p_os: os.id,
                  }),
                )
              }
            >
              Usar etapas · {perfil.nome}
            </button>
          )}
          <button
            className="botao-primario"
            disabled={busy || encerrada}
            onClick={() => {
              setErro("");
              setEdit(novaEtapa(lista.length));
            }}
          >
            Adicionar etapa
          </button>
        </div>
      </header>
      {(erro || q.isError) && (
        <p role="alert" className="agil-alerta">
          {erro || erroPublico(q.error)}
        </p>
      )}
      {q.isPending && <p role="status">Carregando etapas…</p>}
      {!!lista.length && (
        <>
          <div className="agil-progresso">
            <span style={{ width: `${(concluidas / lista.length) * 100}%` }} />
          </div>
          <small>
            {concluidas} de {lista.length} etapas encerradas
          </small>
        </>
      )}
      {lista.map((e) => {
        const atrasada =
          !!e.prazo &&
          Date.parse(e.prazo) < +agora &&
          !["concluida", "cancelada"].includes(e.situacao);
        return (
          <article className={`agil-etapa ${atrasada ? "atrasada" : ""}`} key={e.id}>
            <div className="agil-cabecalho">
              <div>
                <small>
                  {nomes[e.situacao]}
                  {atrasada ? " · PRAZO VENCIDO" : ""}
                </small>
                <h3>{e.nome}</h3>
                <p>
                  {e.responsavel || "Defina o responsável"}
                  {e.fornecedor ? ` · ${e.fornecedor}` : ""}
                </p>
                {e.prazo && (
                  <small>Prazo: {new Date(e.prazo).toLocaleString("pt-BR")}</small>
                )}
                {e.observacoes && <p>{e.observacoes}</p>}
                {e.custo_centavos > 0 && (
                  <p>
                    Custo previsto: {dinheiro(e.custo_centavos)} ·{" "}
                    {e.titulo_financeiro_id
                      ? "Conta criada no financeiro"
                      : "Ainda não lançado no financeiro"}
                  </p>
                )}
              </div>
              <button
                className="botao-secundario"
                disabled={busy || encerrada}
                onClick={() => {
                  setErro("");
                  setEdit(e);
                }}
              >
                Atualizar
              </button>
            </div>
          </article>
        );
      })}
      {!lista.length && !q.isPending && (
        <p>
          Crie somente as etapas que ajudam sua equipe. Para reparos simples, uma etapa
          pode ser suficiente.
        </p>
      )}
      {edit && (
        <Dialogo
          aberto
          titulo={edit.revisao ? "Atualizar etapa" : "Nova etapa"}
          fechar={() => !busy && setEdit(null)}
        >
          <form
            className="agil-pagina"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void gravar(() =>
                salvarEtapa(
                  a.oficina!.id,
                  os.id,
                  {
                    ...edit,
                    nome: String(form.get("nome")),
                    situacao: String(form.get("situacao")),
                    responsavel: String(form.get("responsavel")),
                    fornecedor_id: String(form.get("fornecedor")) || null,
                    prazo: form.get("prazo")
                      ? new Date(String(form.get("prazo"))).toISOString()
                      : null,
                    custo_centavos: Math.round(Number(form.get("custo")) * 100),
                    observacoes: String(form.get("observacoes")),
                  },
                  {
                    gerar_conta: form.get("gerar_conta") === "on",
                    vencimento: form.get("vencimento"),
                  },
                ),
              );
            }}
          >
            <fieldset disabled={busy}>
              <div className="agil-grade">
                <label>
                  Etapa
                  <input
                    name="nome"
                    required
                    minLength={2}
                    maxLength={120}
                    defaultValue={edit.nome}
                  />
                </label>
                <label>
                  Situação
                  <select name="situacao" defaultValue={edit.situacao}>
                    {Object.entries(nomes).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsável
                  <input
                    name="responsavel"
                    maxLength={120}
                    defaultValue={edit.responsavel}
                  />
                </label>
                <label>
                  Prazo
                  <input
                    name="prazo"
                    type="datetime-local"
                    defaultValue={
                      edit.prazo
                        ? new Date(
                            Date.parse(edit.prazo) -
                              new Date(edit.prazo).getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                  />
                </label>
              </div>
              <details className="agil-detalhes" open={!!edit.fornecedor_id}>
                <summary>Serviço feito por um terceiro</summary>
                <label>
                  Buscar fornecedor
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome ou documento"
                  />
                </label>
                <label>
                  Fornecedor
                  <select name="fornecedor" defaultValue={edit.fornecedor_id || ""}>
                    <option value="">Equipe da oficina</option>
                    {edit.fornecedor_id &&
                      !f.data?.itens.some((x) => x.id === edit.fornecedor_id) && (
                        <option value={edit.fornecedor_id}>{edit.fornecedor}</option>
                      )}
                    {f.data?.itens.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <Link to="/fornecedores">Cadastrar fornecedor</Link>
                <label>
                  Custo total (R$)
                  <input
                    type="number"
                    name="custo"
                    min={0}
                    max={1000000}
                    step="0.01"
                    defaultValue={edit.custo_centavos / 100}
                  />
                </label>
                {!edit.titulo_financeiro_id && a.oficina!.perfil !== "staff" && (
                  <>
                    <label className="agil-grupo">
                      <input name="gerar_conta" type="checkbox" />
                      Gerar conta a pagar ao concluir a etapa
                    </label>
                    <label>
                      Vencimento
                      <input type="date" name="vencimento" />
                    </label>
                  </>
                )}
                {edit.titulo_financeiro_id && (
                  <p>A conta já está no financeiro. Ela não será duplicada.</p>
                )}
              </details>
              <label>
                Observação
                <textarea
                  name="observacoes"
                  maxLength={2000}
                  defaultValue={edit.observacoes}
                />
              </label>
            </fieldset>
            {erro && <p role="alert">{erro}</p>}
            <button className="botao-primario" disabled={busy}>
              {busy ? "Salvando…" : "Salvar etapa"}
            </button>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
