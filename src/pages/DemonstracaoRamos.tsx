import { useNavigate } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { ramos, type Ramo } from "../lib/ramos";
import { useState } from "react";
import { especialidadePadrao } from "../lib/especialidades";
import { subsetoresDoRamo } from "../lib/operacaoServicos";
export function DemonstracaoRamos() {
  const a = useAcesso(),
    n = useNavigate();
  const [selecionados, setSelecionados] = useState<Record<string, string>>({});
  return (
    <main className="tela-acesso">
      <section className="cartao-acesso">
        <h1>Explore os sistemas</h1>
        <p>
          Dados fictícios salvos somente neste navegador. Nenhuma empresa será criada no
          banco.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {Object.entries(ramos).map(([id, r]) => (
            <div
              key={id}
              style={{
                display: "grid",
                gap: 8,
                padding: 12,
                border: "1px solid #82948940",
                borderRadius: 12,
              }}
            >
              <label>
                {r.nome}
                <select
                  aria-label={`Subsetor de ${r.nome}`}
                  value={selecionados[id] || especialidadePadrao(id as Ramo)}
                  onChange={(e) =>
                    setSelecionados({ ...selecionados, [id]: e.target.value })
                  }
                >
                  {subsetoresDoRamo(id).map(([chave, perfil]) => (
                    <option key={chave} value={chave}>
                      {perfil.nome}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="botao-secundario"
                key={id}
                onClick={() => {
                  localStorage.setItem(
                    `patio_especialidade:${id === "automotivo" ? "demonstracao" : `demo-${id}`}`,
                    selecionados[id] || especialidadePadrao(id as Ramo),
                  );
                  a.demonstrarRamo(id as Ramo);
                  n("/");
                }}
              >
                Explorar {r.nome}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
