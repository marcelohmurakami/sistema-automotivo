import { rpc } from "../lib/rpc";
import { opcoesQualidade } from "./qualidade";
import { lerServicosDemo } from "./servicos";
import {
  financeiroGarantiaDemo,
  ocorrenciaAnaliseDemo,
} from "./qualidadeOperacionalDemo";
import type {
  AcompanhamentoQualidade,
  DocumentoQualidade,
} from "../lib/qualidadeAvancada";
export type PesquisaQualidade = {
  id: string;
  token: string;
  revisao: number;
  nota: number | null;
  comentario: string | null;
  respondido_em: string | null;
  expira_em: string;
  revogado_em: string | null;
  acompanhamento: string;
  resolvido_em: string | null;
  recusa_contato: boolean;
};
export type LinhaSatisfacao = DocumentoQualidade & {
  pesquisa: PesquisaQualidade | null;
  envio: string | null;
  contato_permitido: boolean | null;
};
export type ConfigPesquisa = {
  ativa: boolean;
  atraso_dias: number;
  validade_dias: number;
  site: string;
};
export type SatisfacaoQualidade = {
  totais: {
    concluidos: number;
    convidados: number;
    enviados: number;
    respostas: number;
    nota_media: number | null;
    satisfeitos: number;
    insatisfeitos: number;
    sem_permissao: number;
    sem_telefone: number;
  };
  itens: LinhaSatisfacao[];
  configuracao: ConfigPesquisa | null;
};

/** A demonstração é isolada por empresa e nunca envia pesquisas ou documentos. */
export async function operacaoQualidade<T>(
  demo: boolean,
  nome: string,
  dados: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!demo) return rpc<T>(nome, dados, signal);
  const w = String(dados.p_oficina),
    key = `patio_qualidade_avancada:${w}`;
  const salvo = JSON.parse(
    localStorage.getItem(key) || '{"casos":[],"config":null}',
  ) as { casos: AcompanhamentoQualidade[]; config: ConfigPesquisa | null };
  let resultado: unknown = [];
  for (const caso of salvo.casos.filter((c) => c.tipo === "fabricante")) {
    const t = financeiroGarantiaDemo(caso);
    if (t) {
      caso.dados.recebido_centavos = t.baixado_centavos;
      caso.situacao =
        t.baixado_centavos === t.valor_centavos
          ? "ressarcida"
          : caso.situacao === "ressarcida"
            ? "autorizada"
            : caso.situacao;
    }
  }
  if (nome === "consultar_financeiro_garantia" || nome === "ocorrencia_da_analise") {
    const caso = salvo.casos.find((c) => c.id === dados.p_id);
    if (!caso) throw Error("Acompanhamento indisponível.");
    return (
      nome === "consultar_financeiro_garantia"
        ? financeiroGarantiaDemo(caso)
        : await ocorrenciaAnaliseDemo(w, caso, dados)
    ) as T;
  }
  if (nome === "buscar_documentos_qualidade") {
    const os = await opcoesQualidade(true, w, String(dados.p_busca || ""));
    resultado = [
      ...os.map((o) => ({
        id: o.id,
        origem: "os",
        numero: o.numero,
        cliente: o.cliente,
        objeto: o.veiculo,
      })),
      ...lerServicosDemo(w).atendimentos.map((a) => ({
        id: a.id,
        origem: "atendimento",
        numero: a.numero,
        cliente: "Cliente da demonstração",
        objeto: a.titulo,
      })),
    ].filter((o) =>
      `${o.cliente} ${o.objeto} ${o.numero}`
        .toLowerCase()
        .includes(String(dados.p_busca || "").toLowerCase()),
    );
  } else if (nome === "consultar_acompanhamento_qualidade")
    resultado = salvo.casos.find((a) => a.id === dados.p_id);
  else if (nome === "listar_acompanhamentos_qualidade")
    resultado = salvo.casos.filter((a) => a.tipo === dados.p_tipo);
  else if (nome === "salvar_acompanhamento_qualidade") {
    const i = salvo.casos.findIndex((a) => a.id === dados.p_id),
      antigo = salvo.casos[i];
    if (antigo && antigo.revisao !== dados.p_revisao)
      throw new Error("Registro alterado. Atualize antes de salvar.");
    const documento = {
      id: dados.p_documento,
      origem: dados.p_origem,
      empresa: "Empresa de demonstração",
      cliente: "Cliente da demonstração",
      objeto: "Atendimento da demonstração",
      conteudo: dados.p_dados,
    };
    const canonico = JSON.stringify(documento);
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonico),
    );
    const a = {
      id: dados.p_id,
      tipo: dados.p_tipo,
      situacao: dados.p_situacao,
      dados: dados.p_dados,
      documento,
      documento_canonico: canonico,
      hash_documento: Array.from(new Uint8Array(bytes), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join(""),
      ordem_servico_id: dados.p_origem === "os" ? dados.p_documento : null,
      atendimento_id: dados.p_origem === "atendimento" ? dados.p_documento : null,
      revisao: (antigo?.revisao || 0) + 1,
      criado_em: antigo?.criado_em || new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    } as AcompanhamentoQualidade;
    if (a.tipo === "fabricante") financeiroGarantiaDemo(a, true);
    if (i < 0) salvo.casos.push(a);
    else salvo.casos[i] = a;
    resultado = a;
  } else if (nome === "consultar_satisfacao_qualidade")
    resultado = {
      totais: {
        concluidos: 0,
        convidados: 0,
        enviados: 0,
        respostas: 0,
        nota_media: null,
        satisfeitos: 0,
        insatisfeitos: 0,
        sem_permissao: 0,
        sem_telefone: 0,
      },
      itens: [],
      configuracao: salvo.config,
    };
  else if (nome === "configurar_pesquisa_qualidade")
    salvo.config = {
      ativa: !!dados.p_ativa,
      atraso_dias: Number(dados.p_atraso),
      validade_dias: Number(dados.p_validade),
      site: String(dados.p_site),
    };
  localStorage.setItem(key, JSON.stringify(salvo));
  return resultado as T;
}
