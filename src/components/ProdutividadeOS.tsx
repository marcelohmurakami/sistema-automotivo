import { novoId } from "../lib/uuid.ts";
import { dinheiro } from "../lib/formatacao";
import { SecaoRecolhivel } from "./SecaoRecolhivel";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CarFront } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";

import {
  consultarProdutividade,
  operarProdutividade,
  tokenPublico,
  type Vistoria,
} from "../services/produtividade";
import type { OrdemServico } from "../services/ordensServico";
import "../pages/Produtividade.css";
export function ProdutividadeOS({
  os,
  atualizar,
}: {
  os: OrdemServico;
  atualizar: () => void;
}) {
  const chaves = useRef<Record<string, string>>({});
  const operando = useRef(false);
  const chaveAcao = (acao: string) => (chaves.current[acao] ??= novoId());
  const a = useAcesso(),
    cache = useQueryClient(),
    nav = useNavigate();
  const [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [link, setLink] = useState("");
  const q = useQuery({
    queryKey: ["produtividade", a.oficina!.id, os.id],
    enabled: !a.demo,
    queryFn: ({ signal }) => consultarProdutividade(a.oficina!.id, os.id, signal),
    refetchInterval: 15000,
  });
  const encerrada = ["delivered", "cancelled"].includes(os.situacao);
  async function acao(nome: string, dados: Record<string, unknown> = {}) {
    if (operando.current) return null;
    operando.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      const r = await operarProdutividade(a.oficina!.id, nome, {
        os: os.id,
        ...dados,
      });
      await cache.invalidateQueries({ queryKey: ["produtividade"] });
      if (["aplicar_pacote", "aplicar_adicional", "retorno"].includes(nome)) {
        await Promise.all(
          ["os", "mapa-oficina", "financeiro", "financeiro-os", "relatorios"].map((k) =>
            cache.invalidateQueries({ queryKey: [k] }),
          ),
        );
      }
      delete chaves.current[nome];
      atualizar();
      setAviso("Alteração salva.");
      return r;
    } catch (e) {
      setErro(erroPublico(e));
      return null;
    } finally {
      operando.current = false;
      setBusy(false);
    }
  }
  if (a.demo)
    return (
      <p>
        Estes recursos utilizam a conta real para compartilhar horários, aprovações e
        cronômetros com segurança.
      </p>
    );
  if (q.isError) return <p role="alert">{erroPublico(q.error)}</p>;
  if (!q.data) return <p>Carregando produtividade…</p>;
  const d = q.data,
    segundos = d.tempos.reduce((s, t) => s + Number(t.segundos), 0),
    custo = d.tempos.reduce((s, t) => s + Number(t.custo_centavos), 0),
    rodando = d.tempos.some((t) => t.meu && !t.encerrado_em);
  const maoObra = os.itens
    .filter((i) => i.tipo === "service" && i.situacao !== "cancelled")
    .reduce((s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos), 0);
  return (
    <div className="documentos-pagina produtividade">
      {erro && <p role="alert">{erro}</p>}
      {aviso && <p role="status">{aviso}</p>}
      <section className="os-painel">
        <h3>Tempo de trabalho</h3>
        <div className="prod-resumo">
          <div>
            <small>Tempo apontado pela equipe</small>
            <strong>{Math.round(segundos / 60)} min</strong>
            <span>Previsto: {os.minutos_previstos || 0} min</span>
          </div>
          <div>
            <small>Custo estimado do tempo</small>
            <strong>{dinheiro(custo)}</strong>
          </div>
          <div>
            <small>Mão de obra menos tempo</small>
            <strong>{dinheiro(maoObra - custo)}</strong>
          </div>
        </div>
        <p>
          Estimativa operacional, antes de descontos, peças, despesas e impostos. Não
          gera lançamento financeiro. Pause ao interromper o trabalho; apenas um
          cronômetro por pessoa fica ativo.
        </p>
        <button
          disabled={busy || (!rodando && encerrada)}
          onClick={() => void acao(rodando ? "pausar" : "iniciar")}
        >
          {rodando ? "Pausar meu trabalho" : "Iniciar meu trabalho"}
        </button>
        {a.oficina!.perfil !== "staff" && !encerrada && (
          <SecaoRecolhivel titulo="Previsão de tempo e custo da hora">
            <form
              className="documentos-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void acao("previsao_tempo", {
                  minutos: Number(f.get("minutos")),
                  custo_hora_centavos: Math.round(Number(f.get("custo")) * 100),
                });
              }}
            >
              <fieldset disabled={busy}>
                <div className="prod-grade">
                  <label>
                    Tempo previsto (min)
                    <input
                      name="minutos"
                      type="number"
                      min="0"
                      max="100000"
                      required
                      defaultValue={os.minutos_previstos || 0}
                    />
                  </label>
                  <label>
                    Custo da hora (R$)
                    <input
                      name="custo"
                      type="number"
                      min="0"
                      max="100000"
                      step="0.01"
                      required
                      defaultValue={(os.custo_hora_centavos || 0) / 100}
                    />
                  </label>
                </div>
                <button>Salvar previsão</button>
              </fieldset>
              <small>
                A taxa fica registrada ao iniciar cada período. Alterar a taxa afeta os
                próximos períodos.
              </small>
            </form>
          </SecaoRecolhivel>
        )}
        <details>
          <summary>Períodos registrados ({d.tempos.length})</summary>
          {d.tempos.map((t) => (
            <p key={t.id}>
              {t.meu ? "Você" : "Integrante da equipe"} ·{" "}
              {new Date(t.iniciado_em).toLocaleString("pt-BR")} ·{" "}
              {t.encerrado_em ? "Pausado" : "Em andamento"} ·{" "}
              {Math.round(t.segundos / 60)} min
            </p>
          ))}
        </details>
      </section>
      {!encerrada && (
        <SecaoRecolhivel
          titulo="Pacote de serviços"
          descricao="Inclua vários serviços de uma vez"
        >
          <p>
            Inclua vários itens de uma vez. Em OS originada de orçamento, use um
            adicional para obter nova aprovação.
          </p>
          <select
            aria-label="Adicionar pacote à OS"
            disabled={busy || !!os.orcamento_origem_id}
            value=""
            onChange={(e) => {
              if (e.target.value)
                void acao("aplicar_pacote", {
                  pacote: e.target.value,
                  revisao: os.revisao,
                });
            }}
          >
            <option value="">Selecione um pacote</option>
            {d.pacotes
              .filter((p) => p.ativo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        </SecaoRecolhivel>
      )}
      <SecaoRecolhivel
        titulo="Serviços adicionais com aprovação"
        descricao="Orce novos serviços e peça aprovação ao cliente"
      >
        <p>
          Crie o complemento, ajuste os itens e anexe fotos na tela de orçamentos. Envie
          o link existente ao cliente. Os valores originais são preservados.
        </p>
        {!encerrada && (
          <button
            disabled={busy}
            onClick={async () => {
              const r = await acao("criar_adicional", {
                id: chaveAcao("criar_adicional"),
              });
              if (r?.orcamento) nav("/orcamentos?orcamento=" + r.orcamento);
            }}
          >
            Preparar orçamento adicional
          </button>
        )}
        {d.adicionais.map((c) => (
          <article className="prod-registro" key={c.orcamento_id}>
            <strong>
              Adicional #{c.numero} · {dinheiro(c.total_centavos)}
            </strong>
            <p>
              {c.aplicado_em
                ? "Incluído na OS"
                : (
                    {
                      draft: "Rascunho",
                      approved: "Aprovado",
                      awaiting_approval: "Aguardando cliente",
                      declined: "Recusado",
                      cancelled: "Cancelado",
                      expired: "Vencido",
                    } as Record<string, string>
                  )[c.situacao] || c.situacao}
            </p>
            <Link to={"/orcamentos?orcamento=" + c.orcamento_id}>
              Abrir orçamento e fotos
            </Link>
            {c.situacao === "approved" && !c.aplicado_em && !encerrada && (
              <button
                disabled={busy}
                onClick={() => void acao("aplicar_adicional", { id: c.orcamento_id })}
              >
                Incluir adicional aprovado na OS
              </button>
            )}
          </article>
        ))}
      </SecaoRecolhivel>
      <SecaoRecolhivel
        titulo="Vistoria de entrada"
        descricao="Registre avarias, combustível e pertences"
      >
        <p>
          Marque avarias, combustível e pertences. As fotos de entrada são anexadas na
          aba Fotos da OS. A confirmação por link registra ciência do cliente.
        </p>
        <EditorVistoria
          key={String(d.vistoria?.revisao || 0)}
          inicial={d.vistoria}
          bloqueado={busy || encerrada || !!d.vistoria?.confirmado_em}
          salvar={(dados) =>
            void acao("salvar_vistoria", {
              dados,
              revisao: d.vistoria?.revisao,
            })
          }
        />
        {d.vistoria?.confirmado_em ? (
          <p>
            Confirmada por {d.vistoria.nome_confirmacao} em{" "}
            {new Date(d.vistoria.confirmado_em).toLocaleString("pt-BR")}.
          </p>
        ) : (
          d.vistoria &&
          !encerrada && (
            <button
              disabled={busy}
              onClick={async () => {
                const t = await tokenPublico();
                if (await acao("link_vistoria", { hash: t.hash }))
                  setLink(window.location.origin + "/vistoria#" + t.token);
              }}
            >
              Gerar link de confirmação
            </button>
          )
        )}
        {link && (
          <label>
            Link válido por 7 dias
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            {["localhost", "127.0.0.1"].includes(window.location.hostname) && (
              <small>
                Endereço de teste local. Para o cliente abrir em outro aparelho,
                publique o sistema.
              </small>
            )}
            <a href={link} target="_blank" rel="noreferrer">
              Abrir confirmação
            </a>
          </label>
        )}
      </SecaoRecolhivel>
      <SecaoRecolhivel
        titulo="Próxima manutenção"
        descricao="Recomende quando o cliente deve voltar"
      >
        <p>
          Defina o prazo adequado ao veículo. A recomendação aparece no portal do
          cliente quando habilitado.
        </p>
        <form
          className="documentos-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            if (
              await acao("manutencao", {
                id: chaveAcao("manutencao"),
                descricao: f.get("descricao"),
                data: f.get("data"),
                km: f.get("km"),
              })
            )
              form.reset();
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Serviço recomendado
              <input name="descricao" required minLength={2} maxLength={500} />
            </label>
            <div className="prod-grade">
              <label>
                Até a data
                <input type="date" name="data" />
              </label>
              <label>
                Ou na quilometragem
                <input name="km" type="number" min="0" max="2147483647" />
              </label>
            </div>
            <button>Registrar recomendação</button>
          </fieldset>
        </form>
        {d.manutencoes.map((m) => (
          <p key={m.id}>
            {m.descricao} · {m.data_prevista || "Sem data"} ·{" "}
            {m.quilometragem_prevista ?? "—"} km ·{" "}
            {m.concluida_em ? "Concluída" : "Pendente"}
          </p>
        ))}
      </SecaoRecolhivel>
      <SecaoRecolhivel
        titulo="Retorno e garantia"
        descricao="Registre o problema e acompanhe a solução"
      >
        <Link className="botao-secundario" to={"/garantias?os=" + os.id}>
          Registrar ocorrência
        </Link>
        <p>
          Registre os custos e a solução na ocorrência. Se precisar de outra OS para
          executar o retorno, abra abaixo e confira a cobertura antes de cobrar.
        </p>
        {os.situacao === "delivered" && (
          <form
            className="documentos-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const r = await acao("retorno", {
                id: chaveAcao("retorno"),
                motivo: f.get("motivo"),
              });
              if (r?.os) nav("/ordens-servico?os=" + r.os);
            }}
          >
            <fieldset disabled={busy}>
              <label>
                Motivo do retorno
                <textarea name="motivo" required minLength={5} maxLength={2000} />
              </label>
              <button>Abrir OS de retorno</button>
            </fieldset>
          </form>
        )}
        {d.retornos.map((r) => (
          <article key={r.id}>
            <Link to={"/ordens-servico?os=" + r.ordem_retorno_id}>
              Retorno · OS #{r.numero}
            </Link>
            {r.ordem_retorno_id === os.id && (
              <Link to={"/ordens-servico?os=" + r.ordem_original_id}>
                Consultar OS original
              </Link>
            )}
            <p>{r.motivo}</p>
            <p>Valor da OS de retorno: {dinheiro(r.total_centavos)}</p>
          </article>
        ))}
      </SecaoRecolhivel>
    </div>
  );
}
function EditorVistoria({
  inicial,
  bloqueado,
  salvar,
}: {
  inicial: Vistoria | null;
  bloqueado: boolean;
  salvar: (d: Vistoria["dados"]) => void;
}) {
  const [avarias, setAvarias] = useState(inicial?.dados.avarias || []),
    [local, setLocal] = useState("frente");
  return (
    <form
      className="documentos-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        salvar({
          combustivel: Number(f.get("combustivel")),
          pertences: String(f.get("pertences")),
          avarias,
        });
      }}
    >
      <fieldset disabled={bloqueado}>
        <div className="prod-vistoria">
          {["frente", "esquerda", "direita", "traseira", "teto", "interior"].map(
            (l) => (
              <button
                type="button"
                key={l}
                aria-pressed={local === l}
                onClick={() => setLocal(l)}
              >
                {l}
                {avarias.some((a) => a.local === l) ? " •" : ""}
              </button>
            ),
          )}
          <div className="prod-carro">
            <CarFront />
          </div>
        </div>
        <label>
          Avaria em: {local}
          <input id="descricao-avaria" name="avaria" maxLength={500} />
        </label>
        <button
          type="button"
          onClick={(e) => {
            const f = e.currentTarget.form!,
              input = f.elements.namedItem("avaria") as HTMLInputElement;
            if (input.value.trim().length >= 2 && avarias.length < 30) {
              setAvarias([...avarias, { local, descricao: input.value.trim() }]);
              input.value = "";
            }
          }}
        >
          Adicionar avaria
        </button>
        {avarias.map((a, i) => (
          <div className="prod-linha" key={i}>
            <span>
              {a.local}: {a.descricao}
            </span>
            <button
              type="button"
              onClick={() => setAvarias(avarias.filter((_, j) => i !== j))}
            >
              Remover
            </button>
          </div>
        ))}
        <label>
          Combustível (%)
          <input
            name="combustivel"
            type="number"
            min="0"
            max="100"
            required
            defaultValue={inicial?.dados.combustivel ?? 50}
          />
        </label>
        <label>
          Pertences deixados no veículo
          <textarea
            name="pertences"
            maxLength={2000}
            defaultValue={inicial?.dados.pertences || ""}
          />
        </label>
        <button>Salvar vistoria</button>
      </fieldset>
    </form>
  );
}
