import { dinheiro } from "../lib/formatacao";
import { ComprovanteAutorizacao } from "./ComprovanteAutorizacao";
import { dataDocumento } from "../lib/documentoCliente";
import { tiposServico, type TipoServico } from "../lib/especialidades";
import { ChevronDown, FileText } from "lucide-react";
import { type Proposta } from "../services/orcamentos";
import "./ConteudoProposta.css";

export function ObservacoesProposta({ q }: { q: Proposta }) {
  return (
    <>
      {[
        ["Tipo de serviço", tiposServico[q.versao.tipo_servico as TipoServico]?.[0]],
        ["Relação de peças a trocar (lista informativa)", q.versao.pecas_a_trocar],
        ["Forma de pagamento", q.versao.forma_pagamento],
        ["Detalhes do serviço", q.versao.detalhes_especialidade],
        ["Relato do cliente", q.versao.queixa_cliente],
        ["Diagnóstico técnico", q.versao.diagnostico],
        ["Códigos de falha / testes", q.versao.codigos_falha],
      ].map(([titulo, texto]) =>
        texto ? (
          <div className="texto-documento" key={titulo}>
            <h3>{titulo}</h3>
            <p>{texto}</p>
          </div>
        ) : null,
      )}
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
    </>
  );
}

export function ConteudoProposta({
  q,
  recolherDetalhes = false,
  exibirObservacoes = true,
}: {
  q: Proposta;
  recolherDetalhes?: boolean;
  exibirObservacoes?: boolean;
}) {
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
        {q.versao.data_servico && (
          <div>
            <small>DATA DO SERVIÇO</small>
            <strong>{dataDocumento(q.versao.data_servico, false)}</strong>
          </div>
        )}
        <div>
          <small>CLIENTE</small>
          <strong>{q.versao.dados_cliente.nome}</strong>
        </div>
        <div>
          <small>VEÍCULO</small>
          <strong>{q.versao.dados_veiculo.modelo}</strong>
          <span>
            {q.versao.dados_veiculo.especialidade === "retifica"
              ? `Motor: ${q.versao.dados_veiculo.motor || "Não informado"}`
              : q.versao.dados_veiculo.placa || "Placa não informada"}
          </span>
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
      <div className="linhas-documento itens-proposta">
        {q.itens.map((i, n) => (
          <article className="item-proposta" key={i.id ?? n}>
            <div className="item-proposta-cabecalho">
              <strong>{i.descricao}</strong>
              <strong className="item-proposta-valor">
                {dinheiro(
                  i.total_item_centavos ??
                    Math.round(i.quantidade * i.preco_unitario_centavos),
                )}
              </strong>
            </div>
            <div className="item-proposta-resumo">
              <span>
                {i.tipo === "service" ? "Serviço" : "Peça"} · {i.quantidade} {i.unidade}{" "}
                × {dinheiro(i.preco_unitario_centavos)}
              </span>
              {i.prioridade_servico === "urgente" && (
                <span className="item-proposta-alerta">Urgente</span>
              )}
              {q.aprovacao?.grupos_aprovados &&
                !q.aprovacao.grupos_aprovados.includes(
                  i.grupo_servico || "Atendimento",
                ) && <span className="item-proposta-alerta">Fora da autorização</span>}
            </div>
            <details
              className="item-proposta-detalhes"
              open={recolherDetalhes ? undefined : true}
            >
              <summary>
                <span>Ver detalhes</span>
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <div>
                <small>
                  {i.grupo_servico || "Atendimento"} ·{" "}
                  {i.prioridade_servico || "recomendado"}
                </small>
                {i.explicacao_cliente && <p>{i.explicacao_cliente}</p>}
              </div>
            </details>
          </article>
        ))}
      </div>
      <div className="totais-documento">
        <span>
          Subtotal<strong>{dinheiro(q.versao.subtotal_centavos)}</strong>
        </span>
        <span>
          Desconto<strong>− {dinheiro(q.versao.desconto_centavos)}</strong>
        </span>
        <div className="resumo-total-proposta">
          <div className="total-final">
            <span>Total do orçamento</span>
            <strong>{dinheiro(q.versao.total_centavos)}</strong>
          </div>
          {q.aprovacao && (
            <div className="confirmacao-proposta">
              {q.aprovacao.total_aprovado_centavos != null && (
                <>
                  <div className="valor-autorizado-proposta">
                    <span>Valor autorizado pelo cliente</span>
                    <strong>{dinheiro(q.aprovacao.total_aprovado_centavos)}</strong>
                  </div>
                  <p>
                    Grupos autorizados:{" "}
                    {q.aprovacao.grupos_aprovados?.join(", ") || "nenhum"}.
                  </p>
                </>
              )}
              <p>
                {q.aprovacao.decisao === "approved" ? "Aprovado" : "Recusado"} por{" "}
                {q.aprovacao.nome_informado} em{" "}
                <time dateTime={q.aprovacao.confirmado_em}>
                  {new Date(q.aprovacao.confirmado_em).toLocaleString("pt-BR")}
                </time>
              </p>
            </div>
          )}
        </div>
      </div>
      {exibirObservacoes && <ObservacoesProposta q={q} />}
      <ComprovanteAutorizacao comprovante={q.aprovacao?.comprovante} />
    </div>
  );
}
