import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Navigation, Route } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { supabase } from "../lib/supabase";
import { consultarConfiguracoes } from "../services/gestao";
import { buscarSelecaoServicos } from "../services/painelServicos";
import { consultarClienteDemo } from "../services/clientes";
import { DuracaoVisita } from "./DuracaoVisita";
import {
  conflitoVisita,
  enderecoTexto,
  fimOcupacao,
  horarioVisita,
  inicioOcupacao,
  linkNavegacao,
  logisticaVazia,
  reservaAtiva,
  type LogisticaVisita,
  type VisitaPlanejada,
} from "../lib/logisticaVisitas";
import "./PlanejamentoVisita.css";
type Local = { nome: string; ponto: [number, number] };
type Resultado = {
  confirmar: boolean;
  origens?: Local[];
  destinos?: Local[];
  ida?: { minutos: number; metros: number };
  volta?: { minutos: number; metros: number } | null;
  calculado_em?: string;
};
export function PlanejamentoVisita({
  inicial,
  inicio,
  fim,
  reservas = [],
  destinoSugerido = "",
  clienteId = "",
  objetoId = "",
  aoProcessar,
  origemEquipe,
  aoAlterarVisita,
  aoDefinirFim,
}: {
  inicial: VisitaPlanejada;
  inicio: string;
  fim: string | null;
  reservas?: VisitaPlanejada[];
  destinoSugerido?: string;
  clienteId?: string;
  objetoId?: string;
  aoProcessar: (ocupado: boolean) => void;
  origemEquipe?: { id: string; origem: string; origem_ponto: [number, number] | null };
  aoAlterarVisita?: (visita: boolean) => void;
  aoDefinirFim?: (fim: string) => void;
}) {
  const acesso = useAcesso();
  const [visita, setVisita] = useState(!!inicial.visita);
  const [logistica, setLogistica] = useState<LogisticaVisita>(() => ({
    ...logisticaVazia(),
    ...(inicial.visita ? { margem_minutos: 0 } : {}),
    ...inicial.logistica,
  }));
  const [minutos, setMinutos] = useState(inicial.deslocamento_minutos || 0);
  const [retornar, setRetornar] = useState(!!inicial.logistica?.retorno_minutos);
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  const [locais, setLocais] = useState<{ origens: Local[]; destinos: Local[] } | null>(
    null,
  );
  const [origemIndice, setOrigemIndice] = useState(0),
    [destinoIndice, setDestinoIndice] = useState(0);
  const geracao = useRef(0);
  const calculoAtual = useRef<AbortController | null>(null);
  const idaInput = useRef<HTMLInputElement>(null);
  const [revisarOrigem, setRevisarOrigem] = useState(false);
  const [origemAplicada, setOrigemAplicada] = useState<typeof origemEquipe>();
  if (visita && origemEquipe?.origem && origemAplicada !== origemEquipe) {
    setOrigemAplicada(origemEquipe);
    setLogistica((l) => {
      if (l.origem === origemEquipe.origem) return l;
      return {
        ...l,
        origem: origemEquipe.origem,
        origem_ponto: origemEquipe.origem_ponto,
        fonte: "manual",
        distancia_metros: undefined,
        retorno_metros: undefined,
        calculado_em: undefined,
      };
    });
    // Ao trocar de equipe, o deslocamento anterior não deve ser confirmado por engano.
    setRevisarOrigem(true);
  }
  useEffect(() => {
    idaInput.current?.setCustomValidity(
      revisarOrigem && visita
        ? "Confira o deslocamento da equipe escolhida: calcule o trajeto ou informe os minutos de ida."
        : "",
    );
  }, [revisarOrigem, visita]);
  useEffect(
    () => () => {
      geracao.current++;
      calculoAtual.current?.abort();
    },
    [],
  );
  const empresa = useQuery({
    queryKey: ["configuracoes-visita", acesso.oficina!.id, acesso.demo],
    queryFn: ({ signal }) =>
      consultarConfiguracoes(acesso.demo, acesso.oficina!.id, signal),
    enabled: visita,
    staleTime: 300_000,
  });
  const enderecoEmpresa = enderecoTexto(empresa.data?.endereco);
  const enderecoCadastro = useQuery({
    queryKey: ["endereco-visita", acesso.oficina!.id, acesso.demo, clienteId, objetoId],
    enabled: visita && !!(clienteId || objetoId),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (objetoId) {
        const objetos = await buscarSelecaoServicos(
          acesso.oficina!.id,
          acesso.demo,
          "objetos",
          "",
          "",
          objetoId,
          signal,
        );
        if (objetos[0]?.dados.endereco) return objetos[0].dados.endereco;
      }
      if (!clienteId) return "";
      if (acesso.demo) return consultarClienteDemo(clienteId)?.endereco || "";
      const r = await supabase!
        .from("clientes")
        .select("endereco")
        .eq("oficina_id", acesso.oficina!.id)
        .eq("id", clienteId)
        .abortSignal(signal)
        .maybeSingle();
      if (r.error) throw r.error;
      return r.data?.endereco || "";
    },
  });
  const destinoCadastro = destinoSugerido || enderecoCadastro.data || "";
  const atual = {
    ...inicial,
    inicio,
    fim,
    visita,
    deslocamento_minutos: minutos,
    logistica,
  };
  const anterior = useMemo(() => {
    const limite = Date.parse(inicio);
    let encontrada: VisitaPlanejada | undefined;
    let ultimoFim = -Infinity;
    for (const reserva of reservas) {
      if (reserva.id === inicial.id || !reservaAtiva(reserva)) continue;
      const termino = fimOcupacao(reserva);
      if (termino <= limite && termino > ultimoFim) {
        encontrada = reserva;
        ultimoFim = termino;
      }
    }
    return encontrada;
  }, [reservas, inicial.id, inicio]);
  const origemAnterior = anterior?.visita
    ? anterior.logistica?.retorno_minutos
      ? anterior.logistica?.origem
      : anterior.logistica?.destino
    : enderecoEmpresa;
  const conflito = conflitoVisita(atual, reservas);
  function alterar(dados: Partial<LogisticaVisita>) {
    setLogistica((l) => ({
      ...l,
      ...dados,
      ...(dados.origem !== undefined ? { origem_ponto: undefined } : {}),
      ...(dados.destino !== undefined ? { destino_ponto: undefined } : {}),
      fonte: "manual",
      calculado_em: undefined,
      distancia_metros: undefined,
      retorno_metros: undefined,
    }));
    setLocais(null);
    setErro("");
  }
  async function calcular() {
    if (calculoAtual.current) return;
    const controller = new AbortController();
    calculoAtual.current = controller;
    const turno = ++geracao.current;
    setOcupado(true);
    aoProcessar(true);
    setErro("");
    try {
      if (acesso.demo)
        throw Error(
          "Na demonstração, informe os minutos manualmente. O cálculo está disponível nas empresas conectadas.",
        );
      if (!supabase) throw Error("Conecte-se ao sistema para calcular o trajeto.");
      const { data, error } = await supabase.functions.invoke("planejar-trajeto", {
        signal: controller.signal,
        body: {
          oficina: acesso.oficina!.id,
          origem: logistica.origem,
          destino: logistica.destino,
          retorno: retornar,
          ...(locais
            ? {
                origem_ponto: locais.origens[origemIndice].ponto,
                destino_ponto: locais.destinos[destinoIndice].ponto,
              }
            : {}),
        },
      });
      if (error) {
        let mensagem =
          "Não foi possível calcular. Tente novamente ou informe os minutos manualmente.";
        if (error.context instanceof Response) {
          try {
            const corpo = await error.context.json();
            if (typeof corpo.erro === "string") mensagem = corpo.erro;
          } catch {
            /* resposta sem JSON */
          }
        }
        throw Error(mensagem);
      }
      if (turno !== geracao.current) return;
      const r = data as Resultado;
      if (r.confirmar && r.origens?.length && r.destinos?.length) {
        setLocais({ origens: r.origens, destinos: r.destinos });
        setOrigemIndice(0);
        setDestinoIndice(0);
      } else if (r.ida) {
        setMinutos(r.ida.minutos);
        setRevisarOrigem(false);
        idaInput.current?.setCustomValidity("");
        setLogistica((l) => ({
          ...l,
          origem: locais?.origens[origemIndice].nome || l.origem,
          destino: locais?.destinos[destinoIndice].nome || l.destino,
          origem_ponto: locais?.origens[origemIndice].ponto || l.origem_ponto,
          destino_ponto: locais?.destinos[destinoIndice].ponto || l.destino_ponto,
          retorno_minutos: r.volta?.minutos || 0,
          distancia_metros: r.ida!.metros,
          retorno_metros: r.volta?.metros || 0,
          calculado_em: r.calculado_em,
          fonte: "openrouteservice",
        }));
        setLocais(null);
      } else throw Error("Trajeto não encontrado. Confira os endereços.");
    } catch (e) {
      if (turno === geracao.current)
        setErro(e instanceof Error ? e.message : "Falha ao calcular trajeto.");
    } finally {
      if (calculoAtual.current === controller) calculoAtual.current = null;
      if (turno === geracao.current) {
        setOcupado(false);
        aoProcessar(false);
      }
    }
  }
  return (
    <section className="planejamento-visita">
      <label className="visita-checkbox">
        <input
          type="checkbox"
          name="visita"
          checked={visita}
          disabled={ocupado}
          onChange={(e) => {
            setVisita(e.target.checked);
            aoAlterarVisita?.(e.target.checked);
          }}
        />
        <strong>Visita ao cliente</strong>
      </label>
      {visita && (
        <fieldset disabled={ocupado}>
          <input type="hidden" name="logistica" value={JSON.stringify(logistica)} />
          {aoDefinirFim && (
            <DuracaoVisita inicio={inicio} fim={fim} alterarFim={aoDefinirFim} />
          )}
          <div className="visita-enderecos">
            <label>
              <span>
                <Navigation size={16} /> Ponto de partida
              </span>
              <input
                required
                maxLength={300}
                minLength={6}
                value={logistica.origem}
                placeholder="Rua, número, cidade e estado"
                onChange={(e) => alterar({ origem: e.target.value })}
              />
            </label>
            <label>
              <span>
                <MapPin size={16} /> Endereço da visita
              </span>
              <input
                required
                maxLength={300}
                minLength={6}
                value={logistica.destino}
                placeholder="Rua, número, cidade e estado"
                onChange={(e) => alterar({ destino: e.target.value })}
              />
            </label>
          </div>
          {revisarOrigem && (
            <p role="status">
              Base da equipe selecionada. Calcule o trajeto ou confirme os minutos de
              ida antes de salvar.
            </p>
          )}
          <div className="visita-atalhos">
            {enderecoEmpresa && (
              <button
                type="button"
                onClick={() => alterar({ origem: enderecoEmpresa })}
              >
                Sair da empresa
              </button>
            )}
            {origemAnterior && anterior && (
              <button type="button" onClick={() => alterar({ origem: origemAnterior })}>
                Sair do atendimento anterior
              </button>
            )}
            {destinoCadastro && (
              <button
                type="button"
                onClick={() => alterar({ destino: destinoCadastro })}
              >
                Usar endereço do cadastro
              </button>
            )}
          </div>
          <label className="visita-checkbox">
            <input
              type="checkbox"
              checked={retornar}
              onChange={(e) => {
                setRetornar(e.target.checked);
                alterar({ retorno_minutos: 0 });
              }}
            />{" "}
            Reservar retorno ao ponto de partida
          </label>
          {locais && (
            <div className="visita-confirmar" role="status">
              <strong>Confira os locais encontrados</strong>
              <label>
                Saída
                <select
                  value={origemIndice}
                  onChange={(e) => setOrigemIndice(Number(e.target.value))}
                >
                  {locais.origens.map((l, i) => (
                    <option key={i} value={i}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Chegada
                <select
                  value={destinoIndice}
                  onChange={(e) => setDestinoIndice(Number(e.target.value))}
                >
                  {locais.destinos.map((l, i) => (
                    <option key={i} value={i}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                Selecione o local correto. Se não estiver na lista, ajuste o endereço
                acima.
              </small>
            </div>
          )}
          <div className="visita-atalhos">
            <button
              type="button"
              className="botao-secundario"
              disabled={
                ocupado ||
                logistica.origem.trim().length < 6 ||
                logistica.destino.trim().length < 6
              }
              onClick={() => void calcular()}
            >
              <Route size={17} />
              {ocupado
                ? "Calculando…"
                : locais
                  ? "Confirmar locais e calcular"
                  : "Calcular trajeto"}
            </button>
            <small>
              Por carro · consulta ao openrouteservice · sem trânsito em tempo real
            </small>
          </div>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <div className="visita-tempos">
            <label>
              Ida (min)
              <input
                name="deslocamento_minutos"
                ref={idaInput}
                type="number"
                min={0}
                max={720}
                step={1}
                required
                value={minutos}
                onChange={(e) => {
                  setRevisarOrigem(false);
                  e.currentTarget.setCustomValidity("");
                  setMinutos(Number(e.target.value));
                  alterar({});
                }}
              />
            </label>
            <label>
              Margem de segurança (min)
              <input
                type="number"
                min={0}
                max={180}
                step={1}
                required
                value={logistica.margem_minutos}
                onChange={(e) =>
                  setLogistica((l) => ({
                    ...l,
                    margem_minutos: Number(e.target.value),
                  }))
                }
              />
            </label>
            {retornar && (
              <label>
                Retorno (min)
                <input
                  type="number"
                  min={1}
                  max={720}
                  step={1}
                  required
                  value={logistica.retorno_minutos || ""}
                  onChange={(e) => alterar({ retorno_minutos: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
          {logistica.fonte === "openrouteservice" && (
            <small>
              Trajeto calculado:{" "}
              {((logistica.distancia_metros || 0) / 1000).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}{" "}
              km de ida
              {retornar
                ? ` · ${((logistica.retorno_metros || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km de volta`
                : ""}
              . Dados:{" "}
              <a href="https://openrouteservice.org/" target="_blank" rel="noreferrer">
                openrouteservice
              </a>{" "}
              /{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap
              </a>
              .
            </small>
          )}
          {inicio && (
            <div className="visita-resumo" aria-live="polite">
              <span>
                Sair até <strong>{horarioVisita(inicioOcupacao(atual))}</strong>
              </span>
              <span>
                Atendimento <strong>{horarioVisita(Date.parse(inicio))}</strong>
              </span>
              <span>
                Equipe livre{" "}
                <strong>
                  {fim ? horarioVisita(fimOcupacao(atual)) : "Informe o término"}
                </strong>
              </span>
            </div>
          )}
          {!fim && (
            <p role="status">
              {aoDefinirFim
                ? "Escolha a duração acima ou preencha o término previsto para reservar o horário da equipe."
                : "Informe o término da visita para reservar a agenda corretamente."}
            </p>
          )}
          {conflito && (
            <p role="alert" className="erro-formulario">
              Conflito com outro atendimento:{" "}
              {horarioVisita(Date.parse(conflito.inicio))}. Considere a ida, a margem e
              o retorno.
            </p>
          )}
          {logistica.origem && logistica.destino && (
            <a
              href={linkNavegacao(logistica.origem, logistica.destino)}
              target="_blank"
              rel="noreferrer"
            >
              Abrir navegação ↗
            </a>
          )}
        </fieldset>
      )}
    </section>
  );
}
