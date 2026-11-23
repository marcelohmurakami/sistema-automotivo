import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { salvarComplemento } from "../services/relatoriosGestao";
import { erroPublico } from "../lib/supabase";
import { complemento, type DadosGestao } from "../lib/relatoriosGestao";
export function DadosGestaoEditor({
  dados,
  entidade,
  id,
  fechar,
}: {
  dados: DadosGestao;
  entidade: string;
  id: string;
  fechar: () => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const trava = useRef(false);
  const c = complemento(dados, entidade, id),
    rev =
      dados.complementos.find((c) => c.entidade === entidade && c.registro_id === id)
        ?.revisao || 0;
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trava.current) return;
    const f = new FormData(e.currentTarget),
      d: Record<string, unknown> = {};
    for (const [k, v] of f.entries()) d[k] = v;
    if (entidade === "oficina") {
      d.capacidade = Number(d.capacidade);
      d.dias = f.getAll("dias").map(Number);
    }
    if (entidade === "os") {
      d.custos_conferidos = f.has("custos_conferidos");
      d.custo_externo_centavos = Math.round(Number(f.get("custo_externo")) * 100);
    }
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await salvarComplemento(a.demo, a.oficina!.id, entidade, id, d, rev);
      await qc.invalidateQueries({ queryKey: ["relatorios-gestao"] });
      fechar();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  const campo = (nome: string, rotulo: string, tipo = "text", obrigatorio = false) => (
    <label>
      {rotulo}
      <input
        name={nome}
        type={tipo}
        defaultValue={String(c[nome] ?? "")}
        required={obrigatorio}
        min={tipo === "number" ? (nome === "capacidade" ? 1 : 0) : undefined}
        step={
          tipo === "number"
            ? ["capacidade", "reposicao_dias"].includes(nome)
              ? "1"
              : "0.001"
            : undefined
        }
      />
    </label>
  );
  return (
    <Dialogo
      aberto
      fechar={() => {
        if (!ocupado) fechar();
      }}
      titulo={
        {
          oficina: "Capacidade e expediente",
          os: "Custos e funcionário da OS",
          produto: "Reposição da peça",
          compra: "Pedido e entrega da compra",
          despesa: "Classificar despesa",
          profissional: "Vincular comissionado ao funcionário",
        }[entidade] || "Dados de gestão"
      }
      classe="qual-dialogo"
    >
      <form className="qual-form" onSubmit={salvar}>
        <fieldset disabled={ocupado}>
          {entidade === "os" && (
            <p>
              <strong>
                OS #{dados.ordens.find((o) => o.id === id)?.numero} ·{" "}
                {dados.ordens.find((o) => o.id === id)?.cliente}
              </strong>
            </p>
          )}
          {entidade === "produto" && (
            <p>
              <strong>{dados.produtos.find((p) => p.id === id)?.nome}</strong>
            </p>
          )}
          {entidade === "compra" && (
            <p>
              <strong>
                {dados.compras.find((c) => c.id === id)?.fornecedor} ·{" "}
                {dados.compras.find((c) => c.id === id)?.documento}
              </strong>
            </p>
          )}
          {entidade === "despesa" && (
            <p>
              <strong>{dados.titulos.find((t) => t.id === id)?.nome}</strong>
            </p>
          )}
          {entidade === "oficina" && (
            <>
              <p>
                Informe quantos veículos ou serviços a oficina comporta simultaneamente.
                A ocupação histórica usa a capacidade informada aqui.
              </p>
              {campo("capacidade", "Capacidade da oficina", "number", true)}
              <div className="qual-grid">
                {campo("abertura", "Início do expediente", "time", true)}
                {campo("fechamento", "Fim do expediente", "time", true)}
              </div>
              <div className="qual-checks">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((n, i) => (
                  <label key={n}>
                    <input
                      type="checkbox"
                      name="dias"
                      value={i}
                      defaultChecked={Array.isArray(c.dias) && c.dias.includes(i)}
                    />
                    {n}
                  </label>
                ))}
              </div>
              <small>
                O expediente delimita as horas sem agendamento. Registre bloqueios na
                agenda para os intervalos indisponíveis.
              </small>
            </>
          )}
          {(entidade === "os" || entidade === "profissional") && (
            <label>
              Funcionário cadastrado
              <select
                name="funcionario_id"
                defaultValue={String(c.funcionario_id || "")}
              >
                <option value="">Sem vínculo</option>
                {dados.funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.ativo ? "" : " (inativo)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {entidade === "os" && (
            <>
              <label>
                Custos adicionais ainda não lançados (R$)
                <input
                  name="custo_externo"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={Number(c.custo_externo_centavos || 0) / 100}
                />
              </label>
              <p className="qual-legenda">
                Peças consumidas, despesas vinculadas, apontamentos de mão de obra e
                comissões já entram no cálculo. Informe acima apenas o que falta. Os
                custos de garantia são registrados na ficha da ocorrência.
              </p>
              <label className="qual-check">
                <input
                  type="checkbox"
                  name="custos_conferidos"
                  defaultChecked={!!c.custos_conferidos}
                />{" "}
                Conferi os custos desta OS
              </label>
              <small>
                O vínculo de funcionário identifica o responsável para a análise. As
                atribuições individuais de comissão têm preferência em cada serviço.
              </small>
            </>
          )}
          {entidade === "produto" && (
            <>
              <div className="qual-grid">
                {campo("maximo", "Estoque máximo", "number")}
                {campo("reposicao_dias", "Prazo de reposição (dias)", "number")}
              </div>
              <label>
                Fornecedor principal
                <select
                  name="fornecedor_id"
                  defaultValue={String(c.fornecedor_id || "")}
                >
                  <option value="">Não informado</option>
                  {dados.fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {entidade === "compra" && (
            <>
              <div className="qual-grid">
                {campo("pedido_em", "Data do pedido", "date")}
                {campo("prevista_em", "Entrega prometida pelo fornecedor", "date")}
              </div>
              {campo("condicoes", "Condições de pagamento")}
              <small>
                A data da compra no estoque representa o recebimento efetivo. Estas
                datas permitem medir o prazo e o atraso do fornecedor.
              </small>
            </>
          )}
          {entidade === "despesa" && (
            <label>
              Comportamento do custo
              <select
                name="classificacao"
                defaultValue={String(c.classificacao || "nao_classificada")}
              >
                <option value="nao_classificada">Não classificada</option>
                <option value="fixa">Fixa — existe mesmo sem produção</option>
                <option value="variavel">
                  Variável — acompanha o volume de serviços
                </option>
              </select>
              <small>
                Um valor que muda de mês para mês pode continuar sendo um custo fixo.
              </small>
            </label>
          )}
          {erro && <p role="alert">{erro}</p>}
          <button type="submit" className="botao-primario" disabled={ocupado}>
            {ocupado ? "Salvando…" : "Salvar dados"}
          </button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
