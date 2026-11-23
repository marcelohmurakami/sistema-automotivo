import { AlertTriangle, ArrowDownUp, MoreHorizontal, Pencil } from "lucide-react";
import { dinheiro } from "../../lib/formatacao";
import type { ProdutoEstoque } from "../../services/estoque";

import { numeroEstoque } from "../../lib/formatoEstoque";

export function LinhaEstoque({
  produto: p,
  movimentar,
  opcoes,
  editar,
}: {
  produto: ProdutoEstoque;
  movimentar: () => void;
  opcoes: () => void;
  editar: () => void;
}) {
  const disponivel = p.disponivel ?? p.saldo;
  const repor = !p.arquivado_em && disponivel !== null && disponivel <= p.minimo;
  return (
    <li className="linha-estoque">
      <div className="linha-estoque-identidade">
        <h2>
          <button type="button" onClick={opcoes}>
            {p.descricao}
          </button>
        </h2>
        <p>
          <span>{p.codigo || "Sem código"}</span>
          {p.localizacao && <span>{p.localizacao}</span>}
          {p.arquivado_em && <span>Arquivado</span>}
        </p>
      </div>
      <div className="linha-estoque-quantidade">
        <span className="linha-estoque-rotulo">Disponível</span>
        <strong>
          {numeroEstoque(disponivel)}
          {p.saldo !== null && <small> {p.unidade}</small>}
        </strong>
        {!!p.reservado && <small>{numeroEstoque(p.reservado)} reservados</small>}
        {repor && (
          <span className="linha-estoque-repor">
            <AlertTriangle size={13} aria-hidden />
            {disponivel === 0 ? "Sem unidades livres" : "Estoque baixo"}
          </span>
        )}
      </div>
      <div className="linha-estoque-valores">
        <span className="linha-estoque-rotulo">Preço de venda</span>
        <strong>{dinheiro(p.preco_padrao_centavos)}</strong>
      </div>
      <div className="linha-estoque-acoes">
        {!p.arquivado_em && (
          <button
            type="button"
            className="botao-secundario linha-estoque-movimentar"
            aria-label={`${p.saldo === null ? "Ativar controle de" : "Movimentar"} ${p.descricao}`}
            onClick={movimentar}
          >
            <ArrowDownUp size={16} aria-hidden />
            {p.saldo === null ? "Ativar controle" : "Movimentar"}
          </button>
        )}
        {!p.arquivado_em && (
          <button
            type="button"
            className="botao-secundario estoque-editar"
            aria-label={`Editar ${p.descricao}`}
            title="Editar cadastro"
            onClick={editar}
          >
            <Pencil size={17} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className="botao-secundario estoque-mais"
          aria-label={`Mais opções de ${p.descricao}`}
          onClick={opcoes}
        >
          <MoreHorizontal size={20} aria-hidden />
          <span>Mais opções</span>
        </button>
      </div>
    </li>
  );
}
