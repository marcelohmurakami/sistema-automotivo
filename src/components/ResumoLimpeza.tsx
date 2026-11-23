import { MapPin, ClipboardCheck, Droplets } from "lucide-react";
import type { AtendimentoServico, ObjetoServico } from "../services/servicos";
import { ehLimpeza } from "../lib/aceiteServico";
import "./ResumoTecnicoReparo.css";

export function ResumoLimpeza({
  atendimento: a,
  objeto,
}: {
  atendimento: AtendimentoServico;
  objeto: Pick<ObjetoServico, "dados">;
}) {
  if (!ehLimpeza(a)) return null;
  const c = a.ficha_especialidade!.campos;
  return (
    <section className="reparo-tecnico-resumo" aria-label="Resumo da limpeza">
      <div>
        <MapPin size={19} aria-hidden="true" />
        <span>Local e contratação</span>
        <strong>
          {c.endereco_visita || objeto.dados.endereco || "Endereço não informado"}
        </strong>
        <small>
          {[
            c.tipo_bem,
            c.quantidade_lugares ? `${c.quantidade_lugares} lugares / unidades` : "",
            c.area ? `${c.area} m²` : "",
            c.frequencia,
            c.contato_local,
          ]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </div>
      <div
        className={
          c.resultado_vistoria === "Conforme o escopo"
            ? "reparo-validado"
            : c.resultado_vistoria
              ? "reparo-validacao-pendente"
              : ""
        }
      >
        <ClipboardCheck size={19} aria-hidden="true" />
        <span>Vistoria</span>
        <strong>{c.resultado_vistoria || "Ainda não registrada"}</strong>
        {c.pendencias_finais && <small>{c.pendencias_finais}</small>}
      </div>
      <div
        className={
          c.liberacao_uso && c.liberacao_uso !== "Liberado"
            ? "reparo-validacao-pendente"
            : ""
        }
      >
        <Droplets size={19} aria-hidden="true" />
        <span>Uso do local / bem</span>
        <strong>{c.liberacao_uso || "Liberação não registrada"}</strong>
        {c.secagem_horas && (
          <small>
            Secagem estimada: {c.secagem_horas} h
            {c.condicoes_secagem ? ` · ${c.condicoes_secagem}` : ""}
          </small>
        )}
        {c.restricoes_uso && <small>{c.restricoes_uso}</small>}
      </div>
    </section>
  );
}
