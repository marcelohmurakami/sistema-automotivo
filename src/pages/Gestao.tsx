import { IdentidadeDocumentos } from "../components/IdentidadeDocumentos";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  Lightbulb,
  Moon,
  Sun,
  Monitor,
  RefreshCw,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { useTema, definirTema, type Tema } from "../lib/tema";
import { erroPublico } from "../lib/supabase";
import {
  consultarConfiguracoes,
  salvarConfiguracoes,
  consultarRelatorios,
  consultarHistorico,
} from "../services/gestao";
import { normalizarTelefone } from "../services/clientes";
import { dinheiro } from "../services/orcamentos";
import { hoje, consultarFinanceiro } from "../services/financeiro";
import "./Gestao.css";
const dia = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const variacao = (atual: number, anterior: number) =>
  anterior > 0
    ? `${(((atual - anterior) / anterior) * 100).toFixed(1).replace(".", ",")}% em relação ao período anterior`
    : atual > 0
      ? "Período anterior sem base para comparar"
      : "Sem movimento nos dois períodos";
function exportar(linhas: unknown[][], nome: string) {
  const csv =
    "\ufeff" +
    linhas
      .map((l) =>
        l
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[\s]*[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n");
  const u = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function Periodo({
  inicio,
  fim,
  alterar,
}: {
  inicio: string;
  fim: string;
  alterar: (i: string, f: string) => void;
}) {
  return (
    <div className="gestao-periodo">
      <label>
        De
        <input
          type="date"
          value={inicio}
          onChange={(e) => alterar(e.target.value, fim)}
        />
      </label>
      <label>
        Até
        <input
          type="date"
          value={fim}
          onChange={(e) => alterar(inicio, e.target.value)}
        />
      </label>
      <button
        className="botao-secundario"
        onClick={() => alterar(hoje().slice(0, 7) + "-01", hoje())}
      >
        Este mês
      </button>
    </div>
  );
}
export function Relatorios() {
  const a = useAcesso(),
    [inicio, setInicio] = useState(hoje().slice(0, 7) + "-01"),
    [fim, setFim] = useState(hoje()),
    gerente = a.oficina?.perfil !== "staff";
  const q = useQuery({
    queryKey: ["relatorios", a.demo, a.oficina!.id, inicio, fim],
    queryFn: () => consultarRelatorios(a.demo, a.oficina!.id, inicio, fim),
    enabled: gerente,
    refetchInterval: 60000,
  });
  const fin = useQuery({
    queryKey: ["financeiro-relatorio", a.demo, a.oficina!.id, inicio, fim],
    queryFn: () =>
      consultarFinanceiro(a.demo, a.oficina!.id, {
        inicio,
        fim,
        busca: "",
        filtro: "periodo",
        natureza: "",
        pagina: 0,
        os: null,
      }),
    enabled: gerente && a.permite("finance"),
    refetchInterval: 60000,
  });
  if (!gerente)
    return (
      <div className="os-painel">
        Relatórios de gestão disponíveis ao proprietário e gerentes.
      </div>
    );
  const d = q.data,
    r = fin.data?.resumo;
  const resultado = r ? r.receitas - r.despesas - r.pecas - r.taxas : null;
  const insights = d
    ? [
        d.operacao.atrasadas > 0
          ? {
              titulo: `${d.operacao.atrasadas} entrega(s) em atraso`,
              texto:
                "Combine um novo prazo com os clientes e priorize os serviços que podem ser concluídos hoje.",
              rota: "/ordens-servico",
            }
          : null,
        d.operacao.paradas > 0
          ? {
              titulo: `${d.operacao.paradas} carro(s) parado(s)`,
              texto:
                "Confira o motivo de cada parada abaixo. Resolva a dependência antes de colocar mais serviços na fila.",
              rota: "/ordens-servico",
            }
          : null,
        d.operacao.prontas > 0
          ? {
              titulo: `${d.operacao.prontas} carro(s) pronto(s) para retirada`,
              texto:
                "Avise os clientes e combine a entrega. Isso libera espaço para novos atendimentos.",
              rota: "/ordens-servico",
            }
          : null,
        d.operacao.sem_previsao > 0
          ? {
              titulo: `${d.operacao.sem_previsao} OS sem previsão`,
              texto:
                "Defina uma data prometida. Sem ela, o sistema não consegue medir atrasos e pontualidade.",
              rota: "/ordens-servico",
            }
          : null,
        d.operacao.aguardando_aprovacao > 0
          ? {
              titulo: `${d.operacao.aguardando_aprovacao} orçamento(s) aguardando resposta`,
              texto:
                "Revise a validade e entre em contato com os clientes antes de reservar peças ou iniciar o serviço.",
              rota: "/orcamentos",
            }
          : null,
        d.estoque.baixo > 0
          ? {
              titulo: `${d.estoque.baixo} peça(s) no mínimo ou abaixo`,
              texto:
                "Confira as OS em andamento e reponha primeiro as peças que impedem uma entrega.",
              rota: "/estoque",
            }
          : null,
        d.estoque.sem_custo > 0
          ? {
              titulo: `${d.estoque.sem_custo} produto(s) com custo zero`,
              texto:
                "Confira os custos antes das próximas baixas. Custo zero pode fazer o lucro parecer maior do que é.",
              rota: "/estoque",
            }
          : null,
        r && r.receber_atrasado > 0
          ? {
              titulo: `${dinheiro(r.receber_atrasado)} a receber em atraso`,
              texto:
                "Confira pagamentos ainda não registrados e entre em contato com os clientes que continuam devendo.",
              rota: "/financeiro",
            }
          : null,
        r && r.pagar_atrasado > 0
          ? {
              titulo: `${dinheiro(r.pagar_atrasado)} em contas vencidas`,
              texto:
                "Organize o que precisa ser pago primeiro e negocie vencimentos quando necessário.",
              rota: "/financeiro",
            }
          : null,
        r && r.revisar_custos > 0
          ? {
              titulo: `Custos de ${r.revisar_custos} OS precisam de revisão`,
              texto:
                "Inclua peças externas, terceiros e outros gastos antes de tomar decisões com base no lucro.",
              rota: "/financeiro",
            }
          : null,
        resultado !== null && resultado < 0
          ? {
              titulo: "As despesas e custos superaram as receitas",
              texto:
                "Confira os custos cadastrados e a sobra de cada OS. Separe problemas de preço, custos de execução e despesas gerais.",
              rota: "/financeiro",
            }
          : null,
      ].filter((x) => x !== null)
    : [];
  return (
    <div className="gestao-pagina">
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">DADOS QUE AJUDAM A DECIDIR</div>
          <h1>
            Relatórios<span>.</span>
          </h1>
          <p>Entenda o resultado e descubra o que merece sua atenção.</p>
        </div>
        <button
          className="botao-secundario"
          onClick={() => {
            void q.refetch();
            void fin.refetch();
          }}
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      <Periodo
        inicio={inicio}
        fim={fim}
        alterar={(i, f) => {
          setInicio(i);
          setFim(f);
        }}
      />
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração: indicadores calculados com os registros deste navegador.
          Orçamentos antigos da demonstração não têm data de criação para
          comparar períodos.
        </p>
      )}
      {q.isPending ? (
        <p role="status">Calculando relatórios…</p>
      ) : q.isError ? (
        <p role="alert" className="erro-formulario">
          {erroPublico(q.error)}
        </p>
      ) : (
        d && (
          <>
            <p className="texto-suave gestao-legenda">
              Comparação com {dia(d.inicio_anterior)} a {dia(d.fim_anterior)} —
              mesma quantidade de dias. Datas no horário de Brasília.
            </p>
            <section className="gestao-indicadores">
              <article>
                <span>OS entregues</span>
                <strong>{d.atual.entregues}</strong>
                <small>
                  {variacao(d.atual.entregues, d.anterior.entregues)}
                </small>
              </article>
              <article>
                <span>Vendido nas OS entregues</span>
                <strong>{dinheiro(d.atual.vendido)}</strong>
                <small>{variacao(d.atual.vendido, d.anterior.vendido)}</small>
              </article>
              <article>
                <span>Valor médio por OS</span>
                <strong>
                  {d.atual.entregues
                    ? dinheiro(d.atual.ticket)
                    : "Sem entregas"}
                </strong>
                <small>
                  {d.anterior.entregues
                    ? variacao(d.atual.ticket, d.anterior.ticket)
                    : "Sem base anterior"}
                </small>
              </article>
              <article>
                <span>Entregas no prazo</span>
                <strong>
                  {d.atual.com_previsao
                    ? `${Math.round((d.atual.no_prazo / d.atual.com_previsao) * 100)}%`
                    : "Sem previsão registrada"}
                </strong>
                <small>
                  {d.atual.no_prazo} de {d.atual.com_previsao} entregas com
                  prazo informado
                </small>
              </article>
            </section>
            <section className="os-painel">
              <div className="gestao-cabecalho">
                <h2>
                  <Lightbulb size={21} />O que fazer agora
                </h2>
                <span className="texto-suave">Situação atual da oficina</span>
              </div>
              {insights.length ? (
                <div className="gestao-insights">
                  {insights.map((x) => (
                    <article key={x.titulo}>
                      <h3>{x.titulo}</h3>
                      <p>{x.texto}</p>
                      <Link to={x.rota}>
                        Conferir <ArrowUpRight size={16} />
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="gestao-vazio">
                  <CheckCircle2 size={22} />
                  Nenhum alerta nas verificações disponíveis. Continue
                  registrando prazos, custos e pagamentos.
                </p>
              )}
              {fin.isError && (
                <p role="alert">
                  Indicadores financeiros indisponíveis:{" "}
                  {erroPublico(fin.error)}
                </p>
              )}
            </section>
            <div className="gestao-colunas">
              <section className="os-painel">
                <h2>Produção e orçamentos</h2>
                <dl className="gestao-dados">
                  <div>
                    <dt>Carros em atendimento agora</dt>
                    <dd>{d.operacao.ativas}</dd>
                  </div>
                  <div>
                    <dt>Tempo médio entre entrada e entrega</dt>
                    <dd>
                      {d.atual.prazo_medio === null
                        ? "Sem dados"
                        : `${d.atual.prazo_medio} dias`}
                    </dd>
                  </div>
                  {!a.demo && (
                    <>
                      <div>
                        <dt>Orçamentos criados no período</dt>
                        <dd>{d.atual.orcamentos}</dd>
                      </div>
                      <div>
                        <dt>Aprovados entre os enviados dessa seleção</dt>
                        <dd>
                          {d.atual.aprovados} / {d.atual.enviados}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
                <p className="texto-suave">
                  A aprovação considera a situação atual dos orçamentos criados
                  no período, excluindo rascunhos e cancelados do denominador. O
                  tempo de atendimento usa dias corridos e inclui esperas.
                </p>
              </section>
              <section className="os-painel">
                <h2>Resultado financeiro</h2>
                {r ? (
                  <>
                    <strong className="gestao-grande">
                      {dinheiro(resultado!)}
                    </strong>
                    <p>
                      {resultado! < 0
                        ? "Prejuízo estimado"
                        : "Resultado estimado"}{" "}
                      com os custos e despesas registrados.
                    </p>
                    <dl className="gestao-dados">
                      <div>
                        <dt>Receitas</dt>
                        <dd>{dinheiro(r.receitas)}</dd>
                      </div>
                      <div>
                        <dt>Custos, despesas e taxas</dt>
                        <dd>{dinheiro(r.pecas + r.despesas + r.taxas)}</dd>
                      </div>
                    </dl>
                    <Link to="/financeiro">Entender cada valor →</Link>
                  </>
                ) : (
                  <p>
                    {fin.isPending
                      ? "Carregando…"
                      : "Financeiro não disponível nesta consulta."}
                  </p>
                )}
              </section>
            </div>
            <section className="os-painel">
              <h2>Atendimentos que precisam de atenção</h2>
              <p className="texto-suave">
                Até 15 OS atrasadas ou com parada aberta; os totais acima
                incluem todas.
              </p>
              {d.atencao.length ? (
                d.atencao.map((o) => (
                  <Link
                    className="gestao-linha"
                    key={o.id}
                    to={`/ordens-servico?os=${o.id}`}
                  >
                    <div>
                      <strong>
                        OS #{o.numero} · {o.veiculo}
                      </strong>
                      <p>
                        {o.cliente} ·{" "}
                        {o.entrega_prevista_em
                          ? new Date(o.entrega_prevista_em).toLocaleString(
                              "pt-BR",
                              { timeZone: "America/Sao_Paulo" },
                            )
                          : "Sem previsão"}
                      </p>
                      {o.motivo && <small>{o.motivo}</small>}
                    </div>
                    <ArrowUpRight size={18} />
                  </Link>
                ))
              ) : (
                <p className="gestao-vazio">Nenhuma OS atrasada ou parada.</p>
              )}
            </section>
            <section className="os-painel">
              <h2>Clientes com maior valor em serviços</h2>
              <p className="texto-suave">
                Até 10 clientes por valor das OS entregues no período. Use o
                histórico para planejar o próximo atendimento; este valor é
                venda, não lucro.
              </p>
              {d.clientes.map((c) => (
                <div className="gestao-linha" key={c.cliente_id}>
                  <div>
                    <strong>{c.nome}</strong>
                    <p>{c.atendimentos} atendimento(s)</p>
                  </div>
                  <strong>{dinheiro(c.total)}</strong>
                </div>
              ))}
              {!d.clientes.length && (
                <p className="gestao-vazio">
                  Ainda não há entregas neste período.
                </p>
              )}
            </section>
            <button
              className="botao-secundario"
              onClick={() =>
                exportar(
                  [
                    ["Indicador", "Atual", "Anterior"],
                    ["OS entregues", d.atual.entregues, d.anterior.entregues],
                    [
                      "Vendido em OS (R$)",
                      (d.atual.vendido / 100).toFixed(2),
                      (d.anterior.vendido / 100).toFixed(2),
                    ],
                    [
                      "Valor médio (R$)",
                      (d.atual.ticket / 100).toFixed(2),
                      (d.anterior.ticket / 100).toFixed(2),
                    ],
                    [
                      "Entregas no prazo",
                      d.atual.no_prazo,
                      d.anterior.no_prazo,
                    ],
                  ],
                  `relatorio-${inicio}-${fim}.csv`,
                )
              }
            >
              <Download size={17} />
              Exportar indicadores
            </button>
          </>
        )
      )}
    </div>
  );
}
const acoes: Record<string, string> = {
  "cliente.cadastrado": "Cliente cadastrado",
  "cliente.editado": "Cliente atualizado",
  "cliente.arquivado": "Cliente arquivado",
  "cliente.restaurado": "Cliente restaurado",
  "orcamento.criado": "Orçamento criado",
  "orcamento.editado": "Orçamento atualizado",
  "orcamento.emitido": "Orçamento emitido",
  "orcamento.revisado": "Nova versão de orçamento",
  "orcamento.cancelado": "Orçamento cancelado",
  "orcamento.approved": "Orçamento aprovado",
  "orcamento.declined": "Orçamento recusado",
  saved: "Lançamento financeiro salvo",
  paid: "Pagamento registrado",
  reversed: "Pagamento estornado",
  cancelled: "Lançamento cancelado",
  costs_reviewed: "Custos conferidos",
  os_generated: "Receita de OS gerada",
  transfer_reversed: "Transferência estornada",
  configuracoes_atualizadas: "Configurações da oficina atualizadas",
  salvar_produto: "Produto de estoque atualizado",
};
export function Historico() {
  const a = useAcesso(),
    [inicio, setInicio] = useState(hoje().slice(0, 7) + "-01"),
    [fim, setFim] = useState(hoje()),
    [tipo, setTipo] = useState(""),
    [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    gerente = a.oficina?.perfil !== "staff";
  const q = useQuery({
    queryKey: [
      "historico-gestao",
      a.demo,
      a.oficina!.id,
      inicio,
      fim,
      tipo,
      busca,
      pagina,
    ],
    queryFn: () =>
      consultarHistorico(
        a.demo,
        a.oficina!.id,
        inicio,
        fim,
        tipo,
        busca,
        pagina,
      ),
    enabled: gerente,
    refetchInterval: 60000,
  });
  if (!gerente)
    return (
      <div className="os-painel">
        Histórico de gestão disponível ao proprietário e gerentes.
      </div>
    );
  return (
    <div className="gestao-pagina">
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">CADA PASSO REGISTRADO</div>
          <h1>
            Histórico<span>.</span>
          </h1>
          <p>Consulte o que aconteceu na oficina, sem apagar os registros.</p>
        </div>
        <button className="botao-secundario" onClick={() => void q.refetch()}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>
      <Periodo
        inicio={inicio}
        fim={fim}
        alterar={(i, f) => {
          setInicio(i);
          setFim(f);
          setPagina(0);
        }}
      />
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração: eventos de OS e estoque deste navegador. Auditoria
          completa disponível na conta real.
        </p>
      )}
      <section className="os-painel">
        <div className="gestao-periodo">
          <label>
            Buscar por descrição ou número da OS
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
          <label>
            Módulo
            <select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value);
                setPagina(0);
              }}
            >
              <option value="">Todos</option>
              <option value="ordem_servico">Ordens de serviço</option>
              <option value="estoque">Estoque</option>
              <option value="financeiro">Financeiro</option>
              <option value="oficina">Configurações</option>
              <option value="cliente">Clientes</option>
              <option value="orcamento">Orçamentos</option>
            </select>
          </label>
        </div>
        {q.isPending ? (
          <p role="status">Carregando histórico…</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : (
          <>
            {q.data.itens.map((e) => (
              <article className="gestao-evento" key={e.origem + e.id}>
                <time>
                  {new Date(e.data).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </time>
                <strong>
                  {acoes[e.descricao] || e.descricao.replaceAll("_", " ")}
                </strong>
                <small>
                  {e.numero ? `OS #${e.numero} · ` : ""}
                  {e.autor
                    ? `Usuário ${e.autor.slice(0, 8)}`
                    : "Sistema, cliente ou demonstração"}
                </small>
                {e.origem === "os" && (
                  <Link to={`/ordens-servico?os=${e.entidade}`}>
                    Abrir atendimento →
                  </Link>
                )}
              </article>
            ))}
            {!q.data.itens.length && (
              <p className="gestao-vazio">Nenhum evento nesta seleção.</p>
            )}
            <div className="gestao-paginacao">
              <span>
                {q.data.total} eventos · Página {pagina + 1}
              </span>
              <button
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </button>
              <button
                disabled={(pagina + 1) * 30 >= q.data.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
export function Configuracoes() {
  const a = useAcesso(),
    qc = useQueryClient(),
    tema = useTema(),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [ocupado, setOcupado] = useState(false),
    trava = useRef(false);
  const q = useQuery({
    queryKey: ["configuracoes", a.demo, a.oficina!.id],
    queryFn: () => consultarConfiguracoes(a.demo, a.oficina!.id),
  });
  const gerente = a.oficina?.perfil !== "staff";
  return (
    <div className="gestao-pagina">
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">DO JEITO DA SUA OFICINA</div>
          <h1>
            Configurações<span>.</span>
          </h1>
          <p>Dados da empresa, aparência e informações do acesso.</p>
        </div>
      </div>
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      <IdentidadeDocumentos />
      <section className="os-painel">
        <h2>Aparência</h2>
        <p className="texto-suave">
          Preferência salva neste navegador. No modo automático, acompanha o
          tema do dispositivo.
        </p>
        <div className="gestao-temas">
          {(
            [
              ["claro", "Claro", Sun],
              ["escuro", "Escuro", Moon],
              ["sistema", "Automático", Monitor],
            ] as const
          ).map(([id, nome, Icone]) => (
            <button
              key={id}
              aria-pressed={tema === id}
              onClick={() => definirTema(id as Tema)}
            >
              <Icone size={24} />
              {nome}
              {tema === id && <CheckCircle2 size={17} />}
            </button>
          ))}
        </div>
      </section>
      <section className="os-painel">
        <h2>Dados da oficina</h2>
        <p className="texto-suave">
          Nome e telefone serão usados nos próximos orçamentos. Propostas já
          emitidas preservam seus dados originais.
        </p>
        {q.isPending ? (
          <p>Carregando…</p>
        ) : q.isError ? (
          <p role="alert">
            {erroPublico(q.error)}{" "}
            <button onClick={() => void q.refetch()}>Tentar novamente</button>
          </p>
        ) : (
          <form
            key={q.data.revisao}
            className="gestao-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (trava.current) return;
              trava.current = true;
              setOcupado(true);
              setErro("");
              setAviso("");
              const f = new FormData(e.currentTarget);
              try {
                await salvarConfiguracoes(a.demo, a.oficina!.id, {
                  ...q.data,
                  nome: String(f.get("nome")),
                  telefone: normalizarTelefone(String(f.get("telefone"))) || "",
                  endereco: {
                    ...q.data.endereco,
                    logradouro: String(f.get("logradouro")),
                    cidade: String(f.get("cidade")),
                    uf: String(f.get("uf")),
                    cep: String(f.get("cep")),
                  },
                });
                await Promise.all([
                  q.refetch(),
                  a.atualizar(),
                  qc.invalidateQueries({ queryKey: ["historico-gestao"] }),
                ]);
                setAviso("Dados da oficina atualizados.");
              } catch (err) {
                setErro(erroPublico(err));
              } finally {
                trava.current = false;
                setOcupado(false);
              }
            }}
          >
            <fieldset disabled={ocupado || !gerente}>
              <div className="dupla-campos">
                <label>
                  Nome da oficina
                  <input
                    name="nome"
                    defaultValue={q.data.nome}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  Telefone com DDD
                  <input
                    type="tel"
                    name="telefone"
                    defaultValue={q.data.telefone}
                    maxLength={24}
                  />
                </label>
              </div>
              <label>
                Rua, número e complemento
                <input
                  name="logradouro"
                  defaultValue={q.data.endereco.logradouro || ""}
                  maxLength={300}
                />
              </label>
              <div className="dupla-campos">
                <label>
                  Cidade
                  <input
                    name="cidade"
                    defaultValue={q.data.endereco.cidade || ""}
                    maxLength={100}
                  />
                </label>
                <label>
                  Estado (UF)
                  <input
                    name="uf"
                    defaultValue={q.data.endereco.uf || ""}
                    pattern="[A-Za-z]{2}"
                    maxLength={2}
                  />
                </label>
              </div>
              <label>
                CEP
                <input
                  name="cep"
                  defaultValue={q.data.endereco.cep || ""}
                  pattern="[0-9]{5}-?[0-9]{3}"
                  maxLength={9}
                />
              </label>
              {gerente && (
                <button className="botao-primario">
                  {ocupado ? "Salvando…" : "Salvar dados da oficina"}
                </button>
              )}
            </fieldset>
            {!gerente && (
              <p>Apenas proprietário e gerentes podem alterar os dados.</p>
            )}
          </form>
        )}
      </section>
      <section className="os-painel">
        <h2>Conta e plano</h2>
        <dl className="gestao-dados">
          <div>
            <dt>Oficina</dt>
            <dd>{q.data?.nome || a.oficina!.nome}</dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>
              {a.oficina!.perfil === "owner"
                ? "Proprietário"
                : a.oficina!.perfil === "manager"
                  ? "Gerente"
                  : "Funcionário"}
            </dd>
          </div>
          <div>
            <dt>Plano</dt>
            <dd>{a.oficina!.nome_plano}</dd>
          </div>
        </dl>
        <Link className="botao-secundario" to="/planos">
          Ver recursos do plano
        </Link>
        <p className="texto-suave gestao-legenda">
          Valores em reais (BRL). Relatórios no horário de Brasília.{" "}
          {a.demo
            ? "Dados demonstrativos ficam somente neste navegador."
            : "Cada oficina acessa seus próprios dados, conforme perfil e assinatura."}
        </p>
      </section>
    </div>
  );
}
