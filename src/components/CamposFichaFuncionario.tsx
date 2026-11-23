import type { Funcionario } from "../services/funcionarios";
import { camposFichaFuncionario } from "../lib/camposFichaFuncionario";
export function CamposFichaFuncionario({
  f,
  formId,
}: {
  f: Funcionario;
  formId?: string;
}) {
  const campo = (k: string, n: string, t: string) => (
    <label key={k}>
      {n} (opcional)
      <input
        form={formId}
        type={t}
        name={`dados_${k}`}
        maxLength={500}
        defaultValue={f.dados?.[k] ?? ""}
      />
    </label>
  );
  return (
    <>
      <details className="funcionario-secao">
        <summary>Contratação, salário e jornada (opcional)</summary>
        <div className="funcionario-campos">
          <div className="dupla-campos">
            <label>
              Data de admissão (opcional)
              <input
                form={formId}
                name="admissao"
                type="date"
                defaultValue={f.admissao ?? ""}
              />
            </label>
            <label>
              Data de desligamento (opcional)
              <input
                form={formId}
                name="desligamento"
                type="date"
                defaultValue={f.desligamento ?? ""}
              />
            </label>
          </div>
          <label>
            Salário-base (R$) (opcional)
            <input
              form={formId}
              name="salario"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              defaultValue={f.salario_centavos == null ? "" : f.salario_centavos / 100}
            />
          </label>
          <div className="dupla-campos">
            {camposFichaFuncionario.slice(5).map(([k, n, t]) => campo(k, n, t))}
          </div>
          <p className="texto-suave">
            Alterações no salário-base ficam no histórico. Estes dados não geram folha,
            descontos ou pagamentos no financeiro.
          </p>
        </div>
      </details>
      <details className="funcionario-secao">
        <summary>Dados pessoais e emergência (opcional)</summary>
        <div className="funcionario-campos dupla-campos">
          {camposFichaFuncionario.slice(0, 5).map(([k, n, t]) => campo(k, n, t))}
        </div>
      </details>
    </>
  );
}
