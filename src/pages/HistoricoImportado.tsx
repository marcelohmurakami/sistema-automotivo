import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { rpc } from "../lib/rpc";
import { AnexosImportados } from "../components/AnexosImportados";
import "./DadosSeguranca.css";

type Registro = {
  tabela: string;
  id_legado: string;
  dados: Record<string, unknown>;
};
type Resultado = {
  grupos: { tabela: string; quantidade: number }[];
  total: number;
  registros: Registro[];
};
export function HistoricoImportado() {
  const a = useAcesso();
  const [tabela, setTabela] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const termoConsulta1 = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: [
      "historico-importado",
      a.usuario,
      a.oficina?.id,
      tabela,
      termoConsulta1,
      pagina,
    ],
    enabled: !!a.oficina && !a.demo,
    queryFn: ({ signal }) =>
      rpc<Resultado>(
        "consultar_historico_importado",
        {
          p_oficina: a.oficina!.id,
          p_tabela: tabela,
          p_busca: termoConsulta1,
          p_pagina: pagina,
        },
        signal,
      ),
  });
  return (
    <section className="clientes-pagina">
      <header className="titulo-pagina">
        <div>
          <h1>Histórico importado</h1>
          <p>
            Consulta dos registros originais, anotações e imagens do sistema anterior.
            Clientes, serviços, estoque e financeiro também estão nos seus módulos.
          </p>
        </div>
      </header>
      <AnexosImportados />
      <div className="formulario-cliente">
        <label>
          Tipo de registro
          <select
            value={tabela}
            onChange={(e) => {
              setTabela(e.target.value);
              setPagina(0);
            }}
          >
            <option value="">Todos</option>
            {(q.data?.grupos || [{ tabela: "anotacoes_gerais", quantidade: 0 }]).map(
              (g) => (
                <option key={g.tabela} value={g.tabela}>
                  {g.tabela.replace(/_/g, " ")} ({g.quantidade})
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Buscar no conteúdo
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
          />
        </label>
      </div>
      {a.demo && (
        <p>
          O histórico importado está disponível nas empresas reais que receberam uma
          migração.
        </p>
      )}
      {q.isPending && !a.demo && <p>Carregando histórico…</p>}
      {q.error && <p role="alert">{erroPublico(q.error)}</p>}
      {q.data?.registros.map((r) => (
        <details
          key={r.tabela + r.id_legado}
          style={{
            padding: "1rem",
            borderBottom: "1px solid var(--borda, #ddd)",
          }}
        >
          <summary>
            {r.tabela.replace(/_/g, " ")} #{r.id_legado} —{" "}
            {String(
              r.dados.titulo ||
                r.dados.descricao ||
                r.dados.cliente ||
                r.dados.nome ||
                r.dados.motor ||
                "Registro original",
            )}
          </summary>
          {r.tabela === "Imagens" &&
            typeof r.dados.base64 === "string" &&
            ["image/jpeg", "image/png", "image/webp"].includes(
              String(r.dados.mime),
            ) && (
              <img
                loading="lazy"
                decoding="async"
                alt={r.id_legado}
                src={`data:${r.dados.mime};base64,${r.dados.base64}`}
                style={{ maxWidth: "100%", maxHeight: 400 }}
              />
            )}
          <dl>
            {Object.entries(r.dados)
              .filter(([k]) => !["base64", "empresa_id"].includes(k))
              .map(([k, v]) => (
                <div key={k} style={{ marginTop: 12 }}>
                  <dt>
                    <strong>{k}</strong>
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {typeof v === "object"
                      ? JSON.stringify(v, null, 2)
                      : String(v ?? "Não informado")}
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      ))}
      {q.data && (
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            marginTop: 20,
          }}
        >
          <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <span>
            {q.data.total} registros · Página {pagina + 1}
          </span>
          <button
            disabled={(pagina + 1) * 50 >= q.data.total}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
