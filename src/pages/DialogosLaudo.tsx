import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { SelecaoRapida } from "../components/SelecaoRapida";
import { DocumentoLaudo, type DocumentoLaudoDados } from "../components/DocumentoLaudo";
import {
  camposLaudo,
  linguagemLaudo,
  novoLaudo,
  numeroLaudo,
  situacoesLaudo,
  validarLaudo,
  type CampoLaudo,
  type Laudo,
} from "../lib/laudos";
import { novoId } from "../lib/uuid";
import { erroPublico } from "../lib/supabase";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import {
  buscarOrigensLaudo,
  consultarVersaoLaudo,
  operarLaudo,
  origemLaudo,
  type OperacaoLaudo,
} from "../services/laudos";
import { consultarIdentidade } from "../services/documentos";
const horario = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
export function EditorLaudo({
  laudo,
  origemInicial,
  salvo,
  fechar,
}: {
  laudo: Laudo | null;
  origemInicial?: { id: string; tipo: "os" | "atendimento" };
  salvo: (l: Laudo) => void;
  fechar: () => void;
}) {
  const a = useAcesso(),
    w = a.oficina!.id,
    linguagem = linguagemLaudo(a.oficina?.ramo, a.oficina?.especialidade);
  const [dados, setDados] = useState(() => novoLaudo(laudo?.dados));
  const origemInicialId = origemInicial?.id,
    origemInicialTipo = origemInicial?.tipo;
  const [repetirOrigem, setRepetirOrigem] = useState(0);
  const [origem, setOrigem] = useState(origemInicial),
    [rotulo, setRotulo] = useState(laudo?.origem_rotulo || "");
  const [busca, setBusca] = useState(""),
    termo = useBuscaDebounced(busca);
  const [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [sujo, setSujo] = useState(false);
  const trava = useRef(false),
    identidade = useRef(laudo?.id || novoId()),
    tentativa = useRef({ payload: "", chave: "" });
  const fontes = useQuery({
    queryKey: ["origens-laudo", w, a.demo, termo],
    queryFn: ({ signal }) =>
      buscarOrigensLaudo(
        a.demo,
        w,
        termo,
        a.oficina?.ramo === "automotivo" || !a.oficina?.ramo,
        signal,
      ),
    enabled: !laudo && !origemInicial,
  });
  useEffect(() => {
    if (!origemInicialId || !origemInicialTipo) return;
    let ativo = true;
    origemLaudo(a.demo, w, origemInicialTipo, origemInicialId)
      .then((o) => {
        if (ativo) {
          setDados(novoLaudo(o.dados));
          setRotulo(o.rotulo);
        }
      })
      .catch((e) => {
        if (ativo) setErro(erroPublico(e));
      });
    return () => {
      ativo = false;
    };
  }, [a.demo, w, origemInicialId, origemInicialTipo, repetirOrigem]);
  async function selecionar(id: string) {
    if (trava.current) return;
    const o = fontes.data?.find((o) => o.id === id);
    if (!o) return;
    if (
      sujo &&
      !window.confirm(
        "Preencher cliente, identificação e serviços com os dados desta OS? Os demais campos serão mantidos.",
      )
    )
      return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const r = await origemLaudo(a.demo, w, o.tipo, o.id);
      setDados((d) => ({ ...d, ...r.dados }));
      setOrigem({ id: o.id, tipo: o.tipo });
      setRotulo(r.rotulo);
      setSujo(true);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  async function salvar() {
    if (trava.current || (origemInicialId && !rotulo)) return;
    setErro("");
    try {
      validarLaudo(dados);
      trava.current = true;
      setOcupado(true);
      const p: OperacaoLaudo = {
        id: identidade.current,
        revisao: laudo?.revisao ?? null,
        acao: "salvar",
        dados,
        tipo: laudo?.origem_tipo || origem?.tipo,
        origem: laudo?.origem_id || origem?.id,
      };
      const payload = JSON.stringify(p);
      if (tentativa.current.payload !== payload)
        tentativa.current = { payload, chave: novoId() };
      salvo(await operarLaudo(a.demo, w, { ...p, chave: tentativa.current.chave }));
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function sair() {
    if (
      !ocupado &&
      (!sujo || window.confirm("Sair sem salvar as alterações deste rascunho?"))
    )
      fechar();
  }
  function campo(k: CampoLaudo, nome?: string, exemplo?: string) {
    const config = camposLaudo.find(([c]) => c === k)!;
    const props = {
      "aria-label": nome || config[1],
      value: dados[k],
      maxLength: config[2],
      disabled: ocupado || (!!origemInicialId && !rotulo),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setDados((d) => ({ ...d, [k]: e.target.value }));
        setSujo(true);
      },
      placeholder: exemplo,
    };
    return (
      <label key={k}>
        {nome || config[1]}
        {config[2] > 300 ? (
          <textarea {...props} rows={k === "conclusao" ? 4 : 3} />
        ) : (
          <input {...props} type={k === "data_avaliacao" ? "date" : "text"} />
        )}
      </label>
    );
  }
  return (
    <Dialogo
      aberto
      fechar={sair}
      titulo={laudo ? `Editar ${numeroLaudo(laudo.numero)}` : "Novo laudo técnico"}
      classe="laudos-dialogo"
    >
      <form
        className="laudo-formulario"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        {!laudo && !origemInicial && (
          <SelecaoRapida
            rotulo="Usar dados de uma OS (opcional)"
            valor={origem?.id || ""}
            opcoes={(fontes.data || []).map((o) => ({
              id: o.id,
              nome: `#${o.numero} · ${o.cliente}`,
              detalhe: o.bem,
            }))}
            selecionar={(id) => void selecionar(id)}
            aoBuscar={setBusca}
            carregando={fontes.isFetching}
            erro={fontes.error ? erroPublico(fontes.error) : undefined}
            placeholder="Buscar OS pelo número ou cliente…"
          />
        )}
        {rotulo && (
          <p className="laudo-vinculo">
            Vinculado a {rotulo}. Confira os dados antes de emitir.
          </p>
        )}
        {campo("titulo")}
        <div className="laudo-campos-duplos">
          {campo("cliente")}
          {campo("data_avaliacao")}
        </div>
        {campo("bem", linguagem.bem)}
        {campo("constatacoes", undefined, linguagem.exemplo)}
        {campo(
          "servicos",
          undefined,
          "Descreva somente o que foi efetivamente realizado.",
        )}
        {campo("conclusao")}
        {campo("responsavel")}
        <details className="laudo-opcionais">
          <summary>Identificação complementar (opcional)</summary>
          <div className="laudo-campos-duplos">
            {campo("documento_cliente")}
            {campo("contato_cliente")}
            {campo("identificacao", linguagem.identificacao)}
            {campo("local_avaliacao")}
          </div>
        </details>
        <details className="laudo-opcionais">
          <summary>Detalhes da avaliação e evidências (opcional)</summary>
          <div>
            {(
              [
                "solicitacao",
                "condicoes",
                "procedimentos",
                "recomendacoes",
                "limitacoes",
                "referencias",
                "observacoes",
              ] as const
            ).map((k) =>
              campo(
                k,
                undefined,
                k === "referencias"
                  ? "Identifique fotos, anexos da OS, instrumentos e documentos consultados."
                  : undefined,
              ),
            )}
          </div>
        </details>
        <details className="laudo-opcionais">
          <summary>Qualificação e registro profissional (opcional)</summary>
          <div>
            {campo("qualificacao")}
            {campo("registro_profissional")}
            {campo("numero_art")}
          </div>
        </details>
        {erro && <p role="alert">{erro}</p>}
        {origemInicialId &&
          !rotulo &&
          (erro ? (
            <button
              type="button"
              className="botao-secundario"
              onClick={() => {
                setErro("");
                setRepetirOrigem((n) => n + 1);
              }}
            >
              Tentar carregar a OS novamente
            </button>
          ) : (
            <p role="status">Carregando os dados da OS…</p>
          ))}
        <div className="laudos-acoes">
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado}
            onClick={sair}
          >
            Cancelar
          </button>
          <button
            className="botao-primario"
            disabled={ocupado || (!!origemInicialId && !rotulo)}
          >
            {ocupado ? "Salvando…" : "Salvar e visualizar"}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export function DetalheLaudo({
  laudo: l,
  atualizar,
  editar,
  fechar,
}: {
  laudo: Laudo;
  atualizar: (l: Laudo) => void;
  editar: () => void;
  fechar: () => void;
}) {
  const a = useAcesso(),
    w = a.oficina!.id;
  const [versao, setVersao] = useState(l.situacao === "rascunho" ? 0 : l.versao);
  const [acao, setAcao] = useState<"emitir" | "revisar" | "cancelar" | null>(null),
    [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    trava = useRef(false),
    tentativa = useRef({ payload: "", chave: "" });
  const empresa = useQuery({
    queryKey: ["identidade-laudo", w, a.demo],
    queryFn: ({ signal }) => consultarIdentidade(a.demo, w, signal),
    enabled: versao === 0,
  });
  const copia = useQuery({
    queryKey: ["versao-laudo", w, a.demo, l.id, versao],
    queryFn: ({ signal }) => consultarVersaoLaudo(a.demo, w, l.id, versao, signal),
    enabled: versao > 0,
  });
  const v = copia.data;
  const documento: DocumentoLaudoDados | undefined =
    versao > 0
      ? v && {
          dados: novoLaudo(v.conteudo.dados),
          empresa: v.conteudo.empresa,
          numero: v.conteudo.numero,
          origem: v.conteudo.origem,
          versao: v.versao,
          hash: v.hash,
          emitidoEm: v.emitido_em,
          situacao: l.situacao === "cancelado" ? "cancelado" : "emitido",
          anterior: versao < l.versao,
          motivoCancelamento: l.motivo_cancelamento,
        }
      : empresa.data && {
          dados: novoLaudo(l.dados),
          empresa: empresa.data,
          numero: l.numero,
          origem: l.origem_rotulo,
          situacao: l.situacao === "cancelado" ? "cancelado" : "rascunho",
          motivoCancelamento: l.motivo_cancelamento,
        };
  async function executar() {
    if (!acao || trava.current) return;
    setErro("");
    try {
      if (acao === "emitir") validarLaudo(novoLaudo(l.dados), true);
      else if (motivo.trim().length < 3) throw Error("Informe o motivo.");
      trava.current = true;
      setOcupado(true);
      const p: OperacaoLaudo = { id: l.id, revisao: l.revisao, acao, motivo };
      const payload = JSON.stringify(p);
      if (tentativa.current.payload !== payload)
        tentativa.current = { payload, chave: novoId() };
      atualizar(await operarLaudo(a.demo, w, { ...p, chave: tentativa.current.chave }));
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  async function imprimir() {
    if (!documento) return;
    setErro("");
    const janela = window.open("", "_blank");
    if (!janela) {
      setErro("Permita abrir janelas neste site para imprimir o laudo.");
      return;
    }
    try {
      const m = await import("../services/impressaoLaudo");
      await m.imprimirLaudo(janela, documento);
    } catch (e) {
      janela.close();
      setErro(erroPublico(e));
    }
  }
  const erroConsulta = versao > 0 ? copia.error : empresa.error;
  return (
    <Dialogo
      aberto
      fechar={() => {
        if (!ocupado) fechar();
      }}
      titulo={`${numeroLaudo(l.numero)} · ${situacoesLaudo[l.situacao]}`}
      classe="laudos-dialogo"
    >
      <div className="laudo-detalhe">
        <div className="laudos-acoes">
          <button
            className="botao-primario"
            disabled={!documento || ocupado}
            onClick={() => void imprimir()}
          >
            <Printer size={18} /> Imprimir / PDF
          </button>
          {l.situacao === "rascunho" && (
            <>
              <button className="botao-secundario" disabled={ocupado} onClick={editar}>
                Editar rascunho
              </button>
              <button
                className="botao-secundario"
                disabled={ocupado}
                onClick={() => setAcao("emitir")}
              >
                Emitir laudo
              </button>
            </>
          )}
          {l.situacao === "emitido" && (
            <button
              className="botao-secundario"
              disabled={ocupado}
              onClick={() => setAcao("revisar")}
            >
              Criar nova revisão
            </button>
          )}
        </div>
        {(erro || erroConsulta) && (
          <p role="alert">{erro || erroPublico(erroConsulta)}</p>
        )}
        {acao && (
          <div className="laudo-confirmacao">
            <strong>
              {acao === "emitir"
                ? "Emitir esta versão?"
                : acao === "revisar"
                  ? "Criar uma nova revisão"
                  : "Cancelar este laudo"}
            </strong>
            <p>
              {acao === "emitir"
                ? "Confira a prévia abaixo. O conteúdo emitido ficará preservado; alterações futuras serão feitas em outra versão."
                : acao === "revisar"
                  ? "A versão emitida continuará disponível no histórico."
                  : "As versões e o histórico serão mantidos, com a indicação de cancelamento."}
            </p>
            {acao !== "emitir" && (
              <label>
                Motivo
                <textarea
                  aria-label="Motivo"
                  value={motivo}
                  maxLength={2000}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                />
              </label>
            )}
            <div className="laudos-acoes">
              <button
                className="botao-secundario"
                disabled={ocupado}
                onClick={() => {
                  setAcao(null);
                  setMotivo("");
                }}
              >
                Voltar
              </button>
              <button
                className="botao-primario"
                disabled={ocupado}
                onClick={() => void executar()}
              >
                {ocupado
                  ? "Salvando…"
                  : acao === "emitir"
                    ? "Confirmar emissão"
                    : acao === "revisar"
                      ? "Abrir revisão"
                      : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        )}
        {!!l.versoes.length && (
          <label className="laudo-escolher-versao">
            Visualizar
            <select
              aria-label="Visualizar"
              value={versao}
              onChange={(e) => setVersao(Number(e.target.value))}
            >
              {(l.situacao === "rascunho" || l.versao === 0) && (
                <option value={0}>Rascunho atual</option>
              )}
              {l.versoes.map((v) => (
                <option key={v.versao} value={v.versao}>
                  Versão {v.versao} · {horario(v.emitido_em)}
                </option>
              ))}
            </select>
          </label>
        )}
        {documento ? (
          <div className="laudo-previa">
            <DocumentoLaudo documento={documento} />
          </div>
        ) : (
          !erroConsulta && <p role="status">Preparando documento…</p>
        )}
        <details className="laudo-opcionais">
          <summary>Histórico e outras opções</summary>
          <div>
            <ol className="laudo-historico">
              {l.historico.map((e, i) => (
                <li key={i}>
                  <strong>
                    {{
                      salvar: "Rascunho salvo",
                      emitir: "Versão emitida",
                      revisar: "Revisão iniciada",
                      cancelar: "Laudo cancelado",
                    }[e.acao] || e.acao}
                  </strong>
                  <span>
                    {horario(e.criado_em)}
                    {e.versao ? ` · versão ${e.versao}` : ""}
                  </span>
                  {e.motivo && <p>{e.motivo}</p>}
                </li>
              ))}
            </ol>
            {l.situacao !== "cancelado" && a.oficina?.perfil !== "staff" && (
              <button
                className="botao-secundario"
                disabled={ocupado}
                onClick={() => setAcao("cancelar")}
              >
                Cancelar laudo
              </button>
            )}
          </div>
        </details>
      </div>
    </Dialogo>
  );
}
