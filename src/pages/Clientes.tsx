import { componenteSobDemanda } from "../lib/componenteSobDemanda";
const ImportarCadastros = componenteSobDemanda(async () => ({
  default: (await import("../components/ImportarCadastros")).ImportarCadastros,
}));
const FichaCliente = componenteSobDemanda(async () => ({
  default: (await import("../components/FichaCliente")).FichaCliente,
}));
import { SecaoRecolhivel } from "../components/SecaoRecolhivel";

import { useRef, useState, type FormEvent } from "react";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { atualizarConsultas } from "../lib/atualizarConsultas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { AssistenteContextual } from "../components/AtalhoAssistente";

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Dialogo } from "../components/Dialogo";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import {
  arquivarCliente,
  listarClientes,
  normalizarTelefone,
  salvarCliente,
  type Cliente,
  type DadosCliente,
} from "../services/clientes";
import "./Clientes.css";
function FormularioCliente({
  cliente,
  salvando,
  erro,
  salvar,
  cancelar,
}: {
  cliente?: Cliente;
  salvando: boolean;
  erro: string;
  salvar: (dados: DadosCliente) => void;
  cancelar: () => void;
}) {
  const [validacao, setValidacao] = useState("");
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidacao("");
    const f = new FormData(e.currentTarget);
    try {
      const nome = String(f.get("nome")).trim();
      if (nome.length < 2)
        throw new Error("Informe um nome com pelo menos 2 caracteres.");
      salvar({
        nome,
        telefone_e164: normalizarTelefone(String(f.get("telefone"))),
        email: String(f.get("email")).trim(),
        tipo: f.get("tipo") as DadosCliente["tipo"],
        endereco: String(f.get("endereco")).trim(),
        observacoes: String(f.get("observacoes")).trim(),
      });
    } catch (e) {
      setValidacao(erroPublico(e));
    }
  }
  return (
    <form onSubmit={enviar} className="formulario-cliente">
      <p className="texto-suave">Só o nome é obrigatório.</p>
      <fieldset disabled={salvando}>
        <label>
          Nome ou razão social (obrigatório)
          <input
            name="nome"
            required
            minLength={2}
            maxLength={160}
            defaultValue={cliente?.nome}
            placeholder="Como o cliente se chama?"
            autoComplete="name"
            autoFocus
          />
        </label>
        <div className="dupla-campos">
          <label>
            Tipo de cliente
            <select name="tipo" defaultValue={cliente?.tipo ?? "pessoa_fisica"}>
              <option value="pessoa_fisica">Pessoa física</option>
              <option value="pessoa_juridica">Empresa</option>
            </select>
          </label>
          <label>
            Telefone / WhatsApp
            <input
              name="telefone"
              type="tel"
              maxLength={24}
              defaultValue={cliente?.telefone_e164 ?? ""}
              placeholder="(16) 99999-9999"
              autoComplete="tel"
            />
          </label>
        </div>
        <SecaoRecolhivel
          titulo="Mais dados do cliente"
          descricao="E-mail, endereço e observações · opcional"
        >
          <label>
            E-mail
            <input
              name="email"
              type="email"
              maxLength={254}
              defaultValue={cliente?.email ?? ""}
              placeholder="cliente@email.com"
              autoComplete="email"
            />
          </label>
          <label>
            Endereço
            <input
              name="endereco"
              maxLength={1000}
              defaultValue={cliente?.endereco}
              placeholder="Rua, número, bairro e cidade"
              autoComplete="street-address"
            />
          </label>
          <label>
            Observações
            <textarea
              name="observacoes"
              maxLength={2000}
              rows={3}
              defaultValue={cliente?.observacoes}
              placeholder="Preferências e informações úteis para o atendimento"
            />
          </label>
        </SecaoRecolhivel>
      </fieldset>
      {(erro || validacao) && (
        <p role="alert" className="erro-formulario">
          {validacao || erro}
        </p>
      )}
      <div className="acoes-formulario">
        <button
          type="button"
          className="botao-secundario"
          disabled={salvando}
          onClick={cancelar}
        >
          Cancelar
        </button>
        <button className="botao-primario" disabled={salvando}>
          {salvando ? "Salvando…" : cliente ? "Salvar alterações" : "Cadastrar cliente"}
        </button>
      </div>
    </form>
  );
}
export function Clientes() {
  const acesso = useAcesso();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const clienteSelecionado = params.get("cliente");
  const [busca, setBusca] = useState("");
  const filtro = useBuscaDebounced(busca.trim());
  const [arquivados, setArquivados] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [editor, setEditor] = useState<Cliente | "novo" | null>(null);
  const [exclusao, setExclusao] = useState<Cliente | null>(null);
  const [aviso, setAviso] = useState("");
  const gravando = useRef(false);
  const arquivando = useRef(false);
  const oficina = acesso.oficina!;
  const gerencia = ["owner", "manager"].includes(oficina.perfil);
  const chave = ["clientes", acesso.demo ? "demo" : acesso.usuario, oficina.id];
  const consulta = useQuery({
    queryKey: [...chave, filtro, arquivados, pagina],
    queryFn: ({ signal }) =>
      listarClientes(acesso.demo, oficina.id, filtro, arquivados, pagina, signal),
    retry: false,
  });
  const gravacao = useMutation({
    onSettled: () => {
      gravando.current = false;
    },
    mutationFn: (dados: DadosCliente) =>
      salvarCliente(
        acesso.demo,
        oficina.id,
        dados,
        editor && editor !== "novo" ? editor : undefined,
      ),
    onSuccess: async () => {
      setEditor(null);
      setAviso("Cliente salvo com sucesso.");
      await atualizarConsultas(
        cache,
        [chave, ["ficha-cliente"], ["selecao-operacao"]],
        [chave, ["ficha-cliente"]],
      );
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: chave });
      void acesso.atualizar();
    },
  });
  const arquivamento = useMutation({
    onSettled: () => {
      arquivando.current = false;
    },
    mutationFn: (cliente: Cliente) =>
      arquivarCliente(acesso.demo, oficina.id, cliente, !cliente.arquivado_em),
    onSuccess: async () => {
      setPagina(0);
      await atualizarConsultas(
        cache,
        [chave, ["ficha-cliente"], ["selecao-operacao"]],
        [chave, ["ficha-cliente"]],
      );
      setExclusao(null);
      setAviso(
        arquivados
          ? "Cliente restaurado."
          : "Cliente movido para a lixeira. O histórico foi preservado.",
      );
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: chave });
      void acesso.atualizar();
    },
  });
  function editar(cliente: Cliente | "novo") {
    if (gravando.current || arquivando.current) return;
    gravacao.reset();
    setEditor(cliente);
    setAviso("");
  }
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" /> CADA CLIENTE, UMA RELAÇÃO
          </div>
          <h1>
            Clientes<span>.</span>
          </h1>
        </div>
        <div className="acoes-titulo">
          <ImportarCadastros tipo="clientes" />
          <button className="botao-primario" onClick={() => editar("novo")}>
            <Plus size={20} />
            Novo cliente
          </button>
        </div>
      </div>
      {acesso.demo && (
        <div className="nota-demo">
          Modo demonstração · Alterações salvas apenas neste navegador.
        </div>
      )}
      <section className="painel-registros painel-clientes">
        <div className="registros-cabecalho">
          <div>
            <h2>
              Clientes cadastrados{" "}
              <span className="contagem-total">{consulta.data?.total ?? "—"}</span>
            </h2>
            <p>
              {arquivados
                ? "Cadastros excluídos, com o histórico preservado."
                : "Encontre um cliente para consultar ou editar."}
            </p>
          </div>
          <label className="campo-busca">
            <Search size={18} />
            <input
              aria-label="Buscar clientes"
              placeholder="Buscar nome, telefone ou e-mail"
              maxLength={200}
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
        </div>
        <div className="abas-clientes" aria-label="Situação dos clientes">
          <button
            className={!arquivados ? "selecionada" : ""}
            aria-pressed={!arquivados}
            onClick={() => {
              setArquivados(false);
              setPagina(0);
            }}
          >
            <Users size={17} />
            Clientes ativos
          </button>
          {gerencia && (
            <button
              className={arquivados ? "selecionada" : ""}
              aria-pressed={arquivados}
              onClick={() => {
                setArquivados(true);
                setPagina(0);
              }}
            >
              <Trash2 size={17} />
              Lixeira
            </button>
          )}
        </div>
        {aviso && (
          <p className="aviso-cliente" role="status">
            {aviso}
          </p>
        )}
        {consulta.isPending ? (
          <div className="estado-lista" role="status">
            Carregando clientes…
          </div>
        ) : consulta.isError ? (
          <div className="estado-lista">
            <p role="alert">{erroPublico(consulta.error)}</p>
            <button
              className="botao-secundario"
              onClick={() => void consulta.refetch()}
            >
              Tentar novamente
            </button>
          </div>
        ) : !consulta.data.itens.length ? (
          <div className="estado-lista">
            <Users size={32} />
            <h3>
              {filtro
                ? "Nenhum cliente encontrado"
                : arquivados
                  ? "A lixeira está vazia"
                  : "Seu primeiro cliente começa aqui"}
            </h3>
            <p>
              {filtro
                ? "Tente outro nome, e-mail ou telefone."
                : arquivados
                  ? "Os clientes excluídos aparecerão aqui para restauração."
                  : "Cadastre pelo nome e complete os detalhes depois."}
            </p>
            {!filtro && !arquivados && (
              <button className="botao-primario" onClick={() => editar("novo")}>
                Cadastrar primeiro cliente
              </button>
            )}
          </div>
        ) : (
          <ul className="lista-clientes" aria-label="Clientes cadastrados">
            {consulta.data.itens.map((cliente) => (
              <li className="linha-cliente" key={cliente.id}>
                <Link
                  className="abrir-ficha-cliente"
                  to={`?cliente=${cliente.id}`}
                  aria-label={`Ver ficha de ${cliente.nome}`}
                >
                  <div className="linha-cliente-identidade">
                    <span
                      className={`avatar-cliente ${cliente.tipo === "pessoa_juridica" ? "empresa" : ""}`}
                      aria-hidden="true"
                    >
                      {cliente.tipo === "pessoa_juridica" ? (
                        <Building2 size={22} />
                      ) : (
                        cliente.nome
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join("")
                      )}
                    </span>
                    <div>
                      <h3>{cliente.nome}</h3>
                      <small>
                        {cliente.tipo === "pessoa_juridica"
                          ? "Empresa"
                          : "Pessoa física"}
                      </small>
                    </div>
                  </div>
                  <div className="linha-cliente-contatos">
                    {cliente.telefone_e164 && (
                      <span>
                        <Phone size={15} aria-hidden="true" />
                        <span>{cliente.telefone_e164}</span>
                      </span>
                    )}
                    {cliente.email && (
                      <span>
                        <Mail size={15} aria-hidden="true" />
                        <span>{cliente.email}</span>
                      </span>
                    )}
                    {!cliente.telefone_e164 && !cliente.email && (
                      <span>Sem contato cadastrado</span>
                    )}
                  </div>
                  <ChevronRight
                    size={18}
                    aria-hidden="true"
                    className="linha-cliente-seta"
                  />
                </Link>
                <div className="linha-cliente-acoes">
                  {!arquivados && (
                    <button
                      className="botao-icone"
                      aria-label={`Editar ${cliente.nome}`}
                      title="Editar cliente"
                      onClick={() => editar(cliente)}
                    >
                      <Pencil size={18} />
                    </button>
                  )}
                  {gerencia && (
                    <button
                      className={`botao-icone ${arquivados ? "" : "excluir-cliente"}`}
                      aria-label={`${arquivados ? "Restaurar" : "Excluir"} ${cliente.nome}`}
                      title={arquivados ? "Restaurar cliente" : "Excluir cliente"}
                      onClick={() => {
                        arquivamento.reset();
                        setExclusao(cliente);
                      }}
                    >
                      {arquivados ? <RotateCcw size={18} /> : <Trash2 size={18} />}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="paginacao-clientes">
          <span>
            {consulta.data?.total ?? 0} cliente(s) · Página {pagina + 1}
          </span>
          <div>
            <button
              className="botao-icone"
              aria-label="Página anterior"
              disabled={pagina === 0 || consulta.isFetching}
              onClick={() => setPagina((p) => p - 1)}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="botao-icone"
              aria-label="Próxima página"
              disabled={
                !consulta.data ||
                (pagina + 1) * 24 >= consulta.data.total ||
                consulta.isFetching
              }
              onClick={() => setPagina((p) => p + 1)}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
      </section>
      <Dialogo
        aberto={!!clienteSelecionado && editor === null && exclusao === null}
        fechar={() =>
          setParams((atuais) => {
            const novos = new URLSearchParams(atuais);
            novos.delete("cliente");
            return novos;
          })
        }
        titulo="Ficha do cliente"
        acoesCabecalho={
          clienteSelecionado && (
            <AssistenteContextual
              contexto={{ cliente: clienteSelecionado, titulo: "Cliente selecionado" }}
            />
          )
        }
        classe="dialogo-ficha-cliente"
      >
        {clienteSelecionado && (
          <FichaCliente
            key={`${oficina.id}-${clienteSelecionado}`}
            id={clienteSelecionado}
            editar={editar}
          />
        )}
      </Dialogo>
      <Dialogo
        aberto={editor !== null}
        fechar={() => {
          if (!gravacao.isPending) setEditor(null);
        }}
        titulo={editor === "novo" ? "Novo cliente" : "Editar cliente"}
      >
        {editor && (
          <FormularioCliente
            key={editor === "novo" ? "novo" : editor.id}
            cliente={editor === "novo" ? undefined : editor}
            salvando={gravacao.isPending}
            erro={gravacao.isError ? erroPublico(gravacao.error) : ""}
            salvar={(dados) => {
              if (gravando.current) return;
              gravando.current = true;
              gravacao.mutate(dados);
            }}
            cancelar={() => setEditor(null)}
          />
        )}
      </Dialogo>
      <Dialogo
        aberto={!!exclusao}
        fechar={() => {
          if (!arquivamento.isPending) setExclusao(null);
        }}
        titulo={arquivados ? "Restaurar cliente?" : "Excluir cliente?"}
      >
        <div className="confirmacao-cliente">
          <p>
            <strong>{exclusao?.nome}</strong>
          </p>
          <p>
            {arquivados
              ? "O cadastro voltará para os clientes ativos. Um acesso anterior ao portal precisa ser concedido novamente."
              : "O cadastro irá para a lixeira e poderá ser restaurado. Os orçamentos e serviços serão preservados. O acesso deste cliente ao portal será revogado."}
          </p>
          {arquivamento.isError && (
            <p role="alert" className="erro-formulario">
              {erroPublico(arquivamento.error)}
            </p>
          )}
          <div className="acoes-formulario">
            <button
              className="botao-secundario"
              disabled={arquivamento.isPending}
              onClick={() => setExclusao(null)}
            >
              Cancelar
            </button>
            <button
              className={arquivados ? "botao-primario" : "botao-perigo"}
              disabled={arquivamento.isPending}
              onClick={() => {
                if (!exclusao || arquivando.current) return;
                arquivando.current = true;
                arquivamento.mutate(exclusao);
              }}
            >
              {arquivamento.isPending
                ? "Salvando…"
                : arquivados
                  ? "Restaurar cliente"
                  : "Mover para a lixeira"}
            </button>
          </div>
        </div>
      </Dialogo>
    </>
  );
}
