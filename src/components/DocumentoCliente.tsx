import QRCode from "qrcode";
import { DocumentoOrcamento } from "./DocumentoOrcamento";
import { dataDocumento } from "../lib/documentoCliente";
import type { CSSProperties } from "react";
import {
  corDocumento,
  telefoneDocumento,
  temInformacaoDocumento,
  camposGradeOS,
  logoDocumento,
  moedaDocumento,
  quantidadeDocumento,
  type DocumentoCliente as Documento,
} from "../lib/documentoCliente";

export function DocumentoCliente({ documento: d }: { documento: Documento }) {
  if (d.tipo === "orcamento" && !d.comprovante)
    return <DocumentoOrcamento documento={d} />;
  const qr =
    d.tipo === "os" && d.pixCopiaCola && !d.destaque
      ? QRCode.create(d.pixCopiaCola, { errorCorrectionLevel: "M" })
      : null;
  const logo = logoDocumento(d.identidade.logo);
  return (
    <article
      className={`folha-cliente ${d.tipo === "os" ? "folha-os" : ""}`}
      aria-label={`Prévia de ${d.titulo} ${d.numero}`}
      style={{ "--cor-documento": corDocumento(d.identidade.cor) } as CSSProperties}
    >
      <header className="folha-marca">
        {logo && <img src={logo} alt={`Logo de ${d.identidade.nome}`} />}
        <div>
          <h2>{d.identidade.nome}</h2>
          {d.identidade.documento && <p>CNPJ/CPF: {d.identidade.documento}</p>}
          {(d.identidade.telefone || d.identidade.telefone_e164) && (
            <p>
              {telefoneDocumento(d.identidade.telefone || d.identidade.telefone_e164)}
            </p>
          )}
          {d.identidade.endereco && (
            <p>{Object.values(d.identidade.endereco).filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {!qr &&
          d.tipo === "os" &&
          !d.destaque &&
          logoDocumento(d.identidade.pix_qr) && (
            <div className="folha-os-pix">
              <strong>PAGUE VIA PIX</strong>
              <img
                src={d.identidade.pix_qr}
                alt="QR Code Pix da empresa"
                style={{
                  maxWidth: 130,
                  maxHeight: 130,
                  width: 130,
                  height: 130,
                  objectFit: "contain",
                  background: "white",
                }}
              />
            </div>
          )}
        {qr && (
          <div className="folha-os-pix">
            <strong>PAGUE VIA PIX</strong>
            <svg
              role="img"
              aria-label="QR Code Pix"
              viewBox={`0 0 ${qr.modules.size + 8} ${qr.modules.size + 8}`}
            >
              <rect width="100%" height="100%" fill="white" />
              {Array.from({ length: qr.modules.size }, (_, r) =>
                Array.from({ length: qr.modules.size }, (_, c) =>
                  qr.modules.get(r, c) ? (
                    <rect
                      key={r + "-" + c}
                      x={c + 4}
                      y={r + 4}
                      width="1"
                      height="1"
                      fill="black"
                    />
                  ) : null,
                ),
              )}
            </svg>
          </div>
        )}
      </header>
      {d.tipo === "os" && (
        <div className="folha-os-titulo">
          <h2>ORDEM DE SERVIÇO [OS] Nº {d.numero}</h2>
        </div>
      )}
      {d.tipo !== "os" && (
        <div className="folha-titulo">
          <div>
            <span>DOCUMENTO DO CLIENTE</span>
            <h2>
              {d.titulo} <b>#{d.numero}</b>
            </h2>
            {d.versao && <small>Versão {d.versao}</small>}
          </div>
          <strong className={d.destaque ? "folha-alerta" : "folha-situacao"}>
            {d.situacao}
          </strong>
        </div>
      )}
      {d.tipo === "os" ? (
        <section className="folha-grade-os" aria-label="Dados do atendimento">
          {camposGradeOS(d).map((c, indice) => (
            <div key={c.rotulo}>
              <small>{c.rotulo.toUpperCase()}</small>
              <span>
                {indice === 0 ? (
                  <>
                    <strong>{c.valor.split("\n")[0]}</strong>
                    {c.valor.includes("\n") &&
                      "\n" + c.valor.split("\n").slice(1).join("\n")}
                  </>
                ) : (
                  c.valor
                )}
              </span>
            </div>
          ))}
        </section>
      ) : (
        <section className="folha-dados" aria-label="Dados do atendimento">
          <div>
            <small>CLIENTE</small>
            <strong>{d.cliente}</strong>
            {d.telefoneCliente && <span>{telefoneDocumento(d.telefoneCliente)}</span>}
          </div>
          <div>
            <small>VEÍCULO</small>
            <strong>{d.veiculo}</strong>
            {!d.retifica && temInformacaoDocumento(d.placa) && (
              <span>Placa: {d.placa}</span>
            )}
            {temInformacaoDocumento(d.motor) && (
              <span>Motor: {d.motor || "Não informado"}</span>
            )}
          </div>
          <div
            className="folha-dados-metas"
            style={
              {
                "--colunas-metas": Math.min(4, Math.max(1, d.informacoes.length)),
              } as CSSProperties
            }
          >
            {d.informacoes.map((i) => (
              <div key={i.rotulo}>
                <small>{i.rotulo.toUpperCase()}</small>
                <strong>{i.valor}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
      <table className="folha-itens">
        <caption>Serviços e produtos</caption>
        <thead>
          <tr>
            <th>Descrição</th>
            {d.tipo === "os" && <th>Tipo</th>}

            <th>Qtd.</th>
            <th>Unitário</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {d.itens.map((i, n) => (
            <tr key={i.id ?? n}>
              <td>
                <strong>
                  {i.descricao}
                  {i.cancelado && " (cancelado)"}
                </strong>
                <small
                  className={d.tipo === "os" ? "folha-item-tipo-mobile" : undefined}
                >
                  {i.tipo === "service" ? "Serviço" : "Peça / produto"}
                </small>
              </td>

              {d.tipo === "os" && (
                <td className="folha-item-tipo">
                  {i.tipo === "service" ? "Serviço" : "Peça"}
                </td>
              )}
              <td>
                {quantidadeDocumento(i.quantidade)} {i.unidade}
              </td>
              <td>{moedaDocumento(i.preco_unitario_centavos)}</td>
              <td>{moedaDocumento(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!d.itens.length && (
        <p className="folha-sem-itens">Nenhum item lançado neste atendimento.</p>
      )}

      <section className="folha-totais" aria-label="Valores do documento">
        <p>
          Subtotal <span>{moedaDocumento(d.subtotal)}</span>
        </p>
        {d.mostrarDesconto !== false && (
          <p>
            Desconto <span>− {moedaDocumento(d.desconto)}</span>
          </p>
        )}
        <p className="folha-total">
          Total <strong>{moedaDocumento(d.total)}</strong>
        </p>
      </section>
      {d.tipo !== "os" && d.vencimento && (
        <p>
          <strong>VENCIMENTO: {dataDocumento(d.vencimento, false)}</strong>
        </p>
      )}
      {d.secoes.map((s) => (
        <section className="folha-texto" key={s.titulo}>
          <h3>{s.titulo}</h3>
          <p>{s.texto}</p>
        </section>
      ))}
      {d.confirmacao && (
        <section className="folha-texto">
          <h3>Confirmação registrada</h3>
          <p>{d.confirmacao}</p>
        </section>
      )}
      {d.identidade.rodape && <p className="folha-mensagem">{d.identidade.rodape}</p>}
      {d.tipo === "os" ? (
        <div className="folha-os-assinatura">
          <div className="folha-os-assinatura-linha">
            <div>
              <p>{d.assinatura}</p>
              <span>&nbsp;</span>
              <strong>Assinatura do cliente</strong>
            </div>
            <div>
              <strong>Vencimento</strong>
              <span>
                {d.vencimento
                  ? dataDocumento(d.vencimento, false)
                  : "____/____/________"}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="folha-assinaturas">
          <div>
            <span>{d.assinatura}</span>
          </div>
          <div>
            <span>Data: ____/____/________</span>
          </div>
        </div>
      )}
      <footer>
        <span>{d.aviso}</span>
        <span>
          {d.titulo} #{d.numero}
          {d.versao ? ` · v${d.versao}` : ""}
        </span>
      </footer>
    </article>
  );
}
