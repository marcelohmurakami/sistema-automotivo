import { IconeTipoServico } from "../components/TipoServico";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { IndicadorEntrega, LegendaEntrega } from "../components/PrazoEntrega";
import { useAgora } from "../lib/useAgora";
import {
  lerOrdenacoesMapa,
  salvarOrdenacoesMapa,
  ordenarVeiculosMapa,
  type OrdenacaoMapa,
} from "../lib/ordenacaoMapa";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  CarFront,
  ClipboardList,
  ClipboardCheck,
  UserRound,
  CheckCheck,
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
  Pause,
  Play,
  Search,
  Timer,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import {
  etapasMapa as etapas,
  filtrarVeiculosMapa,
  prepararMapa,
  motivosParada,
} from "../lib/mapaOficina";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  consultarMapaOficina,
  moverOSNoMapa,
  executarAcaoNoMapa,
  type AcaoRapidaMapa,
} from "../services/mapaOficina";
import { Dialogo } from "../components/Dialogo";
import { PecasNaEntrega } from "../components/PecasNaEntrega";
import { faltaOrigemPeca } from "../lib/origemPecas";
import { OrdenarMapa } from "../components/OrdenarMapa";
import { situacoesOS } from "../services/ordensServico";
import { destinoNoMapa, type DirecaoMapa } from "../lib/movimentacaoMapa";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import {
  devePerguntarPagamentoOS,
  usePagamentoAposRegistro,
} from "../lib/pagamentoAposRegistro";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import "./MapaOficina.css";
import type { OrdemNoMapa, VeiculoMapa as Veiculo } from "../lib/mapaOficina";

function EntradaVeiculo({ veiculo }: { veiculo: Veiculo }) {
  return veiculo.entrada ? (
    <span className="mapa-entrada" title={`Entrada em ${veiculo.entradaTexto}`}>
      Entrada{" "}
      <time dateTime={veiculo.entrada} aria-label={veiculo.entradaTexto}>
        {veiculo.entradaTexto.replace(/\/\d{4}/, "").replace(" às ", " · ")}
      </time>
    </span>
  ) : null;
}

const AcoesEtapaMapa = memo(function AcoesEtapaMapa({ veiculo }: { veiculo: Veiculo }) {
  const perguntarPagamento = usePagamentoAposRegistro();
  const acesso = useAcesso(),
    qc = useQueryClient();
  const [parando, setParando] = useState(false);
  const [conferirPecas, setConferirPecas] = useState(false);
  const [detalhes, setDetalhes] = useState("");
  const trava = useRef(false);
  const chaveMapa = ["mapa-oficina", acesso.demo, acesso.oficina!.id];
  const movimento = useMutation({
    onMutate: () => qc.cancelQueries({ queryKey: chaveMapa, exact: true }),
    mutationFn: ({
      acao,
      revisao,
    }: {
      acao: DirecaoMapa | AcaoRapidaMapa;
      revisao: number;
    }) =>
      typeof acao === "string"
        ? moverOSNoMapa(acesso.demo, acesso.oficina!.id, veiculo.osId, revisao, acao)
        : executarAcaoNoMapa(
            acesso.demo,
            acesso.oficina!.id,
            veiculo.osId,
            revisao,
            acao,
          ),
    onError: (erro) => {
      if (faltaOrigemPeca(erro)) setConferirPecas(true);
    },
    onSuccess: async (atual) => {
      // Uma leitura iniciada antes da gravação não pode restaurar a revisão antiga.
      await qc.cancelQueries({ queryKey: chaveMapa, exact: true });
      setParando(false);
      if (devePerguntarPagamentoOS(veiculo.situacao, atual.situacao)) {
        perguntarPagamento({ tipo: "os", id: veiculo.osId, contexto: "entrega" });
      }
      qc.setQueryData<OrdemNoMapa[]>(chaveMapa, (ordens) =>
        ordens?.map((o) =>
          o.id === veiculo.osId && atual.revisao >= o.revisao ? { ...o, ...atual } : o,
        ),
      );
    },
    onSettled: () => {
      // A RPC já confirmou a etapa. A reconciliação continua em segundo plano,
      // inclusive após erro/conflito, sem travar a próxima ação confirmada.
      void atualizarIntegracoes(qc, []).catch(() => {
        /* As consultas mantêm seus próprios estados de erro e nova tentativa. */
      });
    },
  });
  const mudar = async (
    acao: DirecaoMapa | AcaoRapidaMapa,
    revisao = veiculo.revisao,
  ) => {
    if (trava.current) return;
    trava.current = true;
    try {
      await movimento.mutateAsync({ acao, revisao });
    } catch {
      /* O erro fica visível no próprio cartão. */
    } finally {
      trava.current = false;
    }
  };
  const conferencia = veiculo.situacao === "quality_check";
  const erro =
    movimento.isError &&
    (faltaOrigemPeca(movimento.error) ? (
      <button
        className="mapa-avancar mapa-acao-inteira"
        onClick={() => setConferirPecas(true)}
      >
        Conferir peças e entregar
      </button>
    ) : (
      <p className="mapa-movimento-erro" role="alert">
        {erroPublico(movimento.error)}
      </p>
    ));
  return (
    <>
      <div
        className="mapa-movimentacao"
        aria-label={`Mudar etapa da OS ${veiculo.id}`}
        aria-busy={movimento.isPending}
      >
        {veiculo.motivo ? (
          <button
            className="mapa-avancar mapa-acao-inteira"
            disabled={movimento.isPending}
            aria-label={`Retomar serviço da OS ${veiculo.id}`}
            title="Resolve as pendências abertas e volta à etapa anterior à parada."
            onClick={() => void mudar({ acao: "retomar" })}
          >
            <Play size={16} aria-hidden="true" />
            {movimento.isPending ? "Salvando…" : "Retomar serviço"}
          </button>
        ) : (
          <>
            {conferencia && (
              <button
                className="mapa-avancar mapa-acao-inteira"
                disabled={movimento.isPending}
                aria-label={`Concluir serviço da OS ${veiculo.id}`}
                title="Conclui os itens da OS e deixa o veículo pronto para entrega."
                onClick={() => void mudar({ acao: "concluir" })}
              >
                <CheckCheck size={16} aria-hidden="true" />
                {movimento.isPending ? "Salvando…" : "Concluir serviço"}
              </button>
            )}
            {(["voltar", "avancar"] as const)
              .filter((d) => !(conferencia && d === "avancar"))
              .map((direcao) => {
                const destino = destinoNoMapa(veiculo.situacao, direcao);
                const texto =
                  direcao === "voltar"
                    ? "Voltar"
                    : destino === "delivered"
                      ? "Entregar"
                      : "Avançar";
                const descricao = destino
                  ? `${texto} OS ${veiculo.id} para ${situacoesOS[destino]}`
                  : "Primeira etapa";
                return (
                  <button
                    key={direcao}
                    className={direcao === "avancar" ? "mapa-avancar" : undefined}
                    disabled={movimento.isPending || !destino}
                    title={
                      destino === "delivered"
                        ? "Registrar entrega e finalizar a OS, com baixa de estoque e atualização do financeiro."
                        : descricao
                    }
                    aria-label={descricao}
                    onClick={() => void mudar(direcao)}
                  >
                    {direcao === "voltar" && <ArrowLeft size={16} aria-hidden="true" />}
                    {movimento.isPending && movimento.variables?.acao === direcao
                      ? "Salvando…"
                      : texto}
                    {direcao === "avancar" && (
                      <ArrowRight size={16} aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            {veiculo.situacao !== "ready" && (
              <button
                className={`mapa-parar ${conferencia ? "" : "mapa-acao-inteira"}`}
                disabled={movimento.isPending}
                aria-label={`Parar serviço da OS ${veiculo.id}`}
                onClick={() => {
                  movimento.reset();
                  setDetalhes("");
                  setParando(true);
                }}
              >
                <Pause size={16} aria-hidden="true" />
                Parar serviço
              </button>
            )}
          </>
        )}
        {!parando && erro}
      </div>
      {conferirPecas && (
        <PecasNaEntrega
          osId={veiculo.osId}
          fechar={() => setConferirPecas(false)}
          continuar={async (atual) => {
            if (atual.situacao !== "ready")
              throw new Error(
                "A situação da OS mudou. Confira o atendimento antes de entregar.",
              );
            await movimento.mutateAsync({ acao: "avancar", revisao: atual.revisao });
            setConferirPecas(false);
          }}
        />
      )}
      {parando && (
        <Dialogo
          aberto={parando}
          titulo={`Parar serviço · OS #${veiculo.id}`}
          classe="mapa-dialogo-parada"
          fechar={() => {
            if (!trava.current) setParando(false);
          }}
        >
          <p>Toque no motivo para colocar o serviço em Paradas.</p>
          <label className="mapa-detalhes-parada">
            Detalhes (opcional)
            <textarea
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              maxLength={2000}
              rows={2}
              disabled={movimento.isPending}
              placeholder="Ex.: aguardando a chegada do filtro"
            />
          </label>
          <div className="mapa-motivos-parada" aria-busy={movimento.isPending}>
            {Object.entries(motivosParada).map(([motivo, nome]) => (
              <button
                key={motivo}
                className="botao-secundario"
                disabled={movimento.isPending}
                onClick={() => void mudar({ acao: "parar", motivo, detalhes })}
              >
                <Pause size={16} aria-hidden="true" />
                {nome}
              </button>
            ))}
          </div>
          {movimento.isPending && <p role="status">Registrando parada…</p>}
          {erro}
        </Dialogo>
      )}
    </>
  );
});

const CartaoVeiculo = memo(function CartaoVeiculo({
  veiculo,
  abrir,
}: {
  veiculo: Veiculo;
  abrir: (veiculo: Veiculo) => void;
}) {
  return (
    <article
      className={`cartao-veiculo ${veiculo.etapa === "pronto" ? "cartao-pronto" : ""}`}
      data-prazo={veiculo.prazoEntrega.tipo}
    >
      <button
        className="cartao-veiculo-conteudo"
        onClick={() => abrir(veiculo)}
        aria-label={`Ver ${veiculo.modelo}, placa ${veiculo.placa}, OS ${veiculo.id}${veiculo.entrada ? `, entrada em ${veiculo.entradaTexto}` : ""}, ${veiculo.prazoEntrega.rotulo}, ${veiculo.prazoEntrega.data}`}
      >
        <span className={`mapa-etapa-cartao etiqueta-etapa ${veiculo.etapa}`}>
          {etapas.find((e) => e.id === veiculo.etapa)?.nome}
        </span>
        <div className="cartao-modelo">
          <div>
            <h3>{veiculo.modelo}</h3>
            <div className="cartao-topo">
              {veiculo.placa && veiculo.placa !== "Sem placa" && (
                <span className="placa">{veiculo.placa}</span>
              )}
              <span className="numero-os">
                OS #{veiculo.id}
                <ChevronRight size={14} />
              </span>
            </div>
          </div>
          <IconeTipoServico tipo={veiculo.tipoServico} />
        </div>
        <p className="cliente-cartao">
          <UserRound size={16} aria-hidden="true" />
          {veiculo.cliente}
        </p>
        <p className="mapa-responsavel">Responsável: {veiculo.tecnico}</p>
        <EntradaVeiculo veiculo={veiculo} />
        {veiculo.motivo && (
          <div className="motivo-parada">
            <TriangleAlert size={18} aria-hidden="true" />
            <span>
              <strong>Pendência para retomar</strong>
              {veiculo.motivo}
            </span>
          </div>
        )}
        <div className="cartao-rodape">
          <IndicadorEntrega prazo={veiculo.prazoEntrega} />
          <span
            className={`avatar-tecnico ${veiculo.cor}`}
            title={`Responsável: ${veiculo.tecnico}`}
          >
            {veiculo.iniciais}
          </span>
        </div>
      </button>
      <AcoesEtapaMapa veiculo={veiculo} />
    </article>
  );
});

const LinhaVeiculo = memo(function LinhaVeiculo({
  veiculo: v,
  abrir,
}: {
  veiculo: Veiculo;
  abrir: (veiculo: Veiculo) => void;
}) {
  return (
    <article className="mapa-item-lista">
      <button
        onClick={() => abrir(v)}
        className="linha-veiculo"
        data-prazo={v.prazoEntrega.tipo}
      >
        <span className="icone-veiculo">
          <IconeTipoServico tipo={v.tipoServico} />
        </span>
        <span>
          <strong>{v.modelo}</strong>
          <small>
            OS #{v.id} · {v.cliente}
          </small>
          <small>Responsável: {v.tecnico}</small>
          <EntradaVeiculo veiculo={v} />
          {v.motivo && <small className="texto-laranja">{v.motivo}</small>}
        </span>
        <span className="placa">{v.placa}</span>
        <span className={`etiqueta-etapa ${v.etapa}`}>
          {etapas.find((e) => e.id === v.etapa)?.nome}
        </span>
        <IndicadorEntrega prazo={v.prazoEntrega} />
        <ChevronRight size={17} />
      </button>
      <AcoesEtapaMapa veiculo={v} />
    </article>
  );
});

export function MapaOficina() {
  const acesso = useAcesso();
  const chaveOrdenacao = `patio_mapa_ordenacao_v1:${acesso.demo ? "demo" : acesso.usuario}:${acesso.oficina!.id}`;
  return <ConteudoMapaOficina key={chaveOrdenacao} chaveOrdenacao={chaveOrdenacao} />;
}

function ConteudoMapaOficina({ chaveOrdenacao }: { chaveOrdenacao: string }) {
  const agora = useAgora();
  const acesso = useAcesso(),
    navegar = useNavigate();
  const consulta = useQuery({
    queryKey: ["mapa-oficina", acesso.demo, acesso.oficina!.id],
    queryFn: ({ signal }) =>
      consultarMapaOficina(acesso.demo, acesso.oficina!.id, signal),
    refetchInterval: 30000,
    refetchOnWindowFocus: "always",
  });
  const veiculos = useMemo(
    () => prepararMapa(consulta.data ?? [], agora),
    [consulta.data, agora],
  );
  const abrirVeiculo = useCallback(
    (v: Veiculo) => navegar("/ordens-servico?os=" + v.osId),
    [navegar],
  );
  const abrirNovaOS = () => navegar("/ordens-servico?nova=1");
  const [ordenacoes, setOrdenacoes] = useState(() => lerOrdenacoesMapa(chaveOrdenacao));
  const mudarOrdenacao = (secao: string, ordem: OrdenacaoMapa) => {
    const preferencias = { ...ordenacoes, [secao]: ordem };
    setOrdenacoes(preferencias);
    salvarOrdenacoesMapa(chaveOrdenacao, preferencias);
  };
  const [filtro, setFiltro] = useState("todos"),
    [busca, setBusca] = useState(""),
    [modo, setModo] = useState<"quadro" | "lista">("quadro");
  const contagens = useMemo(() => {
    const presentes = new Set<string>();
    const totais = {
      atrasados: 0,
      prontos: 0,
      execucao: 0,
      hoje: 0,
      parados: 0,
      semPrazo: 0,
    };
    for (const v of veiculos) {
      if (v.presente) presentes.add(v.veiculoId || v.osId);
      if (v.atrasado) totais.atrasados++;
      if (v.etapa === "pronto") totais.prontos++;
      if (v.etapa === "execucao") totais.execucao++;
      if (v.hoje) totais.hoje++;
      if (v.motivo) totais.parados++;
      if (v.semPrazo) totais.semPrazo++;
    }
    return { ...totais, presentes: presentes.size };
  }, [veiculos]);
  const { atrasados, prontos } = contagens;
  const lista = useMemo(
    () => filtrarVeiculosMapa(veiculos, filtro, busca),
    [veiculos, filtro, busca],
  );
  const mapaFiltrado = filtro !== "todos" || busca.trim() !== "";
  const porEtapa = useMemo(() => {
    const grupos = new Map<string, Veiculo[]>();
    for (const v of lista) {
      const grupo = grupos.get(v.etapa) ?? [];
      grupo.push(v);
      grupos.set(v.etapa, grupo);
    }
    if (modo === "quadro") {
      for (const [etapa, grupo] of grupos)
        grupos.set(etapa, ordenarVeiculosMapa(grupo, ordenacoes[etapa] ?? "entrega"));
    }
    return grupos;
  }, [lista, ordenacoes, modo]);
  const listaOrdenada = useMemo(
    () =>
      modo === "lista" ? ordenarVeiculosMapa(lista, ordenacoes.lista ?? "entrega") : [],
    [lista, ordenacoes.lista, modo],
  );
  const etapasVisiveis = mapaFiltrado
    ? etapas.filter((etapa) => porEtapa.has(etapa.id))
    : etapas;
  const resumos = [
    {
      filtro: "presentes",
      nome: "Veículos na oficina",
      quantidade: contagens.presentes,
      icone: CarFront,
      detalhe: "Com entrada registrada",
      tom: "neutro",
    },
    {
      filtro: "execucao",
      nome: "Em execução",
      quantidade: contagens.execucao,
      icone: Wrench,
      detalhe: "Serviços em andamento",
      tom: "andamento",
    },
    {
      filtro: "atrasados",
      nome: "Entregas atrasadas",
      quantidade: atrasados,
      icone: Timer,
      detalhe: atrasados ? "Priorize estes atendimentos" : "Nenhuma entrega atrasada",
      tom: atrasados > 0 ? "urgente" : "neutro",
    },
    {
      filtro: "prontos",
      nome: "Prontos para entregar",
      quantidade: prontos,
      icone: CheckCheck,
      detalhe: "Aguardando retirada",
      tom: "concluido",
    },
  ];
  return (
    <div className={`mapa-real${veiculos.length > 80 ? " mapa-volumoso" : ""}`}>
      <div className="titulo-pagina">
        <div>
          <div className="sobretitulo">
            <span className="linha-verde" /> VISÃO GERAL DA OPERAÇÃO
          </div>
          <h1>
            Mapa da oficina<span>.</span>
          </h1>
          <p>Veja os carros, os prazos e o que precisa de atenção.</p>
        </div>
        <button className="botao-primario" onClick={abrirNovaOS}>
          <Plus size={20} /> Nova ordem de serviço
          <ArrowUpRight size={18} />
        </button>
      </div>
      {acesso.demo && (
        <p className="nota-demo">
          Demonstração · O mapa acompanha as OS cadastradas neste navegador.
        </p>
      )}
      {consulta.isError && (
        <p role="alert" className="erro-formulario">
          {erroPublico(consulta.error)}{" "}
          {consulta.data ? "Exibindo a última atualização disponível." : ""}
        </p>
      )}
      {consulta.isPending && <p role="status">Buscando veículos e pendências…</p>}
      {consulta.data && (
        <>
          <section className="mapa-visao-rapida" aria-label="Resumo da oficina">
            {resumos.map((item) => (
              <button
                key={item.filtro}
                type="button"
                className="mapa-resumo-acao"
                data-tom={item.tom}
                aria-pressed={filtro === item.filtro}
                onClick={() =>
                  setFiltro(filtro === item.filtro ? "todos" : item.filtro)
                }
              >
                <span className="mapa-resumo-icone">
                  <item.icone size={22} aria-hidden="true" />
                </span>
                <span className="mapa-resumo-rotulo">{item.nome}</span>
                <strong>{String(item.quantidade).padStart(2, "0")}</strong>
                <span className="mapa-resumo-ajuda">{item.detalhe}</span>
                <ArrowUpRight
                  size={15}
                  className="mapa-resumo-seta"
                  aria-hidden="true"
                />
              </button>
            ))}
          </section>
          {resumos.some((item) => item.filtro === filtro) && (
            <div className="mapa-recorte" role="status">
              <span>
                <strong>{resumos.find((item) => item.filtro === filtro)?.nome}</strong>{" "}
                · {lista.length} OS{busca ? " nesta busca" : ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFiltro("todos");
                  setBusca("");
                }}
              >
                Ver todas as OS
              </button>
            </div>
          )}
          <section className="secao-mapa" aria-label="Veículos da oficina">
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
                    quantidade: contagens.hoje,
                  },
                  { id: "atrasados", nome: "Atrasadas", quantidade: atrasados },
                  {
                    id: "parados",
                    nome: "Paradas",
                    quantidade: contagens.parados,
                  },
                  {
                    id: "sem-prazo",
                    nome: "Sem data",
                    quantidade: contagens.semPrazo,
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
                    <button onClick={() => setBusca("")} aria-label="Limpar busca">
                      ×
                    </button>
                  )}
                </label>
                <div
                  className="modos-visualizacao"
                  role="group"
                  aria-label="Visualização do mapa"
                >
                  <button
                    aria-label="Visualizar em quadro"
                    onClick={() => setModo("quadro")}
                    className={modo === "quadro" ? "ativo" : ""}
                    aria-pressed={modo === "quadro"}
                  >
                    <LayoutGrid size={15} aria-hidden="true" />
                    <span>Quadro</span>
                  </button>
                  <button
                    aria-label="Visualizar em lista"
                    onClick={() => setModo("lista")}
                    className={modo === "lista" ? "ativo" : ""}
                    aria-pressed={modo === "lista"}
                  >
                    <List size={17} aria-hidden="true" />
                    <span>Lista</span>
                  </button>
                </div>
              </div>
            </div>
            <LegendaEntrega />
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
                  }}
                >
                  Limpar busca e filtros
                </button>
              </div>
            ) : modo === "quadro" ? (
              <div className={mapaFiltrado ? "quadro quadro-filtrado" : "quadro"}>
                {etapasVisiveis.map((etapa) => (
                  <section
                    key={etapa.id}
                    className={`coluna-etapa ${etapa.id}`}
                    aria-label={etapa.nome}
                  >
                    <div className="coluna-cabecalho">
                      <div>
                        <span className="mapa-icone-etapa" aria-hidden="true">
                          {etapa.id === "recepcao" ? (
                            <ClipboardList size={21} />
                          ) : etapa.id === "aguardando" ? (
                            <Pause size={21} />
                          ) : etapa.id === "execucao" ? (
                            <Wrench size={21} />
                          ) : etapa.id === "conferencia" ? (
                            <ClipboardCheck size={21} />
                          ) : (
                            <CheckCheck size={21} />
                          )}
                        </span>
                        <h3>{etapa.nome}</h3>
                        <span className="quantidade-etapa">
                          {porEtapa.get(etapa.id)?.length ?? 0}
                        </span>
                        <OrdenarMapa
                          secao={etapa.nome}
                          valor={ordenacoes[etapa.id] ?? "entrega"}
                          mudar={(ordem) => mudarOrdenacao(etapa.id, ordem)}
                        />
                      </div>
                      <p>{etapa.descricao}</p>
                    </div>
                    <div className="coluna-cartoes">
                      {(porEtapa.get(etapa.id) ?? []).map((v) => (
                        <CartaoVeiculo key={v.osId} veiculo={v} abrir={abrirVeiculo} />
                      ))}
                      {!porEtapa.has(etapa.id) && (
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
              <>
                <div className="mapa-ordenacao-lista">
                  <OrdenarMapa
                    secao="lista de veículos"
                    valor={ordenacoes.lista ?? "entrega"}
                    mudar={(ordem) => mudarOrdenacao("lista", ordem)}
                  />
                </div>
                <div className="lista-veiculos">
                  {listaOrdenada.map((v) => (
                    <LinhaVeiculo key={v.osId} veiculo={v} abrir={abrirVeiculo} />
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
