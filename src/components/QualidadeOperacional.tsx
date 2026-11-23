import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { operacaoQualidade } from "../services/qualidadeAvancada";
import type { AcompanhamentoQualidade } from "../lib/qualidadeAvancada";
import type { TituloFinanceiro } from "../services/financeiro";
import { PagamentosIntegrados } from "./PagamentosIntegrados";
import { Dialogo } from "./Dialogo";
import { erroPublico } from "../lib/supabase";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";

export type OcorrenciaAnalise = {
  id: string;
  revisao: number;
  origem: "os" | "atendimento";
  custo_centavos: number;
  minutos: number;
};

export function FinanceiroGarantia({
  registro,
  atualizar,
}: {
  registro: AcompanhamentoQualidade;
  atualizar: (r: AcompanhamentoQualidade) => void;
}) {
  const a = useAcesso(),
    w = a.oficina!.id;
  const q = useQuery({
    queryKey: ["garantia-financeiro", w, registro.id, registro.revisao],
    queryFn: ({ signal }) =>
      operacaoQualidade<TituloFinanceiro | null>(
        a.demo,
        "consultar_financeiro_garantia",
        { p_oficina: w, p_id: registro.id },
        signal,
      ),
  });
  const [erro, setErro] = useState("");
  return (
    <section className="qa-financeiro">
      {q.isPending && <p role="status">Consultando ressarcimento…</p>}
      {(q.error || erro) && <p role="alert">{erro || erroPublico(q.error)}</p>}
      {q.data && (
        <PagamentosIntegrados
          titulo={q.data}
          rotulo="Ressarcimento do fabricante"
          aoConcluir={() => {
            void operacaoQualidade<AcompanhamentoQualidade>(
              a.demo,
              "consultar_acompanhamento_qualidade",
              { p_oficina: w, p_id: registro.id },
            )
              .then(atualizar)
              .catch((e) => setErro(erroPublico(e)));
          }}
        />
      )}
    </section>
  );
}

export function CustosOcorrenciaAnalise({
  analise,
  ocorrencia,
  fechar,
}: {
  analise: string;
  ocorrencia: OcorrenciaAnalise;
  fechar: () => void;
}) {
  const a = useAcesso(),
    qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  return (
    <Dialogo
      aberto
      fechar={() => {
        if (!ocupado) fechar();
      }}
      titulo="Custos da ocorrência"
      classe="qa-dialogo"
    >
      <form
        className="qa-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ocupado) return;
          const f = new FormData(e.currentTarget);
          setOcupado(true);
          setErro("");
          try {
            await operacaoQualidade(a.demo, "ocorrencia_da_analise", {
              p_oficina: a.oficina!.id,
              p_id: analise,
              p_criar: false,
              p_revisao: ocorrencia.revisao,
              p_dados: {
                custo_centavos: Math.round(Number(f.get("custo")) * 100),
                minutos: Number(f.get("minutos")),
              },
            });
            await atualizarIntegracoes(qc, [
              "qualidade-avancada",
              "garantia-financeiro",
              "lucro-documento",
              "financeiro",
              "financeiro-detalhe",
              "os-detalhe",
              "detalhes-atendimento",
            ]);
            fechar();
          } catch (error) {
            setErro(erroPublico(error));
          } finally {
            setOcupado(false);
          }
        }}
      >
        <p>
          A ocorrência está registrada e vinculada a esta análise. Você pode informar os
          custos agora ou depois.
        </p>
        <fieldset disabled={ocupado} className="qa-campos">
          <label>
            {ocorrencia.origem === "os"
              ? "Outros custos do retrabalho (R$)"
              : "Custo do retrabalho (R$)"}
            <input
              name="custo"
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              required
              defaultValue={ocorrencia.custo_centavos / 100}
            />
          </label>
          <label>
            Tempo de retrabalho (minutos)
            <input
              name="minutos"
              type="number"
              min="0"
              max="1000000"
              step="1"
              required
              defaultValue={ocorrencia.minutos}
            />
          </label>
        </fieldset>
        {ocorrencia.origem === "os" && (
          <small>
            Peças, custo por hora e reembolsos já registrados na ocorrência são
            preservados.
          </small>
        )}
        {erro && <p role="alert">{erro}</p>}
        <div className="qa-rodape">
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado}
            onClick={fechar}
          >
            Depois
          </button>
          <button className="botao-primario" disabled={ocupado}>
            {ocupado ? "Salvando…" : "Salvar custos"}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
