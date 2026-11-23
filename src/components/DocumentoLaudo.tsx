import { camposLaudo, numeroLaudo, type DadosLaudo } from "../lib/laudos";
import { logoDocumento } from "../lib/documentoCliente";
import type { Identidade } from "../services/documentos";
import "./DocumentoLaudo.css";

export type DocumentoLaudoDados = {
  dados: DadosLaudo;
  empresa: Identidade;
  numero: number;
  origem: string;
  versao?: number;
  hash?: string;
  emitidoEm?: string;
  situacao: "rascunho" | "emitido" | "cancelado";
  anterior?: boolean;
  motivoCancelamento?: string;
};
export function DocumentoLaudo({ documento: d }: { documento: DocumentoLaudoDados }) {
  const logo = logoDocumento(d.empresa.logo);
  const data = (v: string) =>
    v
      ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })
      : "—";
  const bloco = (k: keyof DadosLaudo, titulo?: string) =>
    d.dados[k] ? (
      <section className="laudo-texto" key={k}>
        <h2>{titulo || camposLaudo.find(([c]) => c === k)?.[1]}</h2>
        <p>{d.dados[k]}</p>
      </section>
    ) : null;
  const linha = (nome: string, valor?: string) =>
    valor ? (
      <div>
        <dt>{nome}</dt>
        <dd>{valor}</dd>
      </div>
    ) : null;
  return (
    <article className="folha-laudo" aria-label="Prévia do laudo">
      <header className="laudo-papel-cabecalho">
        {logo && <img src={logo} alt="Logo da empresa" />}
        <div>
          <strong>{d.empresa.nome}</strong>
          {d.empresa.documento && <p>{d.empresa.documento}</p>}
          <p>{d.empresa.telefone || d.empresa.telefone_e164}</p>
          <p>
            {Object.values(d.empresa.endereco || {})
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="laudo-numero">
          <b>{numeroLaudo(d.numero)}</b>
          <span>{d.versao ? `Versão ${d.versao}` : "Rascunho"}</span>
          {d.emitidoEm && <span>Emitido em {data(d.emitidoEm)}</span>}
        </div>
      </header>
      {d.situacao !== "emitido" && (
        <p className="laudo-marca">
          {d.situacao === "rascunho" ? "RASCUNHO · NÃO EMITIDO" : "LAUDO CANCELADO"}
        </p>
      )}
      {d.anterior && (
        <p className="laudo-marca">VERSÃO ANTERIOR · Consulte a versão mais recente.</p>
      )}
      {d.situacao === "cancelado" && (
        <p className="laudo-texto">Motivo do cancelamento: {d.motivoCancelamento}</p>
      )}
      <h1>{d.dados.titulo}</h1>
      <dl className="laudo-identificacao">
        {linha("Cliente / solicitante", d.dados.cliente)}
        {linha("CPF / CNPJ", d.dados.documento_cliente)}
        {linha("Bem ou local avaliado", d.dados.bem)}
        {linha("Identificação", d.dados.identificacao)}
        {linha("Data da avaliação", data(d.dados.data_avaliacao))}
        {linha("Atendimento vinculado", d.origem)}
        {linha("Local da avaliação", d.dados.local_avaliacao)}
        {linha("Contato", d.dados.contato_cliente)}
      </dl>
      {(
        [
          "solicitacao",
          "condicoes",
          "procedimentos",
          "constatacoes",
          "servicos",
          "conclusao",
          "recomendacoes",
          "limitacoes",
          "referencias",
          "observacoes",
        ] as const
      ).map((k) => bloco(k))}
      <section className="laudo-responsavel">
        <h2>Responsável pelo laudo</h2>
        <strong>{d.dados.responsavel || "Não informado"}</strong>
        <p>
          {[d.dados.qualificacao, d.dados.registro_profissional]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {d.dados.numero_art && <p>Responsabilidade técnica: {d.dados.numero_art}</p>}
        <div className="laudo-assinaturas">
          <div>
            <span>Assinatura do responsável</span>
            <small>Data: ____ / ____ / ________</small>
          </div>
          <div>
            <span>Ciência do cliente (opcional)</span>
            <small>Data: ____ / ____ / ________</small>
          </div>
        </div>
      </section>
      {d.hash && (
        <footer className="laudo-integridade">
          <b>Identificação da versão arquivada</b>
          <span>{d.hash}</span>
          <small>
            Este código identifica o conteúdo registrado no sistema. Não equivale a
            assinatura eletrônica.
          </small>
        </footer>
      )}
    </article>
  );
}
