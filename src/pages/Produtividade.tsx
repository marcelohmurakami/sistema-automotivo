import { ProfissionalAgendamento } from "../components/funcionarios/ProfissionalAgendamento";
import { dadosProfissional } from "../services/gestaoFuncionario";
import { CalendarioOficina } from "../components/agenda/CalendarioOficina";
import { DetalheAgendamentoOficina } from "../components/agenda/DetalheAgendamentoOficina";
import { diaAgenda } from "../lib/calendarioAgenda";
import { ConfiguracaoCalendario } from "../components/CalendarioOperacao";
import { AgendamentoRecorrente } from "../components/AgendamentoRecorrente";
import { AcoesAgendamento } from "../components/AcoesAgendamento";
import { CalendariosExternos } from "../components/CalendariosExternos";
import { programarCalendario, regraFormulario } from "../services/calendarioOperacao";
import { novoId } from "../lib/uuid.ts";
import { ConfiguracaoRecursos } from "../components/ConfiguracaoRecursos";
import { ReservaRecursos } from "../components/ReservaRecursos";
import { dadosRecursos } from "../services/reservasRecursos";
import { ConfiguracaoDistribuicao } from "../components/ConfiguracaoDistribuicao";
import { DistribuicaoAgenda } from "../components/DistribuicaoAgenda";
import {
  dadosDistribuicao,
  type CandidatoTecnico,
} from "../services/distribuicaoTecnicos";
import { usePublicarContextoAssistente } from "../lib/contextoAssistente";
import { Dialogo } from "../components/Dialogo";
import { PlanejamentoVisita } from "../components/PlanejamentoVisita";
import { RoteiroVisitas } from "../components/RoteiroVisitas";
import { dadosVisita } from "../lib/logisticaVisitas";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import { atualizarCadastro } from "../lib/atualizarCadastro";
import { atualizarConsultas } from "../lib/atualizarConsultas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { auxiliaresOrcamento } from "../services/orcamentos";
import {
  consultarProdutividade,
  operarProdutividade,
  type Agendamento,
  type Pacote,
} from "../services/produtividade";
import { SelecaoClienteVeiculo } from "../components/SelecaoClienteVeiculo";
import { SelecaoCatalogo } from "../components/SelecaoCatalogo";
import "./Documentos.css";
import "./Produtividade.css";
export function Produtividade() {
  const a = useAcesso(),
    cache = useQueryClient();
  const oficina = a.oficina!.id;
  const executando = useRef(false);
  const [params, setParams] = useSearchParams();
  const alvo = params.get("agendamento");
  const [aba, setAba] = useState("agenda"),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false);
  const [cliente, setCliente] = useState(""),
    [veiculo, setVeiculo] = useState(""),
    [criando, setCriando] = useState(false);
  const [agendamentoAberto, setAgendamentoAberto] = useState(false);
  const [recorrente, setRecorrente] = useState(false);
  const [dataAgenda, setDataAgenda] = useState(() => diaAgenda(new Date()));
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [quantidadeVisitas, setQuantidadeVisitas] = useState(1);
  const [inicioVisita, setInicioVisita] = useState("");
  const [fimVisita, setFimVisita] = useState("");
  const [visitaExterna, setVisitaExterna] = useState(false);
  const [servicoVisita, setServicoVisita] = useState("");
  const [recursoVisita, setRecursoVisita] = useState("");
  const [origemEquipe, setOrigemEquipe] = useState<CandidatoTecnico>();
  function novoAgendamento(
    repetir = false,
    dia = dataAgenda,
    hora = "09:00",
    recurso = "",
  ) {
    setAgenda(null);
    setServicoVisita("");
    setRecorrente(repetir);
    setQuantidadeVisitas(repetir ? 4 : 1);
    setInicioVisita(new Date(`${dia}T${hora}:00`).toISOString());
    setFimVisita("");
    setVisitaExterna(false);
    setRecursoVisita(recurso);
    setOrigemEquipe(undefined);
    setAgendaChave(novoId());
    setCliente("");
    setVeiculo("");
    setErro("");
    setAgendamentoAberto(true);
  }
  function editarAgendamento(x: Agendamento) {
    setRecorrente(false);
    setQuantidadeVisitas(1);
    setOrigemEquipe(undefined);
    setAgenda(x);
    setServicoVisita(x.servico);
    setCliente(x.cliente_id);
    setVeiculo(x.veiculo_id || "");
    setInicioVisita(x.inicio);
    setFimVisita(x.fim || "");
    setVisitaExterna(!!x.visita);
    setRecursoVisita(x.recurso);
    setErro("");
    setAgendamentoAberto(true);
  }
  const [agenda, setAgenda] = useState<Agendamento | null>(null),
    [pacote, setPacote] = useState<Pacote | null>(null),
    [itens, setItens] = useState<Pacote["itens"]>([]);
  usePublicarContextoAssistente({ data: dataAgenda });
  const [agendaChave, setAgendaChave] = useState(() => novoId()),
    [pacoteChave, setPacoteChave] = useState(() => novoId());
  const q = useQuery({
    queryKey: ["produtividade", oficina],
    enabled: !a.demo,
    queryFn: ({ signal }) => consultarProdutividade(oficina, undefined, signal),
    refetchInterval: 30000,
  });
  const aux = useQuery({
    queryKey: ["aux-produtividade", oficina],
    enabled: !a.demo && agendamentoAberto,
    queryFn: () => auxiliaresOrcamento(false, oficina),
  });
  const selecionado = q.data?.agenda.find((x) => x.id === (detalheId || alvo));
  function fecharDetalhe() {
    setDetalheId(null);
    if (alvo) setParams({});
  }
  async function acao(nome: string, dados: Record<string, unknown>) {
    if (executando.current) return null;
    executando.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      const r: { os?: string } =
        nome === "programar_calendario"
          ? (await programarCalendario(
              oficina,
              String(dados.id),
              dados,
              quantidadeVisitas,
            ),
            {})
          : await operarProdutividade(oficina, nome, dados);
      // Confirma o calendário visível; avisos e mapas seguem atualizando em segundo plano.
      void atualizarConsultas(cache, [
        ["alertas"],
        ["series-calendario"],
        ...(r.os ? [["os"], ["mapa-oficina"]] : []),
      ]).catch(() => {});
      await atualizarCadastro(cache, ["produtividade", oficina]);
      setAviso(
        r.os
          ? "OS criada. Abra pelo link no agendamento."
          : nome === "programar_calendario"
            ? "Agendamentos recorrentes criados."
            : "Alteração salva.",
      );
      return r;
    } catch (e) {
      setErro(erroPublico(e));
      return null;
    } finally {
      executando.current = false;
      setBusy(false);
    }
  }
  const abaAtual = alvo ? "agenda" : aba;
  return (
    <div className="documentos-pagina produtividade">
      <header className="titulo-pagina">
        <div>
          <span className="sobretitulo">MENOS REPETIÇÃO, MAIS ORGANIZAÇÃO</span>
          <h1>Agenda e revisões.</h1>
          <p>Agende atendimentos e acompanhe as próximas revisões.</p>
        </div>
      </header>
      <nav className="os-abas">
        {[
          ["agenda", "Agenda"],
          ["pacotes", "Pacotes de serviços"],
          ["manutencoes", "Próximas manutenções"],
        ].map(([v, t]) => (
          <button
            key={v}
            aria-pressed={abaAtual === v}
            onClick={() => {
              setAba(v);
              setParams({});
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      {erro && !agendamentoAberto && !selecionado && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
      {a.demo ? (
        <p>
          Entre na conta real para usar a agenda compartilhada e os pacotes. As regras
          são validadas no banco da oficina.
        </p>
      ) : q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : q.isPending ? (
        <p role="status">Carregando…</p>
      ) : (
        <>
          {abaAtual === "agenda" && (
            <>
              {agendamentoAberto && (
                <Dialogo
                  key={agenda?.id || agendaChave}
                  titulo={
                    agenda
                      ? "Editar agendamento"
                      : recorrente
                        ? "Agendamento recorrente"
                        : "Novo agendamento"
                  }
                  aberto
                  fechar={() => {
                    if (!busy && !criando) setAgendamentoAberto(false);
                  }}
                  classe="dialogo-agendamento"
                >
                  <p>
                    {recorrente
                      ? "Defina o primeiro atendimento e escolha quando ele deve se repetir."
                      : "Escolha o responsável e o horário deste atendimento."}
                  </p>
                  {aux.data && (
                    <form
                      key={agenda?.id || agendaChave}
                      className="documentos-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (busy || criando) return;
                        const f = new FormData(e.currentTarget);
                        if (f.get("visita") === "on" && !f.get("fim")) {
                          setErro(
                            "Informe o término da visita para reservar o deslocamento e evitar conflitos.",
                          );
                          return;
                        }
                        const r = await acao(
                          !agenda && recorrente
                            ? "programar_calendario"
                            : "salvar_agenda",
                          {
                            id: agenda?.id || agendaChave,
                            revisao: agenda?.revisao,
                            cliente_id: cliente,
                            veiculo_id: null,
                            identificacao: f.get("identificacao"),
                            recurso: f.get("recurso"),
                            inicio: new Date(String(f.get("inicio"))).toISOString(),
                            fim: f.get("fim")
                              ? new Date(String(f.get("fim"))).toISOString()
                              : null,
                            servico: f.get("servico"),
                            distribuicao: dadosDistribuicao(f),
                            profissional: dadosProfissional(f),
                            recursos_reservados: dadosRecursos(f),
                            ...(!agenda && recorrente
                              ? { regra_calendario: regraFormulario(f) }
                              : {}),
                            ...dadosVisita(f),
                          },
                        );
                        if (r) {
                          setAgendamentoAberto(false);
                          setAgenda(null);
                          setAgendaChave(novoId());
                          setQuantidadeVisitas(1);
                          setCliente("");
                          setVeiculo("");
                        }
                      }}
                    >
                      <fieldset disabled={busy || criando}>
                        <SelecaoClienteVeiculo
                          entradaLivreRetifica
                          aux={aux.data}
                          cliente={cliente}
                          veiculo={veiculo}
                          selecionarCliente={setCliente}
                          selecionarVeiculo={setVeiculo}
                          aoProcessar={setCriando}
                        />
                        <div className="prod-grade">
                          <label>
                            Motor, peça ou veículo
                            <input
                              name="identificacao"
                              required
                              minLength={2}
                              maxLength={120}
                              placeholder="Ex.: Cabeçote do Gol 1.6"
                              defaultValue={
                                agenda?.identificacao || agenda?.veiculo || ""
                              }
                            />
                          </label>
                          <ProfissionalAgendamento automotivo recurso={recursoVisita} alterarRecurso={setRecursoVisita} inicial={agenda?.profissional} escolherServico={s=>{setServicoVisita(s.descricao);if(s.duracao_minutos&&inicioVisita)setFimVisita(new Date(Date.parse(inicioVisita)+s.duracao_minutos*60000).toISOString());}}/>
                          <label>
                            Serviço
                            <input
                              name="servico"
                              required
                              minLength={2}
                              maxLength={500}
                              value={servicoVisita}
                              onChange={e=>setServicoVisita(e.target.value)}
                            />
                          </label>
                          <label>
                            {recorrente ? "Primeiro agendamento" : "Início"}
                            <input
                              type="datetime-local"
                              name="inicio"
                              required
                              defaultValue={
                                agenda
                                  ? local(agenda.inicio)
                                  : inicioVisita
                                    ? local(inicioVisita)
                                    : ""
                              }
                              onInput={(e) =>
                                setInicioVisita(
                                  e.currentTarget.value
                                    ? new Date(e.currentTarget.value).toISOString()
                                    : "",
                                )
                              }
                            />
                          </label>
                          <label>
                            {recorrente
                              ? "Término do primeiro agendamento"
                              : visitaExterna
                                ? "Término previsto da visita"
                                : "Fim previsto (opcional)"}
                            <input
                              type="datetime-local"
                              name="fim"
                              required={recorrente || visitaExterna}
                              value={fimVisita ? local(fimVisita) : ""}
                              min={
                                inicioVisita
                                  ? local(
                                      new Date(
                                        Date.parse(inicioVisita) + 60000,
                                      ).toISOString(),
                                    )
                                  : undefined
                              }
                              onChange={(e) =>
                                setFimVisita(
                                  e.currentTarget.value
                                    ? new Date(e.currentTarget.value).toISOString()
                                    : "",
                                )
                              }
                            />
                            {visitaExterna && (
                              <small>
                                Informe o horário ou escolha a duração em “Visita ao
                                cliente”.
                              </small>
                            )}
                          </label>
                        </div>
                        {!agenda && recorrente && (
                          <AgendamentoRecorrente
                            quantidade={quantidadeVisitas}
                            alterar={setQuantidadeVisitas}
                            inicio={inicioVisita}
                            fim={fimVisita}
                          />
                        )}
                        <PlanejamentoVisita
                          inicial={
                            agenda || {
                              id: agendaChave,
                              inicio: "",
                              fim: null,
                              situacao: "agendado",
                            }
                          }
                          inicio={inicioVisita}
                          fim={fimVisita || null}
                          clienteId={cliente}
                          reservas={q.data.agenda.filter(
                            (x) =>
                              x.recurso.toLocaleLowerCase() ===
                              recursoVisita.trim().toLocaleLowerCase(),
                          )}
                          aoProcessar={setCriando}
                          aoAlterarVisita={(valor) => {
                            setVisitaExterna(valor);
                            setErro("");
                          }}
                          aoDefinirFim={setFimVisita}
                          origemEquipe={origemEquipe}
                        />
                        <DistribuicaoAgenda
                          id={agenda?.id || agendaChave}
                          inicial={agenda?.distribuicao}
                          aoEscolher={(c) => {
                            setRecursoVisita(c.nome);
                            setOrigemEquipe(c);
                          }}
                          aoProcessar={setCriando}
                        />
                        <ReservaRecursos
                          id={agenda?.id || agendaChave}
                          inicial={agenda?.recursos_reservados}
                          resumo={agenda?.resumo_recursos}
                          inicio={inicioVisita}
                          fim={fimVisita || null}
                        />
                        {erro && (
                          <p role="alert" className="erro-formulario">
                            {erro}
                          </p>
                        )}
                        <button className="botao-primario">
                          {busy
                            ? "Salvando…"
                            : recorrente
                              ? "Salvar agendamentos recorrentes"
                              : "Salvar agendamento"}
                        </button>
                        {agenda && (
                          <button
                            type="button"
                            className="botao-secundario"
                            onClick={() => setAgendamentoAberto(false)}
                          >
                            Cancelar edição
                          </button>
                        )}
                      </fieldset>
                    </form>
                  )}
                  {aux.isError && (
                    <p role="alert">Não foi possível carregar clientes e veículos.</p>
                  )}
                  {aux.isPending && (
                    <p role="status">Carregando clientes e veículos…</p>
                  )}
                </Dialogo>
              )}
              <section className="os-painel prod-agenda">
                <div className="prod-agenda-cabecalho">
                  <div>
                    <h2>
                      <CalendarDays size={22} aria-hidden="true" /> Agenda da oficina
                    </h2>
                    <p>
                      Clique no atendimento para ver detalhes ou em Agendar para
                      reservar um horário.
                    </p>
                  </div>
                  <AcoesAgendamento
                    novo={() => novoAgendamento()}
                    recorrente={
                      a.oficina!.perfil !== "staff"
                        ? () => novoAgendamento(true)
                        : undefined
                    }
                  />
                </div>
                {alvo && !selecionado && (
                  <p role="status">
                    Agendamento indisponível.{" "}
                    <button onClick={() => setParams({})}>Ver agenda</button>
                  </p>
                )}
                <CalendarioOficina
                  agenda={q.data.agenda}
                  dia={dataAgenda}
                  alterarDia={setDataAgenda}
                  abrir={(x) => {
                    setErro("");
                    setDetalheId(x.id);
                  }}
                  novo={(dia, hora, recurso) =>
                    novoAgendamento(false, dia, hora, recurso)
                  }
                />
                <RoteiroVisitas
                  data={dataAgenda}
                  reservas={q.data.agenda.map((x) => ({
                    ...x,
                    titulo: x.servico,
                    equipe: x.recurso,
                  }))}
                  abrir={(id) => {
                    setErro("");
                    setDetalheId(id);
                  }}
                />
              </section>
              {selecionado && (
                <DetalheAgendamentoOficina
                  item={selecionado}
                  erro={erro}
                  ocupado={busy}
                  fechar={fecharDetalhe}
                  editar={() => {
                    fecharDetalhe();
                    editarAgendamento(selecionado);
                  }}
                  converter={() =>
                    void acao("converter_agenda", {
                      id: selecionado.id,
                      revisao: selecionado.revisao,
                    })
                  }
                  cancelar={() =>
                    void acao("cancelar_agenda", {
                      id: selecionado.id,
                      revisao: selecionado.revisao,
                    })
                  }
                />
              )}
              <ConfiguracaoDistribuicao />
              <ConfiguracaoRecursos />
              <ConfiguracaoCalendario />
              <CalendariosExternos />
            </>
          )}
          {abaAtual === "pacotes" && (
            <>
              <SecaoRecolhivel
                key={pacote?.id || "novo-pacote"}
                titulo={pacote ? "Editar pacote" : "Novo pacote de serviços"}
                descricao="Agrupe serviços usados juntos para orçar mais rápido"
                aberta={!!pacote}
              >
                <p>
                  Os preços são buscados no catálogo ao adicionar o pacote ao orçamento
                  ou à OS. Depois, você pode ajustar os itens.
                </p>
                {a.oficina!.perfil === "staff" ? (
                  <p>Peça ao responsável para cadastrar pacotes.</p>
                ) : (
                  <form
                    className="documentos-form"
                    key={pacote?.id || pacoteChave}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        await acao("salvar_pacote", {
                          id: pacote?.id || pacoteChave,
                          revisao: pacote?.revisao,
                          nome: f.get("nome"),
                          ativo: f.get("ativo") === "on",
                          itens,
                        })
                      ) {
                        setPacote(null);
                        setPacoteChave(novoId());
                        setItens([]);
                      }
                    }}
                  >
                    <fieldset disabled={busy}>
                      <label>
                        Nome do pacote
                        <input
                          name="nome"
                          required
                          minLength={2}
                          maxLength={120}
                          placeholder="Revisão básica"
                          defaultValue={pacote?.nome}
                        />
                      </label>
                      <SelecaoCatalogo
                        rotulo="Adicionar item do catálogo"
                        valor=""
                        selecionar={(id) => {
                          if (id && itens.length < 50)
                            setItens([
                              ...itens,
                              {
                                item_catalogo_id: id,
                                quantidade: 1,
                              },
                            ]);
                        }}
                      />
                      {itens.map((i, n) => (
                        <div className="prod-linha" key={n}>
                          <SelecaoCatalogo
                            rotulo={`Item ${n + 1}`}
                            valor={i.item_catalogo_id}
                            selecionar={(id) =>
                              setItens(
                                itens.map((x, k) =>
                                  k === n ? { ...x, item_catalogo_id: id } : x,
                                ),
                              )
                            }
                          />
                          <label>
                            Quantidade
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              max="100000"
                              required
                              value={i.quantidade}
                              onChange={(e) =>
                                setItens(
                                  itens.map((x, k) =>
                                    k === n
                                      ? {
                                          ...x,
                                          quantidade: Number(e.target.value),
                                        }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </label>
                          <button
                            type="button"
                            aria-label={"Remover item " + (n + 1)}
                            onClick={() => setItens(itens.filter((_, k) => k !== n))}
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                      <label>
                        <input
                          type="checkbox"
                          name="ativo"
                          defaultChecked={pacote?.ativo ?? true}
                        />
                        Pacote ativo
                      </label>
                      <button className="botao-primario" disabled={!itens.length}>
                        Salvar pacote
                      </button>
                    </fieldset>
                  </form>
                )}
              </SecaoRecolhivel>
              <section className="os-painel">
                <h2>Pacotes cadastrados</h2>
                {q.data.pacotes.map((p) => (
                  <article className="prod-registro" key={p.id}>
                    <strong>{p.nome}</strong>
                    <p>
                      {p.itens.length} itens · {p.ativo ? "Ativo" : "Inativo"}
                    </p>
                    {a.oficina!.perfil !== "staff" && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setPacote(p);
                          setItens(p.itens);
                        }}
                      >
                        Editar pacote
                      </button>
                    )}
                  </article>
                ))}
              </section>
            </>
          )}
          {abaAtual === "manutencoes" && (
            <section className="os-painel">
              <h2>Próximos serviços</h2>
              <p>
                Na OS, abra Mais opções → Vistoria e ferramentas e escolha Próxima
                manutenção. Quilometragem é uma meta informada pela oficina, não uma
                leitura automática do carro.
              </p>
              {q.data.manutencoes.map((m) => (
                <article className="prod-registro" key={m.id}>
                  <strong>{m.descricao}</strong>
                  <p>
                    {m.cliente} · {m.veiculo} · {m.placa}
                  </p>
                  <p>
                    {m.data_prevista
                      ? new Date(m.data_prevista + "T12:00:00").toLocaleDateString(
                          "pt-BR",
                        )
                      : "Sem data"}
                    {m.quilometragem_prevista != null
                      ? " ou " + m.quilometragem_prevista + " km"
                      : ""}{" "}
                    · {m.concluida_em ? "Concluída" : "Pendente"}
                  </p>
                  <Link to={"/ordens-servico?os=" + m.ordem_servico_id}>
                    OS #{m.numero_os}
                  </Link>
                  {!m.concluida_em && (
                    <button
                      disabled={busy}
                      onClick={() => void acao("concluir_manutencao", { id: m.id })}
                    >
                      Marcar concluída
                    </button>
                  )}
                </article>
              ))}
              {!q.data.manutencoes.length && <p>Nenhuma recomendação registrada.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
function local(v: string) {
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
