import type { OrdemServico } from "../services/ordensServico.ts";
import { dataDocumento } from "./documentoCliente.ts";
import { gruposFichaEspecialidade } from "./perfisAtendimento.ts";

export function camposFichaComplementar(
  o: OrdemServico,
  { incluirInternas = true, incluirGestao = true } = {},
) {
  const grupos: {
    titulo: string;
    campos: { rotulo: string; valor: string }[];
  }[] = [];
  function grupo(
    titulo: string,
    campos: [string, string | number | null | undefined][],
  ) {
    const preenchidos = campos.filter(([, v]) => v != null && String(v).trim() !== "");
    if (preenchidos.length)
      grupos.push({
        titulo,
        campos: preenchidos.map(([rotulo, valor]) => ({
          rotulo,
          valor: String(valor),
        })),
      });
  }
  grupos.push(...gruposFichaEspecialidade(o.ficha_especialidade));
  grupo("Relato do cliente", [["Relato", o.queixa_cliente]]);
  if (incluirGestao)
    grupo("Responsável e prioridade", [
      ["Responsável", o.responsavel],
      [
        "Prioridade",
        o.prioridade && o.prioridade !== "normal"
          ? { low: "Baixa", high: "Alta", urgent: "Urgente" }[o.prioridade] ||
            o.prioridade
          : o.responsavel
            ? "Normal"
            : null,
      ],
    ]);
  grupo("Entrada e condições do veículo", [
    [
      "Entrada",
      o.recebido_em &&
      (o.pertences ||
        o.quilometragem_entrada != null ||
        o.combustivel_percentual != null)
        ? dataDocumento(o.recebido_em)
        : null,
    ],
    [
      "Quilometragem de entrada",
      o.quilometragem_entrada != null ? `${o.quilometragem_entrada} km` : null,
    ],
    [
      "Combustível",
      o.combustivel_percentual != null ? `${o.combustivel_percentual}%` : null,
    ],
    ["Pertences e condições", o.pertences],
  ]);
  grupo("Diagnóstico e execução", [
    ["Relação de peças", o.pecas_a_trocar],
    ["Detalhes específicos do serviço", o.detalhes_especialidade],
    ["Diagnóstico técnico", o.diagnostico],
    ["Códigos de falha / testes", o.codigos_falha],
    [
      "Quilometragem de saída",
      o.quilometragem_saida != null ? `${o.quilometragem_saida} km` : null,
    ],
  ]);
  grupo("Garantia", [
    ["Garantia até", o.garantia_ate ? dataDocumento(o.garantia_ate, false) : null],
    ["Condições da garantia", o.condicoes_garantia],
  ]);
  const checklist = Object.entries(o.checklist || {});
  if (checklist.some(([, marcado]) => marcado))
    grupo(
      "Checklist de conferência",
      checklist.map(([item, marcado]) => [item, marcado ? "Conferido" : "Não marcado"]),
    );
  if (incluirInternas)
    grupo("Observações internas - uso da oficina", [
      ["Anotações internas", o.observacoes_internas],
    ]);
  return grupos;
}
