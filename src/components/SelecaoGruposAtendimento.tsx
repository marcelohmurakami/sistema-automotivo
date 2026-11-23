import { dinheiro } from "../lib/formatacao";
import {
  abatimentoDiagnostico,
  type TaxaDiagnostico,
} from "../lib/diagnosticoOrcamento";
import { ResumoTaxaDiagnostico } from "./TaxaDiagnostico";
import {
  gruposDoAtendimento,
  selecionarGrupoAtendimento,
  totalAutorizado,
} from "../lib/aprovacaoServicos";
import type { ItemPropostaServico } from "../types/servicosCompletos";
import "./AprovacaoAtendimento.css";

export function SelecaoGruposAtendimento({
  itens,
  desconto,
  selecionados,
  alterar,
  bloqueado = false,
  taxa,
}: {
  itens: ItemPropostaServico[];
  desconto: number;
  selecionados: string[];
  alterar: (grupos: string[]) => void;
  bloqueado?: boolean;
  taxa?: TaxaDiagnostico;
}) {
  const grupos = gruposDoAtendimento(itens);
  const total = totalAutorizado(itens, desconto, selecionados);
  return (
    <div className="aprovacao-grupos">
      {grupos.map((g) => (
        <label
          className={`aprovacao-grupo${selecionados.includes(g.nome) ? " selecionado" : ""}`}
          key={g.nome}
        >
          <input
            type="checkbox"
            checked={selecionados.includes(g.nome)}
            disabled={bloqueado}
            onChange={(e) =>
              alterar(
                selecionarGrupoAtendimento(
                  itens,
                  selecionados,
                  g.nome,
                  e.target.checked,
                ),
              )
            }
          />
          <span>
            <strong>{g.nome}</strong>
            <span>
              {itens
                .filter((i) => (i.grupo_servico?.trim() || "Atendimento") === g.nome)
                .map(
                  (i) =>
                    `${i.descricao} · ${i.quantidade.toLocaleString("pt-BR")} ${i.unidade} × ${dinheiro(i.preco_centavos)}`,
                )
                .join("; ")}
            </span>
            {!!g.dependencias.length && (
              <small>Inclui também: {g.dependencias.join(", ")}</small>
            )}
          </span>
          <strong>{dinheiro(g.subtotal)}</strong>
        </label>
      ))}
      <div className="aprovacao-total" aria-live="polite">
        <span>
          {selecionados.length} de {grupos.length} grupos selecionados
          {total.desconto > 0 && (
            <small>Desconto proporcional: {dinheiro(total.desconto)}</small>
          )}
        </span>
        <strong>
          {dinheiro(total.total - abatimentoDiagnostico(taxa, total.total))}
        </strong>
      </div>
      <ResumoTaxaDiagnostico taxa={taxa} total={total.total} />
    </div>
  );
}
