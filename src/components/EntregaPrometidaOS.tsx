import { novoId } from "../lib/uuid.ts";
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { salvarOS, type OrdemServico } from "../services/ordensServico";
import { classificarEntrega, entregaDoCampo } from "../lib/entregaPrometida";
import { CampoEntregaPrometida, IndicadorEntrega } from "./PrazoEntrega";

export function EntregaPrometidaOS({
  os,
  agora,
  demo,
  oficina,
  ocupado,
  executar,
}: {
  os: OrdemServico;
  agora: Date;
  demo: boolean;
  oficina: string;
  ocupado: boolean;
  executar: (acao: () => Promise<unknown>) => Promise<void>;
}) {
  // Mantém a revisão aberta pelo usuário: uma edição simultânea deve gerar conflito.
  const [edicao, setEdicao] = useState<OrdemServico | null>(null);
  const prazo = classificarEntrega(os.entrega_prevista_em, os.situacao, agora);
  return (
    <section
      className="entrega-painel"
      data-prazo={prazo.tipo}
      aria-label="Entrega prometida"
    >
      <h3>Entrega prometida ao cliente</h3>
      <div className="entrega-painel-cabecalho">
        <IndicadorEntrega prazo={prazo} />
        {prazo.tipo !== "encerrada" && !edicao && (
          <button
            className="botao-secundario"
            disabled={ocupado}
            onClick={() => setEdicao(os)}
          >
            <CalendarClock size={17} />
            {os.entrega_prevista_em ? "Alterar entrega" : "Definir entrega"}
          </button>
        )}
      </div>
      <p>{prazo.aviso}</p>
      {edicao && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const valor = String(
              new FormData(e.currentTarget).get("entrega_prevista_em") || "",
            );
            void executar(async () => {
              // O RPC de atendimento recebe todos os campos editáveis e protege a revisão.
              const campos = [
                "cliente_id",
                "veiculo_id",
                "queixa_cliente",
                "diagnostico",
                "observacoes_internas",
                "resumo_cliente",
                "responsavel",
                "prioridade",
                "quilometragem_entrada",
                "quilometragem_saida",
                "combustivel_percentual",
                "pertences",
                "condicoes_garantia",
                "garantia_ate",
                "checklist",
              ] as const;
              await salvarOS(
                demo,
                oficina,
                {
                  ...Object.fromEntries(campos.map((c) => [c, edicao[c]])),
                  entrega_prevista_em: entregaDoCampo(valor),
                },
                novoId(),
                edicao,
              );
              setEdicao(null);
            });
          }}
        >
          <fieldset disabled={ocupado}>
            <CampoEntregaPrometida
              inicial={edicao.entrega_prevista_em}
              situacao={edicao.situacao}
            />
            {os.revisao !== edicao.revisao && (
              <p className="aviso-cliente" role="status">
                A OS foi alterada enquanto você editava. Cancele e abra a edição
                novamente para usar os dados atualizados.
              </p>
            )}
            <div className="entrega-acoes">
              <button
                type="submit"
                className="botao-primario"
                disabled={os.revisao !== edicao.revisao}
              >
                {ocupado ? "Salvando…" : "Salvar entrega"}
              </button>
              <button
                type="button"
                className="botao-secundario"
                onClick={() => setEdicao(null)}
              >
                Cancelar alteração
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
