import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { operacaoEquipe } from "../../services/produtividadeEquipe";
import { dataEquipe } from "../../lib/produtividadeEquipe";
import { MensagemEquipe, PaginacaoEquipe } from "./ComumEquipe";
type PessoaMatriz = {
  id: string;
  nome: string;
  aptidoes: {
    habilidade: string;
    nome: string;
    nivel: number | null;
    valida_ate: string | null;
    estado: string;
  }[];
};
export function MatrizEquipe({ w, pessoa }: { w: string; pessoa: string }) {
  const [pagina, setPagina] = useState(0);
  const q = useQuery({
    queryKey: ["equipe", w, "matriz", pessoa, pagina],
    queryFn: ({ signal }) =>
      operacaoEquipe<PessoaMatriz[]>(
        w,
        "matriz_qualificacoes_equipe",
        {
          p_funcionario: pessoa || null,
          p_pagina: pagina,
        },
        signal,
      ),
  });
  return (
    <>
      <MensagemEquipe erro={q.error} />
      {q.isPending ? (
        <p role="status">Carregando aptidões…</p>
      ) : !q.data?.length ? (
        <p className="eq-vazio">Nenhum funcionário ativo neste filtro.</p>
      ) : (
        q.data.slice(0, 50).map((p) => (
          <div className="eq-linha" key={p.id}>
            <div>
              <strong>{p.nome}</strong>
            </div>
            <div className="eq-aptidoes">
              {!p.aptidoes.length ? (
                <small>Cadastre as habilidades abaixo para compor a matriz.</small>
              ) : (
                p.aptidoes.map((h) => (
                  <div
                    className="eq-aptidao"
                    key={h.habilidade}
                    data-valida={h.estado === "Válida"}
                  >
                    <strong>{h.nome}</strong>
                    <small>
                      {h.estado}
                      {h.nivel ? " · Nível " + h.nivel : ""}
                      {h.valida_ate ? " · " + dataEquipe(h.valida_ate) : ""}
                    </small>
                  </div>
                ))
              )}
            </div>
          </div>
        ))
      )}
      <PaginacaoEquipe
        pagina={pagina}
        mudar={setPagina}
        mais={(q.data?.length ?? 0) > 50}
      />
    </>
  );
}
