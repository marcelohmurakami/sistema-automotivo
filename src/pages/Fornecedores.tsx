import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { vocabularioEstoque } from "../lib/interfaceRamo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Search } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "../components/Dialogo";
import { FormFornecedor } from "../components/compras/FormFornecedor";
import { Paginacao } from "../components/compras/PaginacaoCompras";
import { erroPublico } from "../lib/supabase";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { atualizarCadastro } from "../lib/atualizarCadastro";
import { normalizarTelefone } from "../services/clientes";
import {
  listarFornecedores,
  salvarFornecedor,
  arquivarFornecedor,
  novoFornecedor,
  type Fornecedor,
} from "../services/compras";
import "./Compras.css";
export function Fornecedores() {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const [busca, setBusca] = useState(""),
    [arquivados, setArquivados] = useState(false),
    [pagina, setPagina] = useState(0),
    [form, setForm] = useState<Fornecedor | null>(null),
    [arquivo, setArquivo] = useState<Fornecedor | null>(null),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const trava = useRef(false);
  const termoConsulta1 = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: ["fornecedores", a.demo, oficina, termoConsulta1, arquivados, pagina],
    queryFn: ({ signal }) =>
      listarFornecedores(a.demo, oficina, termoConsulta1, arquivados, pagina, signal),
  });
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      void atualizarCadastro(qc, ["fornecedores", a.demo, oficina]).catch(() => {});
      setForm(null);
      setArquivo(null);
      setAviso("Fornecedor atualizado.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
      trava.current = false;
    }
  }
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" />
            FORNECEDORES DA SUA EMPRESA
          </div>
          <h1>
            Fornecedores<span>.</span>
          </h1>
          <p>Contatos e informações em um só lugar, prontos para a próxima compra.</p>
        </div>
        <button
          className="botao-primario"
          disabled={ocupado}
          onClick={() => {
            if (trava.current) return;
            setErro("");
            setForm(novoFornecedor());
          }}
        >
          <Plus size={18} />
          Novo fornecedor
        </button>
      </div>
      {a.demo && (
        <p className="aviso-cliente">Demonstração · Dados salvos neste navegador.</p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      <section className="os-painel">
        {q.isFetching && !q.isPending && <p role="status">Atualizando fornecedores…</p>}
        <div className="compra-filtros">
          <label>
            <Search size={18} />
            <input
              aria-label="Buscar fornecedores"
              placeholder="Nome, CNPJ ou CPF"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
            />
          </label>
          <select
            aria-label="Situação dos fornecedores"
            value={arquivados ? "arquivados" : "ativos"}
            onChange={(e) => {
              setArquivados(e.target.value === "arquivados");
              setPagina(0);
            }}
          >
            <option value="ativos">Ativos</option>
            <option value="arquivados">Arquivados</option>
          </select>
          <Link to="/compras">Ver compras →</Link>
        </div>
        {q.isPending ? (
          <p>Carregando fornecedores…</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : (
          <>
            {!q.data.itens.length && (
              <div className="compra-vazio">
                <Truck size={34} />
                <h3>
                  {busca
                    ? "Nenhum fornecedor encontrado"
                    : `Cadastre seus fornecedores de ${vocabularioEstoque(a.oficina?.ramo).plural}`}
                </h3>
                <p>Nome é obrigatório. Você pode completar os outros dados depois.</p>
              </div>
            )}
            <div className="fornecedor-grade">
              {q.data.itens.map((f) => (
                <article className="fornecedor-card" key={f.id}>
                  <Truck size={22} />
                  <div className="fornecedor-identidade">
                    <h3>{f.nome}</h3>
                    <p>{f.documento || "Documento não informado"}</p>
                  </div>
                  <div className="fornecedor-contato">
                    {f.telefone && <a href={"tel:" + f.telefone}>{f.telefone}</a>}
                    {f.email && <p>{f.email}</p>}
                    {!f.telefone && !f.email && <p>Contato não informado</p>}
                  </div>
                  <div className="fornecedor-detalhes">
                    {f.endereco && <p>{f.endereco}</p>}
                    {f.observacoes && <p className="texto-suave">{f.observacoes}</p>}
                  </div>
                  <div className="compra-acoes">
                    {!f.arquivado_em && (
                      <button
                        className="botao-secundario"
                        disabled={ocupado || q.isFetching}
                        onClick={() => {
                          setErro("");
                          setForm(f);
                        }}
                      >
                        Editar
                      </button>
                    )}
                    <button
                      className="botao-secundario"
                      disabled={ocupado || q.isFetching}
                      onClick={() => {
                        setErro("");
                        setArquivo(f);
                      }}
                    >
                      {f.arquivado_em ? "Restaurar" : "Arquivar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <Paginacao pagina={pagina} total={q.data.total} mudar={setPagina} />
          </>
        )}
      </section>
      <Dialogo
        aberto={!!form || !!arquivo}
        fechar={() => {
          if (!ocupado) {
            setForm(null);
            setArquivo(null);
          }
        }}
        titulo={
          arquivo
            ? arquivo.arquivado_em
              ? "Restaurar fornecedor"
              : "Arquivar fornecedor"
            : form?.revisao
              ? "Editar fornecedor"
              : "Novo fornecedor"
        }
      >
        {erro && (
          <p className="erro-formulario" role="alert">
            {erro}
          </p>
        )}
        {form && (
          <FormFornecedor
            key={form.id}
            valor={form}
            ocupado={ocupado}
            salvar={(f) =>
              void executar(() =>
                salvarFornecedor(a.demo, oficina, {
                  ...f,
                  telefone: normalizarTelefone(f.telefone),
                }),
              )
            }
          />
        )}{" "}
        {arquivo && (
          <>
            <p>
              {arquivo.nome}:{" "}
              {arquivo.arquivado_em
                ? "voltará a aparecer para novas compras."
                : "será ocultado de novas compras. O histórico das compras será preservado."}
            </p>
            <button
              className="botao-primario"
              disabled={ocupado}
              onClick={() =>
                void executar(() => arquivarFornecedor(a.demo, oficina, arquivo))
              }
            >
              Confirmar
            </button>
          </>
        )}
      </Dialogo>
    </>
  );
}
