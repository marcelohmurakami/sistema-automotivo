import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { dinheiro } from "../lib/formatacao";
import { erroPublico } from "../lib/supabase";
import { consultarLucroCliente } from "../services/lucroServico";
import "./LucroServico.css";
export function LucroCliente({
  id,
  mostrarTicket = false,
}: {
  id: string;
  mostrarTicket?: boolean;
}) {
  const a = useAcesso();
  const permitido = a.oficina?.perfil !== "staff" && a.permite("finance");
  const q = useQuery({
    queryKey: ["lucro-cliente", a.oficina!.id, id],
    queryFn: ({ signal }) => consultarLucroCliente(a.oficina!.id, id, signal),
    enabled: permitido && !a.demo,
    refetchInterval: 30000,
  });
  if (!permitido || a.demo) return null;
  if (q.isPending) return <p role="status">Calculando lucro médio…</p>;
  if (q.isError)
    return (
      <p role="alert">
        {erroPublico(q.error)}{" "}
        <button onClick={() => void q.refetch()}>Atualizar lucro</button>
      </p>
    );
  const d = q.data;
  return (
    <section className="lucro-cliente" aria-label="Rentabilidade do cliente">
      <div className="ficha-cliente-indicadores">
        {mostrarTicket && (
          <div>
            <span>Ticket médio</span>
            <strong>{d.ticket_medio === null ? "—" : dinheiro(d.ticket_medio)}</strong>
            <small>Por OS concluída</small>
          </div>
        )}
        <div>
          <span>Lucro médio{d.pendentes ? " estimado" : ""}</span>
          <strong>{d.lucro_medio === null ? "—" : dinheiro(d.lucro_medio)}</strong>
          <small>Após insumos e demais custos registrados</small>
        </div>
        <div>
          <span>Lucro total{d.pendentes ? " estimado" : ""}</span>
          <strong>{dinheiro(d.lucro)}</strong>
          <small>{d.quantidade} OS concluída(s)</small>
        </div>
      </div>
      <small>
        OS concluídas, com descontos, insumos, comissões, taxas e custos apropriados.
        Orçamentos, cancelamentos e notinhas sem custeio não entram nesta média.{" "}
        {d.pendentes > 0
          ? `${d.pendentes} OS ainda precisam da conferência de custos.`
          : d.quantidade
            ? "Custos conferidos."
            : "Sem OS concluída para calcular a média."}
      </small>
    </section>
  );
}
