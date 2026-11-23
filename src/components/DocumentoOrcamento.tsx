import type { CSSProperties } from "react";
import { apresentacaoOrcamento } from "../lib/apresentacaoOrcamento";
import {
  corDocumento,
  logoDocumento,
  moedaDocumento,
  quantidadeDocumento,
  type DocumentoCliente,
} from "../lib/documentoCliente";

export function DocumentoOrcamento({ documento: d }: { documento: DocumentoCliente }) {
  const a = apresentacaoOrcamento(d);
  const logo = logoDocumento(d.identidade.logo);
  return (
    <article
      className="folha-cliente folha-orcamento"
      aria-label={`Prévia de ${d.titulo} ${d.numero}`}
      style={{ "--cor-documento": corDocumento(d.identidade.cor) } as CSSProperties}
    >
      <header className="orc-doc-cabecalho">
        <div className="orc-doc-empresa">
          {logo && <img src={logo} alt={`Logo de ${d.identidade.nome}`} />}
          <div>
            <h2>{d.identidade.nome}</h2>
            {a.contatosEmpresa.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        </div>
        <div className="orc-doc-numero">
          <span>ORÇAMENTO</span>
          <strong>#{d.numero}</strong>
          {d.versao != null && <small>Versão {d.versao}</small>}
        </div>
      </header>
      <div className="orc-doc-emissao">
        <span className={`orc-doc-status${d.destaque ? " orc-doc-status-alerta" : ""}`}>
          {a.situacao}
        </span>
        {a.datas.map((i) => (
          <div key={i.rotulo}>
            <span>{i.rotulo}</span>
            <strong>{i.valor}</strong>
          </div>
        ))}
      </div>
      <section className="orc-doc-destinatario" aria-label="Dados do orçamento">
        <div>
          <span className="orc-doc-rotulo">CLIENTE</span>
          <h3>{d.cliente}</h3>
          {a.contatosCliente.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
        {(a.bem || a.detalhesBem.length > 0) && (
          <div>
            {a.bem && (
              <>
                <span className="orc-doc-rotulo">{a.bem.rotulo}</span>
                <h3>{a.bem.valor}</h3>
              </>
            )}
            {a.detalhesBem.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        )}
      </section>
      <table className="orc-doc-itens">
        <caption>
          <span>{a.tituloItens}</span>
          <small>
            {d.itens.length} {d.itens.length === 1 ? "item" : "itens"}
          </small>
        </caption>
        <colgroup>
          <col className="orc-doc-col-descricao" />
          <col className="orc-doc-col-qtd" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Descrição</th>
            <th scope="col">Qtd.</th>
            <th scope="col">Unitário</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {d.itens.map((i, n) => (
            <tr key={n}>
              <td>
                <strong>{i.descricao}</strong>
                <small>
                  {i.tipo === "service"
                    ? "Serviço"
                    : d.rotuloMateriais || "Peça / produto"}
                  {i.cancelado ? " · Cancelado" : ""}
                </small>
              </td>
              <td>
                {quantidadeDocumento(i.quantidade)}
                <small>{i.unidade}</small>
              </td>
              <td>{moedaDocumento(i.preco_unitario_centavos)}</td>
              <td>
                <b>{moedaDocumento(i.total)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.itens.length === 0 && (
        <p className="orc-doc-sem-itens">Nenhum item incluído neste orçamento.</p>
      )}
      <div className="orc-doc-fechamento">
        <section className="orc-doc-condicoes" aria-label="Pagamento">
          {a.condicoes.length > 0 && <h3>Condições de pagamento</h3>}
          {a.condicoes.map((i) => (
            <p key={i.rotulo}>
              <span>{i.rotulo}</span>
              <strong>{i.valor}</strong>
            </p>
          ))}
        </section>
        <div className="orc-doc-totais">
          <p>
            <span>Subtotal</span>
            <span>{moedaDocumento(d.subtotal)}</span>
          </p>
          {d.mostrarDesconto !== false && d.desconto > 0 && (
            <p>
              <span>Desconto</span>
              <span>− {moedaDocumento(d.desconto)}</span>
            </p>
          )}
          <div>
            <span>Total do orçamento</span>
            <strong>{moedaDocumento(d.total)}</strong>
          </div>
        </div>
      </div>
      {d.secoes.map((s, i) => (
        <section className="orc-doc-secao" key={i}>
          <h3>{s.titulo}</h3>
          <p>{s.texto}</p>
        </section>
      ))}
      {d.confirmacao && <p className="orc-doc-confirmacao">{d.confirmacao}</p>}
      {d.identidade.rodape && <p className="orc-doc-mensagem">{d.identidade.rodape}</p>}
      <div className="orc-doc-assinaturas">
        <div>
          <span>{d.assinatura}</span>
        </div>
        <div>
          <span>Data: ____/____/________</span>
        </div>
      </div>
      <footer className="orc-doc-rodape">
        <span>{d.aviso}</span>
        <span>
          Orçamento #{d.numero}
          {d.versao ? ` · v${d.versao}` : ""}
        </span>
      </footer>
    </article>
  );
}
