import { novoId } from "../lib/uuid.ts";
import { useContasBancarias } from "../lib/useContasBancarias";
import { dinheiro } from "../lib/formatacao";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BadgePercent, Plus, Settings2 } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";

import {
  hoje,
  formas,
  historicoFinanceiro,
  estornarBaixa,
  type BaixaFinanceira,
} from "../services/financeiro";
import { equipeRpc, type EquipeDados } from "../services/equipe";
import {
  consultarComissoes,
  salvarProfissionalComissao,
  pagarComissao,
  textoRegra,
  situacaoComissao,
  type Comissao,
  type ProfissionalComissao,
} from "../services/comissoes";
import { Dialogo } from "./Dialogo";
import { SecaoRecolhivel } from "./SecaoRecolhivel";
import "./Comissoes.css";

const dataBR = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
export function Comissoes({
  inicio,
  fim,
  os,
}: {
  inicio: string;
  fim: string;
  os?: string;
}) {
  const { contas, ativas } = useContasBancarias();
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!;
  const dono = oficina.perfil === "owner",
    permitido = a.permite("finance") && ["owner", "manager"].includes(oficina.perfil);
  const [profissional, setProfissional] = useState(""),
    [pagina, setPagina] = useState(0),
    [regras, setRegras] = useState(false);
  const [editar, setEditar] = useState<ProfissionalComissao | null>(null),
    [novo, setNovo] = useState(false);
  const [pagamento, setPagamento] = useState<Comissao | null>(null),
    [historico, setHistorico] = useState<Comissao | null>(null);
  const [estorno, setEstorno] = useState<BaixaFinanceira | null>(null);
  const [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [ocupado, setOcupado] = useState(false);
  const trava = useRef(false),
    chave = useRef(novoId());
  const q = useQuery({
    queryKey: ["comissoes", oficina.id, inicio, fim, profissional, os, pagina],
    queryFn: ({ signal }) =>
      consultarComissoes(oficina.id, inicio, fim, profissional, os, pagina, signal),
    enabled: permitido && !a.demo,
    refetchInterval: 30000,
  });
  const h = useQuery({
    queryKey: ["financeiro-historico", oficina.id, historico?.titulo_id],
    queryFn: ({ signal }) =>
      historicoFinanceiro(false, oficina.id, historico!.titulo_id!, signal),
    enabled: permitido && !a.demo && !!historico?.titulo_id,
  });
  async function executar(fn: () => Promise<unknown>, mensagem: string) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await fn();
      await atualizarIntegracoes(qc, ["comissoes", "financeiro-historico"]);
      setEditar(null);
      setNovo(false);
      setPagamento(null);
      setEstorno(null);
      setAviso(mensagem);
    } catch (e) {
      setErro(erroPublico(e));
      await qc.invalidateQueries({ queryKey: ["comissoes"] });
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  if (!permitido) return null;
  if (a.demo)
    return (
      <section className="os-painel">
        <h2>Comissões por serviço</h2>
        <p>Percentual por profissional sobre a mão de obra.</p>
        <p className="texto-suave">
          Entre na conta da empresa para configurar regras e registrar comissões reais.
        </p>
      </section>
    );
  return (
    <section className="comissoes" aria-label="Comissões da equipe">
      <header className="comissoes-topo">
        <div>
          <h2>
            <BadgePercent size={22} /> Comissões
          </h2>
          <p>Comissões por profissional.</p>
        </div>
        {dono && (
          <button
            className="botao-secundario"
            onClick={() => setRegras(!regras)}
            aria-expanded={regras}
          >
            <Settings2 size={17} /> Configurar porcentagens
          </button>
        )}
      </header>
      {os && (
        <p className="aviso-cliente">
          Mostrando as comissões desta OS.{" "}
          <Link to="/financeiro?aba=comissoes">Ver todas</Link>
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      {erro && !novo && !editar && !pagamento && !estorno && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {q.isPending ? (
        <p role="status">Carregando comissões…</p>
      ) : q.isError ? (
        <div className="erro-formulario" role="alert">
          {erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </div>
      ) : (
        q.data && (
          <>
            {(regras || q.data.profissionais.length === 0) && dono && (
              <section className="comissoes-regras">
                <div className="comissoes-topo">
                  <div>
                    <h3>Porcentagem de cada profissional</h3>
                    <p>Inclua também profissionais sem acesso ao sistema.</p>
                  </div>
                  <button
                    className="botao-primario"
                    onClick={() => {
                      setErro("");
                      setNovo(true);
                    }}
                  >
                    <Plus size={17} /> Novo profissional
                  </button>
                </div>
                {!q.data.profissionais.length ? (
                  <p className="texto-suave">
                    Comece cadastrando um profissional. Depois, na OS, abra “Mais opções
                    → Comissões” e escolha quem fez a mão de obra.
                  </p>
                ) : (
                  q.data.profissionais.map((p) => (
                    <article className="comissao-regra" key={p.id}>
                      <div>
                        <strong>
                          {p.nome}
                          {!p.ativo && " · Inativo"}
                        </strong>
                        <small>{textoRegra(p)}</small>
                      </div>
                      <button
                        className="botao-secundario"
                        onClick={() => {
                          setErro("");
                          setEditar(p);
                        }}
                      >
                        Editar regra
                      </button>
                    </article>
                  ))
                )}
                <small>
                  Novas regras valem para novas atribuições. Comissões existentes não
                  mudam.
                </small>
              </section>
            )}
            <div className="comissoes-filtro">
              <label>
                Profissional
                <select
                  value={profissional}
                  onChange={(e) => {
                    setProfissional(e.target.value);
                    setPagina(0);
                  }}
                >
                  <option value="">Todos os profissionais</option>
                  {q.data.profissionais.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {!p.ativo ? " (inativo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                OS abertas ou entregues no período selecionado. Valores pagos são
                acumulados dessas OS.
              </p>
            </div>
            <div className="comissoes-totais" aria-label="Resumo das comissões">
              <article>
                <span>Aguardando liberação</span>
                <strong>{dinheiro(q.data.resumo.aguardando)}</strong>
                <small>Entrega ou pagamento do cliente</small>
              </article>
              <article className="comissao-destaque">
                <span>Liberado para pagar</span>
                <strong>{dinheiro(q.data.resumo.disponivel)}</strong>
                <small>Disponível conforme a regra</small>
              </article>
              <article>
                <span>Já pago à equipe</span>
                <strong>{dinheiro(q.data.resumo.pago)}</strong>
                <small>Descontados os estornos</small>
              </article>
            </div>
            <SecaoRecolhivel titulo="Como a comissão entra no financeiro">
              <p>
                Na entrega da OS, o valor total da comissão entra como despesa da equipe
                e reduz o lucro do serviço. O dinheiro só sai do caixa quando você
                registra o pagamento ao profissional.
              </p>
              <p>
                No percentual, usamos a mão de obra após o desconto da OS, sem incluir
                peças. No valor fixo, multiplicamos a regra pela quantidade do serviço.
              </p>
              <p>
                Na regra por recebimento, a liberação começa após a entrega e acompanha
                a proporção paga do total da OS. Exemplo: cliente pagou metade da OS,
                metade da comissão é liberada.
              </p>
            </SecaoRecolhivel>
            {!q.data.itens.length ? (
              <div className="comissoes-vazio">
                <BadgePercent size={30} />
                <h3>Nenhuma comissão neste período</h3>
                <p>
                  Escolha o profissional dos serviços em uma OS. A previsão aparece aqui
                  e é liberada conforme a regra do proprietário.
                </p>
                <Link className="botao-secundario" to="/ordens-servico">
                  Ir para ordens de serviço
                </Link>
              </div>
            ) : (
              <div className="comissoes-lista">
                {q.data.itens.map((c) => (
                  <article className="comissao-cartao" key={c.id}>
                    <div className="comissao-identificacao">
                      <span className="comissao-situacao">{situacaoComissao(c)}</span>
                      <h3>{c.nome_profissional}</h3>
                      <p>{c.descricao_servico}</p>
                      <Link to={`/ordens-servico?os=${c.ordem_servico_id}`}>
                        OS #{c.numero_os} · {c.cliente}
                      </Link>
                      <small>{textoRegra(c)}</small>
                    </div>
                    <div className="comissao-valores">
                      <span>
                        Comissão total <strong>{dinheiro(c.prevista_centavos)}</strong>
                      </span>
                      <span>
                        Já pago <strong>{dinheiro(c.pago_centavos)}</strong>
                      </span>
                      <span>
                        A pagar agora <strong>{dinheiro(c.disponivel_centavos)}</strong>
                      </span>
                    </div>
                    <div className="comissao-acoes">
                      {c.titulo_id && (
                        <button
                          className="botao-secundario"
                          onClick={() => {
                            setErro("");
                            setHistorico(c);
                          }}
                        >
                          Histórico
                        </button>
                      )}
                      {c.disponivel_centavos > 0 && c.titulo_id && (
                        <button
                          className="botao-primario"
                          onClick={() => {
                            setErro("");
                            chave.current = novoId();
                            setPagamento(c);
                          }}
                        >
                          Registrar pagamento
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {q.data.total > 50 && (
              <div className="os-paginacao">
                <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </button>
                <span>
                  Página {pagina + 1} de {Math.ceil(q.data.total / 50)}
                </span>
                <button
                  disabled={(pagina + 1) * 50 >= q.data.total}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )
      )}
      {(novo || editar) && (
        <RegraComissao
          key={editar?.id ?? "novo"}
          profissional={editar}
          ocupado={ocupado}
          erro={erro}
          fechar={() => {
            if (!ocupado) {
              setNovo(false);
              setEditar(null);
              setErro("");
            }
          }}
          salvar={(p) =>
            void executar(
              () => salvarProfissionalComissao(oficina.id, p, editar?.revisao),
              "Regra salva. As comissões anteriores foram preservadas.",
            )
          }
        />
      )}
      {pagamento && (
        <Dialogo
          aberto
          titulo="Registrar pagamento de comissão"
          fechar={() => {
            if (!ocupado) {
              setPagamento(null);
              setErro("");
            }
          }}
        >
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(
                () =>
                  pagarComissao(oficina.id, pagamento.titulo_id!, {
                    chave: chave.current,
                    valor: Math.round(Number(f.get("valor")) * 100),
                    data: String(f.get("data")),
                    conta: String(f.get("conta")),
                    forma: String(f.get("forma")),
                    observacao: String(f.get("observacao")),
                  }),
                "Pagamento registrado no financeiro.",
              );
            }}
          >
            <p>
              <strong>{pagamento.nome_profissional}</strong> · OS #{pagamento.numero_os}
            </p>
            <p>
              Liberado: <strong>{dinheiro(pagamento.disponivel_centavos)}</strong>.
              Registre apenas o valor que você já pagou ao profissional.
            </p>
            <fieldset disabled={ocupado}>
              <div className="dupla-campos">
                <label>
                  Valor pago (R$)
                  <input
                    name="valor"
                    type="number"
                    min="0.01"
                    max={pagamento.disponivel_centavos / 100}
                    step="0.01"
                    defaultValue={pagamento.disponivel_centavos / 100}
                    required
                  />
                </label>
                <label>
                  Data do pagamento
                  <input
                    type="date"
                    name="data"
                    min={pagamento.competencia}
                    max={hoje()}
                    defaultValue={hoje()}
                    required
                  />
                </label>
              </div>
              <div className="dupla-campos">
                <label>
                  Saiu de
                  <select name="conta">
                    {Object.entries(ativas).map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Forma de pagamento
                  <select name="forma" defaultValue="pix">
                    {Object.entries(formas).map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Observação (opcional)
                <textarea name="observacao" maxLength={1000} />
              </label>
              {erro && (
                <p role="alert" className="erro-formulario">
                  {erro}
                </p>
              )}
              <button className="botao-primario" disabled={ocupado}>
                {ocupado ? "Registrando…" : "Confirmar registro"}
              </button>
            </fieldset>
            <small>
              Este registro atualiza o caixa. Não realiza transferência bancária.
            </small>
          </form>
        </Dialogo>
      )}
      {historico && !estorno && (
        <Dialogo
          aberto
          titulo={`Pagamentos · ${historico.nome_profissional}`}
          fechar={() => setHistorico(null)}
        >
          <p>
            OS #{historico.numero_os} · {historico.descricao_servico}
          </p>
          {h.isPending ? (
            <p>Carregando histórico…</p>
          ) : h.isError ? (
            <p role="alert">{erroPublico(h.error)}</p>
          ) : !h.data?.length ? (
            <p className="texto-suave">Nenhum pagamento registrado.</p>
          ) : (
            h.data.map((b) => (
              <article className="fin-historico" key={b.id}>
                <strong>
                  {b.estorno_de ? "Estorno" : "Pagamento"} ·{" "}
                  {dinheiro(b.valor_centavos)}
                </strong>
                <span>
                  {dataBR(b.data)} · {contas[b.conta]} · {formas[b.forma]}
                </span>
                {b.observacao && <p>{b.observacao}</p>}
                {!b.estorno_de && !h.data?.some((x) => x.estorno_de === b.id) && (
                  <button
                    className="botao-secundario"
                    onClick={() => {
                      setErro("");
                      setEstorno(b);
                    }}
                  >
                    Estornar registro
                  </button>
                )}
              </article>
            ))
          )}
        </Dialogo>
      )}
      {estorno && (
        <Dialogo
          aberto
          titulo="Estornar pagamento de comissão"
          fechar={() => !ocupado && setEstorno(null)}
        >
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(
                () =>
                  estornarBaixa(
                    false,
                    oficina.id,
                    estorno,
                    String(f.get("data")),
                    String(f.get("motivo")),
                  ),
                "Estorno registrado. O saldo da comissão foi atualizado.",
              );
            }}
          >
            <p>
              O registro de {dinheiro(estorno.valor_centavos)} será revertido no caixa e
              a comissão voltará a ficar pendente. O histórico será preservado.
            </p>
            <fieldset disabled={ocupado}>
              <label>
                Data do estorno
                <input
                  type="date"
                  name="data"
                  required
                  min={estorno.data}
                  max={hoje()}
                  defaultValue={hoje()}
                />
              </label>
              <label>
                Motivo
                <textarea name="motivo" minLength={3} maxLength={1000} required />
              </label>
              {erro && (
                <p role="alert" className="erro-formulario">
                  {erro}
                </p>
              )}
              <button className="botao-primario" disabled={ocupado}>
                Confirmar estorno
              </button>
            </fieldset>
          </form>
        </Dialogo>
      )}
    </section>
  );
}

function RegraComissao({
  profissional,
  ocupado,
  erro,
  fechar,
  salvar,
}: {
  profissional: ProfissionalComissao | null;
  ocupado: boolean;
  erro: string;
  fechar: () => void;
  salvar: (p: Omit<ProfissionalComissao, "revisao">) => void;
}) {
  const a = useAcesso(),
    [tipo, setTipo] = useState(profissional?.tipo ?? "percentual"),
    [valores, setValores] = useState({
      percentual: profissional?.tipo === "percentual" ? String(profissional.valor) : "",
      fixo: profissional?.tipo === "fixo" ? String(profissional.valor) : "",
    }),
    [liberacao, setLiberacao] = useState(profissional?.liberacao ?? "recebimento"),
    [usuarioId, setUsuarioId] = useState(profissional?.usuario_id ?? ""),
    [id] = useState(() => profissional?.id ?? novoId());
  const equipe = useQuery({
    queryKey: ["equipe", a.usuario, a.oficina?.id, a.demo],
    queryFn: ({ signal }) =>
      equipeRpc<EquipeDados>("consultar_equipe", { p_oficina: a.oficina!.id }, signal),
    enabled: !a.demo && a.oficina?.perfil === "owner",
    retry: false,
  });
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    salvar({
      id,
      nome: String(f.get("nome")),
      usuario_id: usuarioId || null,
      ativo: f.get("ativo") === "sim",
      tipo: tipo as ProfissionalComissao["tipo"],
      valor: Number(f.get("valor")),
      liberacao: String(f.get("liberacao")) as ProfissionalComissao["liberacao"],
    });
  }
  return (
    <Dialogo
      aberto
      titulo={profissional ? "Editar regra de comissão" : "Novo profissional"}
      fechar={fechar}
    >
      <form className="formulario-cliente" onSubmit={enviar}>
        <fieldset disabled={ocupado}>
          <label>
            Nome do profissional
            <input
              name="nome"
              required
              minLength={2}
              maxLength={160}
              defaultValue={profissional?.nome}
            />
          </label>
          <label>
            {tipo === "percentual"
              ? "Porcentagem sobre a mão de obra (%)"
              : "Valor por unidade de serviço (R$)"}
            <input
              name="valor"
              type="number"
              inputMode="decimal"
              min="0.01"
              max={tipo === "percentual" ? 100 : 1000000}
              step="0.01"
              required
              placeholder={tipo === "percentual" ? "Ex.: 10" : undefined}
              value={valores[tipo]}
              onChange={(e) => setValores((v) => ({ ...v, [tipo]: e.target.value }))}
            />
          </label>
          <p className="texto-suave">
            Peças não entram no cálculo. Pagamento liberado{" "}
            {liberacao === "entrega"
              ? "na entrega da OS."
              : "após a entrega, conforme o cliente paga."}
          </p>
          <SecaoRecolhivel titulo="Avançado">
            <label>
              Como calcular
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as typeof tipo)}
              >
                <option value="percentual">Porcentagem sobre a mão de obra</option>
                <option value="fixo">Valor fixo por unidade de serviço</option>
              </select>
            </label>
            <label>
              Quando liberar o pagamento
              <select
                name="liberacao"
                value={liberacao}
                onChange={(e) => setLiberacao(e.target.value as typeof liberacao)}
              >
                <option value="entrega">Na entrega da OS</option>
                <option value="recebimento">
                  Após a entrega, conforme o cliente paga
                </option>
              </select>
            </label>
            <label>
              Usuário da equipe (opcional)
              <select
                name="usuario_id"
                value={usuarioId}
                onChange={(e) => setUsuarioId(e.target.value)}
                disabled={equipe.isPending || equipe.isError}
              >
                <option value="">Profissional sem login</option>
                {usuarioId &&
                  !equipe.data?.membros.some((m) => m.usuario_id === usuarioId) && (
                    <option value={usuarioId}>Usuário vinculado</option>
                  )}
                {equipe.data?.membros
                  .filter((m) => m.ativo || m.usuario_id === profissional?.usuario_id)
                  .map((m) => (
                    <option key={m.usuario_id} value={m.usuario_id}>
                      {m.email}
                      {!m.ativo ? " (inativo)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            {equipe.isError && (
              <p role="alert">
                Não foi possível carregar a equipe.{" "}
                <button type="button" onClick={() => void equipe.refetch()}>
                  Tentar novamente
                </button>
              </p>
            )}
            <label>
              Situação
              <select
                name="ativo"
                defaultValue={profissional?.ativo === false ? "nao" : "sim"}
              >
                <option value="sim">Ativo para novos serviços</option>
                <option value="nao">Inativo — preservar histórico</option>
              </select>
            </label>
            <p className="texto-suave">
              Na OS, abra Avançado para escolher serviços específicos. Alterações nesta
              regra valem para novas atribuições; as anteriores são preservadas.
            </p>
          </SecaoRecolhivel>
          {erro && (
            <p className="erro-formulario" role="alert">
              {erro}
            </p>
          )}
          <button
            className="botao-primario"
            disabled={
              ocupado ||
              !!(profissional?.usuario_id && (equipe.isPending || equipe.isError))
            }
          >
            {ocupado ? "Salvando…" : "Salvar profissional"}
          </button>
        </fieldset>
      </form>
    </Dialogo>
  );
}
