import type { ItemEditorOS } from "../components/EditorItensOS";
import type { BaseOffline, RascunhoOffline } from "./atendimentoOffline";
import type { FichaEspecialidade } from "./perfisAtendimento";
import {
  novaFichaEspecialidade,
  validarFichaEspecialidade,
} from "./perfisAtendimento.ts";
import {
  calcularDesconto,
  descontoInicial,
  estadoDescontoValido,
  type EstadoDesconto,
} from "./desconto.ts";
import { quantidadeItemValida } from "./quantidadeItem.ts";
import { dataDocumento, type DocumentoCliente } from "./documentoCliente.ts";
import { ramos } from "./ramos.ts";
import { especialidades } from "./especialidades.ts";

export type DocumentoOffline = {
  versao: 1;
  tipo: "os" | "orcamento";
  especialidade: string;
  cliente: { id: string; nome: string; telefone: string };
  bem: { id: string; nome: string; marca: string; placa: string; motor: string };
  data: string;
  titulo: string;
  itens: ItemEditorOS[];
  desconto: EstadoDesconto;
  mostrar_desconto_nota: boolean;
  ficha: FichaEspecialidade;
  observacoes: string;
  condicoes: string;
  forma_pagamento: string;
  vencimento: string;
};
export type ReciboDocumentoOffline = {
  id: string;
  numero: number;
  tipo: "os" | "orcamento";
  ramo: string;
  cliente_id: string;
  objeto_id: string;
  total_centavos: number;
};
export function novoDocumentoOffline(
  base: BaseOffline,
  tipo: DocumentoOffline["tipo"],
): DocumentoOffline {
  const especialidade =
    base.especialidade ||
    Object.entries(especialidades).find(
      ([, e]) => e.ramo === (base.ramo || "automotivo"),
    )?.[0] ||
    "mecanica";
  const data = new Date().toLocaleDateString("en-CA");
  return {
    versao: 1,
    tipo,
    especialidade,
    cliente: { id: "", nome: "", telefone: "" },
    bem: { id: "", nome: "", marca: "", placa: "", motor: "" },
    data,
    titulo: "",
    itens: [],
    desconto: descontoInicial(),
    mostrar_desconto_nota: false,
    ficha: novaFichaEspecialidade(especialidade),
    observacoes: "",
    condicoes: "",
    forma_pagamento: "Carteira",
    vencimento: data,
  };
}
export function totaisDocumentoOffline(d: DocumentoOffline) {
  const subtotal = d.itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos),
    0,
  );
  const desconto = calcularDesconto(d.desconto, subtotal);
  return { subtotal, desconto, total: subtotal - desconto };
}
export function validarDocumentoOffline(d: DocumentoOffline) {
  if (
    d.versao !== 1 ||
    !["os", "orcamento"].includes(d.tipo) ||
    !especialidades[d.especialidade]
  )
    throw Error("Documento inválido.");
  if (d.cliente.nome.trim().length < 2 || d.cliente.nome.length > 160)
    throw Error("Informe o nome do cliente.");
  if (d.bem.nome.trim().length < 2 || d.bem.nome.length > 160)
    throw Error("Informe o veículo, equipamento ou local.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d.data) ||
    !Number.isFinite(Date.parse(d.data)) ||
    new Date(d.data).toISOString().slice(0, 10) !== d.data
  )
    throw Error("Confira a data do serviço.");
  if (!d.itens.length || d.itens.length > 100)
    throw Error("Adicione pelo menos um serviço ou produto, até 100 itens.");
  if (
    d.itens.some(
      (i) =>
        !i.descricao.trim() ||
        i.descricao.length > 300 ||
        !["service", "part"].includes(i.tipo) ||
        !quantidadeItemValida(i.quantidade) ||
        !Number.isSafeInteger(i.preco_unitario_centavos) ||
        i.preco_unitario_centavos < 0 ||
        i.preco_unitario_centavos > 100000000,
    )
  )
    throw Error("Confira descrição, quantidade e preço dos itens.");
  if (!estadoDescontoValido(d.desconto)) throw Error("Confira o desconto.");
  const t = totaisDocumentoOffline(d);
  if (!Number.isSafeInteger(t.subtotal) || t.subtotal > 1e10 || t.total < 0)
    throw Error("O desconto não pode superar o valor dos itens.");
  if (d.ficha.especialidade !== d.especialidade)
    throw Error("Confira a ficha deste subsistema.");
  validarFichaEspecialidade(d.ficha);
  if (d.observacoes.length > 4000 || d.condicoes.length > 4000)
    throw Error("Resuma as observações e condições em até 4.000 caracteres.");
  if (
    d.tipo === "os" &&
    especialidades[d.especialidade].ramo === "automotivo" &&
    d.observacoes.length + d.condicoes.length + 14 > 5000
  )
    throw Error(
      "Resuma as observações e condições da OS em até 5.000 caracteres no total.",
    );
  return t;
}
/** O mesmo conteúdo alimenta impressão HTML e PDF; não depende de nenhuma consulta. */
export function documentoParaImprimirOffline(
  r: RascunhoOffline,
  base: BaseOffline,
): DocumentoCliente {
  const d = r.documento!;
  const t = validarDocumentoOffline(d);
  const ramo = especialidades[d.especialidade].ramo,
    auto = ramo === "automotivo";
  const mostrar = d.tipo === "orcamento" || d.mostrar_desconto_nota;
  const referencia = r.recibo
    ? String(r.recibo.numero).padStart(4, "0")
    : "LOCAL-" + r.id.slice(0, 8).toUpperCase();
  return {
    tipo: d.tipo,
    titulo: d.tipo === "os" ? "Ordem de serviço" : "Orçamento",
    numero: referencia,
    arquivo: `${d.tipo}-${referencia}.pdf`,
    identidade: base.identidade || { nome: base.nome },
    situacao: r.recibo
      ? "Sincronizado"
      : "Salvo no aparelho · aguardando sincronização",
    destaque: !r.recibo,
    cliente: d.cliente.nome,
    telefoneCliente: d.cliente.telefone,
    veiculo: d.bem.nome,
    motor: d.bem.motor,
    placa: d.bem.placa,
    bem: {
      rotulo: auto ? "Veículo / identificação" : ramos[ramo].objeto,
      valor: [
        d.bem.nome,
        d.bem.marca && "Marca: " + d.bem.marca,
        d.bem.motor && "Motor: " + d.bem.motor,
        d.bem.placa && "Placa: " + d.bem.placa,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    informacoes: [{ rotulo: "Data do serviço", valor: dataDocumento(d.data, false) }],
    vencimento: d.forma_pagamento === "Carteira" ? d.vencimento : undefined,
    formaPagamento: d.forma_pagamento,
    tituloItens:
      ramo === "limpeza" || ramo === "manutencao_campo"
        ? "Serviços e materiais"
        : "Serviços e peças",
    itens: d.itens.map((i) => ({
      ...i,
      total: Math.round(i.quantidade * i.preco_unitario_centavos),
      cancelado: false,
    })),
    subtotal: t.subtotal,
    desconto: mostrar ? t.desconto : 0,
    total: mostrar ? t.total : t.subtotal,
    mostrarDesconto: mostrar,
    secoes: [
      ...(d.observacoes ? [{ titulo: "Observações", texto: d.observacoes }] : []),
      ...(d.condicoes ? [{ titulo: "Condições", texto: d.condicoes }] : []),
      ...(!r.recibo
        ? [
            {
              titulo: "Referência local",
              texto: `${referencia} · Número oficial disponível após a sincronização.`,
            },
          ]
        : []),
    ],
    assinatura:
      d.tipo === "os"
        ? "Conferência dos serviços e condições relacionados nesta ordem."
        : "Ciência do orçamento pelo cliente",
    aviso: "Sem valor fiscal. Não comprova pagamento.",
  };
}
