import type { FichaEspecialidade } from "../lib/perfisAtendimento";
import {
  CircuitBoard,
  MapPin,
  ClipboardCheck,
  Smartphone,
  Laptop,
  Database,
} from "lucide-react";
import "./ResumoTecnicoReparo.css";

export function ResumoTecnicoReparo({ ficha }: { ficha?: FichaEspecialidade | null }) {
  if (
    !ficha ||
    ![
      "assistencia_eletrodomesticos",
      "assistencia_eletronica",
      "assistencia_celulares",
      "assistencia_informatica",
    ].includes(ficha.especialidade)
  )
    return null;
  const c = ficha.campos,
    eletronica = ficha.especialidade === "assistencia_eletronica",
    celular = ficha.especialidade === "assistencia_celulares",
    informatica = ficha.especialidade === "assistencia_informatica",
    digital = celular || informatica;
  const Icone = celular ? Smartphone : informatica ? Laptop : CircuitBoard;
  const completo = c.resultado_teste === "Aprovado nos testes";
  return (
    <section className="reparo-tecnico-resumo" aria-label="Resumo técnico do reparo">
      <div>
        <Icone size={19} aria-hidden="true" />
        <span>
          {digital
            ? "Condição de entrada"
            : eletronica
              ? "Placa / revisão"
              : "Aparelho / código"}
        </span>
        <strong>
          {digital
            ? [c.tipo_aparelho, c.liga].filter(Boolean).join(" · ") || "Não informada"
            : eletronica
              ? [c.placa, c.revisao_placa].filter(Boolean).join(" · ") ||
                "Não informado"
              : [c.familia, c.codigo_produto].filter(Boolean).join(" · ") ||
                "Não informado"}
        </strong>
      </div>
      <div>
        {digital ? (
          <Database size={19} aria-hidden="true" />
        ) : (
          <MapPin size={19} aria-hidden="true" />
        )}
        <span>
          {digital
            ? "Dados do cliente"
            : eletronica
              ? "Condição do ensaio"
              : "Local do serviço"}
        </span>
        <strong>
          {digital
            ? `Backup: ${c.backup || "não informado"}`
            : eletronica
              ? c.condicao_ensaio || c.objeto_recebido || "Não informado"
              : c.modalidade || "Não informado"}
        </strong>
        {digital && (
          <small>
            Restaurar / apagar: {c.autorizacao_dados || "sem autorização registrada"}
          </small>
        )}
        {informatica && c.criptografia && <small>Criptografia: {c.criptografia}</small>}
        {!eletronica && c.modalidade === "Domicílio" && c.endereco_visita && (
          <small>{c.endereco_visita}</small>
        )}
      </div>
      <div
        className={
          completo
            ? "reparo-validado"
            : c.resultado_teste
              ? "reparo-validacao-pendente"
              : ""
        }
      >
        <ClipboardCheck size={19} aria-hidden="true" />
        <span>Validação registrada</span>
        <strong>{c.resultado_teste || "Ainda não informada"}</strong>
        {c.limitacoes_teste && <small>{c.limitacoes_teste}</small>}
      </div>
    </section>
  );
}
