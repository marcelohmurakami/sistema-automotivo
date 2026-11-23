import { DetalhesRelatorio } from "./relatorios/ControlesRelatorios";
import { dinheiro } from "../lib/formatacao";
import { GraficoResultados } from "./GraficoResultados";
import { nomeCategoria } from "../lib/exportarRelatorioFinanceiro";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CircleCheck,
  CreditCard,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { formas, contas as contasPadrao } from "../services/financeiro";

import {
  custoTotal,
  resultadoFinanceiro,
  nomesFaixas,
  nomesAtrasos,
  type DiaFinanceiro,
  type RelatorioFinanceiro as Dados,
} from "../lib/relatorioFinanceiro";

const dia = (s: string) => s.split("-").reverse().join("/");
const pct = (n: number, total: number) =>
  total > 0
    ? ((n / total) * 100).toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      }) + "%"
    : "—";
function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const diferenca = atual - anterior;
  return (
    <span className="rel-variacao">
      {diferenca === 0
        ? "Sem variação"
        : `${diferenca > 0 ? "+" : "−"}${dinheiro(Math.abs(diferenca))}`}
      {anterior > 0 && diferenca !== 0
        ? ` (${diferenca > 0 ? "+" : "−"}${pct(Math.abs(diferenca), anterior)})`
        : ""}
    </span>
  );
}
function Card({
  titulo,
  valor,
  detalhe,
  tom = "",
}: {
  titulo: string;
  valor: string;
  detalhe: React.ReactNode;
  tom?: string;
}) {
  return (
    <article className={`rel-indicador ${tom ? "rel-tom--" + tom : ""}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small>{detalhe}</small>
    </article>
  );
}
export function GraficoFinanceiro({ serie }: { serie: DiaFinanceiro[] }) {
  const [visao, setVisao] = useState<"resultado" | "caixa">("resultado");
  const caixa = visao === "caixa";
  return (
    <GraficoResultados
      key={visao}
      id="rel-evolucao"
      titulo="Evolução no período"
      descricao={
        caixa
          ? "Compare o dinheiro que entrou e saiu do caixa."
          : "Compare as receitas com os custos e veja o resultado do período."
      }
      monetario
      pontos={serie.map((p) => ({
        data: p.data,
        valores: caixa
          ? [p.entradas, p.saidas, p.entradas - p.saidas]
          : [p.receitas, p.custos, p.receitas - p.custos],
      }))}
      series={[
        {
          nome: caixa ? "Entradas" : "Receitas",
          cor: "#3797b3",
          detalhe: caixa
            ? "Dinheiro recebido no período"
            : "Serviços e outras receitas",
        },
        {
          nome: caixa ? "Saídas" : "Custos e despesas",
          cor: "#d89046",
          detalhe: caixa ? "Dinheiro pago no período" : "Peças, despesas e taxas",
        },
        {
          nome: caixa ? "Movimento líquido" : "Resultado",
          cor: "#55a878",
          detalhe: caixa ? "Entradas menos saídas" : "Receitas menos custos e despesas",
          saldo: true,
          comparar: false,
          positivo: caixa ? "Caixa aumentou" : "Lucro no período",
          negativo: caixa ? "Caixa diminuiu" : "Prejuízo no período",
        },
      ]}
      controles={
        <label>
          Visualizar
          <select
            aria-label="Visualizar gráfico financeiro"
            value={visao}
            onChange={(e) => setVisao(e.target.value as "resultado" | "caixa")}
          >
            <option value="resultado">Receitas e custos</option>
            <option value="caixa">Entradas e saídas do caixa</option>
          </select>
        </label>
      }
    />
  );
}

export function RelatorioFinanceiro({
  dados: d,
  contas = contasPadrao,
  visao = "resumo",
}: {
  dados: Dados;
  visao?: "resumo" | "caixa";
  contas?: Record<string, string>;
}) {
  const r = d.resumo,
    anterior = d.anterior,
    custos = custoTotal(r),
    resultado = resultadoFinanceiro(r);
  const saldo = d.contas.reduce((s, c) => s + c.saldo, 0),
    proximos = d.vencimentos.filter((v) => v.faixa <= 4);
  const previstoReceber = proximos.reduce((s, v) => s + v.receber, 0),
    previstoPagar = proximos.reduce((s, v) => s + v.pagar, 0),
    projecao = saldo + previstoReceber - previstoPagar;
  const gastos = d.categorias.filter((c) => c.natureza === "pagar"),
    maiorGasto = Math.max(1, ...gastos.map((c) => Math.abs(c.valor)));
  const comparacao = [
    { nome: "Receitas", atual: r.receitas, anterior: anterior.receitas },
    {
      nome: "Custos e despesas",
      atual: custos,
      anterior: custoTotal(anterior),
    },
    {
      nome: "Resultado estimado",
      atual: resultado,
      anterior: resultadoFinanceiro(anterior),
    },
    {
      nome: "Entradas líquidas",
      atual: r.entradas,
      anterior: anterior.entradas,
    },
    { nome: "Saídas", atual: r.saidas, anterior: anterior.saidas },
    {
      nome: "Movimento líquido",
      atual: r.entradas - r.saidas,
      anterior: anterior.entradas - anterior.saidas,
    },
  ];
  return (
    <>
      {visao === "resumo" && (
        <>
          <p className="rr-contexto">
            Vendas e custos do período. Recebimentos e pagamentos ficam em Caixa e
            contas.
          </p>
          <section
            className="rel-indicadores"
            id="rel-resultado"
            aria-label="Resultado do período"
          >
            <Card
              titulo="Receitas do período"
              valor={dinheiro(r.receitas)}
              detalhe={
                <>
                  <Variacao atual={r.receitas} anterior={anterior.receitas} />
                  <span>em relação ao período anterior</span>
                </>
              }
            />
            <Card
              titulo="Custos e despesas"
              valor={dinheiro(custos)}
              detalhe={
                <>
                  <Variacao atual={custos} anterior={custoTotal(anterior)} />
                  <span>peças, despesas e taxas</span>
                </>
              }
            />
            <Card
              titulo={resultado < 0 ? "Prejuízo estimado" : "Lucro estimado"}
              valor={dinheiro(resultado)}
              tom={resultado < 0 ? "perigo" : "positivo"}
              detalhe={
                <>
                  <Variacao
                    atual={resultado}
                    anterior={resultadoFinanceiro(anterior)}
                  />
                  <span>em relação ao período anterior</span>
                </>
              }
            />
            <Card
              titulo="Margem estimada"
              valor={pct(resultado, r.receitas)}
              detalhe={
                r.receitas > 0
                  ? `Resultado de ${dinheiro((resultado / r.receitas) * 10000)} a cada R$ 100 vendidos.`
                  : "Sem receita para calcular a margem."
              }
            />
          </section>
          {(r.revisar_custos > 0 || d.variaveis_pendentes > 0) && (
            <div className="rel-aviso">
              <TriangleAlert size={18} />
              <span>
                {r.revisar_custos > 0 && (
                  <>{r.revisar_custos} OS com custos a conferir. </>
                )}
                {d.variaveis_pendentes > 0 && (
                  <>
                    {d.variaveis_pendentes} conta(s) variável(is) sem valor
                    confirmado.{" "}
                  </>
                )}
                Os valores podem mudar.
              </span>
              {r.revisar_custos > 0 && (
                <Link to="/financeiro?aba=custos">
                  Conferir custos <ArrowUpRight size={14} />
                </Link>
              )}
              {d.variaveis_pendentes > 0 && (
                <Link to="/financeiro?aba=contas">
                  Confirmar contas <ArrowUpRight size={14} />
                </Link>
              )}
            </div>
          )}
          <GraficoFinanceiro serie={d.serie} />
          <DetalhesRelatorio titulo="De onde vêm o lucro e os gastos">
            <div className="rel-duas-colunas">
              <section className="rel-painel">
                <header>
                  <div>
                    <h2>Como chegamos ao resultado</h2>
                    <p className="rel-nota">
                      Vendas e gastos do período, mesmo que ainda não pagos.
                    </p>
                  </div>
                </header>
                <dl className="rel-dados">
                  {d.categorias
                    .filter((c) => c.natureza === "receber")
                    .map((c) => (
                      <div key={c.categoria}>
                        <dt>{nomeCategoria(c.categoria)}</dt>
                        <dd>{dinheiro(c.valor)}</dd>
                      </div>
                    ))}
                  <div className="rel-total">
                    <dt>Total de receitas</dt>
                    <dd>{dinheiro(r.receitas)}</dd>
                  </div>
                  <div>
                    <dt>
                      − Peças consumidas do estoque
                      <small>Custo registrado na saída das peças</small>
                    </dt>
                    <dd>{dinheiro(r.pecas)}</dd>
                  </div>
                  <div>
                    <dt>− Despesas e peças externas</dt>
                    <dd>{dinheiro(r.despesas)}</dd>
                  </div>
                  <div>
                    <dt>− Taxas de recebimento</dt>
                    <dd>{dinheiro(r.taxas)}</dd>
                  </div>
                  <div
                    className={`rel-total rel-resultado-final ${resultado < 0 ? "rel-valor-negativo" : ""}`}
                  >
                    <dt>{resultado < 0 ? "Prejuízo estimado" : "Lucro estimado"}</dt>
                    <dd>{dinheiro(resultado)}</dd>
                  </div>
                </dl>
                <details className="rel-metodo rel-detalhe-tabela">
                  <summary>Entenda o cálculo</summary>
                  <p>
                    A receita inclui o valor completo da venda. Peças do estoque entram
                    pelo custo registrado no consumo; peças externas, salários, aluguel,
                    impostos e demais gastos entram pelas despesas cadastradas. Taxas
                    entram na data do recebimento e estornos desfazem os valores.
                  </p>
                  <p>
                    Comprar estoque, colocar dinheiro do dono ou fazer uma retirada
                    movimenta o caixa, mas não entra novamente no lucro. O resultado é
                    gerencial e depende do registro de todos os custos.
                  </p>
                </details>
              </section>
              <section className="rel-painel">
                <header>
                  <div>
                    <h2>Onde estão os gastos</h2>
                    <p className="rel-nota">
                      Despesas por categoria e participação no custo total.
                    </p>
                  </div>
                </header>
                {gastos.length ? (
                  <div className="rel-gastos">
                    {gastos.map((c) => (
                      <div key={c.categoria}>
                        <div>
                          <span>{nomeCategoria(c.categoria)}</span>
                          <strong>{dinheiro(c.valor)}</strong>
                          <small>{pct(c.valor, custos)}</small>
                        </div>
                        <meter
                          aria-label={nomeCategoria(c.categoria)}
                          min={0}
                          max={maiorGasto}
                          value={Math.abs(c.valor)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rel-vazio">Nenhum custo registrado neste período.</p>
                )}
              </section>
            </div>
          </DetalhesRelatorio>
          <DetalhesRelatorio titulo="Comparar com o período anterior">
            <section className="rel-painel">
              <header>
                <div>
                  <h2>Comparação com o período anterior</h2>
                  <p className="rel-nota">
                    {dia(d.inicio_anterior)} a {dia(d.fim_anterior)} · mesma quantidade
                    de dias.
                  </p>
                </div>
              </header>
              <div className="rel-tabela-rolagem">
                <table className="rel-tabela">
                  <thead>
                    <tr>
                      <th scope="col">Indicador</th>
                      <th scope="col">Anterior</th>
                      <th scope="col">Selecionado</th>
                      <th scope="col">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparacao.map((c) => (
                      <tr key={c.nome}>
                        <th scope="row">{c.nome}</th>
                        <td>{dinheiro(c.anterior)}</td>
                        <td>{dinheiro(c.atual)}</td>
                        <td>
                          <Variacao atual={c.atual} anterior={c.anterior} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </DetalhesRelatorio>
        </>
      )}
      {visao === "caixa" && (
        <>
          <div className="rel-secao-titulo" id="rel-caixa">
            <h2>
              <Wallet size={21} />
              Dinheiro no caixa
            </h2>
            <span>Somente recebimentos e pagamentos realizados no período</span>
          </div>
          <div className="rel-duas-colunas">
            <section className="rel-painel">
              <header>
                <h2>Entradas, saídas e saldo</h2>
              </header>
              <dl className="rel-dados">
                <div>
                  <dt>Saldo antes do período</dt>
                  <dd>{dinheiro(d.saldo_inicial)}</dd>
                </div>
                <div>
                  <dt>
                    + Entradas líquidas<small>Já descontadas as taxas</small>
                  </dt>
                  <dd>{dinheiro(r.entradas)}</dd>
                </div>
                <div>
                  <dt>− Pagamentos realizados</dt>
                  <dd>{dinheiro(r.saidas)}</dd>
                </div>
                <div className="rel-total">
                  <dt>Movimento líquido do período</dt>
                  <dd>{dinheiro(r.entradas - r.saidas)}</dd>
                </div>
                <div className="rel-total">
                  <dt>Saldo no fim do período</dt>
                  <dd>{dinheiro(d.saldo_final)}</dd>
                </div>
              </dl>
              <p className="rel-nota">
                Inclui compra de estoque, aportes e retiradas. Transferências entre
                caixa e banco não aumentam as entradas ou saídas.
              </p>
              <details className="rel-metodo rel-detalhe-tabela">
                <summary>Detalhar movimentação por categoria</summary>
                <dl className="rel-dados">
                  {d.caixa_categorias.map((c) => (
                    <div key={c.natureza + c.categoria}>
                      <dt>
                        {c.natureza === "receber" ? "Entrada" : "Saída"} ·{" "}
                        {nomeCategoria(c.categoria)}
                      </dt>
                      <dd>{dinheiro(c.valor)}</dd>
                    </div>
                  ))}
                  {!d.caixa_categorias.length && (
                    <p className="rel-vazio">Nenhuma movimentação no período.</p>
                  )}
                </dl>
              </details>
            </section>
            <section className="rel-painel">
              <header>
                <div>
                  <h2>
                    <CreditCard size={20} />
                    Como o dinheiro foi recebido
                  </h2>
                  <p className="rel-nota">
                    Recebimentos por forma de pagamento, descontados os estornos.
                  </p>
                </div>
              </header>
              {d.formas.length ? (
                <div className="rel-tabela-rolagem">
                  <table className="rel-tabela">
                    <thead>
                      <tr>
                        <th scope="col">Forma</th>
                        <th scope="col">Bruto</th>
                        <th scope="col">Taxas</th>
                        <th scope="col">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.formas.map((f) => (
                        <tr key={f.forma}>
                          <th scope="row">{formas[f.forma] ?? f.forma}</th>
                          <td>{dinheiro(f.bruto)}</td>
                          <td>{dinheiro(f.taxas)}</td>
                          <td>{dinheiro(f.liquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td>{dinheiro(d.formas.reduce((s, f) => s + f.bruto, 0))}</td>
                        <td>{dinheiro(d.formas.reduce((s, f) => s + f.taxas, 0))}</td>
                        <td>{dinheiro(r.entradas)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="rel-vazio">Nenhum recebimento neste período.</p>
              )}
              <p className="rel-nota">
                Inclui todas as entradas externas, como aportes. O bruto representa
                dinheiro recebido antes das taxas; não é o total vendido.
              </p>
            </section>
          </div>
          <div className="rel-secao-titulo rel-fin-divisor" id="rel-contas">
            <h2>Contas a receber e pagar</h2>
            <span>
              Posição atual · {dia(d.data_referencia)} · independente do período acima
            </span>
          </div>
          <section className="rel-indicadores" aria-label="Contas atuais">
            <Card
              titulo="Disponível hoje"
              valor={dinheiro(saldo)}
              detalhe={
                <>
                  {d.contas.map((c) => (
                    <span className="fin-conta-detalhe" key={c.conta}>
                      {contas[c.conta] || "Conta bancária"}: {dinheiro(c.saldo)}
                    </span>
                  ))}
                </>
              }
            />
            <Card
              titulo="Total a receber"
              valor={dinheiro(r.receber)}
              detalhe="Saldo ainda não recebido, de todas as datas."
            />
            <Card
              titulo="Total a pagar"
              valor={dinheiro(r.pagar)}
              detalhe="Saldo ainda não pago, de todas as datas."
            />
            <Card
              titulo="Recebimentos em atraso"
              valor={dinheiro(r.receber_atrasado)}
              tom={r.receber_atrasado > 0 ? "alerta" : ""}
              detalhe={
                <>
                  {pct(r.receber_atrasado, r.receber)} do total a receber
                  <br />A pagar em atraso: {dinheiro(r.pagar_atrasado)}
                </>
              }
            />
          </section>
          <div className="rel-duas-colunas">
            <section className="rel-painel">
              <header>
                <h2>Quando o dinheiro vence</h2>
                <Link to="/financeiro?aba=contas">
                  Abrir contas <ArrowUpRight size={15} />
                </Link>
              </header>
              <div className="rel-tabela-rolagem">
                <table className="rel-tabela">
                  <thead>
                    <tr>
                      <th scope="col">Vencimento</th>
                      <th scope="col">A receber</th>
                      <th scope="col">A pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.vencimentos.map((v) => (
                      <tr
                        key={v.faixa}
                        className={v.faixa === 0 ? "rel-faixa-vencida" : ""}
                      >
                        <th scope="row">{nomesFaixas[v.faixa]}</th>
                        <td>{dinheiro(v.receber)}</td>
                        <td>{dinheiro(v.pagar)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total em aberto</th>
                      <td>{dinheiro(r.receber)}</td>
                      <td>{dinheiro(r.pagar)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
            <section
              className={`rel-painel ${projecao < 0 ? "rel-tom--perigo" : "rel-tom--positivo"}`}
            >
              <header>
                <div>
                  <h2>Previsão de caixa para 30 dias</h2>
                  <p className="rel-nota">
                    Estimativa se todas as contas abaixo forem recebidas e pagas.
                  </p>
                </div>
              </header>
              <dl className="rel-dados">
                <div>
                  <dt>Disponível hoje</dt>
                  <dd>{dinheiro(saldo)}</dd>
                </div>
                <div>
                  <dt>
                    + A receber até 30 dias
                    <small>Inclui {dinheiro(r.receber_atrasado)} já vencidos</small>
                  </dt>
                  <dd>{dinheiro(previstoReceber)}</dd>
                </div>
                <div>
                  <dt>
                    − A pagar até 30 dias
                    <small>Inclui {dinheiro(r.pagar_atrasado)} já vencidos</small>
                  </dt>
                  <dd>{dinheiro(previstoPagar)}</dd>
                </div>
                <div className="rel-total rel-resultado-final">
                  <dt>Saldo projetado</dt>
                  <dd>{dinheiro(projecao)}</dd>
                </div>
              </dl>
              <p className="rel-nota">
                Só considera contas já cadastradas. Novas vendas, despesas futuras ainda
                não lançadas e taxas futuras não estão incluídas.
              </p>
              {projecao < 0 && (
                <p className="rel-nota">
                  <strong>
                    Os compromissos cadastrados superam o caixa e os recebimentos
                    previstos.
                  </strong>
                </p>
              )}
            </section>
          </div>
          {(r.receber_atrasado > 0 || r.pagar_atrasado > 0) && (
            <section className="rel-painel">
              <header>
                <h2>Há quanto tempo estão atrasados?</h2>
              </header>
              <div className="rel-tabela-rolagem">
                <table className="rel-tabela">
                  <thead>
                    <tr>
                      <th scope="col">Tempo de atraso</th>
                      <th scope="col">A receber</th>
                      <th scope="col">A pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.atrasos.map((v) => (
                      <tr key={v.faixa}>
                        <th scope="row">{nomesAtrasos[v.faixa]}</th>
                        <td>{dinheiro(v.receber)}</td>
                        <td>{dinheiro(v.pagar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <div className="rel-duas-colunas">
            {(["receber", "pagar"] as const).map((n) => (
              <section className="rel-painel" key={n}>
                <header>
                  <div>
                    <h2>
                      {n === "receber"
                        ? "Recebimentos para acompanhar"
                        : "Pagamentos para organizar"}
                    </h2>
                    <p className="rel-nota">
                      Até 8 contas vencidas ou a vencer em 30 dias, das mais antigas às
                      mais próximas.
                    </p>
                  </div>
                </header>
                <div className="rel-fin-pendencias">
                  {d.pendencias
                    .filter((p) => p.natureza === n)
                    .map((p) => (
                      <Link
                        key={p.id}
                        to={`/financeiro?aba=contas&titulo=${p.id}`}
                        className="rel-fin-pendencia"
                      >
                        <div>
                          <strong>{p.descricao}</strong>
                          <span>{p.pessoa || "Sem pessoa informada"}</span>
                          <small
                            className={
                              p.vencimento < d.data_referencia
                                ? "rel-valor-negativo"
                                : ""
                            }
                          >
                            {p.vencimento < d.data_referencia
                              ? "Vencido em "
                              : p.vencimento === d.data_referencia
                                ? "Vence hoje · "
                                : "Vence em "}
                            {dia(p.vencimento)}
                            {p.valor_variavel && !p.valor_confirmado_em
                              ? " · Valor a confirmar"
                              : ""}
                          </small>
                        </div>
                        <b>{dinheiro(p.aberto_centavos)}</b>
                        <ArrowUpRight size={15} />
                      </Link>
                    ))}
                  {!d.pendencias.some((p) => p.natureza === n) && (
                    <p className="rel-vazio">
                      <CircleCheck size={20} />
                      Nenhuma conta vencida ou a vencer nos próximos 30 dias.
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
