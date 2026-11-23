export const categoriasFisicas = {
  equipamento: "Equipamento / bem",
  veiculo: "Veículo",
  acessorio: "Acessório",
  chave: "Chave",
  peca: "Peça / material",
  outro: "Outro",
} as const;
export const situacoesFisicas = {
  na_empresa: "Na empresa",
  externo: "Fora da empresa",
  entregue: "Entregue",
  nao_localizado: "Não localizado",
} as const;
export const acoesFisicas = {
  entrada: "Registrado",
  identificacao: "Identificação corrigida",
  vinculo: "Vínculo atualizado",
  mover: "Movido",
  externo: "Saída para serviço externo",
  entregar: "Entrega física",
  retorno: "Retorno registrado",
  nao_localizado: "Não localizado",
} as const;
export type VinculoFisico = {
  tipo: "os" | "orcamento" | "atendimento" | "objeto" | "estoque";
  id: string;
};
export type ContextoFisico = VinculoFisico & {
  titulo: string;
  descricao: string;
  cliente?: string;
  local_sugerido?: string;
};
export type LocalFisico = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  revisao: number;
};
export type ItemFisico = {
  id: string;
  codigo: string;
  descricao: string;
  categoria: keyof typeof categoriasFisicas;
  codigo_externo: string;
  observacoes: string;
  situacao: keyof typeof situacoesFisicas;
  local_id: string | null;
  local_nome: string | null;
  principal_id: string | null;
  principal_descricao: string | null;
  cliente_nome: string | null;
  com_quem: string;
  revisao: number;
  criado_em: string;
  atualizado_em: string;
  numero?: number;
  documento_rotulo?: "OS" | "Orçamento";
  vinculo_tipo?: VinculoFisico["tipo"];
  os_vinculada?: string;
  ordem_servico_id?: string;
  orcamento_id?: string;
  atendimento_id?: string;
  objeto_id?: string;
  produto_id?: string;
};
export type CadastroFisico = Pick<
  ItemFisico,
  "descricao" | "categoria" | "codigo_externo" | "observacoes"
> & { local_id?: string | null; vinculo?: VinculoFisico; principal_id?: string };
export type EventoFisico = {
  id: number;
  acao: keyof typeof acoesFisicas;
  antes: ItemFisico | null;
  depois: ItemFisico;
  observacoes: string;
  autor_nome: string;
  criado_em: string;
};
export type AcaoFisica = Exclude<
  keyof typeof acoesFisicas,
  "entrada" | "identificacao" | "vinculo"
>;

/** Um código lido nunca é executado nem aberto como endereço externo. */
export function interpretarEtiqueta(
  texto: string,
  origem: string,
): { tipo: "item" | "local" | "busca"; codigo: string } {
  let valor = texto.trim();
  if (
    !valor ||
    valor.length > 2048 ||
    [...valor].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error("Código inválido. Leia novamente ou digite a identificação.");
  if (/^[a-z][a-z\d+.-]*:/i.test(valor) || valor.startsWith("/")) {
    let url: URL;
    try {
      url = new URL(valor, origem);
    } catch {
      throw new Error("Etiqueta inválida.");
    }
    if (url.origin !== new URL(origem).origin || url.pathname !== "/localizacao")
      throw new Error(
        "Esta etiqueta não pertence a este sistema. Use o código impresso nela.",
      );
    valor = url.searchParams.get("codigo") || "";
    if (!/^PT[IL]-[A-F\d]{16}$/i.test(valor))
      throw new Error("Código da etiqueta inválido.");
  }
  const codigo = valor.toUpperCase();
  if (/^PTI-[A-F\d]{16}$/.test(codigo)) return { tipo: "item", codigo };
  if (/^PTL-[A-F\d]{16}$/.test(codigo)) return { tipo: "local", codigo };
  if (valor.length > 100 || /^PT[IL]-/i.test(valor))
    throw new Error("Confira o código completo da etiqueta.");
  return { tipo: "busca", codigo: valor };
}
export function enderecoEtiqueta(codigo: string, origem: string) {
  if (!/^PT[IL]-[A-F\d]{16}$/.test(codigo))
    throw new Error("Código de etiqueta inválido.");
  const url = new URL("/localizacao", origem);
  url.searchParams.set("codigo", codigo);
  return url.href;
}
export function retornoInterno(destino: unknown): string {
  return typeof destino === "string" &&
    /^\/(?!\/)/.test(destino) &&
    ![...destino].some(
      (c) => c === "\\" || c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127,
    ) &&
    !/^\/(entrar|cadastro|recuperar-senha|definir-senha)([/?#]|$)/.test(destino)
    ? destino
    : "/";
}
export function ondeEsta(item: ItemFisico) {
  return item.situacao === "na_empresa"
    ? item.local_nome || "Local não informado"
    : `${situacoesFisicas[item.situacao]}${item.com_quem ? " · " + item.com_quem : ""}`;
}
