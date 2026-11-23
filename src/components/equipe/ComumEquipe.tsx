import { erroPublico } from "../../lib/supabase";
import type { Funcionario } from "../../services/funcionarios";
import { mesEquipe } from "../../lib/produtividadeEquipe";
export function MensagemEquipe({ erro, aviso }: { erro?: unknown; aviso?: string }) {
  return (
    <>
      {erro && (
        <p className="eq-alerta" role="alert">
          {typeof erro === "string" ? erro : erroPublico(erro)}
        </p>
      )}
      {aviso && (
        <p className="eq-aviso" role="status">
          {aviso}
        </p>
      )}
    </>
  );
}
export function SeletorFuncionario({
  funcionarios,
  ...props
}: { funcionarios: Funcionario[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select aria-label="Funcionário" {...props}>
      <option value="">Selecione o funcionário</option>
      {funcionarios.map((f) => (
        <option key={f.id} value={f.id}>
          {f.nome}
          {!f.ativo ? " · inativo" : ""}
        </option>
      ))}
    </select>
  );
}
export function PeriodoEquipe({
  valor,
  mudar,
  desabilitado = false,
}: {
  valor: { inicio: string; fim: string };
  mudar: (p: { inicio: string; fim: string }) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="eq-filtros">
      <label>
        De
        <input
          type="date"
          required
          value={valor.inicio}
          disabled={desabilitado}
          onChange={(e) =>
            mudar({
              inicio: e.target.value,
              fim:
                e.target.value && e.target.value > valor.fim
                  ? e.target.value
                  : valor.fim,
            })
          }
        />
      </label>
      <label>
        Até
        <input
          type="date"
          required
          value={valor.fim}
          disabled={desabilitado}
          min={valor.inicio}
          onChange={(e) =>
            mudar({
              fim: e.target.value,
              inicio:
                e.target.value && e.target.value < valor.inicio
                  ? e.target.value
                  : valor.inicio,
            })
          }
        />
      </label>
      <button
        type="button"
        className="botao-secundario"
        onClick={() => mudar(mesEquipe())}
        disabled={desabilitado}
      >
        Este mês
      </button>
    </div>
  );
}
export function PaginacaoEquipe({
  pagina,
  mudar,
  mais,
}: {
  pagina: number;
  mudar: (n: number) => void;
  mais: boolean;
}) {
  return (
    <div className="eq-acoes">
      <button
        className="botao-secundario"
        disabled={!pagina}
        type="button"
        onClick={() => mudar(pagina - 1)}
      >
        Anterior
      </button>
      <span>Página {pagina + 1}</span>
      <button
        className="botao-secundario"
        disabled={!mais}
        type="button"
        onClick={() => mudar(pagina + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
