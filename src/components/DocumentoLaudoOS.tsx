import type { CSSProperties } from "react";
import type { LaudoOS } from "../lib/laudoOS";
import {
  corDocumento,
  dataDocumento,
  logoDocumento,
  quantidadeDocumento,
  telefoneDocumento,
} from "../lib/documentoCliente";
import "./DocumentoLaudoOS.css";

export function DocumentoLaudoOS({ documento: d }: { documento: LaudoOS }) {
  const logo = logoDocumento(d.empresa.logo);
  return (
    <article
      className="laudo-os-folha"
      aria-label={`Laudo da OS ${d.numero}`}
      style={{ "--laudo-cor": corDocumento(d.empresa.cor) } as CSSProperties}
    >
      <header className="laudo-os-empresa">
        {logo && <img src={logo} alt="Logo da empresa" />}
        <div>
          <strong>{d.empresa.nome}</strong>
          <p>
            {[
              d.empresa.documento,
              telefoneDocumento(d.empresa.telefone || d.empresa.telefone_e164),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p>
            {Object.values(d.empresa.endereco || {})
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="laudo-os-referencia">
          <span>ORDEM DE SERVIÇO</span>
          <b>#{d.numero}</b>
          <small>{d.situacao}</small>
        </div>
      </header>
      <div className="laudo-os-titulo">
        <span>REGISTRO TÉCNICO DO ATENDIMENTO</span>
        <h1>Laudo técnico de serviço</h1>
        <p>Especificações e informações registradas na ordem de serviço.</p>
      </div>
      <dl className="laudo-os-identificacao">
        {d.identificacao.map((c) => (
          <div key={c.rotulo}>
            <dt>{c.rotulo}</dt>
            <dd>{c.valor}</dd>
          </div>
        ))}
      </dl>
      {d.secoes.length ? (
        d.secoes.map((s, i) => (
          <section className="laudo-os-secao" key={`${i}-${s.titulo}`}>
            <h2>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s.titulo}
            </h2>
            <dl>
              {s.campos.map((c, j) => (
                <div className="laudo-os-campo" key={`${j}-${c.rotulo}`}>
                  <dt>{c.rotulo}</dt>
                  <dd>{c.valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      ) : (
        <p className="laudo-os-vazio">
          Nenhuma especificação técnica foi preenchida nesta OS.
        </p>
      )}
      {!!d.itens.length && (
        <section className="laudo-os-itens">
          <h2>Itens vinculados à OS</h2>
          <table>
            <thead>
              <tr>
                <th>Serviço / peça / material</th>
                <th>Quantidade</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {d.itens.map((i, n) => (
                <tr key={n}>
                  <td>{i.descricao}</td>
                  <td>
                    {quantidadeDocumento(i.quantidade)} {i.unidade}
                  </td>
                  <td>{i.situacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="laudo-os-assinaturas">
        <div>
          <span>Responsável pelo serviço</span>
          {d.responsavel && <strong>{d.responsavel}</strong>}
          <small>Assinatura e identificação profissional</small>
        </div>
        <div>
          <span>Ciência do cliente</span>
          <small>Assinatura · Data: ____ / ____ / ________</small>
        </div>
      </section>
      <footer className="laudo-os-rodape">
        <strong>
          OS #{d.numero} · Revisão {d.revisao}
        </strong>
        <span>Gerado em {dataDocumento(d.geradoEm)}</span>
        <p>
          Documento elaborado a partir das informações preenchidas na OS. A assinatura
          deve ser realizada pelo responsável.
        </p>
      </footer>
    </article>
  );
}
