import { FileText } from "lucide-react";
import { dinheiro, type Proposta } from "../services/orcamentos";
export function ConteudoProposta({ q }: { q: Proposta }) {
  return (
    <div className="documento-orcamento">
      <div className="documento-marca">
        <FileText size={27} />
        <div>
          <strong>{q.versao.dados_oficina.nome}</strong>
          <span>
            Orçamento #{String(q.numero).padStart(4, "0")} · Versão{" "}
            {q.versao.numero_versao}
          </span>
        </div>
      </div>
      <div className="resumo-destinatario">
        <div>
          <small>CLIENTE</small>
          <strong>{q.versao.dados_cliente.nome}</strong>
        </div>
        <div>
          <small>VEÍCULO</small>
          <strong>{q.versao.dados_veiculo.modelo}</strong>
          <span>{q.versao.dados_veiculo.placa || "Placa não informada"}</span>
        </div>
        <div>
          <small>VALIDADE</small>
          <strong>
            {q.versao.expira_em
              ? new Date(q.versao.expira_em).toLocaleDateString("pt-BR")
              : "Rascunho"}
          </strong>
        </div>
      </div>
      <div className="linhas-documento">
        {q.itens.map((i, n) => (
          <div key={i.id ?? n}>
            <div>
              <strong>{i.descricao}</strong>
              <small>
                {i.tipo === "service" ? "Serviço" : "Peça"} · {i.quantidade}{" "}
                {i.unidade} × {dinheiro(i.preco_unitario_centavos)}
              </small>
            </div>
            <strong>
              {dinheiro(
                i.total_item_centavos ??
                  Math.round(i.quantidade * i.preco_unitario_centavos),
              )}
            </strong>
          </div>
        ))}
      </div>
      <div className="totais-documento">
        <span>
          Subtotal<strong>{dinheiro(q.versao.subtotal_centavos)}</strong>
        </span>
        <span>
          Desconto<strong>− {dinheiro(q.versao.desconto_centavos)}</strong>
        </span>
        <span className="total-final">
          Total do orçamento<strong>{dinheiro(q.versao.total_centavos)}</strong>
        </span>
      </div>
      {q.versao.observacoes && (
        <div className="texto-documento">
          <h3>Observações</h3>
          <p>{q.versao.observacoes}</p>
        </div>
      )}
      {q.versao.condicoes && (
        <div className="texto-documento">
          <h3>Condições de pagamento e execução</h3>
          <p>{q.versao.condicoes}</p>
        </div>
      )}
      {q.aprovacao && (
        <div className="aviso-cliente">
          {q.aprovacao.decisao === "approved" ? "Aprovado" : "Recusado"} por{" "}
          {q.aprovacao.nome_informado} em{" "}
          {new Date(q.aprovacao.confirmado_em).toLocaleString("pt-BR")}
        </div>
      )}
    </div>
  );
}
