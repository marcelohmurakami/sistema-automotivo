import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { baixarArquivo } from "../lib/portabilidade";
import { SecaoRecolhivel } from "./SecaoRecolhivel";
import "./MedicaoUsabilidade.css";
type Resultado = {
  tarefa: string;
  subsetor: string;
  segundos: number;
  cliques: number;
  resultado: string;
  data: string;
};
export function MedicaoUsabilidade() {
  const a = useAcesso(),
    local = useLocation(),
    [tarefa, setTarefa] = useState("Criar orçamento"),
    [ativo, setAtivo] = useState<{
      tarefa: string;
      inicio: number;
      subsetor: string;
      cliques: number;
    } | null>(null),
    [resultado, setResultado] = useState("sem_ajuda"),
    [historico, setHistorico] = useState<Resultado[]>([]);
  const medindo = !!ativo;
  useEffect(() => {
    if (!medindo) return;
    const contar = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || e.target.closest("[data-medicao]")) return;
      setAtivo((v) => (v ? { ...v, cliques: v.cliques + 1 } : null));
    };
    document.addEventListener("click", contar, true);
    return () => document.removeEventListener("click", contar, true);
  }, [medindo]);
  if (!a.oficina || a.segundoFatorExigido) return null;
  if (ativo)
    return (
      <aside
        data-medicao
        className="medicao-barra"
        aria-label="Teste de facilidade em andamento"
      >
        <span>
          <strong>{ativo.tarefa}</strong>
          <small>{ativo.cliques} cliques · medição iniciada por você</small>
        </span>
        <label>
          Resultado
          <select value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option value="sem_ajuda">Consegui sem ajuda</option>
            <option value="com_ajuda">Precisei de ajuda</option>
            <option value="nao_concluiu">Não consegui concluir</option>
          </select>
        </label>
        <button
          className="botao-primario"
          onClick={() => {
            setHistorico((v) =>
              [
                ...v,
                {
                  tarefa: ativo.tarefa,
                  subsetor: ativo.subsetor,
                  segundos: Math.round((Date.now() - ativo.inicio) / 1000),
                  cliques: ativo.cliques,
                  resultado,
                  data: new Date().toISOString(),
                },
              ].slice(-20),
            );
            setAtivo(null);
          }}
        >
          Concluir teste
        </button>
        <button className="botao-secundario" onClick={() => setAtivo(null)}>
          Cancelar
        </button>
      </aside>
    );
  if (local.pathname !== "/comecar") return null;
  return (
    <div className="medicao-inicio" data-medicao>
      <SecaoRecolhivel
        titulo="Medir a facilidade de uso (opcional)"
        aberta={historico.length > 0}
      >
        <p>
          Ative durante um teste acompanhado. Conta somente cliques e tempo; não
          registra conteúdo, nomes ou valores. Os resultados ficam nesta sessão e podem
          ser baixados.
        </p>
        <label>
          Tarefa
          <select value={tarefa} onChange={(e) => setTarefa(e.target.value)}>
            {[
              "Cadastrar cliente",
              "Criar orçamento",
              "Criar ordem de serviço",
              "Registrar pagamento",
              "Consultar relatório",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button
          className="botao-secundario"
          onClick={() => {
            setResultado("sem_ajuda");
            setAtivo({
              tarefa,
              inicio: Date.now(),
              cliques: 0,
              subsetor: a.oficina?.especialidade || a.oficina?.ramo || "",
            });
          }}
        >
          Iniciar medição
        </button>
        {historico.length > 0 && (
          <>
            <p>
              {historico.length === 1
                ? "1 teste registrado nesta sessão."
                : `${historico.length} testes registrados nesta sessão.`}
            </p>
            <button
              onClick={() =>
                baixarArquivo(
                  "teste-facilidade.json",
                  new Blob([JSON.stringify(historico, null, 2)], {
                    type: "application/json",
                  }),
                )
              }
            >
              Baixar resultados
            </button>
            <button onClick={() => setHistorico([])}>Apagar resultados</button>
          </>
        )}
      </SecaoRecolhivel>
    </div>
  );
}
