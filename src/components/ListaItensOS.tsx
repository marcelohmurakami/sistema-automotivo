import { memo, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { dinheiro } from "../lib/formatacao";
import { QuantidadeItem } from "./QuantidadeItem";
import type { ItemEditorOS } from "./EditorItensOS";
/** Digitar na busca ou no item em edição não refaz as linhas já adicionadas. */
export const ListaItensOS = memo(function ListaItensOS({
  itens,
  nomeMaterial,
  contexto,
  desabilitado,
  editar,
  remover,
  alterarQuantidade,
  detalhesItem,
}: {
  itens: ItemEditorOS[];
  nomeMaterial: string;
  contexto: string;
  desabilitado: boolean;
  editar: (item: ItemEditorOS) => void;
  remover: (item: ItemEditorOS) => void;
  alterarQuantidade: (id: string, quantidade: number) => void;
  detalhesItem?: (item: ItemEditorOS, indice: number) => ReactNode;
}) {
  return (
    <>
      {!!itens.length && (
        <div className="os-editor-adicionados">
          <h4>Itens adicionados</h4>
          <ul className="os-editor-lista">
            {itens.map((i, n) => {
              return (
                <li className="os-editor-item" key={i.id}>
                  <div className="os-editor-item-resumo">
                    <strong>{i.descricao}</strong>
                    <span>
                      {i.tipo === "service" ? "Serviço" : nomeMaterial} ·{" "}
                      {i.quantidade.toLocaleString("pt-BR")} ×{" "}
                      {dinheiro(i.preco_unitario_centavos)}
                      {i.situacao === "done"
                        ? " · Já realizado"
                        : i.situacao === "in_progress"
                          ? " · Em execução"
                          : i.situacao === "cancelled"
                            ? " · Cancelado"
                            : ""}
                    </span>
                  </div>
                  <QuantidadeItem
                    quantidade={i.quantidade}
                    descricao={i.descricao || `item ${n + 1}`}
                    desabilitado={desabilitado}
                    alterar={(quantidade) => alterarQuantidade(i.id, quantidade)}
                  />
                  <strong className="os-editor-total-item">
                    {dinheiro(
                      Math.round(i.quantidade * i.preco_unitario_centavos) || 0,
                    )}
                  </strong>
                  <div className="os-editor-item-acoes">
                    <button
                      type="button"
                      className="os-editor-editar"
                      disabled={desabilitado}
                      onClick={() => editar(i)}
                      aria-label={`Editar ${i.descricao || `item ${n + 1}`}: ${contexto}`}
                    >
                      <Pencil size={16} /> Editar
                    </button>
                    <button
                      type="button"
                      className="os-editor-remover"
                      aria-label={`Remover ${i.descricao || `item ${n + 1}`}: ${contexto}`}
                      title={`Remover: ${contexto}`}
                      disabled={desabilitado}
                      onClick={() => remover(i)}
                    >
                      <Trash2 size={16} /> Remover
                    </button>
                  </div>
                  {detalhesItem && (
                    <div className="os-editor-item-detalhes">{detalhesItem(i, n)}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
});
