import { useState, type ReactNode } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { hojeNoAparelho } from "../../lib/dataServico";
import {
  periodoRapido,
  periodoRelatorioValido,
  type PeriodoRelatorio,
} from "../../lib/periodoRelatorios";
import "./ControlesRelatorios.css";

export function PeriodoRelatorios({
  periodo,
  aplicar,
  invalido = false,
}: {
  periodo: PeriodoRelatorio;
  aplicar: (p: PeriodoRelatorio) => void;
  invalido?: boolean;
}) {
  const hoje = hojeNoAparelho();
  const presets = [
    ["mes", "Este mês até hoje"],
    ["anterior", "Mês anterior"],
    ["30dias", "Últimos 30 dias"],
    ["hoje", "Hoje"],
  ];
  const atual =
    presets.find(([id]) => {
      const p = periodoRapido(id, hoje);
      return p.inicio === periodo.inicio && p.fim === periodo.fim;
    })?.[0] || "personalizado";
  const [personalizado, setPersonalizado] = useState(false);
  const [rascunho, setRascunho] = useState(periodo);
  const [erro, setErro] = useState("");
  const mostrar = personalizado;
  const data = (d: string) => d.split("-").reverse().join("/");
  return (
    <section className="rr-periodo" aria-label="Período dos relatórios">
      <div className="rr-periodo-barra">
        <label>
          <CalendarDays size={18} aria-hidden="true" /> Período
          <select
            aria-label="Período dos relatórios"
            value={mostrar ? "personalizado" : atual}
            onChange={(e) => {
              const custom = e.target.value === "personalizado";
              setPersonalizado(custom);
              setErro("");
              setRascunho(periodo);
              if (!custom) aplicar(periodoRapido(e.target.value, hoje));
            }}
          >
            {presets.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
            <option value="personalizado">
              {atual === "personalizado" ? "Personalizado" : "Escolher datas"}
            </option>
          </select>
        </label>
        <div className="rr-periodo-leitura">
          <span className="rr-periodo-aplicado">
            {data(periodo.inicio)} <span>até</span> {data(periodo.fim)}
          </span>
          {atual === "personalizado" && !mostrar && (
            <button
              type="button"
              className="rr-editar-datas"
              onClick={() => {
                setRascunho(periodo);
                setPersonalizado(true);
              }}
            >
              Alterar datas
            </button>
          )}
        </div>
      </div>
      {mostrar && (
        <form
          className="rr-datas"
          onSubmit={(e) => {
            e.preventDefault();
            if (!periodoRelatorioValido(rascunho.inicio, rascunho.fim)) {
              setErro("Escolha datas válidas, em ordem, com no máximo 367 dias.");
              return;
            }
            setErro("");
            setPersonalizado(false);
            aplicar(rascunho);
          }}
        >
          <label>
            De
            <input
              type="date"
              required
              value={rascunho.inicio}
              onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              required
              value={rascunho.fim}
              onChange={(e) => setRascunho({ ...rascunho, fim: e.target.value })}
            />
          </label>
          <button className="botao-secundario" type="submit">
            Aplicar período
          </button>
          {(rascunho.inicio !== periodo.inicio || rascunho.fim !== periodo.fim) && (
            <small>Datas alteradas. Aplique para atualizar os números.</small>
          )}
        </form>
      )}
      {(erro || invalido) && (
        <p role="alert">
          {erro || "As datas do endereço são inválidas. Mostrando este mês até hoje."}
        </p>
      )}
    </section>
  );
}

export function NavegacaoSecoes({
  opcoes,
  valor,
  mudar,
  nome = "Detalhar relatório",
}: {
  opcoes: readonly (readonly [string, string])[];
  valor: string;
  mudar: (v: string) => void;
  nome?: string;
}) {
  return (
    <nav className="rr-secoes" aria-label={nome}>
      {opcoes.map(([id, nome]) => (
        <button
          key={id}
          type="button"
          aria-pressed={valor === id}
          onClick={() => mudar(id)}
        >
          {nome}
        </button>
      ))}
    </nav>
  );
}

export function DetalhesRelatorio({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <details className="rr-detalhes">
      <summary>
        <ChevronRight size={18} aria-hidden="true" />
        {titulo}
      </summary>
      <div className="rr-detalhes-conteudo">{children}</div>
    </details>
  );
}
