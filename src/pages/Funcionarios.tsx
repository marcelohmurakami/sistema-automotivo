import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarCog,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Power,
  Search,
  Users,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { erroPublico } from "../lib/supabase";
import { atendeClientes, corFuncionario } from "../lib/gestaoFuncionario";
import {
  listarFuncionarios,
  novoFuncionario,
  salvarFuncionario,
  type Funcionario,
} from "../services/funcionarios";
import { componenteSobDemanda } from "../lib/componenteSobDemanda";
import "./Funcionarios.css";
const FormularioFuncionario = componenteSobDemanda(
  () => import("../components/funcionarios/FormularioFuncionario"),
);
const GestaoFuncionario = componenteSobDemanda(
  () => import("../components/funcionarios/GestaoFuncionario"),
);
const BloqueiosFuncionarios = componenteSobDemanda(
  () => import("../components/funcionarios/BloqueiosFuncionarios"),
);
const normalizar = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

export function Funcionarios() {
  const a = useAcesso(),
    w = a.oficina!,
    qc = useQueryClient();
  const permitido = ["owner", "manager"].includes(w.perfil);
  const [busca, setBusca] = useState(""),
    [situacao, setSituacao] = useState("todos"),
    [pagina, setPagina] = useState(1),
    [tamanho, setTamanho] = useState(10);
  const [edicao, setEdicao] = useState<Funcionario | null>(null),
    [gestao, setGestao] = useState<Funcionario | null>(null),
    [inativar, setInativar] = useState<Funcionario | null>(null),
    [bloqueios, setBloqueios] = useState(false);
  const [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [ocupado, setOcupado] = useState(false),
    trava = useRef(false);
  const q = useQuery({
    queryKey: ["funcionarios", a.demo, w.id],
    queryFn: ({ signal }) => listarFuncionarios(a.demo, w.id, signal),
    enabled: permitido,
  });
  const lista = useMemo(
    () => [...(q.data ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [q.data],
  );
  const filtrados = useMemo(
    () =>
      lista.filter(
        (f) =>
          (situacao === "todos" || (situacao === "ativos") === f.ativo) &&
          normalizar(
            `${f.nome} ${f.funcao} ${f.telefone} ${f.email} ${f.dados?.documento ?? ""}`,
          ).includes(normalizar(busca)),
      ),
    [lista, situacao, busca],
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / tamanho)),
    atual = Math.min(pagina, paginas),
    visiveis = filtrados.slice((atual - 1) * tamanho, atual * tamanho);
  async function gravar(f: Funcionario) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await salvarFuncionario(a.demo, w.id, f);
      qc.setQueryData<Funcionario[]>(["funcionarios", a.demo, w.id], (anteriores) => [
        ...(anteriores ?? []).filter((x) => x.id !== f.id),
        { ...f, revisao: f.revisao + 1 },
      ]);
      for (const chave of [
        "funcionarios",
        "funcionario-registros",
        "profissionais-agenda",
        "distribuicao",
        "servicos",
      ])
        void qc.invalidateQueries({ queryKey: [chave] });
      setEdicao(null);
      setInativar(null);
      setAviso("Funcionário atualizado.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function editar(f: Funcionario) {
    setErro("");
    setEdicao(f);
  }
  if (!permitido)
    return (
      <section className="os-painel">
        <h1>Funcionários</h1>
        <p>Disponível ao proprietário e aos gerentes.</p>
      </section>
    );
  return (
    <div className="func-pagina">
      <header className="func-cabecalho">
        <div>
          <span className="func-sobretitulo">Equipe</span>
          <h1>Funcionários</h1>
          <p>Cadastre sua equipe e organize os atendimentos.</p>
        </div>
        <div className="func-acoes">
          <button className="botao-secundario" onClick={() => setBloqueios(true)}>
            <Ban size={17} />
            Bloqueios
          </button>
          <button className="botao-primario" onClick={() => editar(novoFuncionario())}>
            <Plus size={18} />
            Novo funcionário
          </button>
        </div>
      </header>
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      {erro && !edicao && !inativar && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      <div className="func-resumo">
        <Users size={18} />
        <span>
          <strong>{lista.filter((f) => f.ativo).length}</strong> ativos
        </span>
        <span>
          <strong>{lista.filter((f) => f.ativo && atendeClientes(f)).length}</strong>{" "}
          realizam atendimentos
        </span>
        <span>
          <strong>{lista.filter((f) => !f.ativo).length}</strong> inativos
        </span>
      </div>
      <section className="func-lista">
        <div className="func-filtros">
          <label className="func-busca">
            Buscar funcionário
            <div>
              <Search size={18} />
              <input
                type="search"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(1);
                }}
                placeholder="Nome, função, CPF ou contato"
              />
            </div>
          </label>
          <label>
            Situação
            <select
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value);
                setPagina(1);
              }}
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          </label>
        </div>
        {q.isPending ? (
          <p className="func-vazio" role="status">
            Carregando funcionários…
          </p>
        ) : q.isError ? (
          <p className="func-vazio" role="alert">
            {erroPublico(q.error)}{" "}
            <button className="botao-secundario" onClick={() => void q.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : !filtrados.length ? (
          <div className="func-vazio">
            <Users size={28} />
            <h3>
              {busca
                ? "Nenhum funcionário encontrado"
                : "Nenhum funcionário nesta lista"}
            </h3>
            <p>
              {busca
                ? "Tente outro nome ou contato."
                : "Comece cadastrando sua equipe."}
            </p>
          </div>
        ) : (
          <>
            <div className="func-colunas" aria-hidden="true">
              <span>Funcionário</span>
              <span>Contato</span>
              <span>Atendimento</span>
              <span>Situação</span>
              <span>Ações</span>
            </div>
            {visiveis.map((f) => (
              <article
                key={f.id}
                className="func-linha"
                onClick={(e) => {
                  if (
                    !(e.target instanceof Element) ||
                    e.target.closest("button,a") ||
                    window.getSelection()?.toString()
                  )
                    return;
                  setGestao(f);
                }}
              >
                <div className="func-identidade">
                  <span
                    className="func-avatar"
                    style={{ backgroundColor: corFuncionario(f) }}
                    aria-hidden="true"
                  >
                    {f.nome
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((x) => x[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div>
                    <button
                      className="func-nome"
                      onClick={() => setGestao(f)}
                      aria-label={`Gerenciar ${f.nome}`}
                    >
                      {f.nome}
                    </button>
                    <small>{f.funcao || "Função não informada"}</small>
                  </div>
                </div>
                <div className="func-contato">
                  {f.telefone && <a href={`tel:${f.telefone}`}>{f.telefone}</a>}
                  {f.email && <span>{f.email}</span>}
                  {!f.email && !f.telefone && <small>Não informado</small>}
                </div>
                <span className="func-etiqueta">
                  {atendeClientes(f) ? "Atende clientes" : "Interno"}
                </span>
                <span className="func-etiqueta" data-ativo={f.ativo}>
                  {f.ativo ? "Ativo" : "Inativo"}
                </span>
                <div className="func-acoes-linha">
                  <button
                    className="botao-secundario"
                    onClick={() => setGestao(f)}
                    aria-label={`Gerenciar agenda de ${f.nome}`}
                  >
                    <CalendarCog size={17} />
                    <span>Gerenciar</span>
                  </button>
                  <button
                    className="botao-icone"
                    title="Editar cadastro"
                    aria-label={`Editar ${f.nome}`}
                    onClick={() => editar(f)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="botao-icone"
                    disabled={ocupado}
                    title={f.ativo ? "Inativar" : "Reativar"}
                    aria-label={`${f.ativo ? "Inativar" : "Reativar"} ${f.nome}`}
                    onClick={() => {
                      setErro("");
                      if (f.ativo) setInativar(f);
                      else void gravar({ ...f, ativo: true });
                    }}
                  >
                    <Power size={17} />
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
        <footer className="func-paginacao">
          <label>
            Por página
            <select
              value={tamanho}
              onChange={(e) => {
                setTamanho(+e.target.value);
                setPagina(1);
              }}
            >
              {[10, 20, 50].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <span>
            {filtrados.length} funcionários · Página {atual} de {paginas}
          </span>
          <div>
            <button
              className="botao-icone"
              disabled={atual === 1}
              aria-label="Página anterior"
              onClick={() => setPagina(atual - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="botao-icone"
              disabled={atual === paginas}
              aria-label="Próxima página"
              onClick={() => setPagina(atual + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </footer>
      </section>
      {edicao && (
        <FormularioFuncionario
          key={edicao.id}
          f={edicao}
          ocupado={ocupado}
          erro={erro}
          salvar={gravar}
          fechar={() => !ocupado && setEdicao(null)}
        />
      )}
      {gestao && <GestaoFuncionario f={gestao} fechar={() => setGestao(null)} />}
      {bloqueios && (
        <Dialogo
          aberto
          fechar={() => setBloqueios(false)}
          titulo="Bloqueios da agenda"
          classe="dialogo-func-gestao"
        >
          <BloqueiosFuncionarios />
        </Dialogo>
      )}
      {inativar && (
        <Dialogo
          aberto
          fechar={() => !ocupado && setInativar(null)}
          titulo="Inativar funcionário?"
        >
          <div className="func-corpo">
            <p>
              <strong>{inativar.nome}</strong> deixará de receber novos agendamentos. Os
              registros e agendamentos existentes serão mantidos.
            </p>
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <div className="func-rodape">
              <button
                className="botao-secundario"
                disabled={ocupado}
                onClick={() => setInativar(null)}
              >
                Voltar
              </button>
              <button
                className="botao-primario"
                disabled={ocupado}
                onClick={() => void gravar({ ...inativar, ativo: false })}
              >
                {ocupado ? "Salvando…" : "Inativar funcionário"}
              </button>
            </div>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
