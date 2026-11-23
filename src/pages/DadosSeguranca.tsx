import { novoId } from "../lib/uuid";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { SegurancaConta } from "../components/SegurancaConta";
import { SelecaoTitular } from "../components/SelecaoTitular";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import { rpc } from "../lib/rpc";
import { erroPublico } from "../lib/supabase";
import {
  baixarArquivo,
  lerPacoteMigracao,
  modeloMigracao,
  type PacoteMigracao,
} from "../lib/portabilidade";
import {
  consultarDadosEmpresa,
  escolherPastaExportacao,
  exportarEmpresa,
  importarAnexo,
  type SolicitacaoPrivacidade,
} from "../services/dadosEmpresa";
import "./DadosSeguranca.css";

export function DadosSeguranca() {
  const a = useAcesso(),
    w = a.oficina!.id,
    dono = a.oficina?.perfil === "owner";
  const [aba, setAba] = useState("seguranca"),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const [pacote, setPacote] = useState<PacoteMigracao | null>(null),
    [lote, setLote] = useState(novoId),
    [previa, setPrevia] = useState<{ novos: number; repetidos: number } | null>(null);
  const [solicitacao, setSolicitacao] = useState<SolicitacaoPrivacidade | null>(null),
    [nova, setNova] = useState(false);
  const [idSolicitacao, setIdSolicitacao] = useState(novoId);
  const cancelamento = useRef<AbortController | null>(null),
    trava = useRef(false);
  const [exportando, setExportando] = useState(false);
  const q = useQuery({
    queryKey: ["dados-empresa", a.usuario, w],
    enabled: dono && !a.demo,
    queryFn: ({ signal }) => consultarDadosEmpresa(w, signal),
    refetchOnWindowFocus: false,
    retry: false,
  });
  async function executar(fn: () => Promise<void>) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      await fn();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  const bloqueado = busy || a.demo;
  const config = q.data?.configuracao;
  return (
    <div className="dados-pagina">
      <header className="titulo-pagina">
        <div>
          <h1>Dados e segurança</h1>
          <p>Acessos, cópias e privacidade.</p>
        </div>
        <Link to="/configuracoes">Voltar às configurações</Link>
      </header>
      <nav className="dados-abas" aria-label="Área de dados e segurança">
        {[
          ["seguranca", "Minha conta"],
          ...(dono
            ? [
                ["dados", "Importar e exportar"],
                ["privacidade", "Privacidade"],
                ["suporte", "Suporte"],
              ]
            : []),
        ].map(([k, n]) => (
          <button
            className={aba === k ? "botao-primario" : "botao-secundario"}
            key={k}
            aria-pressed={aba === k}
            disabled={busy}
            onClick={() => {
              setAba(k);
              setErro("");
              setAviso("");
            }}
          >
            {n}
          </button>
        ))}
      </nav>
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração: entre na conta real para alterar proteção, importar ou exportar
          dados.
        </p>
      )}
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      {dono && q.isError && (
        <p role="alert">
          Não foi possível consultar as configurações.{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </p>
      )}
      {aba === "seguranca" && (
        <>
          <SegurancaConta />
          {dono && (
            <section className="dados-bloco">
              <h2>Acesso da equipe</h2>
              <p>Escolha quem pode consultar ou alterar cada área.</p>
              <Link className="botao-secundario" to="/equipe">
                Gerenciar permissões
              </Link>
            </section>
          )}
          <section className="dados-bloco">
            <h2>Trabalhar sem internet</h2>
            <p>Prepare antes de sair. Sincronize as pendências ao reconectar.</p>
            <div className="dados-acoes">
              <Link to="/execucao-offline" className="botao-secundario">
                Abrir área sem internet
              </Link>
            </div>
          </section>
        </>
      )}
      {aba === "dados" && dono && (
        <>
          <section className="dados-bloco">
            <h2>Baixar dados da empresa</h2>
            <p>
              Dados organizados por assunto, anexos e um arquivo de conferência. Senhas
              e chaves de integração ficam de fora.
            </p>
            <button
              className="botao-primario"
              disabled={bloqueado}
              onClick={() => {
                if (trava.current) return;
                const pasta = escolherPastaExportacao();
                void executar(async () => {
                  const destino = await pasta;
                  const ctrl = new AbortController();
                  cancelamento.current = ctrl;
                  setExportando(true);
                  try {
                    const r = await exportarEmpresa(w, destino, setAviso, ctrl.signal);
                    setAviso(
                      `Exportação concluída: ${r.arquivos} arquivos, incluindo ${r.anexos} anexos.`,
                    );
                  } finally {
                    cancelamento.current = null;
                    setExportando(false);
                  }
                });
              }}
            >
              Exportar dados e anexos
            </button>
            {exportando && (
              <button
                className="botao-secundario"
                onClick={() =>
                  cancelamento.current?.abort(
                    Error("Exportação cancelada. A cópia parcial não deve ser usada."),
                  )
                }
              >
                Cancelar exportação
              </button>
            )}
            <small>
              Se os dados mudarem durante a cópia, o sistema avisa para repetir. Pastas
              sem manifesto de conclusão são incompletas.
            </small>
          </section>
          <section className="dados-bloco">
            <h2>Trazer dados de outro sistema</h2>
            <p>Baixe o modelo, preencha e confira a prévia antes de confirmar.</p>
            <button
              className="botao-secundario"
              onClick={() =>
                baixarArquivo(
                  "modelo-migracao.json",
                  new Blob([JSON.stringify(modeloMigracao, null, 2)], {
                    type: "application/json",
                  }),
                )
              }
            >
              Baixar modelo padrão
            </button>
            <label>
              Arquivo preenchido
              <input
                type="file"
                accept=".json,application/json"
                disabled={bloqueado}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPrevia(null);
                  setPacote(null);
                  if (!f) return;
                  void executar(async () => {
                    if (f.size > 4000000) throw Error("Use um arquivo de até 4 MB.");
                    const p = lerPacoteMigracao(await f.text()),
                      id = novoId();
                    setLote(id);
                    const r = await rpc<{ novos: number; repetidos: number }>(
                      "importar_pacote_empresa",
                      { p_oficina: w, p_id: id, p_pacote: p, p_confirmar: false },
                    );
                    setPacote(p);
                    setPrevia(r);
                  });
                }}
              />
            </label>
            {pacote && previa && (
              <div className="dados-previa">
                <strong>
                  {previa.novos} novos · {previa.repetidos} já importados
                </strong>
                <ul>
                  {pacote.registros.slice(0, 12).map((r) => (
                    <li key={r.tipo + r.id}>
                      {r.tipo.replaceAll("_", " ")} · {r.id} ·{" "}
                      {String(
                        r.dados.nome || r.dados.descricao || r.dados.objeto || "",
                      )}
                    </li>
                  ))}
                </ul>
                {pacote.registros.length > 12 && (
                  <p>Mais {pacote.registros.length - 12} registros no arquivo.</p>
                )}
                <p>
                  Clientes e catálogo entram nos cadastros. OS e anotações antigas ficam
                  no Histórico importado. O financeiro traz o saldo anterior, sem
                  inventar recebimentos no caixa.
                </p>
                <button
                  className="botao-primario"
                  disabled={bloqueado}
                  onClick={() =>
                    void executar(async () => {
                      await rpc("importar_pacote_empresa", {
                        p_oficina: w,
                        p_id: lote,
                        p_pacote: pacote,
                        p_confirmar: true,
                      });
                      setPrevia(null);
                      setPacote(null);
                      setAviso(
                        "Importação concluída. O registro de origem evita duplicações ao repetir o arquivo.",
                      );
                      await q.refetch();
                    })
                  }
                >
                  Confirmar importação
                </button>
              </div>
            )}
            <SecaoRecolhivel titulo="Anexos do sistema anterior">
              <form
                className="formulario-cliente"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  void executar(async () => {
                    const file = f.get("arquivo");
                    if (!(file instanceof File)) throw Error("Escolha um arquivo.");
                    await importarAnexo(
                      w,
                      String(f.get("origem")),
                      String(f.get("referencia")),
                      file,
                    );
                    form.reset();
                    setAviso("Anexo guardado com a referência do registro original.");
                  });
                }}
              >
                <label>
                  Sistema de origem
                  <input name="origem" required minLength={2} maxLength={100} />
                </label>
                <label>
                  Número ou referência original
                  <input name="referencia" required maxLength={120} />
                </label>
                <label>
                  Arquivo
                  <input
                    name="arquivo"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.txt"
                    required
                  />
                </label>
                <button className="botao-secundario" disabled={bloqueado}>
                  Enviar anexo
                </button>
              </form>
            </SecaoRecolhivel>
            <Link to="/historico-importado">Consultar histórico importado</Link>
          </section>
          {!!q.data?.importacoes.length && (
            <SecaoRecolhivel titulo="Últimas importações">
              <ul className="dados-lista">
                {q.data.importacoes.map((i) => (
                  <li key={i.id}>
                    <span>
                      {i.origem}
                      <small>{new Date(i.criado_em).toLocaleString("pt-BR")}</small>
                    </span>
                    <strong>{i.resumo.novos} registros</strong>
                  </li>
                ))}
              </ul>
            </SecaoRecolhivel>
          )}
        </>
      )}
      {aba === "privacidade" && dono && (
        <>
          <section className="dados-bloco">
            <div className="dados-acoes">
              <h2>Solicitações de clientes</h2>
              <button
                className="botao-primario"
                disabled={bloqueado}
                onClick={() => {
                  setNova(true);
                  setSolicitacao(null);
                  setIdSolicitacao(novoId());
                }}
              >
                Registrar solicitação
              </button>
            </div>
            {!q.data?.solicitacoes.length && !nova && (
              <p>Nenhuma solicitação registrada.</p>
            )}
            <ul className="dados-lista">
              {q.data?.solicitacoes.map((s) => (
                <li key={s.id}>
                  <span>
                    <strong>{s.solicitante}</strong>
                    <small>
                      {s.tipo} · {s.situacao.replaceAll("_", " ")} · prazo{" "}
                      {s.prazo.split("-").reverse().join("/")}
                    </small>
                  </span>
                  <button
                    className="botao-secundario"
                    disabled={bloqueado}
                    onClick={() => {
                      setSolicitacao(s);
                      setNova(true);
                    }}
                  >
                    Acompanhar
                  </button>
                  {s.cliente_id &&
                    s.situacao !== "recebida" &&
                    s.identidade?.length >= 5 && (
                      <button
                        className="botao-secundario"
                        disabled={bloqueado}
                        onClick={() => {
                          if (trava.current) return;
                          const pasta = escolherPastaExportacao();
                          void executar(async () => {
                            await exportarEmpresa(
                              w,
                              await pasta,
                              setAviso,
                              new AbortController().signal,
                              s.id,
                            );
                            setAviso(
                              "Cópia preparada. Revise textos e anexos antes de entregar ao cliente; confira também registros antigos sem vínculo.",
                            );
                          });
                        }}
                      >
                        Preparar cópia
                      </button>
                    )}
                </li>
              ))}
            </ul>
            {nova && (
              <form
                key={solicitacao?.id || "nova"}
                className="formulario-cliente"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  void executar(async () => {
                    await rpc("salvar_solicitacao_privacidade", {
                      p_oficina: w,
                      p_id: solicitacao?.id || idSolicitacao,
                      p_dados: f,
                      p_revisao: solicitacao?.revisao ?? null,
                    });
                    setNova(false);
                    setAviso("Solicitação registrada no histórico.");
                    await q.refetch();
                  });
                }}
              >
                <label>
                  Solicitante
                  <input
                    name="solicitante"
                    required
                    minLength={2}
                    maxLength={200}
                    defaultValue={solicitacao?.solicitante}
                    readOnly={!!solicitacao}
                  />
                </label>
                <SelecaoTitular cliente={solicitacao?.cliente_id} />
                <label>
                  Pedido
                  <select name="tipo" defaultValue={solicitacao?.tipo || "acesso"}>
                    {["acesso", "correcao", "exportacao", "exclusao", "revogacao"].map(
                      (v, i) => (
                        <option key={v} value={v}>
                          {
                            [
                              "Acesso aos dados",
                              "Correção",
                              "Cópia dos dados",
                              "Exclusão",
                              "Revogação de consentimento",
                            ][i]
                          }
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Prazo para responder
                  <input
                    type="date"
                    name="prazo"
                    required
                    defaultValue={solicitacao?.prazo}
                  />
                </label>
                <label>
                  Situação
                  <select
                    name="situacao"
                    defaultValue={solicitacao?.situacao || "recebida"}
                  >
                    {[
                      "recebida",
                      "identificada",
                      "em_analise",
                      "concluida",
                      "negada",
                    ].map((v, i) => (
                      <option key={v} value={v}>
                        {
                          [
                            "Recebida",
                            "Identidade conferida",
                            "Em análise",
                            "Concluída",
                            "Negada com justificativa",
                          ][i]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Como a identidade foi conferida
                  <textarea
                    name="identidade"
                    maxLength={1000}
                    defaultValue={solicitacao?.identidade}
                    placeholder="Registre a conferência, sem copiar documentos ou senhas."
                  />
                </label>
                <label>
                  Resposta e providências
                  <textarea
                    name="decisao"
                    maxLength={3000}
                    defaultValue={solicitacao?.decisao}
                    placeholder="O que foi enviado, corrigido ou retido, motivo e referência da resposta."
                  />
                </label>
                <div className="dados-acoes">
                  <button className="botao-primario" disabled={bloqueado}>
                    Salvar solicitação
                  </button>
                  <button
                    type="button"
                    className="botao-secundario"
                    disabled={bloqueado}
                    onClick={() => setNova(false)}
                  >
                    Fechar
                  </button>
                </div>
              </form>
            )}
          </section>
          <SecaoRecolhivel titulo="Política de retenção e responsáveis">
            <p>
              Registre a política aprovada pela empresa. O sistema não apaga registros
              financeiros ou históricos automaticamente.
            </p>
            <form
              key={config?.revisao}
              className="formulario-cliente"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                void executar(async () => {
                  await rpc("salvar_configuracao_dados", {
                    p_oficina: w,
                    p_dados: { ...config?.dados, ...f },
                    p_revisao: config?.revisao || 0,
                  });
                  await q.refetch();
                  setAviso("Política registrada.");
                });
              }}
            >
              <label>
                Responsável pela privacidade
                <input
                  name="privacidade_responsavel"
                  maxLength={200}
                  defaultValue={config?.dados.privacidade_responsavel}
                />
              </label>
              <label>
                Prazos por tipo de dado e justificativas
                <textarea
                  name="retencao"
                  maxLength={5000}
                  rows={6}
                  defaultValue={config?.dados.retencao}
                />
              </label>
              <label>
                Próxima revisão da política
                <input
                  type="date"
                  name="retencao_revisao"
                  defaultValue={config?.dados.retencao_revisao}
                />
              </label>
              <button
                className="botao-secundario"
                disabled={bloqueado || q.isPending || q.isError}
              >
                Salvar política
              </button>
            </form>
          </SecaoRecolhivel>
        </>
      )}
      {aba === "suporte" && dono && (
        <section className="dados-bloco">
          <h2>Atendimento e prazo de suporte</h2>
          <p>
            Preencha somente condições que sua equipe consegue cumprir. Sem
            configuração, nenhum prazo será prometido.
          </p>
          <form
            key={config?.revisao}
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void executar(async () => {
                await rpc("salvar_configuracao_dados", {
                  p_oficina: w,
                  p_dados: { ...config?.dados, ...f },
                  p_revisao: config?.revisao || 0,
                });
                await q.refetch();
                setAviso("Condições de suporte atualizadas.");
              });
            }}
          >
            <label>
              Canal de suporte (link HTTPS)
              <input
                type="url"
                name="suporte_url"
                defaultValue={config?.dados.suporte_url}
                placeholder="https://…"
              />
            </label>
            <label>
              Responsável ou equipe
              <input
                name="suporte_responsavel"
                maxLength={200}
                defaultValue={config?.dados.suporte_responsavel}
              />
            </label>
            <label>
              Dias, horários e fuso
              <input
                name="suporte_horarios"
                maxLength={500}
                defaultValue={config?.dados.suporte_horarios}
                placeholder="Defina o horário de atendimento"
              />
            </label>
            <label>
              Primeira resposta em até (horas úteis)
              <input
                type="number"
                min={1}
                max={720}
                step={1}
                name="resposta_horas"
                defaultValue={config?.dados.resposta_horas}
              />
            </label>
            <button
              className="botao-primario"
              disabled={bloqueado || q.isPending || q.isError}
            >
              Salvar condições
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
