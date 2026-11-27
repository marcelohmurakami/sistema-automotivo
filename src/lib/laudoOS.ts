import type { OrdemServico } from "../services/ordensServico";
import type { DetalhesAtendimento } from "../types/servicosCompletos";
import type { Identidade } from "../services/documentos";
import { camposFichaComplementar } from "./fichaComplementarOS";
import { gruposFichaEspecialidade } from "./perfisAtendimento";
import { especialidades } from "./especialidades";
import { dataDocumento, telefoneDocumento } from "./documentoCliente";

export type CampoLaudoOS = { rotulo: string; valor: string };
export type LaudoOS = {
  empresa: Identidade;
  numero: string;
  revisao: number;
  situacao: string;
  geradoEm: string;
  identificacao: CampoLaudoOS[];
  secoes: { titulo: string; campos: CampoLaudoOS[] }[];
  itens: { descricao: string; quantidade: number; unidade: string; situacao: string }[];
  responsavel: string;
};
function campos(valores: [string, string | null | undefined][]): CampoLaudoOS[] {
  return valores.flatMap(([rotulo, valor]) =>
    valor?.trim() ? [{ rotulo, valor: valor.trim() }] : [],
  );
}
const situacoes: Record<string, string> = {
  open: "Recebida",
  in_progress: "Em execução",
  quality_check: "Em conferência",
  ready: "Pronta para entrega",
  delivered: "Entregue",
  cancelled: "Cancelada",
  orcamento: "Em análise",
  aprovado: "Aprovada",
  em_execucao: "Em execução",
  aguardando: "Aguardando",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

/** Documento de leitura: não emite versões no módulo de laudos nem altera a OS. */
export function laudoDaOS(
  o: OrdemServico,
  empresa: Identidade,
  geradoEm = new Date().toISOString(),
): LaudoOS {
  const secoes = camposFichaComplementar(o, {
    incluirInternas: false,
    incluirGestao: false,
  });
  if (o.resumo_cliente?.trim())
    secoes.push({
      titulo: "Observações e orientações",
      campos: [{ rotulo: "Observações", valor: o.resumo_cliente.trim() }],
    });
  return {
    empresa,
    numero: String(o.numero),
    revisao: o.revisao,
    situacao: situacoes[o.situacao] || o.situacao,
    geradoEm,
    identificacao: campos([
      ["Cliente", o.dados_cliente.nome],
      ["CPF / CNPJ", o.dados_cliente.documento],
      ["Contato", telefoneDocumento(o.dados_cliente.telefone_e164)],
      ["Veículo / componente", o.dados_veiculo.modelo],
      ["Motor", o.dados_veiculo.motor],
      ["Placa", o.dados_veiculo.placa],
      ["Data do serviço", o.data_servico ? dataDocumento(o.data_servico, false) : null],
    ]),
    secoes,
    itens: o.itens.map((i) => ({
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidade || "un",
      situacao:
        (
          {
            done: "Concluído",
            cancelled: "Cancelado",
            pending: "A realizar",
            in_progress: "Em execução",
          } as Record<string, string>
        )[i.situacao] || "Registrado",
    })),
    responsavel: o.responsavel?.trim() || "",
  };
}

export function laudoDoAtendimento(
  d: DetalhesAtendimento,
  empresa: Identidade,
  geradoEm = new Date().toISOString(),
): LaudoOS {
  const a = d.atendimento;
  const ramo =
    especialidades[a.ficha_especialidade?.especialidade || empresa.especialidade || ""]
      ?.ramo;
  const secoes = gruposFichaEspecialidade(a.ficha_especialidade);
  const detalhes = campos([
    ["Descrição do serviço", a.dados.descricao_servico],
    ["Solicitação", a.dados.solicitacao],
    ["Diagnóstico", a.dados.diagnostico],
    ["Execução registrada", a.dados.execucao],
    ["Observações ao cliente", a.dados.observacoes_cliente],
    ["Condições", a.dados.condicoes],
    ["Orientações", a.dados.orientacoes],
    ["Garantia", a.dados.garantia],
  ]);
  if (detalhes.length)
    secoes.unshift({ titulo: "Detalhes do atendimento", campos: detalhes });
  return {
    empresa,
    numero: String(a.numero || a.id.slice(0, 8)),
    revisao: a.revisao,
    situacao: situacoes[a.situacao] || a.situacao,
    geradoEm,
    identificacao: campos([
      ["Cliente", d.cliente.nome],
      ["Contato", telefoneDocumento(d.cliente.telefone)],
      [ramo === "limpeza" ? "Local avaliado" : "Equipamento / local", d.objeto.nome],
      ["Marca", d.objeto.dados.marca],
      ["Modelo", d.objeto.dados.modelo],
      ["Série / identificação", d.objeto.dados.serie],
      ["IMEI", d.objeto.dados.imei],
      ["Endereço", d.objeto.dados.endereco],
      ["Data do serviço", a.data_servico ? dataDocumento(a.data_servico, false) : null],
    ]),
    secoes,
    itens: d.itens.map((i) => ({
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidade || "un",
      situacao:
        a.situacao === "cancelado"
          ? "Cancelado"
          : a.situacao === "concluido"
            ? "Concluído"
            : "Registrado",
    })),
    responsavel: d.equipe
      .map((e) => e.nome)
      .filter(Boolean)
      .join(" · "),
  };
}
