import { rpc } from "../lib/rpc";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";

import type { Manutencao } from "../services/produtividade";
export function ManutencoesCliente({ oficina }: { oficina: string }) {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["manutencoes-cliente", a.usuario, oficina],
    enabled: !!a.usuario && !a.demo,
    queryFn: ({ signal }) =>
      rpc<Manutencao[]>("minhas_manutencoes", { p_oficina: oficina }, signal),
    gcTime: 0,
    refetchInterval: 30000,
  });
  return (
    <section>
      <h3>Próximas manutenções recomendadas</h3>
      {q.isPending ? (
        <p>Carregando recomendações…</p>
      ) : q.isError ? (
        <p role="alert">Não foi possível carregar as próximas manutenções.</p>
      ) : !q.data.length ? (
        <p>As recomendações da oficina aparecerão aqui.</p>
      ) : (
        q.data.map((m) => (
          <article className="portal-os" key={m.id}>
            <strong>{m.descricao}</strong>
            <p>
              {m.veiculo} · {m.placa}
            </p>
            <p>
              {m.data_prevista
                ? "Até " +
                  new Date(m.data_prevista + "T12:00:00").toLocaleDateString("pt-BR")
                : ""}
              {m.quilometragem_prevista != null
                ? " · " + m.quilometragem_prevista + " km"
                : ""}{" "}
              · {m.concluida_em ? "Concluída" : "Pendente"}
            </p>
          </article>
        ))
      )}
      <p>
        A quilometragem indicada é uma recomendação da oficina. Consulte o painel do
        veículo e fale com a equipe para agendar.
      </p>
    </section>
  );
}
