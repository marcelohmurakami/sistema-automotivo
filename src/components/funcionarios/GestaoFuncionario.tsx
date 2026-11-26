import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarOff,
  Clock,
  History,
  Wallet,
  Wrench,
} from "lucide-react";
import { Dialogo } from "../Dialogo";
import { useAcesso } from "../../auth/contexto";
import { erroPublico } from "../../lib/supabase";
import { dinheiro } from "../../lib/formatacao";
import { componenteSobDemanda } from "../../lib/componenteSobDemanda";
import {
  diasDaJornada,
  diasSemanaFuncionario,
  periodosDaJornada,
  type DiaJornada,
  type PeriodoJornada,
} from "../../lib/gestaoFuncionario";
import {
  consultarGestaoFuncionario,
  salvarGestaoFuncionario,
  type GestaoFuncionario as DadosGestao,
  type ServicoFuncionario,
} from "../../services/gestaoFuncionario";
import type { Funcionario } from "../../services/funcionarios";
import BloqueiosFuncionarios from "./BloqueiosFuncionarios";
const HistoricoFuncionario = componenteSobDemanda(async () => ({
  default: (await import("../FichaFuncionario")).HistoricoFuncionario,
}));
const abas = [
  ["jornada", "Jornada", Clock],
  ["servicos", "Serviços", Wrench],
  ["ausencias", "Ausências", CalendarOff],
  ["vales", "Vales e adiantamentos", Wallet],
  ["historico", "Histórico", History],
] as const;

export default function GestaoFuncionario({
  f,
  fechar,
}: {
  f: Funcionario;
  fechar: () => void;
}) {
  const a = useAcesso(),
    w = a.oficina!,
    qc = useQueryClient();
  const [aba, setAba] = useState("jornada"),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [alterado, setAlterado] = useState(false),
    [destino, setDestino] = useState<string | null>(null),
    trava = useRef(false);
  const q = useQuery({
    queryKey: ["gestao-funcionario", a.demo, w.id, f.id],
    queryFn: ({ signal }) => consultarGestaoFuncionario(a.demo, w.id, f.id, signal),
    enabled: aba === "jornada" || aba === "servicos",
    refetchOnWindowFocus: false,
  });
  function navegar(proxima: string) {
    if (ocupado) return;
    if (alterado) {
      setDestino(proxima);
      return;
    }
    setErro("");
    setAviso("");
    if (proxima === "fechar") fechar();
    else setAba(proxima);
  }
  async function salvar(
    secao: "jornada" | "servicos",
    dados: PeriodoJornada[] | ServicoFuncionario[],
  ) {
    if (trava.current || !q.data) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await salvarGestaoFuncionario(
        a.demo,
        w.id,
        f.id,
        secao,
        dados,
        q.data.configuracao.revisao,
      );
      setAlterado(false);
      await q.refetch();
      for (const chave of ["profissionais-agenda", "distribuicao"])
        void qc.invalidateQueries({ queryKey: [chave] });
      setAviso(secao === "jornada" ? "Jornada salva." : "Serviços atualizados.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={() => navegar("fechar")}
      titulo={`Gerenciar ${f.nome}`}
      classe="dialogo-func-gestao"
    >
      <div className="func-corpo">
        <p className="func-intro">Disponibilidade, ausências e serviços executados.</p>
        <div className="func-gestao">
          <nav aria-label="Ficha do funcionário">
            {abas.map(([id, nome, Icone]) => (
              <button
                type="button"
                disabled={ocupado}
                key={id}
                aria-current={aba === id ? "page" : undefined}
                onClick={() => navegar(id)}
              >
                <Icone size={18} />
                {nome}
              </button>
            ))}
          </nav>
          <div className="func-conteudo">
            {erro && (
              <p className="erro-formulario" role="alert">
                {erro}
              </p>
            )}
            {aviso && (
              <p role="status" className="aviso-cliente">
                {aviso}
              </p>
            )}
            {aba === "jornada" || aba === "servicos" ? (
              q.isPending ? (
                <p role="status">Carregando configuração…</p>
              ) : q.isError ? (
                <p role="alert">
                  {erroPublico(q.error)}{" "}
                  <button className="botao-secundario" onClick={() => void q.refetch()}>
                    Tentar novamente
                  </button>
                </p>
              ) : (
                <fieldset disabled={ocupado}>
                  {aba === "jornada" ? (
                    <Jornada
                      key={`j-${q.data.configuracao.revisao}`}
                      inicial={q.data.configuracao.jornada}
                      alterar={() => setAlterado(true)}
                      salvar={(d) => salvar("jornada", d)}
                      ocupado={ocupado}
                    />
                  ) : (
                    <Servicos
                      key={`s-${q.data.configuracao.revisao}`}
                      dados={q.data}
                      alterar={() => setAlterado(true)}
                      salvar={(d) => salvar("servicos", d)}
                      ocupado={ocupado}
                    />
                  )}
                </fieldset>
              )
            ) : aba === "ausencias" ? (
              <BloqueiosFuncionarios funcionario={f} />
            ) : (
              <HistoricoFuncionario key={aba} f={f} somenteVales={aba === "vales"} />
            )}
          </div>
        </div>
      </div>
      {destino && (
        <Dialogo aberto fechar={() => setDestino(null)} titulo="Descartar alterações?">
          <div className="func-corpo">
            <p>As alterações desta aba ainda não foram salvas.</p>
            <div className="func-rodape">
              <button className="botao-secundario" onClick={() => setDestino(null)}>
                Continuar editando
              </button>
              <button
                className="botao-primario"
                onClick={() => {
                  setAlterado(false);
                  setDestino(null);
                  setErro("");
                  setAviso("");
                  if (destino === "fechar") fechar();
                  else setAba(destino);
                }}
              >
                Descartar
              </button>
            </div>
          </div>
        </Dialogo>
      )}
    </Dialogo>
  );
}
function Jornada({
  inicial,
  alterar,
  salvar,
  ocupado,
}: {
  inicial: PeriodoJornada[] | null;
  alterar: () => void;
  salvar: (d: PeriodoJornada[]) => Promise<void>;
  ocupado: boolean;
}) {
  const [dias, setDias] = useState(() => diasDaJornada(inicial)),
    [erro, setErro] = useState("");
  const multiplos = dias.some(
    (d) => (inicial ?? []).filter((p) => p.dia === d.dia).length > 2,
  );
  function definir(dia: number, patch: Partial<DiaJornada>) {
    setDias((ds) => ds.map((d) => (d.dia === dia ? { ...d, ...patch } : d)));
    alterar();
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const dados = periodosDaJornada(dias);
          setErro("");
          void salvar(dados);
        } catch (e) {
          setErro(erroPublico(e));
        }
      }}
    >
      <div className="func-intro">
        <h3>Jornada semanal</h3>
        <p>Defina os dias e horários disponíveis para agendamento.</p>
      </div>
      {inicial === null && (
        <p className="func-nota">
          Jornada ainda não definida. Até salvar, não há restrição de horário por
          funcionário.
        </p>
      )}
      {multiplos ? (
        <p role="alert" className="func-nota">
          Esta jornada tem mais de dois períodos por dia. Os horários foram preservados;
          ajuste-os na distribuição da agenda.
        </p>
      ) : (
        <>
          <div className="func-atalhos">
            <button
              type="button"
              className="botao-secundario"
              onClick={() => {
                setDias(
                  diasDaJornada(
                    [1, 2, 3, 4, 5].flatMap((dia) => [
                      { dia, inicio: "08:00", fim: "12:00" },
                      { dia, inicio: "13:00", fim: "18:00" },
                    ]),
                  ),
                );
                alterar();
              }}
            >
              <CalendarDays size={16} />
              Seg–sex, 08h–18h
            </button>
            <button
              type="button"
              className="botao-secundario"
              onClick={() => {
                setDias((ds) =>
                  ds.map((d) =>
                    d.dia >= 2 && d.dia <= 5 ? { ...ds[1], dia: d.dia } : d,
                  ),
                );
                alterar();
              }}
            >
              Copiar segunda para ter–sex
            </button>
          </div>
          <div className="func-jornada">
            {dias.map((d) => (
              <div className="func-dia" key={d.dia} data-inativo={!d.ativo}>
                <label className="func-check">
                  <input
                    type="checkbox"
                    checked={d.ativo}
                    onChange={(e) => definir(d.dia, { ativo: e.target.checked })}
                  />
                  {diasSemanaFuncionario[d.dia]}
                </label>
                {d.ativo ? (
                  <div className="func-dia-horarios">
                    <div className="func-horas">
                      <label>
                        Início
                        <input
                          aria-label={`Início de ${diasSemanaFuncionario[d.dia]}`}
                          type="time"
                          required
                          value={d.inicio}
                          onChange={(e) => definir(d.dia, { inicio: e.target.value })}
                        />
                      </label>
                      <label>
                        Fim
                        <input
                          aria-label={`Fim de ${diasSemanaFuncionario[d.dia]}`}
                          type="time"
                          required
                          value={d.fim}
                          onChange={(e) => definir(d.dia, { fim: e.target.value })}
                        />
                      </label>
                    </div>
                    <label className="func-check">
                      <input
                        type="checkbox"
                        checked={d.intervalo}
                        onChange={(e) =>
                          definir(d.dia, { intervalo: e.target.checked })
                        }
                      />
                      Intervalo
                    </label>
                    {d.intervalo && (
                      <div className="func-horas">
                        <label>
                          Saída
                          <input
                            aria-label={`Início do intervalo de ${diasSemanaFuncionario[d.dia]}`}
                            type="time"
                            required
                            value={d.intervaloInicio}
                            onChange={(e) =>
                              definir(d.dia, { intervaloInicio: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Retorno
                          <input
                            aria-label={`Fim do intervalo de ${diasSemanaFuncionario[d.dia]}`}
                            type="time"
                            required
                            value={d.intervaloFim}
                            onChange={(e) =>
                              definir(d.dia, { intervaloFim: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  <small>Não trabalha</small>
                )}
              </div>
            ))}
          </div>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <footer className="func-rodape">
            <button className="botao-primario" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Salvar jornada"}
            </button>
          </footer>
        </>
      )}
    </form>
  );
}
type EdicaoServico = { ativo: boolean; duracao: string; preco: string };
function Servicos({
  dados,
  alterar,
  salvar,
  ocupado,
}: {
  dados: DadosGestao;
  alterar: () => void;
  salvar: (d: ServicoFuncionario[]) => Promise<void>;
  ocupado: boolean;
}) {
  const [busca, setBusca] = useState(""),
    [itens, setItens] = useState<Record<string, EdicaoServico>>(() =>
      Object.fromEntries(
        dados.servicos.map((s) => [
          s.item_catalogo_id,
          {
            ativo: s.ativo,
            duracao: s.duracao_minutos == null ? "" : String(s.duracao_minutos),
            preco: s.preco_centavos == null ? "" : String(s.preco_centavos / 100),
          },
        ]),
      ),
    );
  const normalizar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  function mudar(id: string, p: Partial<EdicaoServico>) {
    setItens((v) => ({
      ...v,
      [id]: { ...(v[id] ?? { ativo: false, duracao: "", preco: "" }), ...p },
    }));
    alterar();
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void salvar(
          Object.entries(itens).map(([item_catalogo_id, s]) => ({
            item_catalogo_id,
            ativo: s.ativo,
            duracao_minutos: s.duracao === "" ? null : Number(s.duracao),
            preco_centavos: s.preco === "" ? null : Math.round(Number(s.preco) * 100),
          })),
        );
      }}
    >
      <div className="func-intro">
        <h3>Serviços do funcionário</h3>
        <p>
          Selecione os serviços que realiza. Preço e duração específicos são opcionais.
        </p>
      </div>
      <label>
        Buscar serviço
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome do serviço"
        />
      </label>
      <p className="func-nota">
        {Object.values(itens).filter((s) => s.ativo).length} selecionados · Sem ajuste,
        usa o valor do catálogo.
      </p>
      <div className="func-servicos">
        {dados.catalogo
          .filter((c) => normalizar(c.descricao).includes(normalizar(busca)))
          .map((c) => {
            const s = itens[c.id];
            return (
              <article className="func-servico" key={c.id}>
                <label className="func-check">
                  <input
                    type="checkbox"
                    checked={!!s?.ativo}
                    onChange={(e) => mudar(c.id, { ativo: e.target.checked })}
                  />
                  <span>
                    <strong>{c.descricao}</strong>
                    <small>
                      {dinheiro(c.preco_centavos)}
                      {c.duracao_minutos ? ` · ${c.duracao_minutos} min` : ""}
                    </small>
                  </span>
                </label>
                {s?.ativo && (
                  <div className="func-form-grid">
                    <label>
                      Duração própria (min)
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        step="1"
                        value={s.duracao}
                        placeholder={
                          c.duracao_minutos ? String(c.duracao_minutos) : "Do catálogo"
                        }
                        onChange={(e) => mudar(c.id, { duracao: e.target.value })}
                      />
                    </label>
                    <label>
                      Preço próprio (R$)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={s.preco}
                        placeholder={String(c.preco_centavos / 100)}
                        onChange={(e) => mudar(c.id, { preco: e.target.value })}
                      />
                    </label>
                  </div>
                )}
              </article>
            );
          })}
        {!dados.catalogo.length && (
          <p className="func-vazio">
            Cadastre os serviços no catálogo para vinculá-los aqui.
          </p>
        )}
      </div>
      <footer className="func-rodape">
        <button className="botao-primario" disabled={ocupado}>
          {ocupado ? "Salvando…" : "Salvar serviços"}
        </button>
      </footer>
    </form>
  );
}
