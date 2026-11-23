import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { Funcionarios } from "./Funcionarios";
import "./GestaoFuncionarios.css";
const Resultados = lazy(() => import("../components/equipe/ResultadosEquipe"));
const Escala = lazy(() => import("../components/equipe/EscalaEquipe"));
const Qualificacoes = lazy(() => import("../components/equipe/QualificacoesEquipe"));
const Contador = lazy(() => import("../components/equipe/ContadorEquipe"));
const abas = [
  ["cadastro", "Cadastro"],
  ["resultados", "Resultados"],
  ["escala", "Escala"],
  ["qualificacoes", "Qualificações"],
  ["contador", "Contador"],
] as const;
export function GestaoFuncionarios() {
  const a = useAcesso(),
    [p, setP] = useSearchParams(),
    aba = abas.some(([k]) => k === p.get("aba")) ? p.get("aba")! : "cadastro",
    gerente = ["owner", "manager"].includes(a.oficina!.perfil),
    financeiro = ["resultados", "contador"].includes(aba);
  return (
    <div className="eq-pagina">
      <nav className="eq-abas" aria-label="Gestão da equipe">
        {abas.map(([id, nome]) => (
          <button
            key={id}
            type="button"
            aria-current={aba === id ? "page" : undefined}
            onClick={() => setP({ aba: id })}
          >
            {nome}
          </button>
        ))}
      </nav>
      {aba === "cadastro" ? (
        <Funcionarios />
      ) : !gerente ? (
        <p>Disponível ao proprietário e aos gerentes.</p>
      ) : financeiro && !a.permite("employee_reports") ? (
        <p>
          Resultados individuais e preparação para o contador estão disponíveis no Plano
          Completo.
        </p>
      ) : a.demo ? (
        <p>
          Conecte uma empresa para usar a gestão de produtividade com seus registros
          reais.
        </p>
      ) : (
        <Suspense fallback={<p role="status">Carregando gestão da equipe…</p>}>
          {aba === "resultados" ? (
            <Resultados />
          ) : aba === "escala" ? (
            <Escala />
          ) : aba === "qualificacoes" ? (
            <Qualificacoes />
          ) : (
            <Contador />
          )}
        </Suspense>
      )}
    </div>
  );
}
