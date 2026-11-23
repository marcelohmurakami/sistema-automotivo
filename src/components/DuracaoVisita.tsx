import { useId, useState } from "react";
import { horarioVisita } from "../lib/logisticaVisitas";

const atalhos = [
  [30, "30 minutos"],
  [60, "1 hora"],
  [120, "2 horas"],
  [180, "3 horas"],
] as const;

type Edicao = {
  inicio: string;
  fim: string | null;
  horas: string;
  minutos: string;
};

export function DuracaoVisita({
  inicio,
  fim,
  alterarFim,
}: {
  inicio: string;
  fim: string | null;
  alterarFim: (fim: string) => void;
}) {
  const camposId = useId();
  const [personalizada, setPersonalizada] = useState(false);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const inicioMs = Date.parse(inicio);
  const inicioValido = Number.isFinite(inicioMs);
  const diferenca = fim ? Math.round((Date.parse(fim) - inicioMs) / 60000) : 0;
  const duracao = Number.isFinite(diferenca) && diferenca > 0 ? diferenca : 0;
  const mostrarCampos =
    personalizada || (duracao > 0 && !atalhos.some(([minutos]) => minutos === duracao));
  // Um horário editado no formulário prevalece sobre o rascunho da duração.
  const campos =
    edicao && edicao.inicio === inicio && (edicao.fim || "") === (fim || "")
      ? edicao
      : { horas: String(Math.floor(duracao / 60)), minutos: String(duracao % 60) };

  function personalizar(campo: "horas" | "minutos", valor: string) {
    const atual = { ...campos, [campo]: valor };
    const horas = Number(atual.horas),
      minutos = Number(atual.minutos),
      total = horas * 60 + minutos;
    const valida =
      inicioValido &&
      atual.horas !== "" &&
      atual.minutos !== "" &&
      Number.isInteger(horas) &&
      horas >= 0 &&
      Number.isInteger(minutos) &&
      minutos >= 0 &&
      minutos < 60 &&
      Number.isSafeInteger(total) &&
      total > 0;
    const termino = new Date(inicioMs + total * 60000);
    const novoFim =
      valida && Number.isFinite(termino.getTime()) ? termino.toISOString() : "";
    setEdicao({ ...atual, inicio, fim: novoFim });
    alterarFim(novoFim);
  }

  return (
    <div className="visita-duracao">
      <strong>Quanto tempo vai durar o atendimento?</strong>
      <div
        className="visita-duracao-atalhos"
        role="group"
        aria-label="Duração prevista da visita"
      >
        {atalhos.map(([minutos, texto]) => (
          <button
            key={minutos}
            type="button"
            className="botao-secundario"
            disabled={!inicioValido}
            aria-pressed={!mostrarCampos && duracao === minutos}
            onClick={() => {
              setPersonalizada(false);
              setEdicao(null);
              alterarFim(new Date(inicioMs + minutos * 60000).toISOString());
            }}
          >
            {texto}
          </button>
        ))}
        <button
          type="button"
          className="botao-secundario"
          disabled={!inicioValido}
          aria-pressed={mostrarCampos}
          aria-expanded={mostrarCampos}
          aria-controls={camposId}
          onClick={() => setPersonalizada(true)}
        >
          Personalizar
        </button>
      </div>
      {mostrarCampos && (
        <div
          id={camposId}
          className="visita-duracao-campos"
          role="group"
          aria-label="Duração personalizada"
        >
          <label>
            Horas
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required
              disabled={!inicioValido}
              value={campos.horas}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => personalizar("horas", e.target.value)}
            />
          </label>
          <label>
            Minutos
            <input
              type="number"
              inputMode="numeric"
              min={Number(campos.horas) > 0 ? 0 : 1}
              max={59}
              step={1}
              required
              disabled={!inicioValido}
              value={campos.minutos}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => personalizar("minutos", e.target.value)}
            />
          </label>
        </div>
      )}
      <small>
        {mostrarCampos
          ? "Informe horas e minutos. O término é preenchido automaticamente."
          : "Escolha um atalho, personalize a duração ou edite o término no campo acima."}
      </small>
      {mostrarCampos && (
        <p className="visita-duracao-termino" role="status">
          {duracao > 0 && fim ? (
            <>
              Término previsto: <strong>{horarioVisita(Date.parse(fim))}</strong>
            </>
          ) : (
            "Informe uma duração maior que zero, com os minutos entre 0 e 59."
          )}
        </p>
      )}
    </div>
  );
}
