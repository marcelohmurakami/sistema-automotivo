import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { listarClientes } from "../services/clientes";
export function SelecaoTitular({ cliente = "" }: { cliente?: string }) {
  const a = useAcesso(),
    [busca, setBusca] = useState(""),
    [selecionado, setSelecionado] = useState(cliente);
  const termoConsulta1 = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: ["titular-privacidade", a.usuario, a.oficina?.id, termoConsulta1],
    enabled: !a.demo && !cliente && termoConsulta1.trim().length >= 2,
    queryFn: ({ signal }) =>
      listarClientes(false, a.oficina!.id, termoConsulta1, false, 0, signal),
  });
  return (
    <div className="dados-bloco">
      <input type="hidden" name="cliente_id" value={selecionado} />
      {cliente ? (
        <p>Cliente vinculado a esta solicitação.</p>
      ) : (
        <>
          <label>
            Vincular cliente para preparar uma cópia dos dados (opcional)
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setSelecionado("");
              }}
              placeholder="Digite pelo menos duas letras"
            />
          </label>
          {q.isError && <p role="alert">Não foi possível buscar o cliente.</p>}
          {q.data && (
            <label>
              Cliente encontrado
              <select
                value={selecionado}
                onChange={(e) => setSelecionado(e.target.value)}
              >
                <option value="">Selecione o cliente correto</option>
                {q.data.itens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
    </div>
  );
}
