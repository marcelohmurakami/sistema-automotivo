import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import {
  operacaoQualidade,
  type LinhaSatisfacao,
  type SatisfacaoQualidade,
  type ConfigPesquisa,
  type PesquisaQualidade,
} from "../services/qualidadeAvancada";
import {
  caminhoDocumentoQualidade,
  porcentagemQualidade,
} from "../lib/qualidadeAvancada";
import { erroPublico } from "../lib/supabase";
import { dataDocumento } from "../lib/documentoCliente";

export function SatisfacaoQualidade({ inicio, fim }: { inicio: string; fim: string }) {
  const a = useAcesso(),
    w = a.oficina!.id,
    qc = useQueryClient();
  const [pagina, setPagina] = useState(0),
    [config, setConfig] = useState<ConfigPesquisa | null>(null),
    [linha, setLinha] = useState<LinhaSatisfacao | null>(null),
    [acao, setAcao] = useState("resolver"),
    [registro, setRegistro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const trava = useRef(false);
  const [linkManual, setLinkManual] = useState("");
  const q = useQuery({
    refetchInterval: 60000,
    queryKey: ["qualidade-avancada", w, "satisfacao", inicio, fim, pagina],
    queryFn: ({ signal }) =>
      operacaoQualidade<SatisfacaoQualidade>(
        a.demo,
        "consultar_satisfacao_qualidade",
        { p_oficina: w, p_inicio: inicio, p_fim: fim, p_pagina: pagina },
        signal,
      ),
  });
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return false;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["qualidade-avancada", w] });
      return true;
    } catch (e) {
      setErro(erroPublico(e));
      return false;
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  async function copiarLink(url: string, mensagem: string) {
    setLinkManual("");
    try {
      await navigator.clipboard.writeText(url);
      setAviso(mensagem);
    } catch {
      setLinkManual(url);
      setAviso("O link está pronto. Selecione e copie o endereço abaixo.");
    }
  }
  async function link(l: LinhaSatisfacao) {
    await executar(async () => {
      const p =
        l.pesquisa ||
        (await operacaoQualidade<PesquisaQualidade>(
          a.demo,
          "gerar_pesquisa_qualidade",
          { p_oficina: w, p_origem: l.origem, p_documento: l.id },
        ));
      const base = q.data?.configuracao?.site || window.location.origin;
      await copiarLink(
        `${base}/pesquisa/${p.token}`,
        "Link copiado. Compartilhe com o cliente pelo canal combinado.",
      );
    });
  }
  async function renovar(l: LinhaSatisfacao) {
    await executar(async () => {
      const p = await operacaoQualidade<PesquisaQualidade>(
        a.demo,
        "renovar_pesquisa_qualidade",
        { p_oficina: w, p_id: l.pesquisa!.id, p_revisao: l.pesquisa!.revisao },
      );
      await copiarLink(
        `${q.data?.configuracao?.site || window.location.origin}/pesquisa/${p.token}`,
        "Novo link copiado. O link anterior foi invalidado.",
      );
    });
  }
  const t = q.data?.totais,
    configPadrao = {
      ativa: false,
      atraso_dias: 1,
      validade_dias: 30,
      site: location.origin.startsWith("https:")
        ? location.origin
        : "https://patio-gestao-peach.vercel.app",
    };
  const etapas = [
    { nome: "Atendimentos concluídos", n: t?.concluidos || 0 },
    { nome: "Pesquisas criadas", n: t?.convidados || 0 },
    { nome: "Envios confirmados", n: t?.enviados || 0 },
    { nome: "Respostas recebidas", n: t?.respostas || 0 },
  ];
  return (
    <section className="qa-secao">
      <div className="qa-cabecalho">
        <div>
          <h2>Satisfação dos clientes</h2>
          <p>
            Todos os atendimentos concluídos e entregues no período, incluindo os que
            não receberam pesquisa.
          </p>
        </div>
        <button
          className="botao-secundario"
          disabled={ocupado}
          onClick={() => {
            setConfig(q.data?.configuracao || configPadrao);
            setErro("");
          }}
        >
          Configurar pesquisa automática
        </button>
      </div>
      {erro && (
        <p role="alert" className="qa-erro">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {linkManual && (
        <label>
          Link da pesquisa
          <input
            readOnly
            value={linkManual}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
      {q.isLoading ? (
        <p role="status">Carregando avaliações…</p>
      ) : q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : (
        <>
          <div className="qa-indicadores">
            <article>
              <span>Nota média das respostas</span>
              <strong>
                {t?.nota_media == null
                  ? "—"
                  : Number(t.nota_media).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    }) + " / 5"}
              </strong>
              <small>{t?.respostas || 0} avaliações recebidas</small>
            </article>
            <article>
              <span>Cobertura da pesquisa</span>
              <strong>
                {porcentagemQualidade(t?.respostas || 0, t?.concluidos || 0)}%
              </strong>
              <small>
                {t?.respostas || 0} de {t?.concluidos || 0} atendimentos responderam
              </small>
            </article>
            <article>
              <span>Satisfeitos entre os respondentes</span>
              <strong>
                {t?.respostas
                  ? porcentagemQualidade(t.satisfeitos, t.respostas) + "%"
                  : "—"}
              </strong>
              <small>Notas 4 e 5</small>
            </article>
            <article className={t?.insatisfeitos ? "qa-atencao" : ""}>
              <span>Precisam de atenção</span>
              <strong>{t?.insatisfeitos || 0}</strong>
              <small>Notas 1 e 2 sem solução registrada</small>
            </article>
          </div>
          <div className="qa-cobertura" aria-label="Cobertura da pesquisa">
            {etapas.map((e) => (
              <div key={e.nome}>
                <span>{e.nome}</span>
                <div>
                  <i
                    style={{
                      width: porcentagemQualidade(e.n, t?.concluidos || 0) + "%",
                    }}
                  />
                </div>
                <strong>{e.n}</strong>
              </div>
            ))}
          </div>
          <p className="qa-ajuda">
            {t?.sem_permissao || 0} sem autorização de contato · {t?.sem_telefone || 0}{" "}
            sem telefone válido. O compartilhamento manual do link não é contado como
            envio confirmado.
          </p>
          <div className="qa-lista">
            {q.data?.itens.slice(0, 50).map((l) => (
              <article className="qa-linha" key={l.origem + l.id}>
                <div className="qa-linha-corpo">
                  <Link to={caminhoDocumentoQualidade(l)}>
                    <strong>
                      #{l.numero} · {l.cliente}
                    </strong>
                  </Link>
                  <span>{l.objeto}</span>
                  <small>Concluído em {dataDocumento(l.finalizado_em, false)}</small>
                  {l.pesquisa?.comentario && (
                    <p className="qa-comentario">{l.pesquisa.comentario}</p>
                  )}
                  {l.pesquisa?.acompanhamento && (
                    <small>Acompanhamento: {l.pesquisa.acompanhamento}</small>
                  )}
                </div>
                <div className="qa-estado">
                  {l.pesquisa?.nota ? (
                    <>
                      <strong>{l.pesquisa.nota} / 5</strong>
                      <span>
                        {l.pesquisa.resolvido_em
                          ? "Acompanhamento resolvido"
                          : l.pesquisa.nota <= 2
                            ? "Acompanhar insatisfação"
                            : "Avaliação recebida"}
                      </span>
                    </>
                  ) : (
                    <span>
                      {l.pesquisa?.revogado_em
                        ? "Link revogado"
                        : l.pesquisa &&
                            Date.parse(l.pesquisa.expira_em) <= q.dataUpdatedAt
                          ? "Link expirado"
                          : l.envio === "enviado"
                            ? "Enviado · aguarda resposta"
                            : l.envio === "incerto"
                              ? "Envio não confirmado · confira o canal"
                              : l.envio === "aprovado"
                                ? "Na fila de envio"
                                : l.pesquisa
                                  ? "Pesquisa criada"
                                  : "Sem pesquisa"}
                    </span>
                  )}
                </div>
                <div className="qa-acoes">
                  {!l.pesquisa?.respondido_em &&
                    l.pesquisa &&
                    (l.pesquisa.revogado_em ||
                      Date.parse(l.pesquisa.expira_em) <= q.dataUpdatedAt) && (
                      <button
                        disabled={ocupado}
                        className="botao-secundario"
                        onClick={() => void renovar(l)}
                      >
                        Renovar link
                      </button>
                    )}
                  {!l.pesquisa?.respondido_em &&
                    !l.pesquisa?.revogado_em &&
                    (!l.pesquisa ||
                      Date.parse(l.pesquisa.expira_em) > q.dataUpdatedAt) && (
                      <button
                        disabled={ocupado}
                        className="botao-secundario"
                        onClick={() => void link(l)}
                      >
                        {l.pesquisa ? "Copiar link" : "Criar link"}
                      </button>
                    )}
                  <button
                    className="botao-secundario"
                    disabled={ocupado}
                    onClick={() => {
                      setLinha(l);
                      setRegistro("");
                      setAcao(l.pesquisa?.nota ? "resolver" : "permitir");
                      setErro("");
                    }}
                  >
                    Gerenciar
                  </button>
                </div>
              </article>
            ))}
            {!q.data?.itens.length && (
              <p className="qa-vazio">
                Nenhum atendimento concluído e entregue neste período.
              </p>
            )}
          </div>
          <div className="qa-paginacao">
            <button
              className="botao-secundario"
              disabled={!pagina}
              onClick={() => setPagina(pagina - 1)}
            >
              Anterior
            </button>
            <span>Página {pagina + 1}</span>
            <button
              className="botao-secundario"
              disabled={(q.data?.itens.length || 0) <= 50}
              onClick={() => setPagina(pagina + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      )}
      <Dialogo
        aberto={!!config}
        fechar={() => {
          if (!ocupado) setConfig(null);
        }}
        titulo="Pesquisa após o atendimento"
        classe="qa-dialogo"
      >
        <form
          className="qa-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!config) return;
            const ok = await executar(() =>
              operacaoQualidade(a.demo, "configurar_pesquisa_qualidade", {
                p_oficina: w,
                p_ativa: config.ativa,
                p_atraso: config.atraso_dias,
                p_validade: config.validade_dias,
                p_site: config.site.replace(/\/$/, ""),
              }),
            );
            if (ok) {
              setConfig(null);
              setAviso("Configuração salva.");
            }
          }}
        >
          {config && (
            <fieldset disabled={ocupado}>
              <label className="qa-checkbox">
                <input
                  type="checkbox"
                  checked={config.ativa}
                  onChange={(e) => setConfig({ ...config, ativa: e.target.checked })}
                />
                Criar e agendar pesquisas após novos atendimentos
              </label>
              <p className="qa-ajuda">
                Envia somente para clientes com autorização registrada e telefone
                válido. A entrega usa o canal e o agendador configurados nas automações.
              </p>
              <div className="qa-campos">
                <label>
                  Enviar após (dias)
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    required
                    value={config.atraso_dias}
                    onChange={(e) =>
                      setConfig({ ...config, atraso_dias: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Validade do link (dias)
                  <input
                    type="number"
                    min={1}
                    max={90}
                    step={1}
                    required
                    value={config.validade_dias}
                    onChange={(e) =>
                      setConfig({ ...config, validade_dias: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <details>
                <summary>Endereço do site (opcional)</summary>
                <label>
                  Site publicado
                  <input
                    type="url"
                    required
                    value={config.site}
                    onChange={(e) => setConfig({ ...config, site: e.target.value })}
                  />
                </label>
              </details>
              {erro && <p role="alert">{erro}</p>}
              <button className="botao-primario">
                {ocupado ? "Salvando…" : "Salvar configuração"}
              </button>
            </fieldset>
          )}
        </form>
      </Dialogo>
      <Dialogo
        aberto={!!linha}
        fechar={() => {
          if (!ocupado) setLinha(null);
        }}
        titulo="Acompanhar pesquisa"
        classe="qa-dialogo"
      >
        {linha && (
          <form
            className="qa-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await executar(() =>
                acao === "permitir" || acao === "recusar"
                  ? operacaoQualidade(a.demo, "registrar_contato_pesquisa", {
                      p_oficina: w,
                      p_cliente: linha.cliente_id,
                      p_permite: acao === "permitir",
                      p_registro: registro,
                    })
                  : operacaoQualidade(a.demo, "acompanhar_pesquisa_qualidade", {
                      p_oficina: w,
                      p_id: linha.pesquisa?.id,
                      p_revisao: linha.pesquisa?.revisao,
                      p_acao: acao,
                      p_registro: registro,
                    }),
              );
              if (ok) {
                setLinha(null);
                setAviso("Acompanhamento registrado.");
              }
            }}
          >
            <fieldset disabled={ocupado}>
              <p>
                <strong>{linha.cliente}</strong> · #{linha.numero}
              </p>
              {linha.pesquisa?.recusa_contato && (
                <p className="qa-ajuda">
                  O cliente recusou novos convites nesta pesquisa.
                </p>
              )}
              <label>
                Ação
                <select
                  aria-label="Ação"
                  value={acao}
                  onChange={(e) => setAcao(e.target.value)}
                >
                  {linha.pesquisa?.nota && (
                    <>
                      <option value="resolver">Registrar solução</option>
                      <option value="acompanhar">Registrar contato / andamento</option>
                      <option value="reabrir">Reabrir acompanhamento</option>
                    </>
                  )}
                  <option value="permitir">Registrar autorização para pesquisas</option>
                  <option value="recusar">Registrar recusa de pesquisas</option>
                  {linha.pesquisa && !linha.pesquisa.revogado_em && (
                    <option value="revogar">Revogar link</option>
                  )}
                </select>
              </label>
              <label>
                Registro
                <textarea
                  required
                  minLength={5}
                  maxLength={3000}
                  rows={4}
                  value={registro}
                  onChange={(e) => setRegistro(e.target.value)}
                  placeholder="O que foi combinado, quando e por qual canal?"
                />
              </label>
              {erro && <p role="alert">{erro}</p>}
              <button className="botao-primario">
                {ocupado ? "Salvando…" : "Salvar registro"}
              </button>
            </fieldset>
          </form>
        )}
      </Dialogo>
    </section>
  );
}
