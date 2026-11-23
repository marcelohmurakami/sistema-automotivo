import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { atualizarCadastro } from "../../lib/atualizarCadastro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Plus, ScanLine, Trash2 } from "lucide-react";
import { DialogoLocalizacao as Dialogo } from "./DialogoLocalizacao";
import { LeitorEtiqueta } from "../LeitorEtiqueta";
import { SecaoRecolhivel } from "../SecaoRecolhivel";
import { useAcesso } from "../../auth/contexto";
import { novoId } from "../../lib/uuid";
import { erroPublico } from "../../lib/supabase";
import {
  categoriasFisicas,
  interpretarEtiqueta,
  type CadastroFisico,
  type ContextoFisico,
  type ItemFisico,
  type LocalFisico,
  type AcaoFisica,
} from "../../lib/localizacaoFisica";
import {
  listarLocaisFisicos,
  salvarLocalFisico,
  salvarItemFisico,
  registrarConjuntoFisico,
  movimentarItensFisicos,
} from "../../services/localizacao";
import type { EtiquetaFisica } from "../../services/pdfEtiquetas";

export function ImprimirEtiquetas({
  itens,
  fechar,
}: {
  itens: EtiquetaFisica[];
  fechar: () => void;
}) {
  const a = useAcesso();
  const [formato, setFormato] = useState<"a4" | "termica">("a4");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  async function gerar() {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const { gerarPdfEtiquetas } = await import("../../services/pdfEtiquetas");
      gerarPdfEtiquetas(itens, a.oficina!.nome, window.location.origin, formato).save(
        "etiquetas.pdf",
      );
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={fechar}
      titulo={`Imprimir ${itens.length} etiqueta${itens.length > 1 ? "s" : ""}`}
    >
      <div className="loc-form">
        <strong>
          {itens.length === 1
            ? itens[0].descricao
            : `${itens.length} itens selecionados`}
        </strong>
        <label>
          Papel
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value as typeof formato)}
          >
            <option value="a4">Folha A4</option>
            <option value="termica">Impressora de etiquetas (80 × 50 mm)</option>
          </select>
        </label>
        <p>
          Imprima em tamanho real (100%) e cole no item. Leia o QR para encontrá-lo no
          sistema.
        </p>
        {erro && <p role="alert">{erro}</p>}
        <button
          className="botao-primario"
          disabled={ocupado}
          onClick={() => void gerar()}
        >
          <Printer size={18} /> {ocupado ? "Preparando…" : "Baixar PDF para imprimir"}
        </button>
      </div>
    </Dialogo>
  );
}
export function SeletorLocal({
  valor,
  alterar,
  obrigatorio = false,
}: {
  valor: string;
  alterar: (id: string) => void;
  obrigatorio?: boolean;
}) {
  const acesso = useAcesso(),
    w = acesso.oficina!.id;
  const [gerenciar, setGerenciar] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = useBuscaDebounced(busca);
  const [leitor, setLeitor] = useState(false);
  const [erro, setErro] = useState("");
  const q = useQuery({
    queryKey: ["locais-fisicos", w, termo],
    queryFn: ({ signal }) => listarLocaisFisicos(w, termo, false, signal),
  });
  // Preserve a seleção quando a busca muda, sem selecionar um resultado silenciosamente.
  const [escolhido, setEscolhido] = useState<LocalFisico>();
  const leitura = useRef<AbortController | null>(null);
  useEffect(() => () => leitura.current?.abort(), []);
  const locais = q.data || [];
  const opcoes =
    escolhido && !locais.some((l) => l.id === escolhido.id)
      ? [escolhido, ...locais]
      : locais;
  async function ler(codigo: string) {
    leitura.current?.abort();
    const atual = new AbortController();
    leitura.current = atual;
    setLeitor(false);
    setErro("");
    try {
      const r = interpretarEtiqueta(codigo, window.location.origin);
      if (r.tipo !== "local")
        throw new Error("Leia a etiqueta de um local, como uma bancada ou prateleira.");
      const ls = await listarLocaisFisicos(w, r.codigo, false, atual.signal);
      if (atual.signal.aborted) return;
      const l = ls.find((x) => x.codigo === r.codigo);
      if (!l) throw new Error("Local não encontrado ou desativado nesta empresa.");
      setEscolhido(l);
      alterar(l.id);
    } catch (e) {
      if (!atual.signal.aborted) setErro(erroPublico(e));
    }
  }
  return (
    <div className="loc-form loc-seletor">
      <SecaoRecolhivel titulo="Buscar outro local" classe="loc-busca-extra">
        <div className="loc-acoes">
          <label className="loc-crescer">
            Buscar local
            <input
              value={busca}
              maxLength={100}
              onChange={(e) => {
                leitura.current?.abort();
                setBusca(e.target.value);
              }}
              placeholder="Nome da bancada, armário ou prateleira"
            />
          </label>
          <button
            type="button"
            className="botao-secundario"
            onClick={() => setLeitor(true)}
          >
            <ScanLine size={18} /> Ler local
          </button>
        </div>
      </SecaoRecolhivel>
      <label>
        Onde vai ficar?
        <select
          required={obrigatorio}
          disabled={q.isPending || busca !== termo}
          value={valor}
          onChange={(e) => {
            leitura.current?.abort();
            alterar(e.target.value);
            setEscolhido(opcoes.find((l) => l.id === e.target.value));
          }}
        >
          <option value="">
            {obrigatorio ? "Selecione o destino" : "Informar depois"}
          </option>
          {valor && !opcoes.some((l) => l.id === valor) && (
            <option value={valor}>Local atual do item principal</option>
          )}
          {opcoes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
        {(q.isPending || busca !== termo) && (
          <small role="status">Buscando locais…</small>
        )}
      </label>
      {acesso.oficina!.perfil !== "staff" && (
        <button
          type="button"
          className="botao-texto"
          onClick={() => setGerenciar(true)}
        >
          <Plus size={15} /> Novo local
        </button>
      )}
      {gerenciar && (
        <GerenciarLocais
          novo
          fechar={() => setGerenciar(false)}
          aoSalvar={(l) => {
            leitura.current?.abort();
            setEscolhido(l);
            alterar(l.id);
            setGerenciar(false);
          }}
        />
      )}
      {q.isFetching && <small role="status">Buscando locais…</small>}
      {q.error && <p role="alert">{erroPublico(q.error)}</p>}
      {locais.length === 100 && (
        <small>Refine a busca para encontrar outros locais.</small>
      )}
      {!q.isPending && !q.error && !locais.length && (
        <small>
          Nenhum local encontrado. A gerência pode cadastrá-lo em “Gerenciar locais”.
        </small>
      )}
      {erro && <p role="alert">{erro}</p>}
      {leitor && (
        <LeitorEtiqueta
          fechar={() => setLeitor(false)}
          lido={(codigo) => void ler(codigo)}
        />
      )}
    </div>
  );
}
export function GerenciarLocais({
  fechar,
  novo = false,
  aoSalvar,
}: {
  fechar: () => void;
  novo?: boolean;
  aoSalvar?: (local: LocalFisico) => void;
}) {
  const w = useAcesso().oficina!.id,
    qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const termo = useBuscaDebounced(busca);
  const [editar, setEditar] = useState<LocalFisico | null | undefined>(
    novo ? null : undefined,
  );
  const [id, setId] = useState(novoId);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  const [imprimir, setImprimir] = useState<EtiquetaFisica[]>();
  const q = useQuery({
    queryKey: ["locais-fisicos", w, "gerencia", termo],
    queryFn: ({ signal }) => listarLocaisFisicos(w, termo, true, signal),
    enabled: !novo,
  });
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trava.current) return;
    trava.current = true;
    const d = new FormData(e.currentTarget);
    setOcupado(true);
    setErro("");
    try {
      const salvo = await salvarLocalFisico(w, {
        id: editar?.id || id,
        nome: String(d.get("nome")),
        descricao: String(d.get("descricao")),
        ativo: d.has("ativo"),
        revisao: editar?.revisao,
      });
      // O nome nos itens é secundário; o seletor de destino deve ficar pronto primeiro.
      void qc.invalidateQueries({ queryKey: ["itens-fisicos", w] }).catch(() => {});
      await atualizarCadastro(qc, ["locais-fisicos", w]);
      setEditar(undefined);
      setId(novoId());
      aoSalvar?.(salvo);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={() => {
        if (!ocupado) fechar();
      }}
      titulo={novo ? "Novo local" : "Meus locais"}
    >
      <div className="loc-form">
        {editar === undefined ? (
          <>
            <div className="loc-acoes">
              <label className="loc-crescer">
                Buscar local
                <input value={busca} onChange={(e) => setBusca(e.target.value)} />
              </label>
              <button
                className="botao-primario"
                onClick={() => {
                  setEditar(null);
                  setErro("");
                }}
              >
                <Plus size={18} /> Novo local
              </button>
            </div>
            {q.error && <p role="alert">{erroPublico(q.error)}</p>}
            {q.isPending && <p role="status">Carregando locais…</p>}
            <ul className="loc-lista">
              {q.data?.map((l) => (
                <li key={l.id} className="loc-linha">
                  <button
                    className="loc-abrir"
                    onClick={() => {
                      setEditar(l);
                      setErro("");
                    }}
                  >
                    <strong>{l.nome}</strong>
                    <small>{l.ativo ? l.descricao || l.codigo : "Desativado"}</small>
                  </button>
                  <button
                    className="botao-secundario"
                    aria-label={`Imprimir etiqueta de ${l.nome}`}
                    onClick={() =>
                      setImprimir([
                        { codigo: l.codigo, descricao: l.nome, complemento: "LOCAL" },
                      ])
                    }
                  >
                    <Printer size={18} />
                  </button>
                </li>
              ))}
            </ul>
            {q.data?.length === 100 && (
              <p>
                Mostrando os primeiros 100 locais. Use a busca para localizar os demais.
              </p>
            )}
          </>
        ) : (
          <form onSubmit={(e) => void salvar(e)} className="loc-form">
            <fieldset disabled={ocupado}>
              <label>
                Nome do local
                <input
                  name="nome"
                  minLength={2}
                  maxLength={100}
                  required
                  defaultValue={editar?.nome}
                  placeholder="Ex.: Armário A · Prateleira 2"
                  autoFocus
                />
              </label>
              <SecaoRecolhivel titulo="Avançado">
                <label>
                  Referência (opcional)
                  <input
                    name="descricao"
                    maxLength={500}
                    defaultValue={editar?.descricao}
                    placeholder="Ex.: Sala de entrada, à esquerda"
                  />
                </label>
                <label className="loc-check">
                  <input
                    name="ativo"
                    type="checkbox"
                    defaultChecked={editar?.ativo ?? true}
                  />{" "}
                  Local ativo
                </label>
              </SecaoRecolhivel>
              <div className="loc-acoes">
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => (novo ? fechar() : setEditar(undefined))}
                >
                  Voltar
                </button>
                <button className="botao-primario">
                  {ocupado ? "Salvando…" : "Salvar local"}
                </button>
              </div>
            </fieldset>
          </form>
        )}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {imprimir && (
          <ImprimirEtiquetas itens={imprimir} fechar={() => setImprimir(undefined)} />
        )}
      </div>
    </Dialogo>
  );
}
export function CadastroItemFisico({
  contexto,
  item,
  principal,
  fechar,
  salvo,
}: {
  contexto?: ContextoFisico | null;
  item?: ItemFisico;
  principal?: ItemFisico;
  fechar: () => void;
  salvo: (itens: ItemFisico[]) => void;
}) {
  const acesso = useAcesso(),
    w = acesso.oficina!.id;
  const [id] = useState(novoId);
  const [local, setLocal] = useState(item?.local_id || principal?.local_id || "");
  const [acessorios, setAcessorios] = useState<(CadastroFisico & { id: string })[]>([]);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trava.current) return;
    trava.current = true;
    setErro("");
    const d = new FormData(e.currentTarget);
    const dados: CadastroFisico = {
      descricao: String(d.get("descricao")).trim(),
      categoria: String(d.get("categoria")) as CadastroFisico["categoria"],
      codigo_externo: String(d.get("codigo_externo") || "").trim(),
      observacoes: String(d.get("observacoes") || "").trim(),
      local_id: local || null,
      vinculo: contexto ? { tipo: contexto.tipo, id: contexto.id } : undefined,
      principal_id: principal?.id,
    };
    setOcupado(true);
    try {
      const r = item
        ? [await salvarItemFisico(w, item.id, dados, item.revisao)]
        : await registrarConjuntoFisico(w, id, dados, acessorios);
      salvo(r);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={() => {
        if (!ocupado) fechar();
      }}
      titulo={
        item
          ? "Corrigir identificação"
          : principal
            ? "Registrar acessório"
            : "Guardar item"
      }
    >
      <form className="loc-form" onSubmit={(e) => void salvar(e)}>
        <fieldset disabled={ocupado}>
          {contexto && (
            <p className="loc-contexto">
              <strong>{contexto.titulo}</strong>
              {contexto.cliente && ` · ${contexto.cliente}`}
            </p>
          )}
          {principal && (
            <p>
              Acompanha: <strong>{principal.descricao}</strong>
            </p>
          )}
          {contexto?.tipo === "estoque" && (
            <p>
              A etiqueta identifica a peça ou conjunto. Saldos e reservas continuam
              sendo controlados no estoque e na OS.
            </p>
          )}
          <label>
            O que você vai guardar?
            <input
              name="descricao"
              defaultValue={
                item?.descricao || (!principal ? contexto?.descricao : "") || ""
              }
              required
              minLength={2}
              maxLength={180}
              autoFocus
              placeholder="Nome do equipamento, acessório, chave ou peça"
            />
          </label>
          {!item && <SeletorLocal valor={local} alterar={setLocal} />}
          <SecaoRecolhivel titulo="Avançado">
            <label>
              Categoria
              <select
                name="categoria"
                defaultValue={
                  item?.categoria ||
                  (principal
                    ? "acessorio"
                    : contexto?.tipo === "estoque"
                      ? "peca"
                      : acesso.oficina!.ramo === "automotivo" &&
                          acesso.oficina!.especialidade !== "retifica"
                        ? "veiculo"
                        : "equipamento")
                }
              >
                {Object.entries(categoriasFisicas).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {!item && !principal && (
              <div className="loc-form">
                <div className="loc-acoes">
                  <strong>Acessórios que chegaram junto</strong>
                  <button
                    type="button"
                    className="botao-secundario"
                    disabled={acessorios.length >= 20}
                    onClick={() =>
                      setAcessorios((a) => [
                        ...a,
                        {
                          id: novoId(),
                          descricao: "",
                          categoria: "acessorio",
                          codigo_externo: "",
                          observacoes: "",
                        },
                      ])
                    }
                  >
                    <Plus size={16} /> Adicionar
                  </button>
                </div>
                {acessorios.map((a, n) => (
                  <div className="loc-acessorio" key={a.id}>
                    <label>
                      Descrição do acessório {n + 1}
                      <input
                        required
                        minLength={2}
                        maxLength={180}
                        value={a.descricao}
                        onChange={(e) =>
                          setAcessorios((xs) =>
                            xs.map((x) =>
                              x.id === a.id ? { ...x, descricao: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="Ex.: Fonte, cabo, chave ou controle"
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        value={a.categoria}
                        onChange={(e) =>
                          setAcessorios((xs) =>
                            xs.map((x) =>
                              x.id === a.id
                                ? {
                                    ...x,
                                    categoria: e.target
                                      .value as CadastroFisico["categoria"],
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {Object.entries(categoriasFisicas).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="botao-icone"
                      aria-label={`Remover acessório ${n + 1}`}
                      onClick={() =>
                        setAcessorios((xs) => xs.filter((x) => x.id !== a.id))
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                <small>
                  Cada item recebe sua própria etiqueta. Registre um conjunto em uma só
                  etiqueta apenas se ele sempre ficar junto.
                </small>
              </div>
            )}
            <div className="loc-form">
              <label>
                Série / código de barras do fabricante
                <input
                  name="codigo_externo"
                  maxLength={100}
                  defaultValue={item?.codigo_externo}
                />
              </label>
              <label>
                Condição de entrada e observações
                <textarea
                  name="observacoes"
                  maxLength={2000}
                  defaultValue={item?.observacoes}
                />
              </label>
            </div>
          </SecaoRecolhivel>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <button className="botao-primario">
            {ocupado ? "Salvando…" : item ? "Salvar identificação" : "Guardar item"}
          </button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
export function MovimentoFisico({
  itens,
  fechar,
  salvo,
}: {
  itens: ItemFisico[];
  fechar: () => void;
  salvo: () => void;
}) {
  const w = useAcesso().oficina!.id;
  const [acao, setAcao] = useState<AcaoFisica>(
    itens.every((i) => i.situacao === "entregue") ? "retorno" : "mover",
  );
  const [local, setLocal] = useState("");
  const [observacao, setObservacao] = useState("");
  const motivoObrigatorio = acao === "retorno" || acao === "nao_localizado";
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  // Uma repetição após falha de rede reutiliza a chave somente para o mesmo pedido.
  const [tentativa, setTentativa] = useState({ assinatura: "", chave: novoId() });
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trava.current) return;
    trava.current = true;
    const d = new FormData(e.currentTarget);
    const destino = acao === "mover" || acao === "retorno" ? local : "";
    const quem = String(d.get("com_quem") || ""),
      obs = observacao;
    const assinatura = JSON.stringify([
      itens.map((i) => [i.id, i.revisao]),
      acao,
      destino,
      quem,
      obs,
    ]);
    const chave = assinatura === tentativa.assinatura ? tentativa.chave : novoId();
    setTentativa({ assinatura, chave });
    setOcupado(true);
    setErro("");
    try {
      await movimentarItensFisicos(w, itens, acao, destino, quem, obs, chave);
      salvo();
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={() => {
        if (!ocupado) fechar();
      }}
      titulo={`Mudar local · ${itens.length} ${itens.length > 1 ? "itens" : "item"}`}
    >
      <form className="loc-form" onSubmit={(e) => void salvar(e)}>
        <fieldset disabled={ocupado}>
          <ul className="loc-resumo-itens">
            {itens.map((i) => (
              <li key={i.id}>{i.descricao}</li>
            ))}
          </ul>
          {(acao === "mover" || acao === "retorno") && (
            <SeletorLocal valor={local} alterar={setLocal} obrigatorio />
          )}
          {(acao === "externo" || acao === "entregar") && (
            <label>
              {acao === "entregar" ? "Quem recebeu?" : "Com quem ficou?"}
              <input
                name="com_quem"
                required
                minLength={2}
                maxLength={160}
                placeholder="Nome do cliente, técnico ou terceiro"
              />
            </label>
          )}
          {motivoObrigatorio && (
            <label>
              Motivo
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                required
                minLength={3}
                maxLength={1000}
              />
            </label>
          )}
          {acao === "entregar" && (
            <p>
              Registra a entrega física destes itens. O pagamento e o encerramento do
              serviço continuam na OS.
            </p>
          )}
          <SecaoRecolhivel titulo="Avançado">
            <label>
              Outra operação
              <select
                value={acao}
                onChange={(e) => setAcao(e.target.value as AcaoFisica)}
              >
                <option value="mover">Guardar / mudar de local</option>
                <option value="externo">Saiu com técnico / terceiro</option>
                <option value="entregar">Entregar fisicamente ao cliente</option>
                <option value="retorno">Item entregue retornou</option>
                <option value="nao_localizado">Não localizei o item</option>
              </select>
            </label>
            {!motivoObrigatorio && (
              <label>
                Observação (opcional)
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  maxLength={1000}
                />
              </label>
            )}
          </SecaoRecolhivel>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <button className="botao-primario">
            {ocupado
              ? "Salvando…"
              : acao === "mover"
                ? "Salvar local"
                : acao === "entregar"
                  ? "Confirmar entrega física"
                  : acao === "retorno"
                    ? "Registrar retorno"
                    : acao === "externo"
                      ? "Confirmar saída"
                      : "Registrar item não localizado"}
          </button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
