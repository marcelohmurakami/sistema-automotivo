import { perfilAtendimento, type FichaEspecialidade } from "../lib/perfisAtendimento";
import { CamposFichaTecnica } from "./CamposFichaTecnica";
import { especialidades } from "../lib/especialidades";

export function RecepcaoEspecializada({
  valor,
  alterar,
}: {
  valor: FichaEspecialidade;
  alterar: (ficha: FichaEspecialidade) => void;
}) {
  const perfil = perfilAtendimento(valor.especialidade);
  const campos = perfil.grupos
    .flatMap((g) => g.campos)
    .filter((c) => perfil.recepcaoRapida?.includes(c.id));
  if (!campos.length) return null;
  return (
    <section
      className="recepcao-especializada"
      aria-label={
        valor.especialidade.startsWith("manutencao_") ||
        valor.especialidade.startsWith("limpeza_")
          ? "Planejamento da visita"
          : especialidades[valor.especialidade]?.ramo === "automotivo"
            ? `Entrada rápida · ${perfil.nome}`
            : "Recepção do equipamento"
      }
    >
      <CamposFichaTecnica valor={valor} alterar={alterar} campos={campos} />
    </section>
  );
}
