import { componenteSobDemanda } from "../lib/componenteSobDemanda";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Image,
  Moon,
  ShieldCheck,
  Sun,
  Monitor,
  Wrench,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { useTema, definirTema, type Tema } from "../lib/tema";
import { erroPublico } from "../lib/supabase";
import { consultarConfiguracoes, salvarConfiguracoes } from "../services/gestao";
import { normalizarTelefone } from "../services/clientes";

import "./Gestao.css";
import "./Configuracoes.css";
const EspecialidadeEmpresa = componenteSobDemanda(async () => ({
  default: (await import("../components/EspecialidadeEmpresa")).EspecialidadeEmpresa,
}));
const IdentidadeDocumentos = componenteSobDemanda(async () => ({
  default: (await import("../components/IdentidadeDocumentos")).IdentidadeDocumentos,
}));
const secoes = [
  {
    id: "empresa",
    nome: "Dados da empresa",
    descricao: "Nome, contato e endereço nos seus documentos.",
    icone: Building2,
  },
  {
    id: "especialidade",
    nome: "Especialidade",
    descricao: "Tipos de serviço e etapas dos atendimentos.",
    icone: Wrench,
  },
  {
    id: "documentos",
    nome: "Logo e documentos",
    descricao: "Sua marca, QR Code Pix e mensagem para o cliente.",
    icone: Image,
  },
  {
    id: "aparencia",
    nome: "Aparência",
    descricao: "Escolha como o sistema aparece neste aparelho.",
    icone: Sun,
  },
  {
    id: "conta",
    nome: "Conta e plano",
    descricao: "Confira seu perfil de acesso e os recursos contratados.",
    icone: CreditCard,
  },
] as const;
export function Configuracoes() {
  const a = useAcesso(),
    qc = useQueryClient(),
    tema = useTema(),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [secao, setSecao] = useState<string>("empresa"),
    trava = useRef(false);
  const [visitadas, setVisitadas] = useState(() => new Set(["empresa"]));
  function abrirSecao(id: string) {
    setSecao(id);
    setVisitadas((anteriores) =>
      anteriores.has(id) ? anteriores : new Set([...anteriores, id]),
    );
  }
  const q = useQuery({
    queryKey: ["configuracoes", a.demo, a.oficina!.id],
    queryFn: ({ signal }) => consultarConfiguracoes(a.demo, a.oficina!.id, signal),
  });
  const gerente = a.oficina?.perfil !== "staff";
  return (
    <div className="gestao-pagina configuracoes-pagina">
      <div className="titulo-pagina">
        <div>
          <h1>
            Configurações<span>.</span>
          </h1>
          <p>Escolha o que deseja ajustar na sua empresa.</p>
        </div>
      </div>
      <div className="configuracoes-layout">
        <nav className="configuracoes-menu" aria-label="Seções das configurações">
          <span className="configuracoes-menu-titulo">Configurar</span>
          <div className="configuracoes-menu-desktop">
            {secoes.map(({ id, nome, icone: Icone }) => (
              <button
                key={id}
                type="button"
                aria-pressed={secao === id}
                aria-controls={`config-${id}`}
                onClick={() => abrirSecao(id)}
              >
                <Icone size={19} aria-hidden="true" />
                <span>{nome}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
          <label className="configuracoes-menu-mobile">
            <span>O que deseja configurar?</span>
            <select value={secao} onChange={(e) => abrirSecao(e.target.value)}>
              {secoes.map(({ id, nome }) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <Link className="configuracoes-seguranca" to="/dados-seguranca">
            <ShieldCheck size={19} aria-hidden="true" />
            <span>Dados e segurança</span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </nav>
        <div className="configuracoes-area">
          {secoes.map(({ id, nome, descricao }) => (
            <section
              key={id}
              id={`config-${id}`}
              className="configuracoes-painel"
              hidden={secao !== id}
              aria-labelledby={`config-titulo-${id}`}
            >
              <header className="configuracoes-painel-titulo">
                <h2 id={`config-titulo-${id}`}>{nome}</h2>
                <p>{descricao}</p>
              </header>
              <div className="configuracoes-conteudo">
                {id === "empresa" && (
                  <>
                    {aviso && (
                      <p role="status" className="aviso-cliente">
                        {aviso}
                      </p>
                    )}
                    {erro && (
                      <p role="alert" className="erro-formulario">
                        {erro}
                      </p>
                    )}
                    {q.isPending ? (
                      <p>Carregando…</p>
                    ) : q.isError ? (
                      <p role="alert">
                        {erroPublico(q.error)}{" "}
                        <button onClick={() => void q.refetch()}>
                          Tentar novamente
                        </button>
                      </p>
                    ) : (
                      <form
                        key={`${a.oficina!.id}:${q.data.revisao}`}
                        className="gestao-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (trava.current) return;
                          trava.current = true;
                          setOcupado(true);
                          setErro("");
                          setAviso("");
                          const f = new FormData(e.currentTarget);
                          try {
                            await salvarConfiguracoes(a.demo, a.oficina!.id, {
                              ...q.data,
                              nome: String(f.get("nome")),
                              telefone:
                                normalizarTelefone(String(f.get("telefone"))) || "",
                              endereco: {
                                ...q.data.endereco,
                                logradouro: String(f.get("logradouro")),
                                cidade: String(f.get("cidade")),
                                uf: String(f.get("uf")),
                                cep: String(f.get("cep")),
                              },
                            });
                            await Promise.all([
                              q.refetch(),
                              a.atualizar(),
                              qc.invalidateQueries({ queryKey: ["historico-gestao"] }),
                              qc.invalidateQueries({ queryKey: ["identidade"] }),
                            ]);
                            setAviso("Dados da empresa atualizados.");
                          } catch (err) {
                            setErro(erroPublico(err));
                          } finally {
                            trava.current = false;
                            setOcupado(false);
                          }
                        }}
                      >
                        <fieldset disabled={ocupado || !gerente}>
                          <div className="configuracoes-grupo">
                            <h3>Identificação e contato</h3>
                            <div className="dupla-campos">
                              <label>
                                Nome fantasia da empresa
                                <input
                                  name="nome"
                                  defaultValue={q.data.nome}
                                  minLength={2}
                                  maxLength={120}
                                  required
                                />
                              </label>
                              <label>
                                Telefone com DDD
                                <input
                                  type="tel"
                                  name="telefone"
                                  defaultValue={q.data.telefone}
                                  maxLength={24}
                                />
                              </label>
                            </div>
                          </div>
                          <div className="configuracoes-grupo">
                            <h3>Endereço</h3>
                            <label>
                              Rua, número e complemento
                              <input
                                name="logradouro"
                                defaultValue={q.data.endereco.logradouro || ""}
                                maxLength={300}
                              />
                            </label>
                            <div className="configuracoes-endereco">
                              <label>
                                Cidade
                                <input
                                  name="cidade"
                                  defaultValue={q.data.endereco.cidade || ""}
                                  maxLength={100}
                                />
                              </label>
                              <label>
                                Estado (UF)
                                <input
                                  name="uf"
                                  defaultValue={q.data.endereco.uf || ""}
                                  pattern="[A-Za-z]{2}"
                                  maxLength={2}
                                />
                              </label>
                              <label>
                                CEP
                                <input
                                  name="cep"
                                  defaultValue={q.data.endereco.cep || ""}
                                  pattern="[0-9]{5}-?[0-9]{3}"
                                  maxLength={9}
                                />
                              </label>
                            </div>
                          </div>
                          <div className="configuracoes-form-rodape">
                            <p className="texto-suave">
                              Documentos já emitidos mantêm os dados originais.
                            </p>
                            {gerente && (
                              <button className="botao-primario">
                                {ocupado ? "Salvando…" : "Salvar dados da empresa"}
                              </button>
                            )}
                          </div>
                        </fieldset>
                        {!gerente && (
                          <p>Apenas proprietário e gerentes podem alterar os dados.</p>
                        )}
                      </form>
                    )}
                  </>
                )}
                {id === "especialidade" && visitadas.has(id) && (
                  <EspecialidadeEmpresa />
                )}
                {id === "documentos" && visitadas.has(id) && (
                  <IdentidadeDocumentos semCabecalho />
                )}
                {id === "aparencia" && (
                  <>
                    <p className="texto-suave">
                      Preferência salva neste navegador. No modo automático, acompanha o
                      tema do dispositivo.
                    </p>
                    <div className="gestao-temas">
                      {(
                        [
                          ["claro", "Claro", Sun],
                          ["escuro", "Escuro", Moon],
                          ["sistema", "Automático", Monitor],
                        ] as const
                      ).map(([id, nome, Icone]) => (
                        <button
                          key={id}
                          aria-pressed={tema === id}
                          onClick={() => definirTema(id as Tema)}
                        >
                          <Icone size={24} />
                          {nome}
                          {tema === id && <CheckCircle2 size={17} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {id === "conta" && (
                  <>
                    <dl className="gestao-dados">
                      <div>
                        <dt>Empresa</dt>
                        <dd>{q.data?.nome || a.oficina!.nome}</dd>
                      </div>
                      <div>
                        <dt>Perfil</dt>
                        <dd>
                          {a.oficina!.perfil === "owner"
                            ? "Proprietário"
                            : a.oficina!.perfil === "manager"
                              ? "Gerente"
                              : "Funcionário"}
                        </dd>
                      </div>
                      <div>
                        <dt>Plano</dt>
                        <dd>{a.oficina!.nome_plano}</dd>
                      </div>
                    </dl>
                    <Link className="botao-secundario" to="/planos">
                      Ver recursos do plano
                    </Link>
                    <p className="texto-suave gestao-legenda">
                      Valores em reais (BRL). Relatórios no horário de Brasília.{" "}
                      {a.demo
                        ? "Dados demonstrativos ficam somente neste navegador."
                        : "Cada empresa acessa seus próprios dados, conforme perfil e assinatura."}
                    </p>
                  </>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
