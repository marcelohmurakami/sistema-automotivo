import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CarFront,
  CheckCheck,
  ChevronRight,
  Clock3,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Timer,
  Wrench,
} from "lucide-react";
import {
  etapasMapa as etapas,
  normalizarBuscaMapa as normalizar,
  prepararMapa,
} from "../lib/mapaOficina";
import { useQuery } from "@tanstack/react-query";
import { consultarMapaOficina } from "../services/mapaOficina";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import "./MapaOficina.css";
import type { VeiculoMapa as Veiculo } from "../lib/mapaOficina";

function CartaoVeiculo({
  veiculo,
  abrir,
}: {
  veiculo: Veiculo;
  abrir: () => void;
}) {
  return (
    <button
      className={`cartao-veiculo ${veiculo.etapa === "pronto" ? "cartao-pronto" : ""}`}
      onClick={abrir}
      aria-label={`Ver ${veiculo.modelo}, placa ${veiculo.placa}, OS ${veiculo.id}`}
    >
      <div className="cartao-topo">
        <span className="placa">{veiculo.placa}</span>
        <span className="numero-os">
          OS #{veiculo.id}
          <ChevronRight size={14} />
        </span>
      </div>
      <div className="cartao-modelo">
        <div>
          <h3>{veiculo.modelo}</h3>
          <p>{veiculo.versao}</p>
        </div>
        <CarFront size={29} strokeWidth={1.4} />
      </div>
      <p className="cliente-cartao">{veiculo.cliente}</p>
      <p className="mapa-responsavel">Responsável: {veiculo.tecnico}</p>
      {!veiculo.presente && (
        <p className="mapa-responsavel">Entrada ainda não registrada</p>
      )}
      <div className="servico-cartao">
        <Wrench size={13} />
        <span>{veiculo.servico}</span>
      </div>
      {veiculo.motivo && (
        <div className="motivo-parada">
          <Clock3 size={13} />
          {veiculo.motivo}
        </div>
      )}
      {veiculo.etapa === "pronto" && (
        <div className="servico-concluido">
          <CheckCheck size={15} /> Serviço concluído
        </div>
      )}
      <div className="cartao-rodape">
        <span className={`prazo ${veiculo.atrasado ? "prazo-atrasado" : ""}`}>
          <Clock3 size={13} />
          {veiculo.atrasado ? "Atrasado · " : ""}
          {veiculo.prazo}
        </span>
        <span
          className={`avatar-tecnico ${veiculo.cor}`}
          title={`Responsável: ${veiculo.tecnico}`}
        >
          {veiculo.iniciais}
        </span>
      </div>
    </button>
  );
}

export function MapaOficina() {
  const acesso = useAcesso(),
    navegar = useNavigate();
  const consulta = useQuery({
    queryKey: ["mapa-oficina", acesso.demo, acesso.oficina!.id],
    queryFn: () => consultarMapaOficina(acesso.demo, acesso.oficina!.id),
    refetchInterval: 30000,
    refetchOnWindowFocus: "always",
  });
  const veiculos = prepararMapa(consulta.data ?? []);
  const abrirVeiculo = (v: Veiculo) => navegar("/ordens-servico?os=" + v.osId);
  const abrirNovaOS = () => navegar("/ordens-servico?nova=1");
  const [filtro, setFiltro] = useState("todos"),
    [busca, setBusca] = useState(""),
    [modo, setModo] = useState<"quadro" | "lista">("quadro");
  const [tecnico, setTecnico] = useState("todos"),
    [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [etapaCelular, setEtapaCelular] = useState("todas");
  const atrasados = veiculos.filter((v) => v.atrasado).length;
  const prontos = veiculos.filter((v) => v.etapa === "pronto").length;
  const lista = veiculos.filter(
    (v) =>
      (filtro === "todos" ||
        (filtro === "atrasados" && v.atrasado) ||
        (filtro === "hoje" && v.hoje) ||
        (filtro === "parados" && !!v.motivo) ||
        (filtro === "sem-prazo" && v.semPrazo)) &&
      (tecnico === "todos" || v.tecnico === tecnico) &&
      (etapaCelular === "todas" || v.etapa === etapaCelular) &&
      normalizar(
        `${v.id} ${v.placa} ${v.modelo} ${v.cliente} ${v.motivo} ${v.tecnico}`,
      ).includes(normalizar(busca)),
  );
  return (
    <div className="mapa-real">
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" /> VISÃO GERAL DA OPERAÇÃO
          </div>
          <h1>
            Sua oficina, em movimento<span>.</span>
          </h1>
          <p>Menos tempo procurando. Mais tempo fazendo acontecer.</p>
        </div>
        <button className="botao-primario" onClick={abrirNovaOS}>
          <Plus size={20} /> Nova ordem de serviço
          <ArrowUpRight size={18} />
        </button>
      </div>
      {acesso.demo && (
        <p className="aviso-cliente">
          Demonstração · O mapa acompanha as OS cadastradas neste navegador.
        </p>
      )}
      <div className="mapa-atualizacao">
        <span>
          {consulta.isPending
            ? "Carregando OS…"
            : consulta.isError
              ? "Falha ao atualizar"
              : "Atualização a cada 30 segundos · " +
                new Date(consulta.dataUpdatedAt).toLocaleTimeString("pt-BR")}
        </span>
        <button
          className="botao-secundario"
          disabled={consulta.isFetching}
          onClick={() => void consulta.refetch()}
        >
          Atualizar mapa
        </button>
      </div>
      {consulta.isError && (
        <p role="alert" className="erro-formulario">
          {erroPublico(consulta.error)}{" "}
          {consulta.data ? "Exibindo a última atualização disponível." : ""}
        </p>
      )}
      {consulta.isPending && (
        <p role="status">Buscando veículos e pendências…</p>
      )}
      {consulta.data && (
        <>
          <section className="indicadores" aria-label="Resumo da oficina">
            <div className="indicador indicador-destaque">
              <div className="indicador-topo">
                <span>Veículos na oficina</span>
                <CarFront size={20} />
              </div>
              <div className="indicador-valor">
                {String(
                  new Set(
                    veiculos.filter((v) => v.presente).map((v) => v.veiculoId),
                  ).size,
                ).padStart(2, "0")}
                <span className="mini-barras" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="indicador-rodape">
                <span className="ponto-status" /> Seu pátio, em uma só visão
              </div>
            </div>
            <div className="indicador">
              <div className="indicador-topo">
                <span>Em execução</span>
                <span className="icone-suave azul">
                  <Wrench size={18} />
                </span>
              </div>
              <div className="indicador-valor">
                {String(
                  veiculos.filter((v) => v.etapa === "execucao").length,
                ).padStart(2, "0")}
                <small>serviços em andamento</small>
              </div>
              <div className="indicador-rodape">
                <span className="ponto-azul" /> A equipe está a todo vapor
              </div>
            </div>
            <button
              className={`indicador indicador-interativo ${filtro === "atrasados" ? "selecionado" : ""}`}
              onClick={() =>
                setFiltro(filtro === "atrasados" ? "todos" : "atrasados")
              }
              aria-pressed={filtro === "atrasados"}
            >
              <div className="indicador-topo">
                <span>Precisam de atenção</span>
                <span className="icone-suave laranja">
                  <Timer size={19} />
                </span>
              </div>
              <div className="indicador-valor">
                {String(atrasados).padStart(2, "0")}
                <small>com prazo vencido</small>
              </div>
              <div className="indicador-rodape texto-laranja">
                Ver pendências
                <ArrowRight size={15} />
              </div>
            </button>
            <div className="indicador">
              <div className="indicador-topo">
                <span>Prontos para entregar</span>
                <span className="icone-suave verde">
                  <CheckCheck size={20} />
                </span>
              </div>
              <div className="indicador-valor">
                {String(prontos).padStart(2, "0")}
                <small>
                  {prontos === 1 ? "cliente vai sorrir" : "clientes vão sorrir"}
                </small>
              </div>
              <div className="indicador-rodape">
                <span className="ponto-verde" /> Tudo conferido. Bora entregar!
              </div>
            </div>
          </section>
          <section className="secao-mapa" aria-labelledby="titulo-mapa">
            <div className="mapa-titulo">
              <div className="flex items-center gap-3">
                <h2 id="titulo-mapa">Mapa da oficina</h2>
                <span className="contagem-total">
                  {lista.length} de {veiculos.length} OS
                </span>
              </div>
              <div
                className="modos-visualizacao"
                aria-label="Visualização do mapa"
              >
                <button
                  aria-label="Visualizar em quadro"
                  onClick={() => setModo("quadro")}
                  className={modo === "quadro" ? "ativo" : ""}
                  aria-pressed={modo === "quadro"}
                >
                  <LayoutGrid size={15} />
                  <span>Quadro</span>
                </button>
                <button
                  aria-label="Visualizar em lista"
                  onClick={() => setModo("lista")}
                  className={modo === "lista" ? "ativo" : ""}
                  aria-pressed={modo === "lista"}
                >
                  <List size={17} />
                  <span>Lista</span>
                </button>
              </div>
            </div>
            <div className="barra-mapa">
              <div className="abas-filtro" aria-label="Filtrar veículos">
                {[
                  {
                    id: "todos",
                    nome: "Todas as OS",
                    quantidade: veiculos.length,
                  },
                  {
                    id: "hoje",
                    nome: "Entrega hoje",
                    quantidade: veiculos.filter((v) =>
                      v.prazo.startsWith("Hoje"),
                    ).length,
                  },
                  { id: "atrasados", nome: "Atrasadas", quantidade: atrasados },
                  {
                    id: "parados",
                    nome: "Paradas",
                    quantidade: veiculos.filter((v) => v.motivo).length,
                  },
                  {
                    id: "sem-prazo",
                    nome: "Sem previsão",
                    quantidade: veiculos.filter((v) => v.semPrazo).length,
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setFiltro(item.id)}
                    className={filtro === item.id ? "ativo" : ""}
                    aria-pressed={filtro === item.id}
                  >
                    {item.nome}
                    <span>{item.quantidade}</span>
                  </button>
                ))}
              </div>
              <div className="ferramentas-mapa">
                <label className="campo-busca">
                  <Search size={16} />
                  <input
                    placeholder="Buscar veículo..."
                    aria-label="Buscar veículo no mapa"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                  {busca && (
                    <button
                      onClick={() => setBusca("")}
                      aria-label="Limpar busca"
                    >
                      ×
                    </button>
                  )}
                </label>
                <button
                  className={`botao-filtro ${mostrarFiltros ? "ativo" : ""}`}
                  onClick={() => setMostrarFiltros(!mostrarFiltros)}
                  aria-expanded={mostrarFiltros}
                  aria-label="Filtrar por responsável"
                >
                  <SlidersHorizontal size={17} />
                  <span>Filtros</span>
                </button>
              </div>
            </div>
            {mostrarFiltros && (
              <div className="filtro-expandido">
                <label htmlFor="tecnico">Responsável</label>
                <select
                  id="tecnico"
                  value={tecnico}
                  onChange={(e) => setTecnico(e.target.value)}
                >
                  <option value="todos">Toda a equipe</option>
                  {[...new Set(veiculos.map((v) => v.tecnico))].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <button
                  className="link-texto"
                  onClick={() => {
                    setTecnico("todos");
                    setEtapaCelular("todas");
                    setBusca("");
                    setFiltro("todos");
                  }}
                >
                  Limpar filtros
                </button>
              </div>
            )}
            <div
              className="etapas-celular etapas-mapa-real"
              aria-label="Etapa do serviço"
            >
              <button
                className={etapaCelular === "todas" ? "ativo" : ""}
                aria-pressed={etapaCelular === "todas"}
                onClick={() => setEtapaCelular("todas")}
              >
                Todas
              </button>
              {etapas.map((e) => (
                <button
                  key={e.id}
                  className={etapaCelular === e.id ? "ativo" : ""}
                  aria-pressed={etapaCelular === e.id}
                  onClick={() => setEtapaCelular(e.id)}
                >
                  {e.nome}
                </button>
              ))}
            </div>
            {lista.length === 0 ? (
              <div className="estado-vazio">
                <Search size={30} />
                <h3>
                  {veiculos.length
                    ? "Nenhuma OS corresponde aos filtros"
                    : "Nenhuma OS aberta no momento"}
                </h3>
                <p>
                  {veiculos.length
                    ? "Tente outro nome, placa ou filtro."
                    : "Abra uma ordem de serviço para começar. Entregues e canceladas continuam no histórico de serviços."}
                </p>
                <button
                  className="botao-secundario"
                  onClick={() => {
                    setBusca("");
                    setFiltro("todos");
                    setTecnico("todos");
                    setEtapaCelular("todas");
                  }}
                >
                  Limpar busca e filtros
                </button>
              </div>
            ) : modo === "quadro" ? (
              <div className="quadro">
                {etapas
                  .filter(
                    (e) => etapaCelular === "todas" || e.id === etapaCelular,
                  )
                  .map((etapa) => (
                    <section
                      key={etapa.id}
                      className={`coluna-etapa ${etapa.id} ${etapaCelular !== "todas" && etapaCelular !== etapa.id ? "ocultar-celular" : ""}`}
                      aria-label={etapa.nome}
                    >
                      <div className="coluna-cabecalho">
                        <div>
                          <span className="ponto-etapa" />
                          <h3>{etapa.nome}</h3>
                          <span className="quantidade-etapa">
                            {lista.filter((v) => v.etapa === etapa.id).length}
                          </span>
                        </div>
                        <p>{etapa.descricao}</p>
                      </div>
                      <div className="coluna-cartoes">
                        {lista
                          .filter((v) => v.etapa === etapa.id)
                          .map((v) => (
                            <CartaoVeiculo
                              key={v.id}
                              veiculo={v}
                              abrir={() => abrirVeiculo(v)}
                            />
                          ))}
                        {!lista.some((v) => v.etapa === etapa.id) && (
                          <div className="etapa-vazia">
                            <CheckCheck size={22} />
                            <p>Nenhum veículo nesta etapa.</p>
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
              </div>
            ) : (
              <div className="lista-veiculos">
                {lista
                  .filter(
                    (v) => etapaCelular === "todas" || v.etapa === etapaCelular,
                  )
                  .map((v) => (
                    <button
                      key={v.id}
                      onClick={() => abrirVeiculo(v)}
                      className="linha-veiculo"
                    >
                      <span className="icone-veiculo">
                        <CarFront size={23} />
                      </span>
                      <span>
                        <strong>{v.modelo}</strong>
                        <small>
                          OS #{v.id} · {v.cliente}
                        </small>
                        <small>Responsável: {v.tecnico}</small>
                        {v.motivo && (
                          <small className="texto-laranja">{v.motivo}</small>
                        )}
                      </span>
                      <span className="placa">{v.placa}</span>
                      <span className={`etiqueta-etapa ${v.etapa}`}>
                        {etapas.find((e) => e.id === v.etapa)?.nome}
                      </span>
                      <span className={v.atrasado ? "texto-laranja" : ""}>
                        {v.prazo}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
              </div>
            )}
          </section>
          <p className="mapa-nota">
            OS com paradas abertas ficam em Paradas, preservando a situação no
            cartão. Clique no veículo para atualizar o atendimento. Prazos no
            horário de São Paulo.
          </p>
          <div className="faixa-dia">
            <div className="faixa-dia-icone">
              <CalendarDays size={22} />
            </div>
            <div>
              <strong>Uma oficina organizada entrega mais.</strong>
              <p>
                Confira prazos, resolva pendências e mantenha seu cliente por
                perto.
              </p>
            </div>
            <Link to="/ordens-servico">
              Ver todos os serviços
              <ArrowUpRight size={17} />
            </Link>
            <MapPin className="decoracao-faixa" size={90} strokeWidth={0.7} />
          </div>
        </>
      )}
    </div>
  );
}
