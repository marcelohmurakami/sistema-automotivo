import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import {
  tiposDaEspecialidade,
  especialidadePadrao,
  tiposServico,
  type TipoServico,
} from "../lib/especialidades";
import type { OrdemNoMapa, VeiculoMapa } from "../lib/mapaOficina";
import { entregaDoCampo } from "../lib/entregaPrometida";
import {
  consultarEdicaoRapidaMapa,
  salvarEdicaoRapidaMapa,
  type AlteracaoRapidaMapa,
} from "../services/edicaoRapidaMapa";
import { IconeTipoServico } from "./TipoServico";
import { CampoEntregaPrometida } from "./PrazoEntrega";
import { Dialogo } from "./Dialogo";
import "./EdicaoRapidaMapa.css";

export type EdicaoMapa = { campo: "tipo" | "entrega"; veiculo: VeiculoMapa };

export function EdicaoRapidaMapa({
  edicao,
  fechar,
  aoSalvar,
}: {
  edicao: EdicaoMapa;
  fechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient(),
    oficina = a.oficina!.id;
  const trava = useRef(false);
  const { veiculo, campo } = edicao;
  const chaveMapa = ["mapa-oficina", a.demo, oficina];
  const consulta = useQuery({
    queryKey: ["mapa-edicao-rapida", a.demo, oficina, veiculo.osId],
    queryFn: ({ signal }) =>
      consultarEdicaoRapidaMapa(a.demo, oficina, veiculo.osId, signal),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const gravacao = useMutation({
    onMutate: () => qc.cancelQueries({ queryKey: chaveMapa, exact: true }),
    mutationFn: (alteracao: AlteracaoRapidaMapa) =>
      salvarEdicaoRapidaMapa(a.demo, oficina, consulta.data!, alteracao),
    onSuccess: async (salva) => {
      await qc.cancelQueries({ queryKey: chaveMapa, exact: true });
      qc.setQueryData<OrdemNoMapa[]>(chaveMapa, (ordens) =>
        ordens?.map((o) =>
          o.id === salva.id && salva.revisao >= o.revisao
            ? {
                ...o,
                revisao: salva.revisao,
                tipo_servico: salva.tipo_servico,
                entrega_prevista_em: salva.entrega_prevista_em,
              }
            : o,
        ),
      );
      // A gravação já devolveu a ficha completa: não consulta a OS outra vez.
      qc.setQueryData(["os-detalhe", a.demo, oficina, salva.id], salva);
      void qc
        .invalidateQueries({
          predicate: (q) =>
            ["os", "documento-cliente", "historico-gestao", "alertas"].includes(
              String(q.queryKey[0]),
            ),
        })
        .catch(() => {});
      aoSalvar(
        `${campo === "tipo" ? "Ícone" : "Entrega"} da OS #${veiculo.id} atualizad${campo === "tipo" ? "o" : "a"}.`,
      );
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: chaveMapa, exact: true }).catch(() => {});
    },
  });
  const atual = consulta.data;
  const encerrada = atual && ["delivered", "cancelled"].includes(atual.situacao);
  const ocupado = gravacao.isPending;
  async function salvar(alteracao: AlteracaoRapidaMapa) {
    if (!atual || trava.current || encerrada) return;
    if (
      (alteracao.campo === "tipo"
        ? atual.tipo_servico || ""
        : atual.entrega_prevista_em) === alteracao.valor
    ) {
      fechar();
      return;
    }
    trava.current = true;
    try {
      await gravacao.mutateAsync(alteracao);
    } catch {
      /* O erro permanece na janela, com a opção de atualizar os dados. */
    } finally {
      trava.current = false;
    }
  }
  const opcoes = Array.from(
    new Set([
      "",
      ...tiposDaEspecialidade(
        a.oficina?.especialidade || especialidadePadrao(a.oficina?.ramo),
      ),
      ...(atual?.tipo_servico && tiposServico[atual.tipo_servico as TipoServico]
        ? [atual.tipo_servico]
        : []),
    ]),
  );
  return (
    <Dialogo
      aberto
      fechar={() => {
        if (!trava.current) fechar();
      }}
      titulo={`${campo === "tipo" ? "Ícone" : "Entrega"} da OS #${veiculo.id}`}
      classe="mapa-edicao-dialogo"
    >
      <p className="mapa-edicao-contexto">
        {veiculo.modelo} · {veiculo.cliente}
      </p>
      {consulta.isPending || consulta.isFetching ? (
        <p role="status">Carregando…</p>
      ) : consulta.isError ? (
        <div role="alert">
          <p>{erroPublico(consulta.error)}</p>
          <button className="botao-secundario" onClick={() => void consulta.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : encerrada ? (
        <p role="alert">Esta OS foi encerrada. O histórico foi preservado.</p>
      ) : (
        atual && (
          <>
            {campo === "tipo" ? (
              <div
                className="mapa-edicao-tipos"
                role="group"
                aria-label="Escolher ícone"
              >
                {opcoes.map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    disabled={ocupado}
                    aria-pressed={(atual.tipo_servico || "") === tipo}
                    aria-label={
                      tiposServico[tipo as TipoServico]?.[0] || "Sem identificação"
                    }
                    onClick={() => void salvar({ campo: "tipo", valor: tipo })}
                  >
                    <IconeTipoServico tipo={tipo} legenda />
                  </button>
                ))}
              </div>
            ) : (
              <form
                key={atual.revisao}
                onSubmit={(e) => {
                  e.preventDefault();
                  const valor = String(
                    new FormData(e.currentTarget).get("entrega_prevista_em") || "",
                  );
                  void salvar({ campo: "entrega", valor: entregaDoCampo(valor) });
                }}
              >
                <fieldset disabled={ocupado}>
                  <CampoEntregaPrometida
                    inicial={atual.entrega_prevista_em}
                    situacao={atual.situacao}
                  />
                  <div className="mapa-edicao-acoes">
                    <button type="button" className="botao-secundario" onClick={fechar}>
                      Cancelar
                    </button>
                    <button type="submit" className="botao-primario">
                      {ocupado ? "Salvando…" : "Salvar entrega"}
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
            {ocupado && campo === "tipo" && <p role="status">Salvando ícone…</p>}
            {gravacao.isError && (
              <div role="alert" className="mapa-edicao-erro">
                <p>{erroPublico(gravacao.error)}</p>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => {
                    gravacao.reset();
                    void consulta.refetch();
                  }}
                >
                  Atualizar dados
                </button>
              </div>
            )}
          </>
        )
      )}
    </Dialogo>
  );
}
