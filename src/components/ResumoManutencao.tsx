import { MapPin, ClipboardCheck, ShieldCheck } from "lucide-react";
import type { AtendimentoServico, ObjetoServico } from "../services/servicos";
import { ehManutencao } from "../lib/manutencao";
import "./ResumoTecnicoReparo.css";

export function ResumoManutencao({
  atendimento: a,
  objeto,
}: {
  atendimento: AtendimentoServico;
  objeto: Pick<ObjetoServico, "dados">;
}) {
  if (!ehManutencao(a)) return null;
  const c = a.ficha_especialidade!.campos;
  return (
    <section className="reparo-tecnico-resumo" aria-label="Resumo da visita técnica">
      <div>
        <MapPin size={19} aria-hidden="true" />
        <span>Local da visita</span>
        <strong>
          {c.endereco_visita || objeto.dados.endereco || "Endereço não informado"}
        </strong>
        <small>
          {[c.ativo, c.contato || objeto.dados.contato].filter(Boolean).join(" · ")}
        </small>
      </div>
      <div
        className={
          c.resultado_teste === "Aprovado nos testes"
            ? "reparo-validado"
            : c.resultado_teste
              ? "reparo-validacao-pendente"
              : ""
        }
      >
        <ClipboardCheck size={19} aria-hidden="true" />
        <span>Testes registrados</span>
        <strong>{c.resultado_teste || "Ainda não informados"}</strong>
        {c.limitacoes_teste && <small>{c.limitacoes_teste}</small>}
      </div>
      <div
        className={
          c.condicao_uso && c.condicao_uso !== "Liberado para uso"
            ? "reparo-validacao-pendente"
            : ""
        }
      >
        <ShieldCheck size={19} aria-hidden="true" />
        <span>Condição de uso</span>
        <strong>{c.condicao_uso || "Não informada pelo técnico"}</strong>
        {c.restricoes_uso && <small>{c.restricoes_uso}</small>}
        {c.proxima_data && (
          <small>
            Próxima manutenção: {c.proxima_data.split("-").reverse().join("/")}
          </small>
        )}
      </div>
    </section>
  );
}
