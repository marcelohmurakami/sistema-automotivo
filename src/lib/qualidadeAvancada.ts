export type TipoAcompanhamento = "analise" | "fabricante" | "custodia" | "assinatura";
export type DocumentoQualidade = {
  id: string;
  origem: "os" | "atendimento";
  numero: number;
  cliente_id: string;
  cliente: string;
  objeto: string;
  telefone?: string;
  pronto_em?: string;
  finalizado_em?: string;
  dias?: number;
  itens?: { codigo: string; descricao: string; local: string; situacao: string }[];
  acompanhamento?: {
    id: string;
    situacao: string;
    dados: Record<string, string | number>;
  } | null;
};
export type AcompanhamentoQualidade = {
  id: string;
  tipo: TipoAcompanhamento;
  situacao: string;
  dados: Record<string, string | number>;
  ordem_servico_id: string | null;
  atendimento_id: string | null;
  revisao: number;
  documento: DocumentoQualidade & {
    empresa: string;
    conteudo: Record<string, string | number>;
  };
  documento_canonico: string;
  hash_documento: string;
  criado_em: string;
  atualizado_em: string;
  cliente?: string;
  objeto?: string;
  numero?: number;
};
export type CampoQualidade = {
  id: string;
  nome: string;
  tipo?: "area" | "dinheiro" | "date" | "datetime-local" | "email";
  ajuda?: string;
  opcional?: boolean;
  obrigatorio?: boolean;
};
export const titulosQualidade: Record<TipoAcompanhamento, string> = {
  analise: "Análise da falha",
  fabricante: "Garantia com fabricante",
  custodia: "Controle de retirada",
  assinatura: "Assinatura especializada",
};
export const etapasQualidade: Record<TipoAcompanhamento, Record<string, string>> = {
  analise: {
    aberta: "Aberta",
    em_analise: "Em análise",
    confirmada: "Causa confirmada pela equipe",
    encerrada: "Solução verificada",
    cancelada: "Cancelada",
  },
  fabricante: {
    aberta: "Preparar solicitação",
    solicitada: "Solicitada",
    autorizada: "Autorizada",
    negada: "Negada",
    enviada: "Peças enviadas",
    recebida: "Peças recebidas",
    ressarcida: "Ressarcimento recebido",
    encerrada: "Encerrada",
    cancelada: "Cancelada",
  },
  custodia: {
    aberta: "Aguardando contato",
    notificada: "Cliente avisado",
    combinada: "Retirada combinada",
    retirada: "Retirada concluída",
    cancelada: "Cancelada",
  },
  assinatura: { preparada: "Preparada · aguarda integração", cancelada: "Cancelada" },
};
export const camposQualidade: Record<TipoAcompanhamento, CampoQualidade[]> = {
  analise: [
    { id: "descricao", nome: "O que aconteceu?", tipo: "area", obrigatorio: true },
    {
      id: "hipotese",
      nome: "Possível causa",
      ajuda: "Uma hipótese a testar; não atribui responsabilidade.",
    },
    { id: "teste", nome: "Teste realizado e resultado", tipo: "area" },
    {
      id: "evidencias",
      nome: "Evidências verificadas",
      tipo: "area",
      ajuda: "Medições, fotos na OS, laudos ou referências dos arquivos.",
    },
    { id: "conclusao", nome: "Conclusão do responsável", tipo: "area" },
    { id: "acao", nome: "Ação para corrigir e evitar repetição", tipo: "area" },
    { id: "validacao", nome: "Verificação após a correção", tipo: "area" },
    {
      id: "porques",
      nome: "Por que aconteceu?",
      tipo: "area",
      opcional: true,
      ajuda:
        "Aprofunde cada resposta com outro porquê. Pare quando houver uma causa verificável, sem presumir culpa.",
    },
  ],
  fabricante: [
    { id: "descricao", nome: "Problema apresentado", tipo: "area", obrigatorio: true },
    {
      id: "fabricante",
      nome: "Fabricante / assistência autorizada",
      obrigatorio: true,
    },
    { id: "pecas", nome: "Peças, quantidade e série / lote", obrigatorio: true },
    { id: "protocolo", nome: "Protocolo da solicitação" },
    { id: "prazo", nome: "Prazo de resposta", tipo: "date" },
    { id: "solicitado_centavos", nome: "Valor solicitado (R$)", tipo: "dinheiro" },
    { id: "autorizado_centavos", nome: "Valor autorizado (R$)", tipo: "dinheiro" },
    { id: "vencimento_ressarcimento", nome: "Previsão de recebimento", tipo: "date" },
    { id: "recebido_centavos", nome: "Ressarcimento recebido (R$)", tipo: "dinheiro" },
    { id: "autorizacao", nome: "Autorização do fabricante", tipo: "area" },
    {
      id: "rastreio",
      nome: "Envio / rastreamento / recebimento das peças",
      tipo: "area",
    },
    { id: "comprovante", nome: "Referência do comprovante de ressarcimento" },
    {
      id: "conclusao",
      nome: "Resultado / motivo de recusa ou encerramento",
      tipo: "area",
    },
    {
      id: "documentos",
      nome: "Nota de compra e documentos de apoio",
      tipo: "area",
      opcional: true,
    },
  ],
  custodia: [
    {
      id: "descricao",
      nome: "Bem e acessórios sob guarda",
      tipo: "area",
      obrigatorio: true,
    },
    { id: "local", nome: "Local de guarda" },
    { id: "condicao", nome: "Condição do bem e conferência", tipo: "area" },
    { id: "contato", nome: "Canal, destinatário e resultado do contato", tipo: "area" },
    { id: "contato_em", nome: "Contato realizado em", tipo: "datetime-local" },
    { id: "retirada_prevista", nome: "Retirada combinada", tipo: "date" },
    { id: "recebedor", nome: "Quem recebeu" },
    {
      id: "documentos",
      nome: "Documentos e comprovantes",
      tipo: "area",
      opcional: true,
    },
  ],
  assinatura: [
    { id: "descricao", nome: "Título do documento", obrigatorio: true },
    { id: "signatario", nome: "Nome de quem assinará", obrigatorio: true },
    { id: "email", nome: "E-mail de quem assinará", tipo: "email", obrigatorio: true },
    { id: "conteudo", nome: "Conteúdo do documento", tipo: "area", obrigatorio: true },
  ],
};
export function roteiroAnalise(especialidade: string, ramo: string) {
  if (especialidade.includes("celular"))
    return [
      "Conferir oxidação, impactos e condição de entrada",
      "Medir alimentação e testar a peça substituída",
      "Repetir os testes de carga, áudio e comunicação aplicáveis",
    ];
  if (especialidade.includes("informatica"))
    return [
      "Conferir sintomas e testes de hardware",
      "Verificar logs, temperatura e alimentação",
      "Reproduzir a falha sem alterar os dados do cliente",
    ];
  if (especialidade.includes("placa") || especialidade.includes("eletron"))
    return [
      "Conferir esquema, tensões e sinais",
      "Inspecionar componentes e soldas",
      "Testar sob carga com procedimento adequado",
    ];
  if (especialidade.includes("eletrodom"))
    return [
      "Conferir instalação e condições de uso",
      "Testar o ciclo e os componentes envolvidos",
      "Registrar medições e repetir o teste após o reparo",
    ];
  if (ramo === "limpeza")
    return [
      "Conferir superfície, produto e diluição",
      "Comparar o resultado com o escopo combinado",
      "Registrar antes e depois e validar com o cliente",
    ];
  if (especialidade.includes("climat"))
    return [
      "Conferir instalação, filtros e drenagem",
      "Registrar temperaturas e testes do equipamento",
      "Comparar com o procedimento do fabricante",
    ];
  if (especialidade.includes("eletric"))
    return [
      "Conferir circuito, proteção e conexão",
      "Registrar medições feitas por profissional habilitado",
      "Verificar o resultado após a correção",
    ];
  if (ramo === "manutencao_campo")
    return [
      "Comparar instalação e uso com o escopo contratado",
      "Registrar inspeção, medições e teste funcional",
      "Verificar a correção com o responsável no local",
    ];
  return [
    "Comparar o sintoma com a condição de entrada",
    "Conferir peça, montagem e medições do serviço",
    "Reproduzir a falha e testar novamente após a correção",
  ];
}
export const caminhoDocumentoQualidade = (
  d: Pick<DocumentoQualidade, "id" | "origem">,
) =>
  d.origem === "os"
    ? `/ordens-servico?os=${d.id}`
    : `/atendimentos?atendimento=${d.id}`;

export function textoAvisoRetirada(a: AcompanhamentoQualidade) {
  const d = a.documento;
  const combinado = String(a.dados.retirada_prevista || "");
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(combinado)
    ? combinado.split("-").reverse().join("/")
    : "";
  return `Olá, ${a.cliente || d.cliente}. O atendimento #${a.numero || d.numero} (${a.objeto || d.objeto}) está pronto para retirada em ${d.empresa}.${dia ? ` A data combinada é ${dia}.` : " Por favor, entre em contato para combinar a retirada."} Se precisar de ajuda, fale com nossa equipe.`;
}
export function porcentagemQualidade(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0;
}
// Contrato independente de provedor. Nenhum estado local equivale a assinatura concluída.
export function pacoteAssinatura(a: AcompanhamentoQualidade) {
  if (a.tipo !== "assinatura" || a.situacao !== "preparada")
    throw new Error("Prepare um documento ativo para integrar.");
  return {
    versao: 1,
    idempotencia: a.id,
    estado: "aguardando_provedor",
    documento_canonico: a.documento_canonico,
    hash_sha256: a.hash_documento,
    algoritmo: "SHA-256",
    signatario: { nome: a.dados.signatario, email: a.dados.email },
    requisitos: [
      "autenticação do signatário",
      "webhook autenticado e idempotente",
      "conferência do hash e versão",
      "documento final e trilha de auditoria",
    ],
  };
}
