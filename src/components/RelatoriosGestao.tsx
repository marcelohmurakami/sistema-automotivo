import { baixarCSV } from "../lib/csv";
function baixar(titulo: string, colunas: string[], linhas: Celula[][]) {
  baixarCSV([colunas, ...linhas], titulo + ".csv");
}
import { dinheiro } from "../lib/formatacao";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, Settings2, SlidersHorizontal } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { consultarGestao } from "../services/relatoriosGestao";
import {
  calcularGestao,
  filtrosGestaoVazios,
  mediaGestao,
  type FiltrosGestao,
  type DadosGestao,
} from "../lib/relatoriosGestao";
import { tiposServico, type TipoServico } from "../lib/especialidades";
import { nomeEtapaOficina, nomeMotivoOficina } from "../lib/relatorioOficina";
import { motivosQualidade } from "../services/qualidade";
import { categorias, formas } from "../services/financeiro";

import { erroPublico } from "../lib/supabase";
import { DadosGestaoEditor } from "./DadosGestaoEditor";
import { IndicadoresEspecialidade } from "./IndicadoresEspecialidade";
import "../pages/Qualidade.css";
import "./RelatoriosGestao.css";
const num = (n: number | null, unidade = "") =>
  n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + unidade;
const data = (s: string | null) =>
  s
    ? s.length === 10
      ? s.split("-").reverse().join("/")
      : new Date(s).toLocaleDateString("pt-BR")
    : "—";
const tipoNome = (s: string) =>
  tiposServico[s as TipoServico]?.[0] || "Sem identificação visual";
type Celula = string | number | null;

function Tabela({
  titulo,
  nota,
  colunas,
  linhas,
  acao,
  aberta = false,
}: {
  titulo: string;
  nota?: string;
  colunas: string[];
  linhas: Celula[][];
  acao?: (i: number) => ReactNode;
  aberta?: boolean;
}) {
  const [todas, setTodas] = useState(false);
  return (
    <details className="gestao-secao" open={aberta || undefined}>
      <summary>
        <span>{titulo}</span>
        <small>{linhas.length} registros</small>
      </summary>
      <div className="gestao-secao-conteudo">
        <div className="gestao-tabela-topo">
          <p>{nota}</p>
          <button
            type="button"
            className="botao-secundario"
            onClick={() => baixar(titulo, colunas, linhas)}
            disabled={!linhas.length}
          >
            <Download size={15} /> Baixar planilha
          </button>
        </div>
        {linhas.length ? (
          <>
            <div className="rel-tabela-rolagem">
              <table className="rel-tabela">
                <thead>
                  <tr>
                    {colunas.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                    {acao && <th scope="col">Dados</th>}
                  </tr>
                </thead>
                <tbody>
                  {(todas ? linhas : linhas.slice(0, 10)).map((l, i) => (
                    <tr key={i}>
                      {l.map((v, j) =>
                        j === 0 ? (
                          <th scope="row" key={j}>
                            {v ?? "—"}
                          </th>
                        ) : (
                          <td key={j}>{v ?? "—"}</td>
                        ),
                      )}
                      {acao && <td>{acao(i)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {linhas.length > 10 && (
              <button className="rel-link" onClick={() => setTodas(!todas)}>
                {todas
                  ? "Mostrar 10 primeiros"
                  : `Ver todos os ${linhas.length} registros`}
              </button>
            )}
          </>
        ) : (
          <p className="gestao-vazio">Sem registros para estes filtros.</p>
        )}
      </div>
    </details>
  );
}
function Cards({ itens }: { itens: [string, string | number, string?][] }) {
  return (
    <div className="gestao-cards">
      {itens.map(([n, v, s]) => (
        <article key={n}>
          <span>{n}</span>
          <strong>{v}</strong>
          {s && <small>{s}</small>}
        </article>
      ))}
    </div>
  );
}
export function RelatoriosGestao({
  aba,
  inicio,
  fim,
}: {
  aba: string;
  inicio: string;
  fim: string;
}) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: [
      "relatorios-gestao",
      a.demo,
      a.oficina!.id,
      inicio,
      fim,
      a.permite("employee_reports"),
    ],
    queryFn: ({ signal }) =>
      consultarGestao(
        a.demo,
        a.oficina!.id,
        inicio,
        fim,
        a.permite("employee_reports"),
        signal,
      ),
    enabled: a.oficina!.perfil !== "staff" && a.permite("finance"),
  });
  if (!a.permite("finance")) return null;
  if (q.isError)
    return (
      <p role="alert">
        Não foi possível carregar a análise detalhada. {erroPublico(q.error)}
      </p>
    );
  if (!q.data) return <p role="status">Carregando análise detalhada…</p>;
  return (
    <PainelGestao
      key={aba + inicio + fim}
      dados={q.data}
      aba={aba}
      inicio={inicio}
      fim={fim}
    />
  );
}
export function PainelGestao({
  dados: d,
  aba,
  inicio,
  fim,
}: {
  dados: DadosGestao;
  aba: string;
  inicio: string;
  fim: string;
}) {
  const a = useAcesso(),
    [f, setF] = useState<FiltrosGestao>(filtrosGestaoVazios),
    [edicao, setEdicao] = useState<{ entidade: string; id: string } | null>(null),
    [ordemClientes, setOrdemClientes] = useState("margem");
  const r = useMemo(() => calcularGestao(d, inicio, fim, f), [d, inicio, fim, f]);
  const custo = (v: number, conferido: boolean) =>
    dinheiro(v) + (conferido ? "" : " *");
  const abrir = (entidade: string, id: string) => setEdicao({ entidade, id });
  const editar = (entidade: string, id: string) => (
    <button className="rel-link" onClick={() => abrir(entidade, id)}>
      Completar dados
    </button>
  );
  const filtro = (k: keyof FiltrosGestao, nome: string, opcoes: [string, string][]) => (
    <label>
      {nome}
      <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        <option value="">Todos</option>
        {opcoes.map(([id, n]) => (
          <option value={id} key={id}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
  const financeiro = aba === "financeiro",
    estoque = aba === "estoque",
    qualidade = aba === "qualidade",
    producao = aba === "producao",
    oficina = aba === "oficina";
  const clientes = [...r.clientes].sort((a, b) =>
    ordemClientes === "receita"
      ? b.receita - a.receita
      : ordemClientes === "garantia"
        ? b.garantia - a.garantia
        : Number(b.conferido) - Number(a.conferido) || b.margem - a.margem,
  );
  const comparacoes = r.osFinanceiro.filter((o) => o.orcado !== null);
  const qs = r.qualidadeResumo;
  const osOpcoes = d.ordens.map(
    (o) => [o.id, `OS #${o.numero} · ${o.cliente}`] as [string, string],
  );
  return (
    <section className="gestao-detalhes">
      <header className="gestao-cabecalho">
        <div>
          <h2>
            {estoque
              ? "Estoque e fornecedores"
              : qualidade
                ? "Qualidade dos atendimentos"
                : financeiro
                  ? "Desempenho de serviços, clientes e equipe"
                  : "Análise detalhada"}
          </h2>
          <p>
            {estoque
              ? "Posição atual das peças; compras e movimentações no período selecionado."
              : qualidade
                ? "Ocorrências abertas no período selecionado."
                : "Selecione o recorte e abra os indicadores que deseja analisar."}
          </p>
        </div>
        {(oficina || producao) && (
          <button
            className="botao-secundario"
            onClick={() => abrir("oficina", a.oficina!.id)}
          >
            <Settings2 size={17} /> Capacidade e expediente
          </button>
        )}
      </header>
      <details className="gestao-filtros">
        <summary>
          <SlidersHorizontal size={17} /> Filtros desta análise
          {Object.values(f).some(Boolean) ? " · filtros ativos" : ""}
        </summary>
        <div className="qual-filtros">
          <label>
            Buscar
            <input
              value={f.busca}
              onChange={(e) => setF({ ...f, busca: e.target.value })}
              placeholder={estoque ? "Peça ou código" : "OS, cliente ou veículo"}
            />
          </label>
          {estoque ? (
            <>
              {filtro(
                "fornecedor",
                "Fornecedor",
                d.fornecedores.map((x) => [x.id, x.nome]),
              )}
              {filtro("estoque", "Estoque", [
                ["baixo", "Abaixo do mínimo"],
                ["zerado", "Zerado"],
                ["reservado", "Com reservas"],
                ["sem_movimento", "Sem movimentação no período"],
                ["90", "Parado há mais de 90 dias"],
                ["120", "Parado há mais de 120 dias"],
                ["150", "Parado há mais de 150 dias"],
              ])}
            </>
          ) : (
            <>
              {filtro("cliente", "Cliente cadastrado", [
                ...new Map(
                  d.ordens
                    .filter((o) => o.cliente_id)
                    .map((o) => [o.cliente_id!, o.cliente]),
                ).entries(),
              ])}
              {filtro(
                "tipo",
                "Tipo de serviço",
                [...new Set(d.ordens.map((o) => o.tipo || "sem_tipo"))].map((t) => [
                  t,
                  tipoNome(t),
                ]),
              )}
              {d.equipe_permitida &&
                filtro(
                  "funcionario",
                  "Funcionário",
                  d.funcionarios.map((x) => [x.id, x.nome]),
                )}
              {!financeiro &&
                filtro(
                  "situacao",
                  "Situação atual da OS",
                  Object.entries(nomeEtapaOficina),
                )}
            </>
          )}
          <button className="rel-link" onClick={() => setF(filtrosGestaoVazios)}>
            Limpar filtros
          </button>
        </div>
      </details>
      {financeiro && (
        <>
          <Cards
            itens={[
              [
                "Margem média por OS conferida",
                r.resumoFinanceiro.ticketMargem === null
                  ? "—"
                  : dinheiro(Math.round(r.resumoFinanceiro.ticketMargem)),
                `${r.resumoFinanceiro.conferidas} OS com custos conferidos`,
              ],
              [
                "Rentabilidade média",
                num(r.resumoFinanceiro.rentabilidade, "%"),
                "Média das margens percentuais das OS conferidas",
              ],
              [
                "Custos a conferir",
                r.resumoFinanceiro.pendentes,
                "OS entregues no período",
              ],
            ]}
          />
          <details className="gestao-metodo">
            <summary>Como ler os valores e as margens</summary>
            <p>
              Rankings consideram OS entregues no período e os descontos de cada OS. A
              margem usa o mesmo custeio da OS: peças consumidas, despesas vinculadas,
              mão de obra, comissões, taxas, garantias e custos indiretos apropriados.
              Despesas gerais não apropriadas ficam no resultado financeiro. Valores com
              * têm custos pendentes de conferência.
            </p>
            <p>
              Garantias da OS original são consideradas até hoje; o quadro de qualidade
              usa a data de abertura da ocorrência. Peças sem custo de consumo
              identificado não recebem uma margem presumida.
            </p>
          </details>
          <Tabela
            titulo="Serviços que mais faturam"
            aberta
            colunas={["Serviço", "Quantidade", "Faturamento"]}
            linhas={r.servicos.map((s) => [
              s.nome,
              num(s.quantidade),
              dinheiro(s.receita),
            ])}
          />
          <Tabela
            titulo="Peças: faturamento e margem"
            nota="Margem da peça = venda após desconto menos custo de consumo registrado. Não inclui despesas gerais."
            colunas={[
              "Peça",
              "Quantidade",
              "Faturamento",
              "Custo consumido",
              "Margem da peça",
            ]}
            linhas={r.pecas.map((s) => [
              s.nome,
              num(s.quantidade),
              dinheiro(s.receita),
              s.conferido ? dinheiro(s.custo) : "Custo a conferir",
              s.conferido ? dinheiro(s.margem) : "—",
            ])}
          />
          <Tabela
            titulo="Peças com maior margem"
            colunas={["Peça", "Faturamento", "Margem da peça"]}
            linhas={[...r.pecas]
              .filter((s) => s.conferido)
              .sort((a, b) => b.margem - a.margem)
              .map((s) => [s.nome, dinheiro(s.receita), dinheiro(s.margem)])}
          />
          <div className="gestao-ordenar">
            <label>
              Ordenar clientes por
              <select
                value={ordemClientes}
                onChange={(e) => setOrdemClientes(e.target.value)}
              >
                <option value="margem">Maior resultado</option>
                <option value="receita">Maior faturamento</option>
                <option value="garantia">
                  Maior custo de garantia nas OS entregues
                </option>
              </select>
            </label>
          </div>
          <Tabela
            titulo="Clientes que mais geram resultado"
            nota="A margem ajuda a reconhecer os melhores clientes. Confira os custos antes de definir prioridade; promessas de entrega e urgências continuam valendo. Clientes sem cadastro permanecem separados por OS."
            colunas={[
              "Cliente",
              "OS",
              "Faturamento",
              "Margem de contribuição",
              "Garantias",
              "Conferência",
            ]}
            linhas={clientes.map((c) => [
              c.nome + (c.registrado ? "" : " (avulso)"),
              c.ordens,
              dinheiro(c.receita),
              custo(c.margem, c.conferido),
              dinheiro(c.garantia),
              c.conferido ? "Conferido" : "Pendente",
            ])}
          />
          <Tabela
            titulo="Clientes: custos dos retornos no período"
            colunas={["Cliente", "Ocorrências", "Custo líquido registrado"]}
            linhas={r.perdasClientes.map((c) => [
              c.nome,
              c.retornos,
              custo(c.custo, c.conferido),
            ])}
          />
          <Tabela
            titulo="Rentabilidade de cada OS"
            colunas={[
              "OS / cliente",
              "Faturamento",
              "Custo direto + garantia",
              "Margem",
              "Margem %",
            ]}
            linhas={r.osFinanceiro.map((o) => [
              `#${o.numero} · ${o.cliente}`,
              dinheiro(o.total),
              custo(o.custo, o.conferido),
              custo(o.margem, o.conferido),
              num(o.percentual, "%") + (o.conferido ? "" : " *"),
            ])}
            acao={(i) => editar("os", r.osFinanceiro[i].id)}
          />
          <Tabela
            titulo="Orçado × valor final"
            nota="A diferença isolada não prova erro no orçamento. Veja os complementos aprovados e investigue diferenças que ficaram sem previsão."
            colunas={[
              "OS",
              "Orçamento original",
              "Complementos aprovados",
              "Valor final",
              "Diferença total",
              "Além do previsto",
            ]}
            linhas={comparacoes.map((o) => [
              `#${o.numero}`,
              dinheiro(o.orcado!),
              dinheiro(o.adicionais),
              dinheiro(o.total),
              dinheiro(o.total - o.orcado!),
              dinheiro(o.total - o.orcado! - o.adicionais),
            ])}
          />
          <Tabela
            titulo="Despesas fixas e variáveis"
            nota="Por competência. Com filtros de OS ativos, mostra somente despesas vinculadas às OS selecionadas; despesas gerais ficam fora desse recorte."
            colunas={["Classificação", "Lançamentos", "Valor"]}
            linhas={r.despesasGrupos.map((g) => [
              {
                fixa: "Fixas",
                variavel: "Variáveis",
                nao_classificada: "Não classificadas",
              }[g.nome]!,
              g.quantidade,
              dinheiro(g.valor),
            ])}
          />
          <Tabela
            titulo="Despesas por categoria"
            colunas={["Categoria", "Valor"]}
            linhas={r.despesasCategorias.map((g) => [
              categorias[g.nome] || g.nome,
              dinheiro(g.valor),
            ])}
          />
          <Tabela
            titulo="Classificar e conferir despesas"
            colunas={["Descrição", "Categoria", "Competência", "Valor"]}
            linhas={r.despesas.map((t) => [
              t.nome,
              categorias[t.categoria] || t.categoria,
              data(t.data),
              dinheiro(t.valor),
            ])}
            acao={(i) => editar("despesa", r.despesas[i].id)}
          />
          <Tabela
            titulo="Formas de pagamento mais usadas"
            nota="Recebimentos de toda a oficina no período. Uma baixa é um recebimento; estornos são exibidos separadamente e descontados do valor."
            colunas={["Forma", "Recebimentos", "Estornos", "Valor líquido de estornos"]}
            linhas={r.formas.map((p) => [
              formas[p.nome] || p.nome,
              p.quantidade,
              p.estornos,
              dinheiro(p.valor),
            ])}
          />
          {d.equipe_permitida ? (
            <>
              <Link to="/funcionarios?aba=resultados">
                Conferir atribuição de receita, horas e custos por participante →
              </Link>
              <Tabela
                titulo="Funcionários: produção, comissão e retornos"
                nota={
                  d.custeios
                    ? "Faturamento das OS entregues no período, conforme a atribuição de execução em Resultados da equipe. OS sem atribuição não entram no ranking. Serviços e pagamentos de comissão seguem os vínculos dos itens; retornos seguem o funcionário da ocorrência."
                    : "Faturamento de serviços atribuídos ao funcionário, após descontos. O vínculo do comissionado prevalece sobre o responsável da OS. Retornos e custos seguem o funcionário identificado na ocorrência, sem presumir culpa."
                }
                colunas={[
                  "Funcionário",
                  "OS",
                  "Serviços",
                  "Faturamento",
                  "Comissão prevista",
                  "Liberada",
                  "Paga",
                  "Retornos",
                  "Horas retrabalho",
                  "Custo de retornos",
                ]}
                linhas={r.equipe.map((p) => [
                  p.nome,
                  p.os,
                  num(p.servicos),
                  dinheiro(p.receita),
                  dinheiro(p.comissao),
                  dinheiro(p.liberada),
                  dinheiro(p.paga),
                  p.retornos,
                  num(p.horas),
                  custo(p.perda, p.conferido),
                ])}
              />
              <Tabela
                titulo="Vincular profissionais de comissão"
                nota="Associe cada profissional ao cadastro do funcionário para consolidar os indicadores."
                colunas={["Profissional"]}
                linhas={d.profissionais.map((p) => [p.nome])}
                acao={(i) => editar("profissional", d.profissionais[i].id)}
              />
            </>
          ) : (
            <p className="gestao-plano">
              O relatório completo por funcionário está disponível no Plano Completo.
            </p>
          )}
        </>
      )}
      {(oficina || producao) && (
        <>
          <Cards
            itens={[
              [
                "Serviços atrasados no período",
                r.atrasos.length,
                num(mediaGestao(r.atrasos.map((o) => o.dias)), " dias de atraso médio"),
              ],
              [
                "Serviços parados no período",
                r.paradas.length,
                num(
                  mediaGestao(r.paradas.map((o) => o.dias)),
                  " dias parados em média",
                ),
              ],
              [
                "Até iniciar o serviço",
                num(r.tempoInicio, " dias"),
                "Da entrada ao primeiro início registrado",
              ],
              [
                "Permanência na oficina",
                num(r.tempoPermanencia, " dias"),
                "Da entrada à entrega no período",
              ],
            ]}
          />
          <Tabela
            titulo="Tempo para ficar pronto por tipo de serviço"
            aberta
            nota="Ordenado do mais rápido ao mais demorado. Considera serviços concluídos no período, da entrada até ficarem prontos."
            colunas={[
              "Tipo de serviço",
              "Concluídas",
              "Com datas válidas",
              "Média em dias",
            ]}
            linhas={r.tipos.map((t) => [
              tipoNome(t.tipo),
              t.quantidade,
              t.amostra,
              num(t.dias),
            ])}
          />
          <Tabela
            titulo="Tempo em cada processo"
            nota={`Tempo acumulado de cada OS em cada etapa dentro do período, dividido pelas OS observadas. ${r.semHistorico} OS sem histórico de transições suficiente ficaram fora deste cálculo.`}
            colunas={["Processo", "OS observadas", "Média de dias"]}
            linhas={r.tempoEtapas.map((t) => [
              nomeEtapaOficina[t.etapa] || t.etapa,
              t.ordens,
              num(t.dias),
            ])}
          />
          <Tabela
            titulo="Serviços atrasados"
            nota="Inclui entregues com atraso e pendentes que já ultrapassaram a promessa durante o período. A duração é contada desde a promessa até a entrega ou o fim observado."
            colunas={["OS", "Cliente", "Promessa", "Entrega", "Dias de atraso"]}
            linhas={r.atrasos.map((o) => [
              `#${o.numero}`,
              o.cliente,
              data(o.prazo),
              data(o.entrega),
              num(o.dias),
            ])}
          />
          <Tabela
            titulo="Serviços parados"
            nota="Somente o tempo parado dentro do período. Paradas simultâneas da mesma OS contam uma vez."
            colunas={["OS", "Cliente", "Dias parados"]}
            linhas={r.paradas.map((o) => [`#${o.numero}`, o.cliente, num(o.dias)])}
          />
          <Tabela
            titulo="Motivos de parada e espera"
            nota="Causas registradas nas paradas; são indícios para investigar os atrasos."
            colunas={["Motivo", "OS", "Horas de espera"]}
            linhas={r.motivosParada.map((p) => [
              nomeMotivoOficina[p.motivo] || p.motivo,
              p.quantidade,
              num(p.horas),
            ])}
          />
        </>
      )}
      {oficina && (
        <>
          <IndicadoresEspecialidade
            registros={r.entradasTecnicas.map((o) => ({
              id: o.id,
              nome: `OS #${o.numero} · ${o.cliente}`,
              ficha: o.ficha_especialidade,
            }))}
            nota="OS recebidas no período selecionado, considerando os filtros acima e excluindo cancelamentos."
            destino="os"
          />
          <Cards
            itens={[
              [
                "Em serviço agora",
                r.atuais.length,
                "Inclui serviços prontos aguardando retirada",
              ],
              ["Aguardando diagnóstico", r.diagnostico],
              ["Aguardando aprovação", r.aprovacao],
              ["Aguardando peças", r.pecasAguardando],
              [
                "Ocupação atual",
                num(r.ocupacaoAtual, "%"),
                r.capacidade
                  ? `${r.atuais.length} de ${r.capacidade} vagas`
                  : "Informe a capacidade",
              ],
              [
                "Ocupação média no período",
                num(r.ocupacaoMedia, "%"),
                "Ponderada pelo tempo de permanência; ignora dias futuros",
              ],
              [
                "Clientes que voltaram",
                num(r.retornoClientes, "%"),
                `${r.clientesIdentificados} clientes cadastrados atendidos no período`,
              ],
            ]}
          />
          <Tabela
            titulo="Orçamentos aprovados e não aprovados"
            nota="Orçamentos criados no período, pela situação atual; aprovação parcial usa o valor aprovado. Filtros de cliente e tipo se aplicam aqui. Pendentes e rascunhos ficam separados das recusas."
            colunas={["Situação", "Quantidade", "Valor"]}
            linhas={[...new Set(r.orcamentos.map((o) => o.situacao))].map((s) => [
              {
                draft: "Rascunho",
                awaiting_approval: "Aguardando aprovação",
                approved: "Aprovado",
                partially_approved: "Aprovado parcialmente",
                rejected: "Recusado",
                expired: "Expirado",
                cancelled: "Cancelado",
                converted: "Convertido em OS",
              }[s] || s,
              r.orcamentos.filter((o) => o.situacao === s).length,
              dinheiro(
                r.orcamentos
                  .filter((o) => o.situacao === s)
                  .reduce((t, o) => t + (o.valor || 0), 0),
              ),
            ])}
          />
          <Tabela
            titulo="Agenda dos próximos sete dias"
            nota="Situação atual de toda a oficina, independente do período histórico e dos filtros de OS."
            colunas={[
              "Quando",
              "Cliente",
              "Motor / veículo",
              "Serviço",
              "Box / responsável",
              "Fim",
            ]}
            linhas={r.agenda.map((e) => [
              new Date(e.inicio).toLocaleString("pt-BR"),
              e.cliente,
              e.identificacao,
              e.servico,
              e.recurso,
              e.fim ? new Date(e.fim).toLocaleString("pt-BR") : "Sem previsão",
            ])}
          />
          <Tabela
            titulo="Horas livres na agenda"
            nota="Próximos sete dias, por recurso já utilizado na agenda e dentro do expediente cadastrado. Não mede tempo de trabalho efetivo. Agendamentos sem fim impedem estimar as horas livres daquele dia."
            colunas={[
              "Dia",
              "Box / responsável",
              "Horas sem agendamento",
              "Sem fim informado",
            ]}
            linhas={r.livres.map((l) => [
              data(l.dia),
              l.recurso,
              num(l.horas),
              l.semFim,
            ])}
          />
          <div className="gestao-chamada">
            <Link to="/garantias">Registrar garantia ou retrabalho →</Link>
            <span>
              {qs.garantias} garantias · {qs.retrabalhos} retrabalhos ·{" "}
              {dinheiro(qs.custo)} de custo registrado neste recorte
            </span>
          </div>
        </>
      )}
      {(qualidade || oficina) && (
        <>
          <Cards
            itens={[
              ["Retornos em garantia", qs.garantias],
              ["Retrabalhos", qs.retrabalhos, num(qs.horas, " horas registradas")],
              [
                "Custo do retrabalho / retornos",
                dinheiro(qs.custo),
                `${qs.pendentes} ocorrências com custos a conferir`,
              ],
              ["Reclamações", qs.reclamacoes],
              [
                "Satisfação após ocorrência",
                num(qs.satisfacao, "%"),
                "Notas 4 e 5 entre as avaliações recebidas",
              ],
              ["Nota média", num(qs.nota, " / 5"), `${qs.avaliacoes} avaliações`],
              ["Tempo para resolver reclamações", num(qs.reclamacaoResolucao, " dias")],
              [
                "Tempo para resolver ocorrências",
                num(qs.resolucao, " dias"),
                `${qs.resolvidas} ocorrências resolvidas`,
              ],
              [
                "Retorno em garantia das OS entregues",
                num(qs.coorte, "%"),
                "OS entregues no período com retorno posterior até hoje",
              ],
            ]}
          />
          <Tabela
            titulo="Motivos dos problemas"
            aberta={qualidade}
            colunas={["Motivo", "Ocorrências", "Custo registrado"]}
            linhas={r.motivosQualidade.map((q) => [
              motivosQualidade[q.motivo],
              q.quantidade,
              dinheiro(q.custo),
            ])}
          />
          <Tabela
            titulo="Serviços relacionados aos retornos"
            colunas={["Serviço", "Ocorrências", "Horas", "Custo registrado"]}
            linhas={r.servicosQualidade.map((q) => [
              q.nome,
              q.quantidade,
              num(q.horas),
              dinheiro(q.custo),
            ])}
          />
          <div className="rr-ferramentas">
            <Link to="/garantias">Garantias e retrabalhos →</Link>
            <Link to={`/garantias?aba=satisfacao&inicio=${inicio}&fim=${fim}`}>
              Pesquisa geral de satisfação e cobertura →
            </Link>
          </div>
        </>
      )}
      {estoque && (
        <>
          <Cards
            itens={[
              [
                "Investido no estoque",
                dinheiro(r.produtos.reduce((s, p) => s + p.valor, 0)),
                "Saldo físico × custo médio atual",
              ],
              [
                "Abaixo do mínimo",
                r.produtos.filter((p) => p.disponivel < p.minimo).length,
                "Considera as reservas das OS",
              ],
              ["Estoque zerado", r.produtos.filter((p) => p.saldo === 0).length],
              [
                "Compras no período",
                dinheiro(r.compras.reduce((s, p) => s + p.total, 0)),
                `${r.compras.length} compras recebidas`,
              ],
              [
                "Paradas há mais de 90 dias",
                r.produtos.filter(
                  (p) => p.saldo > 0 && p.idade !== null && p.idade > 90,
                ).length,
              ],
              [
                "Paradas há mais de 120 dias",
                r.produtos.filter(
                  (p) => p.saldo > 0 && p.idade !== null && p.idade > 120,
                ).length,
              ],
              [
                "Paradas há mais de 150 dias",
                r.produtos.filter(
                  (p) => p.saldo > 0 && p.idade !== null && p.idade > 150,
                ).length,
              ],
            ]}
          />
          <Tabela
            titulo="Posição das peças e reposição"
            aberta
            nota="Saldo físico inclui reservas. Disponível = saldo menos reservas, limitado a zero. Faltas de reserva aparecem separadas."
            colunas={[
              "Peça",
              "Código",
              "Unidade",
              "Físico",
              "Reservado",
              "Disponível",
              "Falta reserva",
              "Mínimo",
              "Máximo",
              "Custo médio",
              "Investido",
              "Fornecedor",
              "Reposição (dias)",
            ]}
            linhas={r.produtos.map((p) => [
              p.nome,
              p.codigo,
              p.unidade,
              num(p.saldo),
              num(p.reservado),
              num(p.disponivel),
              num(p.faltaReserva),
              num(p.minimo),
              num(p.maximo),
              dinheiro(p.custo),
              dinheiro(p.valor),
              p.fornecedor || "Não informado",
              p.reposicao,
            ])}
            acao={(i) => editar("produto", r.produtos[i].id)}
          />
          <Tabela
            titulo="Peças mais utilizadas"
            nota="Consumo líquido nas OS dentro do período, descontando estornos e devoluções."
            colunas={["Peça", "Unidade", "Quantidade consumida"]}
            linhas={[...r.produtos]
              .filter((p) => p.uso !== 0)
              .sort((a, b) => b.uso - a.uso)
              .map((p) => [p.nome, p.unidade, num(p.uso)])}
          />
          <Tabela
            titulo="Peças paradas e sem movimentação"
            nota="A idade conta desde a última movimentação; sem movimentação, desde o cadastro. Datas ausentes ficam sem estimativa."
            colunas={[
              "Peça",
              "Saldo",
              "Investido",
              "Última movimentação / cadastro",
              "Dias parada",
              "Movimentos no período",
            ]}
            linhas={[...r.produtos]
              .sort((a, b) => (b.idade ?? -1) - (a.idade ?? -1))
              .map((p) => [
                p.nome,
                num(p.saldo),
                dinheiro(p.valor),
                data(p.ultimo),
                p.idade,
                p.movimentosPeriodo,
              ])}
          />
          <Tabela
            titulo="Perdas, devoluções e divergências"
            nota="Saídas avulsas, estornos e contagens físicas. O motivo registrado permite distinguir perdas de outras saídas."
            colunas={[
              "Data",
              "Peça",
              "Tipo",
              "Motivo",
              "Quantidade",
              "Valor movimentado",
            ]}
            linhas={r.excecoes.map((m) => [
              data(m.data),
              m.nome,
              {
                saida: "Saída avulsa",
                estorno: "Estorno / devolução",
                ajuste: "Divergência de contagem",
              }[m.tipo]!,
              m.motivo,
              num(m.quantidade),
              dinheiro(m.valor),
            ])}
          />
          <Tabela
            titulo="Fornecedores: compras e entregas"
            nota="Prazo médio entre pedido e recebimento somente nas compras com data do pedido informada. Atrasos usam a promessa do fornecedor."
            colunas={[
              "Fornecedor",
              "Compras",
              "Total gasto",
              "Prazo médio (dias)",
              "Com prazo medido",
              "Atrasadas",
              "Com promessa",
            ]}
            linhas={r.fornecedores.map((p) => [
              p.nome,
              p.quantidade,
              dinheiro(p.total),
              num(p.prazo),
              p.amostra,
              p.atrasadas,
              p.comPrevisao,
            ])}
          />
          <Tabela
            titulo="Compras e condições de pagamento"
            colunas={[
              "Fornecedor",
              "Documento",
              "Pedido",
              "Entrega prometida",
              "Recebimento",
              "Total",
              "Condições",
              "Prazo real (dias)",
            ]}
            linhas={r.compras.map((c) => [
              c.fornecedor,
              c.documento,
              data(c.pedido),
              data(c.prevista),
              data(c.data),
              dinheiro(c.total),
              c.condicoes || "Não informado",
              num(c.prazo),
            ])}
            acao={(i) => editar("compra", r.compras[i].id)}
          />
        </>
      )}
      {!estoque && (
        <details className="gestao-secao">
          <summary>Completar vínculo e custos de uma OS</summary>
          <div className="gestao-secao-conteudo">
            <label>
              Ordem de serviço
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) abrir("os", e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Selecione a OS</option>
                {osOpcoes.map(([id, n]) => (
                  <option key={id} value={id}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <small>
              Vincule o funcionário cadastrado e confira os custos usados na
              rentabilidade.
            </small>
          </div>
        </details>
      )}
      {edicao && (
        <DadosGestaoEditor
          key={edicao.entidade + edicao.id}
          dados={d}
          {...edicao}
          fechar={() => setEdicao(null)}
        />
      )}
    </section>
  );
}
