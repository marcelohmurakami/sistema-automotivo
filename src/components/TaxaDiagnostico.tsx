import { dinheiro } from "../lib/formatacao";
import {
  abatimentoDiagnostico,
  type TaxaDiagnostico,
} from "../lib/diagnosticoOrcamento";
import { diaLocal } from "../services/servicos";
import { useAcesso } from "../auth/contexto";

export function CamposTaxaDiagnostico({
  taxa,
  bloqueado = false,
  alterar,
}: {
  taxa?: TaxaDiagnostico;
  bloqueado?: boolean;
  alterar?: (t: TaxaDiagnostico) => void;
}) {
  const { demo } = useAcesso();
  if (demo)
    return (
      <details className="os-detalhes">
        <summary>Taxa de diagnóstico (opcional)</summary>
        <p>
          A cobrança automática e o abatimento ficam disponíveis na conta real,
          vinculados ao financeiro da empresa.
        </p>
      </details>
    );
  return (
    <details className="os-detalhes">
      <summary>Taxa de diagnóstico (opcional)</summary>
      <div
        className="form-grid"
        onChange={(e) => {
          const form = (e.target as HTMLInputElement).form;
          if (form && alterar) {
            const dados = new FormData(form);
            alterar({
              valor_centavos: Math.round(
                Number(dados.get("diagnostico_valor") || 0) * 100,
              ),
              vencimento: String(dados.get("diagnostico_vencimento") || ""),
              abater_na_aprovacao: dados.has("diagnostico_abater"),
            });
          }
        }}
      >
        <label>
          Valor da taxa (R$)
          <input
            name="diagnostico_valor"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            defaultValue={(taxa?.valor_centavos || 0) / 100}
            disabled={bloqueado}
          />
        </label>
        <label>
          Vencimento da taxa
          <input
            name="diagnostico_vencimento"
            type="date"
            defaultValue={taxa?.vencimento || diaLocal(new Date().toISOString())}
            disabled={bloqueado}
          />
        </label>
      </div>
      <label className="aprovacao-confirmar">
        <input
          name="diagnostico_abater"
          type="checkbox"
          defaultChecked={taxa?.abater_na_aprovacao !== false}
          disabled={bloqueado}
          onChange={(e) =>
            alterar?.({ ...taxa, abater_na_aprovacao: e.target.checked })
          }
        />
        Abater a taxa quando o orçamento for aprovado
      </label>
      <p>
        Ao salvar, a taxa gera uma conta a receber. Registre o pagamento somente quando
        receber. Em caso de recusa, a taxa continua devida.
      </p>
      <small>
        Na aprovação total ou parcial, o abatimento fica limitado ao valor autorizado.
        Não informe a mesma taxa também como item do orçamento.
      </small>
    </details>
  );
}

export function ResumoTaxaDiagnostico({
  taxa,
  total,
}: {
  taxa?: TaxaDiagnostico;
  total: number;
}) {
  if (!taxa?.valor_centavos) return null;
  const abatimento = abatimentoDiagnostico(taxa, total);
  return (
    <div className="aviso-cliente">
      <strong>Taxa de diagnóstico: {dinheiro(taxa.valor_centavos)}</strong>
      <p>Cobrada separadamente, inclusive se o orçamento for recusado.</p>
      {taxa.abater_na_aprovacao && total <= 0 ? (
        <p>
          Sem serviços autorizados, não há abatimento. A taxa de diagnóstico permanece
          separada.
        </p>
      ) : taxa.abater_na_aprovacao ? (
        <p>
          Abatimento nesta aprovação: <strong>{dinheiro(abatimento)}</strong>. Valor dos
          serviços após o abatimento: <strong>{dinheiro(total - abatimento)}</strong>.
        </p>
      ) : (
        <p>A taxa não será descontada dos serviços.</p>
      )}
    </div>
  );
}
