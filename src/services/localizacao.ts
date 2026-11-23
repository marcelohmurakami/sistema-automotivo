import { rpc } from "../lib/rpc";
import type {
  AcaoFisica,
  CadastroFisico,
  ContextoFisico,
  EventoFisico,
  ItemFisico,
  LocalFisico,
  VinculoFisico,
} from "../lib/localizacaoFisica";

export function listarLocaisFisicos(
  w: string,
  busca = "",
  inativos = false,
  signal?: AbortSignal,
) {
  return rpc<LocalFisico[]>(
    "listar_locais_fisicos",
    { p_oficina: w, p_busca: busca, p_inativos: inativos },
    signal,
  );
}
export function salvarLocalFisico(
  w: string,
  local: {
    id: string;
    nome: string;
    descricao: string;
    ativo: boolean;
    revisao?: number;
  },
) {
  return rpc<LocalFisico>("salvar_local_fisico", {
    p_oficina: w,
    p_id: local.id,
    p_nome: local.nome,
    p_descricao: local.descricao,
    p_ativo: local.ativo,
    p_revisao: local.revisao ?? null,
  });
}
export function listarItensFisicos(
  w: string,
  filtros: { busca: string; situacao: string; local: string; vinculo?: VinculoFisico },
  antes?: { criado_em: string; id: string },
  signal?: AbortSignal,
) {
  return rpc<{
    itens: ItemFisico[];
    tem_mais: boolean;
    vinculo: ContextoFisico | null;
  }>(
    "listar_itens_fisicos",
    {
      p_oficina: w,
      p_busca: filtros.busca,
      p_situacao: filtros.situacao,
      p_local: filtros.local || null,
      p_vinculo: filtros.vinculo || {},
      p_antes: antes?.criado_em || null,
      p_id_antes: antes?.id || null,
    },
    signal,
  );
}
export function consultarItemFisico(w: string, codigo: string, signal?: AbortSignal) {
  return rpc<ItemFisico & { relacionados: ItemFisico[] }>(
    "consultar_item_fisico",
    { p_oficina: w, p_codigo: codigo },
    signal,
  );
}
export function salvarItemFisico(
  w: string,
  id: string,
  dados: CadastroFisico,
  revisao: number,
) {
  return rpc<ItemFisico>("salvar_item_fisico", {
    p_oficina: w,
    p_id: id,
    p_dados: dados,
    p_revisao: revisao,
  });
}
export function registrarConjuntoFisico(
  w: string,
  id: string,
  dados: CadastroFisico,
  acessorios: (CadastroFisico & { id: string })[],
) {
  return rpc<ItemFisico[]>("registrar_conjunto_fisico", {
    p_oficina: w,
    p_id: id,
    p_dados: dados,
    p_acessorios: acessorios,
  });
}
export function historicoItemFisico(
  w: string,
  id: string,
  antes?: number,
  signal?: AbortSignal,
) {
  return rpc<{ eventos: EventoFisico[]; tem_mais: boolean }>(
    "historico_item_fisico",
    { p_oficina: w, p_item: id, p_antes: antes ?? null },
    signal,
  );
}
export function movimentarItensFisicos(
  w: string,
  itens: ItemFisico[],
  acao: AcaoFisica,
  local: string,
  comQuem: string,
  observacoes: string,
  chave: string,
) {
  return rpc<ItemFisico[]>("movimentar_itens_fisicos", {
    p_oficina: w,
    p_itens: itens.map(({ id, revisao }) => ({ id, revisao })),
    p_acao: acao,
    p_local: local || null,
    p_com_quem: comQuem,
    p_observacoes: observacoes,
    p_chave: chave,
  });
}
export function vincularItensFisicos(
  w: string,
  itens: ItemFisico[],
  vinculo: VinculoFisico,
  chave: string,
) {
  return rpc<ItemFisico[]>("vincular_itens_fisicos", {
    p_oficina: w,
    p_itens: itens.map(({ id, revisao }) => ({ id, revisao })),
    p_vinculo: vinculo,
    p_chave: chave,
  });
}
