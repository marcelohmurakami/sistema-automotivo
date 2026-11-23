import { AjudaContextual } from "./AjudaContextual";
import { dinheiro } from "../lib/formatacao";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CarFront,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import type { Cliente } from "../services/clientes";
import {
  consultarFichaCliente,
  type FiltroAtendimentos,
} from "../services/fichaCliente";

import { situacoesOS } from "../services/ordensServico";
import { SecaoRecolhivel } from "./SecaoRecolhivel";
import "./FichaCliente.css";
import { LucroCliente } from "./LucroCliente";
import { estadosServico } from "../services/servicos";
import { ContaFichaCliente } from "./ContaFichaCliente";
import { ramos } from "../lib/ramos";

const data = (valor?: string | null) =>
  valor
    ? /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? valor.split("-").reverse().join("/")
      : new Date(valor).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })
    : "—";
export function FichaCliente({
  id,
  editar,
}: {
  id: string;
  editar: (cliente: Cliente) => void;
}) {
  const acesso = useAcesso();
  const automotivo = !acesso.oficina?.ramo || acesso.oficina.ramo === "automotivo";
  const [aba, setAba] = useState<"historico" | "dados">("historico");
  const [contaAberta, setContaAberta] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [filtro, setFiltro] = useState<FiltroAtendimentos>("todos");
  const escopo = JSON.stringify([
    acesso.demo,
    acesso.usuario,
    acesso.oficina!.id,
    acesso.oficina!.perfil,
    acesso.oficina!.recursos,
    id,
  ]);
  const q = useQuery({
    queryKey: ["ficha-cliente", escopo, pagina, filtro],
    queryFn: ({ signal }) => consultarFichaCliente(acesso, id, pagina, filtro, signal),
    placeholderData: (anterior, consultaAnterior) =>
      consultaAnterior?.queryKey[1] === escopo ? anterior : undefined,
    retry: false,
    refetchInterval: 30000,
  });
  if (q.isPending)
    return (
      <p className="estado-lista" role="status">
        Carregando ficha do cliente…
      </p>
    );
  if (q.isError)
    return (
      <div className="estado-lista">
        <p role="alert">{erroPublico(q.error)}</p>
        <button className="botao-secundario" onClick={() => void q.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  const { cliente, resumo, financeiro, historico, veiculos, recursos } = q.data;
  return (
    <div className="ficha-cliente">
      <header className="ficha-cliente-topo">
        <div className="ficha-cliente-identidade">
          <div>
            <h3>{cliente.nome}</h3>
            <p>
              {cliente.tipo === "pessoa_juridica" ? "Empresa" : "Pessoa física"} ·
              Cliente desde {data(cliente.criado_em)}
              {cliente.arquivado_em ? " · Na lixeira" : ""}
            </p>
          </div>
          <button
            className="botao-icone"
            aria-label="Atualizar ficha do cliente"
            title="Atualizar ficha"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="ficha-cliente-acoes">
          {!cliente.arquivado_em && acesso.permite("work_orders") && (
            <Link
              className="botao-secundario"
              data-preparar-modulo={automotivo ? "formularioOS" : undefined}
              to={`${automotivo ? "/ordens-servico?nova=1" : "/atendimentos?novo=1"}&cliente=${encodeURIComponent(id)}`}
            >
              <ArrowUpRight size={17} />
              {automotivo ? "Nova OS" : ramos[acesso.oficina!.ramo!].atendimento}
            </Link>
          )}
          {!cliente.arquivado_em && acesso.permite("quotes") && (
            <Link
              className="botao-secundario"
              data-preparar-modulo={automotivo ? "formularioOrcamento" : undefined}
              to={`/orcamentos?novo=1&cliente=${encodeURIComponent(id)}`}
            >
              <ArrowUpRight size={17} /> Novo orçamento
            </Link>
          )}
          {financeiro &&
            acesso.permite("finance") &&
            acesso.oficina?.perfil !== "staff" && (
              <button className="botao-primario" onClick={() => setContaAberta(true)}>
                <FileDown size={17} /> Gerar conta em PDF
              </button>
            )}
          {!cliente.arquivado_em && (
            <button className="botao-secundario" onClick={() => editar(cliente)}>
              <Pencil size={16} /> Editar cadastro
            </button>
          )}
        </div>
      </header>
      {contaAberta && (
        <ContaFichaCliente
          key={`${acesso.oficina?.id}:${id}`}
          cliente={id}
          nome={cliente.nome}
          fechar={() => setContaAberta(false)}
        />
      )}
      <section className="ficha-cliente-resumo" aria-label="Resumo do cliente">
        <div
          className="ficha-cliente-indicadores"
          aria-label="Resumo dos atendimentos do cliente"
        >
          <div>
            <span>Total em serviços</span>
            <strong>{dinheiro(resumo.total_servicos_centavos)}</strong>
            <small>Atendimentos concluídos</small>
          </div>
          <div>
            <span>Ticket médio</span>
            <strong>
              {resumo.ticket_medio_centavos === null
                ? "—"
                : dinheiro(resumo.ticket_medio_centavos)}
            </strong>
            <small>Valor médio por atendimento</small>
          </div>
          <div>
            <span>Atendimentos concluídos</span>
            <strong>{resumo.atendimentos_concluidos}</strong>
            <small>
              {resumo.em_andamento
                ? `${resumo.em_andamento} em andamento`
                : "Nenhum em andamento"}
            </small>
          </div>
        </div>
        <AjudaContextual titulo="Como os totais são calculados">
          <p>
            {!automotivo
              ? "Atendimentos concluídos"
              : recursos.ordens
                ? "OS entregues e notinhas emitidas"
                : "Notinhas emitidas"}
            , incluindo peças e descontos. O total dividido pelos atendimentos
            concluídos é o ticket médio. Cancelados ficam fora da conta.
          </p>
        </AjudaContextual>
      </section>
      <LucroCliente id={id} />
      {financeiro && (
        <section
          className="ficha-cliente-pagamentos"
          aria-label="Pagamentos registrados do cliente"
        >
          <div>
            <span>Já pago</span>
            <strong>{dinheiro(financeiro.pago_centavos)}</strong>
          </div>
          <div>
            <span>Em aberto</span>
            <strong>{dinheiro(financeiro.aberto_centavos)}</strong>
          </div>
          <small>
            OS com adiantamentos e estornos. Notinhas não comprovam pagamento.
          </small>
        </section>
      )}
      <nav className="ficha-cliente-abas" aria-label="Seções da ficha do cliente">
        <button aria-pressed={aba === "historico"} onClick={() => setAba("historico")}>
          Histórico de serviços
        </button>
        <button aria-pressed={aba === "dados"} onClick={() => setAba("dados")}>
          {automotivo ? "Dados e veículos" : "Dados do cliente"}
        </button>
      </nav>
      {aba === "dados" ? (
        <div className="ficha-cliente-dados">
          <section className="ficha-cliente-bloco">
            <h4>Dados cadastrais</h4>
            <dl>
              <div>
                <dt>Nome / razão social</dt>
                <dd>{cliente.nome}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>
                  {cliente.tipo === "pessoa_juridica" ? "Empresa" : "Pessoa física"}
                </dd>
              </div>
              <div>
                <dt>Telefone / WhatsApp</dt>
                <dd>{cliente.telefone_e164 || "Não informado"}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{cliente.email || "Não informado"}</dd>
              </div>
              <div className="ficha-cliente-largo">
                <dt>Endereço</dt>
                <dd>{cliente.endereco || "Não informado"}</dd>
              </div>
              <div className="ficha-cliente-largo">
                <dt>Observações</dt>
                <dd>{cliente.observacoes || "Nenhuma observação"}</dd>
              </div>
              <div>
                <dt>Cadastro atualizado</dt>
                <dd>{data(cliente.atualizado_em)}</dd>
              </div>
              <div>
                <dt>Último atendimento concluído</dt>
                <dd>{data(resumo.ultimo_atendimento_em)}</dd>
              </div>
            </dl>
          </section>
          {automotivo ? (
            <section className="ficha-cliente-bloco">
              <h4>Veículos ({veiculos.length})</h4>
              {veiculos.length ? (
                <ul className="ficha-cliente-veiculos">
                  {veiculos.map((v) => (
                    <li key={v.id}>
                      <CarFront size={22} aria-hidden="true" />
                      <div>
                        <strong>{v.modelo}</strong>
                        <span>
                          {[v.marca, v.ano_modelo, v.placa || "Sem placa"]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {(v.encerrado_em || v.arquivado_em) && (
                          <small>Vínculo anterior · preservado no histórico</small>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="texto-suave">Nenhum veículo vinculado a este cliente.</p>
              )}
            </section>
          ) : (
            <Link to={`/objetos?cliente=${id}`}>
              Ver equipamentos e locais deste cliente <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      ) : (
        <section
          className="ficha-cliente-historico"
          aria-label="Histórico de atendimentos"
          aria-busy={q.isFetching}
        >
          <div className="ficha-cliente-filtros">
            <div>
              <h4>Atendimentos</h4>
              <span>
                {historico.total} {historico.total === 1 ? "registro" : "registros"}
              </span>
            </div>
            <label>
              Situação
              <select
                value={filtro}
                onChange={(e) => {
                  setFiltro(e.target.value as FiltroAtendimentos);
                  setPagina(0);
                }}
              >
                <option value="todos">Todos</option>
                <option value="concluidos">Concluídos</option>
                <option value="andamento">Em andamento</option>
                <option value="cancelados">Cancelados</option>
              </select>
            </label>
          </div>
          {historico.itens.length ? (
            <div className="ficha-cliente-atendimentos">
              {historico.itens.map((a) => (
                <article
                  className="ficha-cliente-atendimento"
                  key={`${a.tipo}-${a.id}`}
                >
                  <header>
                    <div>
                      <strong>
                        {a.tipo === "nota" ? "Notinha" : "OS"} #{a.numero}
                      </strong>
                      <span>
                        {data(a.data)}
                        {a.veiculo.modelo ? ` · ${a.veiculo.modelo}` : ""}
                        {a.veiculo.placa ? ` · ${a.veiculo.placa}` : ""}
                      </span>
                    </div>
                    <div>
                      <span className={`os-status ${a.situacao}`}>
                        {a.tipo === "atendimento"
                          ? estadosServico[a.situacao as keyof typeof estadosServico] ||
                            a.situacao
                          : a.tipo === "os"
                            ? situacoesOS[a.situacao] || a.situacao
                            : a.situacao === "issued"
                              ? "Emitida"
                              : a.situacao === "cancelled"
                                ? "Cancelada"
                                : "Rascunho"}
                      </span>
                      <strong>{dinheiro(a.total_centavos)}</strong>
                    </div>
                  </header>
                  <SecaoRecolhivel
                    titulo={`Ver peças e serviços (${a.itens.length})`}
                    classe="ficha-cliente-itens"
                  >
                    {a.resumo && <p className="ficha-cliente-relato">{a.resumo}</p>}
                    {a.itens.length ? (
                      <ul>
                        {a.itens.map((i, n) => (
                          <li key={n}>
                            <div>
                              <strong>{i.descricao}</strong>
                              <small>
                                {i.tipo === "service" ? "Serviço" : "Peça"} ·{" "}
                                {i.quantidade} {i.unidade}
                                {i.situacao === "done" ? " · Realizado" : ""}
                              </small>
                            </div>
                            <span>{dinheiro(i.total_centavos)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="texto-suave">
                        Nenhum item registrado neste atendimento.
                      </p>
                    )}
                    {a.tipo !== "nota" && (
                      <Link
                        className="ficha-cliente-abrir-os"
                        to={
                          a.tipo === "atendimento"
                            ? `/atendimentos?atendimento=${a.id}`
                            : `/ordens-servico?os=${a.id}`
                        }
                      >
                        Abrir OS completa <ArrowUpRight size={16} />
                      </Link>
                    )}
                  </SecaoRecolhivel>
                </article>
              ))}
            </div>
          ) : (
            <p className="ficha-cliente-vazio">
              {filtro === "todos"
                ? "Este cliente ainda não tem atendimentos registrados."
                : "Nenhum atendimento nesta situação."}
            </p>
          )}
          {historico.total > 20 && (
            <div className="ficha-cliente-paginacao">
              <span>
                Página {pagina + 1} de {Math.ceil(historico.total / 20)}
              </span>
              <button
                className="botao-icone"
                aria-label="Atendimentos anteriores"
                disabled={pagina === 0 || q.isFetching}
                onClick={() => setPagina(pagina - 1)}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="botao-icone"
                aria-label="Próximos atendimentos"
                disabled={(pagina + 1) * 20 >= historico.total || q.isFetching}
                onClick={() => setPagina(pagina + 1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
