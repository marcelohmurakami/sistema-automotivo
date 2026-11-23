import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { dinheiro } from "../../lib/formatacao";
import { baixarCSV } from "../../lib/csv";
import { erroPublico } from "../../lib/supabase";
import { novoId } from "../../lib/uuid";
import { categorias } from "../../services/financeiro";
import {
  consultarApuracao,
  gruposResultado,
  exportarContabilidade,
  registrarAjuste,
  cancelarAjuste,
  salvarMapaContabil,
  conferirApuracao,
  type MapaContabil,
  type AjusteResultado,
} from "../../services/custeio";
import { Dialogo } from "../Dialogo";
import { exportarMovimentosContador } from "../../services/conciliacao";

const nomes: Record<string, string> = {
  ...categorias,
  estoque_consumido: "Estoque consumido",
  taxas: "Taxas de recebimento",
  depreciacao: "Depreciação",
  provisao: "Provisões",
  tributos_lucro: "Tributos sobre o lucro",
  deducoes_receita: "Deduções da receita",
};
const classes = [
  "servicos",
  "outras_receitas",
  "pecas_externas",
  "pessoal",
  "aluguel",
  "agua_luz",
  "impostos",
  "terceiros",
  "outras_despesas",
  "estoque_consumido",
  "taxas",
  "depreciacao",
  "provisao",
  "tributos_lucro",
  "deducoes_receita",
];
const grupoPadrao = (c: string) =>
  ["servicos", "outras_receitas"].includes(c)
    ? "receita"
    : ["pecas_externas", "terceiros", "estoque_consumido"].includes(c)
      ? "custos"
      : c === "taxas"
        ? "despesa_financeira"
        : c === "tributos_lucro"
          ? "tributo_lucro"
          : c === "deducoes_receita"
            ? "deducoes"
            : "operacionais";
export function ApuracaoCompleta({
  inicio,
  fim,
  abrirCustos,
}: {
  inicio: string;
  fim: string;
  abrirCustos: () => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [busy, setBusy] = useState(false),
    [mapa, setMapa] = useState<MapaContabil | null>(null),
    [novo, setNovo] = useState(false),
    [reverter, setReverter] = useState<AjusteResultado | null>(null),
    [conferir, setConferir] = useState(false);
  const trava = useRef(false),
    chave = useRef(novoId());
  const q = useQuery({
    queryKey: ["apuracao", a.oficina!.id, inicio, fim],
    queryFn: ({ signal }) => consultarApuracao(a.oficina!.id, inicio, fim, signal),
    enabled: !a.demo,
  });
  async function executar(
    fn: () => Promise<unknown>,
    texto = "Registro salvo.",
    alteraDados = true,
  ) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      await fn();
      if (alteraDados) await qc.invalidateQueries({ queryKey: ["apuracao"] });
      setNovo(false);
      setMapa(null);
      setReverter(null);
      setConferir(false);
      setAviso(texto);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  function ajuste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void executar(() =>
      registrarAjuste(a.oficina!.id, {
        id: chave.current,
        descricao: String(f.get("descricao")),
        competencia: String(f.get("data")),
        categoria: String(f.get("categoria")),
        valor: Math.round(Number(f.get("valor")) * 100),
      }),
    );
  }
  async function exportar() {
    await executar(
      async () => {
        const l = await exportarContabilidade(a.oficina!.id, inicio, fim);
        baixarCSV(
          [
            [
              "Data de competência",
              "Origem / identificador",
              "Descrição",
              "Categoria",
              "Grupo de resultado",
              "Valor (R$)",
              "Conta débito",
              "Conta crédito",
            ],
            ...l.map((x) => [
              x.data,
              x.chave,
              x.descricao,
              nomes[x.categoria] || x.categoria,
              gruposResultado[x.grupo],
              (x.valor / 100).toFixed(2).replace(".", ","),
              x.conta_debito,
              x.conta_credito,
            ]),
          ],
          `apuracao-${inicio}-${fim}.csv`,
        );
      },
      "Arquivo gerado para conferência e importação pelo contador.",
      false,
    );
  }
  async function exportarCaixa() {
    await executar(
      async () => {
        const linhas = await exportarMovimentosContador(a.oficina!.id, inicio, fim);
        baixarCSV(
          [
            [
              "Data do pagamento",
              "Identificador do movimento",
              "Título",
              "Descrição",
              "Pessoa",
              "Conta bancária",
              "Categoria",
              "Forma",
              "Movimento líquido (R$)",
              "Taxa (R$)",
              "Estorno de",
              "Conciliação",
              "Identificador no banco",
              "Data no banco",
            ],
            ...linhas.map((x) => [
              x.data,
              x.id,
              x.titulo_id,
              x.descricao,
              x.pessoa,
              x.conta_nome,
              nomes[x.categoria] || x.categoria,
              x.forma,
              (x.valor / 100).toFixed(2).replace(".", ","),
              (x.taxa_assinada / 100).toFixed(2).replace(".", ","),
              x.estorno_de,
              x.linha_id ? "Conciliado" : "Sem vínculo",
              x.identificador_banco,
              x.data_extrato,
            ]),
          ],
          `movimentos-contador-${inicio}-${fim}.csv`,
        );
      },
      "Movimentações exportadas. Transferências e estornos estão identificados para a conferência do contador.",
      false,
    );
  }
  const d = q.data;
  return (
    <section className="plano-op fin-ampliado">
      <header className="plano-cabecalho">
        <div>
          <h2>Resultado por competência</h2>
          <p>
            Receitas e despesas pela data em que pertencem ao resultado, mesmo sem
            pagamento.
          </p>
        </div>
        <div className="plano-acoes">
          <button
            className="botao-secundario"
            disabled={busy || !d}
            onClick={() => void exportar()}
          >
            Exportar apuração contábil
          </button>
          <button
            className="botao-secundario"
            disabled={busy || !d}
            onClick={() => void exportarCaixa()}
          >
            Exportar pagamentos e conciliação
          </button>
        </div>
      </header>
      {a.demo ? (
        <p className="aviso-cliente">
          A apuração completa usa os lançamentos da empresa conectada. A demonstração
          mantém os exemplos no resumo financeiro.
        </p>
      ) : q.isPending ? (
        <p role="status">Apurando o período…</p>
      ) : q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : (
        d && (
          <>
            <div className="apuracao-status">
              <strong className={d.conferido ? "custo-conferido" : "custo-pendente"}>
                {d.conferido ? "Conferido pela empresa" : "Resultado provisório"}
              </strong>
              <span>
                {d.servicos_revisar} serviços com custos a conferir ·{" "}
                {d.valores_nao_confirmados} despesas variáveis sem confirmação
                {d.custos_sem_financeiro > 0 &&
                  ` · ${d.custos_sem_financeiro} custos operacionais ainda sem vínculo financeiro`}
              </span>
              <button className="botao-secundario" onClick={abrirCustos}>
                Conferir custos dos serviços
              </button>
            </div>
            <div className="apuracao-demonstrativo">
              {[
                ["Receita bruta", d.grupos.receita || 0, false],
                ["− Deduções da receita", -(d.grupos.deducoes || 0), false],
                ["Receita líquida", d.receita_liquida, true],
                ["− Custos dos serviços e produtos", -(d.grupos.custos || 0), false],
                ["Resultado bruto", d.resultado_bruto, true],
                ["− Despesas operacionais", -(d.grupos.operacionais || 0), false],
                ["Resultado operacional", d.resultado_operacional, true],
                ["+ Receitas financeiras", d.grupos.receita_financeira || 0, false],
                ["− Despesas financeiras", -(d.grupos.despesa_financeira || 0), false],
                ["− Tributos sobre o lucro", -(d.grupos.tributo_lucro || 0), false],
                ["Resultado líquido gerencial", d.resultado_liquido, true],
              ].map(([label, valor, total]) => (
                <div className={total ? "apuracao-total" : ""} key={String(label)}>
                  <span>{label}</span>
                  <strong data-negativo={Number(valor) < 0}>
                    {dinheiro(Number(valor) || 0)}
                  </strong>
                </div>
              ))}
            </div>
            <p className="texto-suave">
              Considera lançamentos confirmados, consumo de estoque, taxas e ajustes
              abaixo. Folha, encargos, depreciação e tributos precisam estar registrados
              na competência correta. A hora usada na formação de preço não cria essas
              despesas automaticamente.
            </p>
            <div className="plano-acoes">
              <button
                className="botao-secundario"
                disabled={busy}
                onClick={() => {
                  chave.current = novoId();
                  setNovo(true);
                }}
              >
                Registrar ajuste por competência
              </button>
              <button
                className="botao-primario"
                disabled={
                  busy ||
                  d.servicos_revisar > 0 ||
                  d.valores_nao_confirmados > 0 ||
                  d.custos_sem_financeiro > 0
                }
                onClick={() => setConferir(true)}
              >
                Concluir conferência do período
              </button>
            </div>
            <section className="plano-op fin-ampliado">
              <h3>Margem por cliente</h3>
              <p>
                Até 100 clientes, do maior resultado para o menor, usando os serviços
                com data no período, inclusive os que ainda estão em andamento. Inclui
                os custos apropriados e pode diferir da receita já reconhecida acima.
              </p>
              <div className="plano-lista">
                {d.clientes.map((c) => (
                  <div className="custo-linha" key={c.id}>
                    <span>
                      <strong>{c.cliente}</strong>
                      <small>
                        {c.quantidade} serviços ·{" "}
                        {c.pendentes
                          ? `${c.pendentes} a conferir`
                          : "Custos conferidos"}
                      </small>
                    </span>
                    <span>
                      <small>Valor dos serviços</small>
                      {dinheiro(c.receita)}
                    </span>
                    <span>
                      <small>Custos e apropriações</small>
                      {dinheiro(c.custo)}
                    </span>
                    <span data-negativo={c.margem < 0}>
                      <small>Margem {c.pendentes ? "estimada" : "conferida"}</small>
                      <strong>{dinheiro(c.margem)}</strong>
                      <small>
                        {c.receita > 0
                          ? `${((c.margem / c.receita) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
                          : "Sem receita"}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              {!d.clientes.length && <p>Nenhum serviço no período.</p>}
            </section>
            <details>
              <summary>Ajustes do período ({d.ajustes.length})</summary>
              <p>
                Ajustes não movimentam dinheiro. Não repita aqui despesas que já constam
                nas contas a pagar.
              </p>
              <div className="plano-lista">
                {d.ajustes.map((x) => (
                  <div className="plano-linha" key={x.id}>
                    <span>
                      <strong>{x.descricao}</strong>
                      <small className="fin-conta-detalhe">
                        {x.competencia.split("-").reverse().join("/")} ·{" "}
                        {nomes[x.categoria]}
                      </small>
                    </span>
                    <strong>{dinheiro(x.valor)}</strong>
                    <button
                      className="botao-secundario"
                      disabled={busy}
                      onClick={() => setReverter(x)}
                    >
                      Reverter ajuste
                    </button>
                  </div>
                ))}
              </div>
            </details>
            <details>
              <summary>Classificação e contas para o contador</summary>
              <p>
                {d.sem_mapeamento} lançamentos sem contas contábeis preenchidas.
                Configure com seu contador antes de importar o arquivo. A exportação é
                CSV e não transmite obrigações fiscais nem substitui a escrituração
                contábil.
              </p>
              <div className="plano-lista">
                {classes.map((c) => {
                  const m = d.plano.find((x) => x.categoria === c) || {
                    categoria: c,
                    grupo: grupoPadrao(c),
                    conta_debito: "",
                    conta_credito: "",
                    revisao: 0,
                  };
                  return (
                    <div className="plano-linha" key={c}>
                      <span>
                        <strong>{nomes[c]}</strong>
                        <small className="fin-conta-detalhe">
                          {gruposResultado[m.grupo]} · Débito{" "}
                          {m.conta_debito || "não definido"} · Crédito{" "}
                          {m.conta_credito || "não definido"}
                        </small>
                      </span>
                      <button
                        className="botao-secundario"
                        disabled={busy}
                        onClick={() => setMapa(m)}
                      >
                        Configurar
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          </>
        )
      )}
      {erro && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
      <Dialogo
        aberto={novo}
        titulo="Ajuste por competência"
        fechar={() => !busy && setNovo(false)}
      >
        <form className="formulario-cliente" onSubmit={ajuste}>
          <fieldset disabled={busy}>
            <p>
              Use para depreciação, provisões ou valores ainda ausentes da apuração.
              Este registro não cria cobrança nem pagamento.
            </p>
            <label>
              Descrição
              <input name="descricao" required minLength={3} maxLength={300} />
            </label>
            <label>
              Categoria
              <select name="categoria">
                {[
                  "depreciacao",
                  "provisao",
                  "tributos_lucro",
                  "deducoes_receita",
                  "impostos",
                  "outras_despesas",
                  "outras_receitas",
                ].map((c) => (
                  <option key={c} value={c}>
                    {nomes[c]}
                  </option>
                ))}
              </select>
            </label>
            <div className="dupla-campos">
              <label>
                Data de competência
                <input type="date" name="data" required defaultValue={fim} />
              </label>
              <label>
                Valor (R$)
                <input
                  type="number"
                  name="valor"
                  required
                  step="0.01"
                  min={-100000000}
                  max={100000000}
                />
              </label>
            </div>
            <small>
              Valor positivo acrescenta o custo ou a receita da categoria. Valor
              negativo reduz. Não informe zero.
            </small>
            <button className="botao-primario">Registrar ajuste</button>
            {erro && <p role="alert">{erro}</p>}
          </fieldset>
        </form>
      </Dialogo>
      <Dialogo
        aberto={!!reverter}
        titulo="Reverter ajuste"
        fechar={() => !busy && setReverter(null)}
      >
        <form
          className="formulario-cliente"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void executar(() =>
              cancelarAjuste(a.oficina!.id, reverter!.id, String(f.get("motivo"))),
            );
          }}
        >
          <fieldset disabled={busy}>
            <p>
              {reverter?.descricao} · {dinheiro(reverter?.valor || 0)}. O histórico será
              preservado.
            </p>
            <label>
              Motivo
              <input name="motivo" required minLength={3} maxLength={1000} />
            </label>
            <button className="botao-primario">Confirmar reversão</button>
            {erro && <p role="alert">{erro}</p>}
          </fieldset>
        </form>
      </Dialogo>
      <Dialogo
        aberto={!!mapa}
        titulo="Classificação contábil"
        fechar={() => !busy && setMapa(null)}
      >
        {mapa && (
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              void executar(() => salvarMapaContabil(a.oficina!.id, mapa));
            }}
          >
            <fieldset disabled={busy}>
              <strong>{nomes[mapa.categoria]}</strong>
              <label>
                Grupo de resultado
                <select
                  value={mapa.grupo}
                  onChange={(e) => setMapa({ ...mapa, grupo: e.target.value })}
                >
                  {Object.entries(gruposResultado)
                    .filter(
                      ([g]) =>
                        ["servicos", "outras_receitas"].includes(mapa.categoria) ===
                        ["receita", "receita_financeira"].includes(g),
                    )
                    .map(([g, n]) => (
                      <option key={g} value={g}>
                        {n}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Conta de débito (opcional)
                <input
                  maxLength={60}
                  value={mapa.conta_debito}
                  onChange={(e) => setMapa({ ...mapa, conta_debito: e.target.value })}
                />
              </label>
              <label>
                Conta de crédito (opcional)
                <input
                  maxLength={60}
                  value={mapa.conta_credito}
                  onChange={(e) => setMapa({ ...mapa, conta_credito: e.target.value })}
                />
              </label>
              <button className="botao-primario">Salvar classificação</button>
              {erro && <p role="alert">{erro}</p>}
            </fieldset>
          </form>
        )}
      </Dialogo>
      <Dialogo
        aberto={conferir}
        titulo="Conferir o resultado do período"
        fechar={() => !busy && setConferir(false)}
      >
        <form
          className="formulario-cliente"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void executar(() =>
              conferirApuracao(
                a.oficina!.id,
                inicio,
                fim,
                d!.assinatura,
                String(f.get("observacao")),
              ),
            );
          }}
        >
          <fieldset disabled={busy}>
            <label className="plano-check">
              <input type="checkbox" required />
              Conferi as receitas, a folha com encargos, despesas, tributos, depreciação
              e provisões do período, sem duplicar valores.
            </label>
            <label>
              Observação da conferência
              <textarea name="observacao" required minLength={3} maxLength={1000} />
            </label>
            <p>
              Alterações nos valores exigem nova conferência. Esta é uma apuração
              gerencial.
            </p>
            <button className="botao-primario">Confirmar conferência</button>
            {erro && <p role="alert">{erro}</p>}
          </fieldset>
        </form>
      </Dialogo>
    </section>
  );
}
