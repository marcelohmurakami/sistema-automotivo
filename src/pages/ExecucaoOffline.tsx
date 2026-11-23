import { useEffect, useMemo, useRef, useState } from "react";
import { agruparLeituras } from "../lib/agruparLeituras";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { componenteSobDemanda } from "../lib/componenteSobDemanda";
import { novaFichaEspecialidade, perfilAtendimento } from "../lib/perfisAtendimento";
import { especialidades } from "../lib/especialidades";
import { erroPublico } from "../lib/supabase";
import { reduzirFoto } from "../lib/capturaAtendimento";
import {
  execucoesLocais,
  guardarExecucao,
  excluirExecucao,
  compararExecucao,
  type ExecucaoLocal,
  type BaseExecucao,
} from "../lib/execucaoOffline";
import {
  basesDoUsuario,
  rascunhosDoUsuario,
  type BaseOffline,
  type RascunhoOffline,
} from "../lib/atendimentoOffline";
import type { ItemFilaOffline } from "../services/filaOffline";
import { enviarFilaOffline } from "../lib/filaOffline";
import { DocumentosOffline } from "../components/offline/DocumentosOffline";
import { CloudUpload, Download, Wifi, WifiOff } from "lucide-react";
import "../components/PlanejamentoOperacional.css";
import "./ExecucaoOffline.css";
const EditorFichaEspecialidade = componenteSobDemanda(async () => ({
  default: (await import("../components/FichaEspecialidade")).EditorFichaEspecialidade,
}));
const NovosAtendimentosOffline = componenteSobDemanda(async () => ({
  default: (await import("../components/offline/NovosAtendimentosOffline"))
    .NovosAtendimentosOffline,
}));
async function sincronizarItemOffline(
  ...args: Parameters<typeof import("../services/filaOffline").sincronizarItemOffline>
) {
  return (await import("../services/filaOffline")).sincronizarItemOffline(...args);
}
async function baixarExecucoes(
  ...args: Parameters<typeof import("../services/execucaoOffline").baixarExecucoes>
) {
  return (await import("../services/execucaoOffline")).baixarExecucoes(...args);
}
const hoje = () => new Date().toLocaleDateString("en-CA");
const rotulos: Record<string, string> = {
  open: "Recebido",
  in_progress: "Em execução",
  quality_check: "Conferência e testes",
  ready: "Pronto",
  orcamento: "Aguardando aprovação",
  aprovado: "Aprovado",
  em_execucao: "Em execução",
  aguardando: "Parado",
  concluido: "Concluído",
};
export function ExecucaoOffline() {
  const a = useAcesso();
  return <AreaExecucao key={a.usuario || "sem-sessao"} />;
}
function AreaExecucao() {
  const a = useAcesso(),
    [agora] = useState(Date.now),
    [execucoes, setLista] = useState<ExecucaoLocal[]>([]),
    [bases, setBases] = useState<BaseOffline[]>([]),
    [rascunhos, setRascunhos] = useState<RascunhoOffline[]>([]),
    [oficinaEscolhida, setOficinaEscolhida] = useState(""),
    [edit, setEdit] = useState<ExecucaoLocal | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [inicio, setInicio] = useState(hoje),
    [fim, setFim] = useState(hoje),
    [remoto, setRemoto] = useState<BaseExecucao | null>(null),
    [escolhas, setEscolhas] = useState<Record<string, "local" | "remoto">>({});
  const trava = useRef(false);
  const nomesBases = useMemo(
    () => new Map(bases.map((b) => [b.oficina, b.nome])),
    [bases],
  );
  const empresas = useMemo(
    () =>
      Array.from(
        new Map([
          ...bases.map((b) => [b.oficina, b.nome] as const),
          ...execucoes.map((r) => [r.oficina, r.empresa] as const),
          ...rascunhos.map(
            (r) =>
              [
                r.oficina,
                nomesBases.get(r.oficina) || "Empresa com atendimentos salvos",
              ] as const,
          ),
          ...(a.oficinas || []).map((e) => [e.id, e.nome] as const),
          ...(a.oficina ? [[a.oficina.id, a.oficina.nome] as const] : []),
        ]),
      ),
    [bases, execucoes, rascunhos, a.oficinas, a.oficina, nomesBases],
  );
  const oficinaAtual = oficinaEscolhida || a.oficina?.id || empresas[0]?.[0] || "";
  const base = bases.find((b) => b.oficina === oficinaAtual);
  const lista = useMemo(
    () => execucoes.filter((r) => r.oficina === oficinaAtual),
    [execucoes, oficinaAtual],
  );
  const novos = useMemo(
    () => rascunhos.filter((r) => r.oficina === oficinaAtual),
    [rascunhos, oficinaAtual],
  );
  const pendentes: ItemFilaOffline[] = [
    ...novos
      .filter((r) => r.situacao !== "sincronizado" && (!r.documento || r.pronto_envio))
      .map((r) => ({ tipo: "novo" as const, id: r.id })),
    ...lista
      .filter((r) => r.pendente)
      .map((r) => ({ tipo: "execucao" as const, id: r.id })),
  ];
  const lerDados = async (usuario: string) =>
    Promise.all([
      execucoesLocais(usuario),
      basesDoUsuario(usuario, true),
      rascunhosDoUsuario(usuario),
    ]);
  const leitor = useRef<ReturnType<typeof agruparLeituras> | null>(null);
  const atualizar = async () => {
    await leitor.current?.atualizar();
  };
  useEffect(() => {
    let vivo = true;
    if (!a.usuario) return;
    const usuario = a.usuario;
    const leitura = agruparLeituras(
      () => lerDados(usuario),
      ([e, b, r]) => {
        setLista(e);
        setBases(b);
        setRascunhos(r);
      },
    );
    leitor.current = leitura;
    const atualizarLocal = () => {
      void leitura.atualizar().catch((e) => {
        if (vivo) setErro(erroPublico(e));
      });
    };
    atualizarLocal();
    window.addEventListener("patio-offline-alterado", atualizarLocal);
    return () => {
      vivo = false;
      leitura.encerrar();
      leitor.current = null;
      window.removeEventListener("patio-offline-alterado", atualizarLocal);
    };
  }, [a.usuario]);
  useEffect(() => {
    document.title = "Trabalhar sem internet · Pátio";
    const f = () => setOnline(navigator.onLine);
    window.addEventListener("online", f);
    window.addEventListener("offline", f);
    return () => {
      window.removeEventListener("online", f);
      window.removeEventListener("offline", f);
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  const acao = async (fn: () => Promise<unknown>) => {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      await fn();
      await atualizar();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  };
  const guardar = async () => {
    if (!edit) return;
    const d = structuredClone(edit);
    d.pendente = true;
    d.erro = "";
    await guardarExecucao(d);
    setEdit(d);
    setDirty(false);
    await atualizar();
    setAviso("Salvo no aparelho. Envie quando houver conexão.");
  };
  const mudar = (patch: Partial<ExecucaoLocal>) => {
    if (!edit) return;
    setEdit({ ...edit, ...patch });
    setDirty(true);
  };
  const validarEnvio = async () => {
    if (!online || !navigator.onLine) throw Error("Conecte à internet para enviar.");
    if (!a.usuario || a.demo || (a.oficina && a.oficina.id !== oficinaAtual))
      throw Error("Selecione a empresa deste atendimento no sistema antes de enviar.");
    if (!a.oficina) {
      const acesso = (await a.atualizar()) as { data?: { id: string }[] };
      if (!acesso.data?.some((x) => x.id === oficinaAtual))
        throw Error(
          "Não foi possível validar o acesso. Entre na conta e tente novamente.",
        );
      a.selecionarOficina(oficinaAtual);
    }
  };
  const enviar = (item: ItemFilaOffline) =>
    acao(async () => {
      await validarEnvio();
      try {
        await sincronizarItemOffline(item, a.usuario!, oficinaAtual);
        setAviso("Atendimento e fotos enviados.");
      } finally {
        await atualizar();
      }
    });
  const sincronizar = (r: ExecucaoLocal) => enviar({ tipo: "execucao", id: r.id });
  const enviarTudo = () =>
    acao(async () => {
      await validarEnvio();
      const resultado = await enviarFilaOffline(
        pendentes,
        (item) => sincronizarItemOffline(item, a.usuario!, oficinaAtual),
        (n, total) => setAviso("Enviando: " + n + " de " + total + " atendimentos."),
      );
      await atualizar();
      setAviso(
        resultado.enviados +
          " atendimento(s) enviado(s)." +
          (resultado.falhas.length
            ? " " +
              resultado.falhas.length +
              " precisa(m) de conferência; os dados continuam no aparelho."
            : " Tudo em dia."),
      );
      if (resultado.falhas.length) setErro(erroPublico(resultado.falhas[0].erro));
    });
  const preparar = () =>
    acao(async () => {
      if (
        !a.usuario ||
        !a.oficina ||
        a.oficina.id !== oficinaAtual ||
        !online ||
        a.demo ||
        !a.permite("work_orders")
      )
        throw Error("Entre na empresa com internet para preparar este aparelho.");
      if (!inicio || !fim || fim < inicio) throw Error("Confira as datas da agenda.");
      const usuario = a.usuario,
        oficina = a.oficina;
      const resultados = await Promise.allSettled([
        import("../services/prepararOffline").then((m) =>
          m.prepararNovosAtendimentos(usuario, oficina),
        ),
        baixarExecucoes(oficinaAtual, inicio, fim).then(async (p) => {
          await (await import("../services/execucaoOffline")).prepararAparelho(p);
          return p.itens.length;
        }),
      ]);
      await atualizar();
      await navigator.storage?.persist?.().catch(() => false);
      const falhas = resultados.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (falhas.length) {
        setAviso("Preparação incompleta. O que já estava salvo permanece disponível.");
        setErro(falhas.map((r) => erroPublico(r.reason)).join(" "));
      } else
        setAviso(
          "Aparelho preparado. Cadastros e " +
            (resultados[1].status === "fulfilled" ? resultados[1].value : 0) +
            " OS/visitas disponíveis sem internet.",
        );
    });
  const comparacao = edit && remoto ? compararExecucao(edit, remoto, escolhas) : null;
  return (
    <main className="plano-offline plano-op offline-unificado">
      <header className="offline-cabecalho">
        <div>
          <Link to="/" className="offline-voltar">
            ← Voltar ao sistema
          </Link>
          <h1>Trabalhar sem internet</h1>
          <p>Crie OS e orçamentos, imprima e continue os atendimentos sem conexão.</p>
        </div>
        <span className={"offline-conexao" + (!online ? " sem-rede" : "")}>
          {online ? <Wifi size={18} /> : <WifiOff size={18} />}
          {online ? "Conectado" : "Sem internet"}
        </span>
      </header>
      {!a.usuario ? (
        <p className="estado-lista">
          Entre na sua conta com internet para preparar este aparelho.{" "}
          <Link to="/entrar">Entrar</Link>
        </p>
      ) : (
        <>
          <section className="offline-resumo" aria-label="Dados deste aparelho">
            <div>
              {empresas.length > 1 ? (
                <label>
                  Empresa neste aparelho
                  <select
                    value={oficinaAtual}
                    disabled={busy || !!edit}
                    onChange={(e) => {
                      setOficinaEscolhida(e.target.value);
                      setErro("");
                      setAviso("");
                    }}
                  >
                    {empresas.map(([id, nome]) => (
                      <option key={id} value={id}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <strong>{empresas[0]?.[1] || "Seu aparelho"}</strong>
              )}
              <p>
                {pendentes.length
                  ? pendentes.length + " atendimento(s) para enviar"
                  : "Nenhum envio pendente"}
              </p>
            </div>
            <button
              className="botao-primario"
              disabled={busy || !online || !pendentes.length}
              onClick={() => void enviarTudo()}
            >
              <CloudUpload size={18} />
              {busy ? "Aguarde…" : "Enviar pendências"}
            </button>
          </section>
          {!online && (
            <p className="offline-ajuda">
              Você pode continuar os registros salvos. O envio será liberado quando a
              conexão voltar.
            </p>
          )}
          {aviso && (
            <p role="status" className="offline-aviso">
              {aviso}
            </p>
          )}
          {erro && (
            <p role="alert" className="offline-erro">
              {erro}
            </p>
          )}
          <DocumentosOffline
            usuario={a.usuario}
            oficina={oficinaAtual}
            base={base}
            lista={novos}
            ocupado={busy}
            atualizar={atualizar}
            sincronizar={(r) => enviar({ tipo: "novo", id: r.id })}
          />
          {novos.some((r) => !r.documento) && (
            <NovosAtendimentosOffline
              apenasExistentes
              key={oficinaAtual}
              usuario={a.usuario}
              oficina={oficinaAtual}
              base={base}
              lista={novos.filter((r) => !r.documento)}
              online={online}
              ocupado={busy}
              atualizar={atualizar}
              sincronizar={(r) => enviar({ tipo: "novo", id: r.id })}
              avisar={setAviso}
            />
          )}
          <section aria-label="OS e visitas salvas" className="offline-execucoes">
            <header className="offline-secao-cabecalho">
              <h2>OS e visitas salvas</h2>
              <span>{lista.length} no aparelho</span>
            </header>
            <div className="plano-lista">
              {lista.map((r) => (
                <article className="plano-card offline-registro" key={r.id}>
                  <div className="plano-cabecalho">
                    <div>
                      <small>{r.empresa}</small>
                      <h2>{r.base.objeto || r.base.titulo}</h2>
                      <p>
                        {r.base.cliente} ·{" "}
                        {r.base.inicio
                          ? new Date(r.base.inicio).toLocaleString("pt-BR")
                          : `OS ${r.base.numero || ""}`}
                      </p>
                      <span className="plano-status">
                        {r.pendente
                          ? r.resposta
                            ? "Fotos pendentes"
                            : r.conflito
                              ? "Precisa comparar alterações"
                              : "Pendente de envio"
                          : "Disponível no aparelho"}
                      </span>
                    </div>
                    <div className="plano-acoes">
                      <button
                        className="botao-primario"
                        disabled={busy}
                        onClick={() => {
                          setEdit(structuredClone(r));
                          setDirty(false);
                          setErro("");
                          setRemoto(null);
                          setEscolhas({});
                        }}
                      >
                        Abrir execução
                      </button>
                      {r.pendente && (
                        <button
                          className="botao-secundario"
                          disabled={busy || !online}
                          onClick={() => void sincronizar(r)}
                        >
                          Sincronizar
                        </button>
                      )}
                      {!r.pendente && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void acao(() => excluirExecucao(a.usuario!, r.id))
                          }
                        >
                          Remover do aparelho
                        </button>
                      )}
                    </div>
                  </div>
                  {r.erro && <p role="alert">{r.erro}</p>}
                  {agora - r.preparado > 7 * 86400000 && (
                    <p>
                      Preparado há mais de sete dias. Atualize conectado antes de
                      iniciar outro serviço.
                    </p>
                  )}
                </article>
              ))}
              {!lista.length && (
                <p className="estado-lista">
                  Nenhuma OS salva. Prepare a agenda abaixo ou use “Usar sem internet”
                  dentro da OS.
                </p>
              )}
            </div>
          </section>
          <details
            className="offline-preparo"
            open={(!base && !lista.length) || undefined}
          >
            <summary>
              <Download size={17} />
              Preparar aparelho
            </summary>
            <p>
              Com internet, baixe clientes, serviços, preços e as OS/visitas da agenda.
              O trabalho pendente será preservado.
            </p>
            <div className="plano-campos">
              <label>
                De
                <input
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  min={inicio}
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                />
              </label>
              <button
                className="botao-secundario"
                disabled={
                  busy ||
                  !online ||
                  !a.oficina ||
                  a.oficina.id !== oficinaAtual ||
                  a.demo ||
                  !a.permite("work_orders")
                }
                onClick={() => void preparar()}
              >
                {busy ? "Preparando…" : "Preparar / atualizar aparelho"}
              </button>
            </div>
            <p className="offline-ajuda">
              Cadastros para novos atendimentos ficam disponíveis por 7 dias. Fotos já
              anexadas no sistema não são baixadas; você pode tirar novas fotos aqui.
            </p>
          </details>
          <details className="offline-ajuda-detalhes">
            <summary>Como funciona</summary>
            <p>
              OS e orçamentos salvos são enviados automaticamente ao reconectar, com o
              aplicativo aberto. A referência local recebe o número oficial sem criar
              outra cópia. Os registros ficam neste aparelho até serem enviados.
              Pagamentos, aprovações e entregas precisam de internet. Envie as
              pendências antes de sair da conta, pois sair remove as cópias locais.
            </p>
          </details>
        </>
      )}
      {edit && (
        <Dialogo
          aberto
          titulo={edit.base.titulo || "Execução do atendimento"}
          fechar={() => {
            if (busy) return;
            void acao(async () => {
              if (dirty) await guardar();
              setEdit(null);
              setRemoto(null);
            });
          }}
        >
          <form
            className="plano-op"
            onSubmit={(e) => {
              e.preventDefault();
              void acao(guardar);
            }}
          >
            <p>
              <strong>{edit.base.cliente}</strong> · {edit.base.objeto}
            </p>
            {edit.base.endereco && <p>{edit.base.endereco}</p>}
            {edit.erro && <p role="alert">Último envio: {edit.erro}</p>}
            {edit.base.itens.length > 0 && (
              <ul>
                {edit.base.itens.map((i, n) => (
                  <li key={n}>
                    {i.quantidade} × {i.descricao}
                  </li>
                ))}
              </ul>
            )}
            {edit.pedido && !edit.conflito && (
              <p>
                Há um envio iniciado. Feche e clique em Sincronizar para concluir antes
                de editar novamente.
              </p>
            )}
            {edit.base.automotivo && edit.dados.situacao === "ready" && (
              <p>
                Ao sincronizar como pronto, todos os itens pendentes serão concluídos,
                como no painel. Confira o trabalho e os materiais antes de salvar.
              </p>
            )}
            <fieldset disabled={busy || !!edit.pedido}>
              <div className="plano-acoes">
                <button
                  type="button"
                  className="botao-secundario"
                  disabled={!!edit.dados.iniciado_em}
                  onClick={() =>
                    mudar({
                      dados: { ...edit.dados, iniciado_em: new Date().toISOString() },
                    })
                  }
                >
                  Registrar início agora
                </button>
                <button
                  type="button"
                  className="botao-secundario"
                  disabled={!edit.dados.iniciado_em || !!edit.dados.finalizado_em}
                  onClick={() =>
                    mudar({
                      dados: { ...edit.dados, finalizado_em: new Date().toISOString() },
                    })
                  }
                >
                  Registrar término agora
                </button>
              </div>
              <p>
                {edit.dados.iniciado_em
                  ? `Início: ${new Date(edit.dados.iniciado_em).toLocaleString("pt-BR")}`
                  : "Início ainda não registrado"}
                {edit.dados.finalizado_em
                  ? ` · Término: ${new Date(edit.dados.finalizado_em).toLocaleString("pt-BR")}`
                  : ""}
              </p>
              {edit.base.agenda_id && (
                <label className="plano-concluir-visita">
                  <input
                    type="checkbox"
                    checked={!!edit.dados.visita_concluida}
                    disabled={!edit.dados.finalizado_em}
                    onChange={(e) =>
                      mudar({
                        dados: { ...edit.dados, visita_concluida: e.target.checked },
                      })
                    }
                  />
                  <span>
                    Concluir esta visita ao sincronizar
                    <small>
                      Registre o término antes de concluir. A situação da OS é escolhida
                      separadamente.
                    </small>
                  </span>
                </label>
              )}
              {edit.base.documento_id && (
                <label>
                  Situação ao sincronizar
                  <select
                    value={edit.dados.situacao || ""}
                    onChange={(e) => {
                      const s = e.target.value;
                      let ficha = edit.dados.ficha;
                      if (
                        ficha &&
                        s === "concluido" &&
                        especialidades[ficha.especialidade]?.ramo ===
                          "assistencia_tecnica"
                      ) {
                        ficha = {
                          ...ficha,
                          etapa:
                            ficha.especialidade === "assistencia_eletrodomesticos" &&
                            ficha.campos.modalidade === "Domicílio"
                              ? "Serviço concluído no local"
                              : perfilAtendimento(ficha.especialidade).etapas.find(
                                  (x) =>
                                    [
                                      "Pronto para retirada",
                                      "Pronto para entrega",
                                      "Disponível para retirada",
                                    ].includes(x),
                                ) || ficha.etapa,
                        };
                      }
                      mudar({ dados: { ...edit.dados, situacao: s, ficha } });
                    }}
                  >
                    {[
                      ...new Set([
                        edit.base.situacao,
                        ...(edit.base.automotivo
                          ? ["open", "in_progress", "quality_check", "ready"]
                          : ["aprovado", "em_execucao", "aguardando"].includes(
                                edit.base.situacao || "",
                              )
                            ? ["em_execucao", "aguardando", "concluido"]
                            : []),
                      ]),
                    ]
                      .filter(Boolean)
                      .map((s) => (
                        <option key={s} value={s!}>
                          {rotulos[s!] || s}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Serviço realizado e observações
                <textarea
                  maxLength={5000}
                  value={edit.dados.anotacoes}
                  onChange={(e) =>
                    mudar({ dados: { ...edit.dados, anotacoes: e.target.value } })
                  }
                />
              </label>
              <section className="plano-card">
                <h3>Fotos antes e depois</h3>
                {edit.base.documento_id ? (
                  <>
                    <label>
                      Adicionar fotos
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        multiple
                        disabled={edit.fotos.length >= 12}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = "";
                          void acao(async () => {
                            if (files.length + edit.fotos.length > 12)
                              throw Error("Limite de 12 fotos por execução.");
                            const fotos = [...edit.fotos];
                            for (const f of files)
                              fotos.push({
                                id: crypto.randomUUID(),
                                imagem: await reduzirFoto(f),
                                fase: "antes",
                                legenda: "",
                                sincronizada: false,
                              });
                            mudar({ fotos });
                          });
                        }}
                      />
                    </label>
                    {edit.fotos.map((f) => (
                      <div className="plano-card plano-campos" key={f.id}>
                        <img
                          loading="lazy"
                          decoding="async"
                          src={f.imagem}
                          alt={f.legenda || "Foto da execução"}
                          style={{ width: "100%", maxWidth: 180, borderRadius: 8 }}
                        />
                        <label>
                          Momento
                          <select
                            disabled={f.sincronizada}
                            value={f.fase}
                            onChange={(e) =>
                              mudar({
                                fotos: edit.fotos.map((x) =>
                                  x.id === f.id ? { ...x, fase: e.target.value } : x,
                                ),
                              })
                            }
                          >
                            <option value="antes">Antes</option>
                            <option value="depois">Depois</option>
                          </select>
                        </label>
                        <label>
                          Legenda
                          <input
                            maxLength={500}
                            disabled={f.sincronizada}
                            value={f.legenda}
                            onChange={(e) =>
                              mudar({
                                fotos: edit.fotos.map((x) =>
                                  x.id === f.id ? { ...x, legenda: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        {!f.sincronizada && (
                          <button
                            type="button"
                            onClick={() =>
                              mudar({ fotos: edit.fotos.filter((x) => x.id !== f.id) })
                            }
                          >
                            Remover foto
                          </button>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <p>
                    Vincule uma OS a esta visita e prepare o aparelho novamente para
                    anexar fotos à ordem.
                  </p>
                )}
              </section>
              {edit.base.documento_id && (
                <EditorFichaEspecialidade
                  valor={
                    edit.dados.ficha || novaFichaEspecialidade(edit.base.especialidade)
                  }
                  alterar={(ficha) => mudar({ dados: { ...edit.dados, ficha } })}
                  mostrarEtapa
                  gruposRecolhiveis
                  ocultarCampos={["recebedor"]}
                  etapasPermitidas={perfilAtendimento(
                    edit.base.especialidade,
                  ).etapas.filter(
                    (e) => !["Entregue", "Aceite registrado"].includes(e),
                  )}
                />
              )}
              <button className="botao-primario" disabled={!dirty}>
                {busy ? "Salvando…" : "Salvar no aparelho"}
              </button>
            </fieldset>
            {edit.conflito && (
              <button
                type="button"
                disabled={busy || !online}
                onClick={() =>
                  void acao(async () => {
                    const p = await baixarExecucoes(
                      edit.oficina,
                      undefined,
                      undefined,
                      edit.base.agenda_id,
                      edit.base.agenda_id ? null : edit.base.documento_id,
                    );
                    setRemoto(p.itens[0]);
                    setEscolhas({});
                  })
                }
              >
                Comparar com a versão atual
              </button>
            )}
            {remoto && comparacao && (
              <section className="plano-card">
                <h3>Conferir alterações</h3>
                <p>
                  Horário atual:{" "}
                  {remoto.inicio
                    ? new Date(remoto.inicio).toLocaleString("pt-BR")
                    : "Sem agendamento"}
                  . Alterações feitas somente no servidor serão preservadas. Confira as
                  divergências abaixo.
                </p>
                {comparacao.conflitos.map((x) => (
                  <div className="plano-card" key={x.campo}>
                    <strong>{x.campo}</strong>
                    <p>No aparelho: {String(x.local)}</p>
                    <p>No sistema: {String(x.remoto)}</p>
                    <select
                      aria-label={`Escolher ${x.campo}`}
                      value={escolhas[x.campo] || ""}
                      onChange={(e) =>
                        setEscolhas({
                          ...escolhas,
                          [x.campo]: e.target.value as "local" | "remoto",
                        })
                      }
                    >
                      <option value="">Escolha qual manter</option>
                      <option value="local">Manter o que registrei</option>
                      <option value="remoto">Manter o que está no sistema</option>
                    </select>
                  </div>
                ))}
                {!comparacao.conflitos.length && (
                  <p>
                    Não há divergências pendentes. O próximo envio usará os dados
                    conferidos.
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy || comparacao.conflitos.length > 0}
                  onClick={() =>
                    void acao(async () => {
                      const d = {
                        ...edit,
                        base: remoto,
                        dados: comparacao.dados,
                        conflito: false,
                        pedido: undefined,
                        resposta: undefined,
                        chave: crypto.randomUUID(),
                        erro: "",
                        pendente: true,
                      };
                      await guardarExecucao(d);
                      setEdit(d);
                      setDirty(false);
                      setRemoto(null);
                    })
                  }
                >
                  Confirmar dados para novo envio
                </button>
              </section>
            )}
            {erro && <p role="alert">{erro}</p>}
          </form>
        </Dialogo>
      )}
    </main>
  );
}
