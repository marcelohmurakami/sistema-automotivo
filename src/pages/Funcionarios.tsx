import { dinheiro } from "../lib/formatacao";
import { atualizarCadastro } from "../lib/atualizarCadastro";
import { camposFichaFuncionario } from "../lib/camposFichaFuncionario";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import {
  listarFuncionarios,
  salvarFuncionario,
  novoFuncionario,
  type Funcionario,
} from "../services/funcionarios";
import "./Compras.css";
import "./Funcionarios.css";
import { CamposFichaFuncionario } from "../components/CamposFichaFuncionario";
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";
import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const HistoricoFuncionario = componenteSobDemanda(async () => ({
  default: (await import("../components/FichaFuncionario")).HistoricoFuncionario,
}));
const textoBusca = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

export function Funcionarios() {
  const a = useAcesso(),
    oficina = a.oficina!,
    qc = useQueryClient();
  const permitido = ["owner", "manager"].includes(oficina.perfil);
  const [busca, setBusca] = useState(""),
    [situacao, setSituacao] = useState("ativos"),
    [edicao, setEdicao] = useState<Funcionario | null>(null),
    [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [aviso, setAviso] = useState("");
  const trava = useRef(false);
  const q = useQuery({
    queryKey: ["funcionarios", a.demo, oficina.id],
    queryFn: ({ signal }) => listarFuncionarios(a.demo, oficina.id, signal),
    enabled: permitido,
  });
  function abrirFicha(funcionario: Funcionario) {
    if (trava.current || q.isFetching) return;
    setErro("");
    setEdicao(funcionario);
  }
  async function gravar(f: Funcionario) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await salvarFuncionario(a.demo, oficina.id, f);
      void atualizarCadastro(qc, [
        "funcionario-registros",
        a.demo,
        oficina.id,
        f.id,
      ]).catch(() => {});
      void atualizarCadastro(qc, ["funcionarios", a.demo, oficina.id]).catch(() => {});
      setEdicao(null);
      setAviso("Cadastro atualizado.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const admissao = String(d.get("admissao") || ""),
      desligamento = String(d.get("desligamento") || "");
    if (admissao && desligamento && desligamento < admissao) {
      setErro("Desligamento anterior à admissão.");
      return;
    }
    void gravar({
      ...edicao!,
      nome: String(d.get("nome")).trim(),
      funcao: String(d.get("funcao")).trim(),
      telefone: String(d.get("telefone")).trim(),
      email: String(d.get("email")).trim(),
      observacoes: String(d.get("observacoes")),
      admissao: admissao || null,
      desligamento: desligamento || null,
      salario_centavos:
        d.get("salario") === "" ? null : Math.round(Number(d.get("salario")) * 100),
      dados: {
        ...edicao?.dados,
        ...Object.fromEntries(
          camposFichaFuncionario.map(([k]) => [
            k,
            String(d.get(`dados_${k}`) || "").trim(),
          ]),
        ),
      },
    });
  }
  const indice = useMemo(
    () =>
      (q.data ?? [])
        .map((f) => ({
          f,
          texto: textoBusca(`${f.nome} ${f.funcao} ${f.telefone} ${f.email}`),
        }))
        .sort((a, b) => a.f.nome.localeCompare(b.f.nome, "pt-BR")),
    [q.data],
  );
  const termo = textoBusca(busca);
  const itens = useMemo(
    () =>
      indice
        .filter(
          ({ f, texto }) =>
            (situacao === "ativos" ? f.ativo : !f.ativo) && texto.includes(termo),
        )
        .map(({ f }) => f),
    [indice, situacao, termo],
  );
  if (!permitido)
    return (
      <section className="os-painel">
        <h1>Funcionários</h1>
        <p>Cadastro disponível ao proprietário e aos gerentes.</p>
      </section>
    );
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>
            Funcionários<span>.</span>
          </h1>
          <p>Cadastro da equipe, sem criar acesso ao sistema.</p>
        </div>
        <button
          className="botao-primario"
          disabled={ocupado}
          onClick={() => {
            if (trava.current) return;
            setErro("");
            setEdicao(novoFuncionario());
          }}
        >
          <Plus size={18} />
          Novo funcionário
        </button>
      </div>
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração · Cadastros salvos neste navegador.
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      {erro && !edicao && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      <section className="os-painel">
        <div className="compra-filtros">
          <label>
            Buscar
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, função ou contato"
            />
          </label>
          <label>
            Situação
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          </label>
        </div>
        {q.isFetching && !q.isPending && <p role="status">Atualizando funcionários…</p>}
        {q.isPending ? (
          <p role="status">Carregando funcionários…</p>
        ) : q.isError ? (
          <p role="alert">
            {erroPublico(q.error)}{" "}
            <button onClick={() => void q.refetch()}>Tentar novamente</button>
          </p>
        ) : (
          <div className="fornecedor-grade">
            {!itens.length && (
              <p className="compra-vazio">Nenhum funcionário encontrado.</p>
            )}
            {itens.map((f) => (
              <article
                className="fornecedor-card funcionario-linha"
                key={f.id}
                onClick={(e) => {
                  if (
                    !(e.target instanceof Element) ||
                    e.target.closest("a, button, input, select, textarea") ||
                    window.getSelection()?.toString()
                  )
                    return;
                  abrirFicha(f);
                }}
              >
                <Users size={22} aria-hidden="true" />
                <div>
                  <h3>
                    <button
                      type="button"
                      className="funcionario-abrir"
                      disabled={ocupado || q.isFetching}
                      aria-label={`Abrir ficha de ${f.nome}`}
                      aria-haspopup="dialog"
                      onClick={() => abrirFicha(f)}
                    >
                      {f.nome}
                      <span>Ver ficha completa →</span>
                    </button>
                  </h3>
                  <p>{f.funcao || "Função não informada"}</p>
                </div>
                <div className="fornecedor-contato">
                  {f.telefone && <a href={`tel:${f.telefone}`}>{f.telefone}</a>}
                  {f.email && <p>{f.email}</p>}
                  {!f.telefone && !f.email && <p>Contato não informado</p>}
                </div>
                <div className="fornecedor-detalhes">
                  {f.admissao && (
                    <p>Admissão: {f.admissao.split("-").reverse().join("/")}</p>
                  )}
                  {f.salario_centavos != null && (
                    <p>Salário-base: {dinheiro(f.salario_centavos)}</p>
                  )}
                </div>
                <div className="compra-acoes">
                  <button
                    className="botao-secundario"
                    disabled={ocupado || q.isFetching}
                    onClick={() => void gravar({ ...f, ativo: !f.ativo })}
                  >
                    {f.ativo ? "Inativar" : "Reativar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <Dialogo
        aberto={!!edicao}
        fechar={() => !ocupado && setEdicao(null)}
        titulo={edicao?.revisao ? `Ficha de ${edicao.nome}` : "Novo funcionário"}
        classe="dialogo-funcionario"
      >
        {edicao && (
          <div className="formulario-cliente">
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <fieldset disabled={ocupado}>
              <label>
                Nome
                <input
                  form="cadastro-funcionario"
                  name="nome"
                  autoFocus
                  required
                  maxLength={160}
                  defaultValue={edicao.nome}
                />
              </label>
              <SecaoRecolhivel titulo="Contato e função (opcional)">
                <label>
                  Função (opcional)
                  <input
                    form="cadastro-funcionario"
                    name="funcao"
                    maxLength={120}
                    defaultValue={edicao.funcao}
                  />
                </label>
                <div className="dupla-campos">
                  <label>
                    Telefone (opcional)
                    <input
                      type="tel"
                      form="cadastro-funcionario"
                      name="telefone"
                      maxLength={40}
                      defaultValue={edicao.telefone}
                    />
                  </label>
                  <label>
                    E-mail (opcional)
                    <input
                      type="email"
                      form="cadastro-funcionario"
                      name="email"
                      maxLength={200}
                      defaultValue={edicao.email}
                    />
                  </label>
                </div>
                <label>
                  Observações (opcional)
                  <textarea
                    form="cadastro-funcionario"
                    name="observacoes"
                    rows={2}
                    maxLength={2000}
                    defaultValue={edicao.observacoes}
                  />
                </label>
              </SecaoRecolhivel>
              {edicao.revisao > 0 ? (
                <HistoricoFuncionario
                  key={edicao.id + "-vales"}
                  f={edicao}
                  somenteVales
                />
              ) : (
                <section className="funcionario-vales">
                  <h3>Vales, adiantamentos e empréstimos</h3>
                  <p>
                    Salve o funcionário para registrar valores e acompanhar os
                    abatimentos.
                  </p>
                </section>
              )}
              <CamposFichaFuncionario f={edicao} formId="cadastro-funcionario" />
              <form id="cadastro-funcionario" onSubmit={salvar}>
                <button className="botao-primario">
                  {ocupado ? "Salvando…" : "Salvar funcionário"}
                </button>
              </form>
            </fieldset>
          </div>
        )}
        {edicao && edicao.revisao > 0 && (
          <HistoricoFuncionario key={edicao.id} f={edicao} />
        )}
        {edicao && !edicao.revisao && (
          <p className="texto-suave">
            Salve o cadastro para adicionar recados, ausências, férias e outros
            registros na ficha.
          </p>
        )}
      </Dialogo>
    </>
  );
}
