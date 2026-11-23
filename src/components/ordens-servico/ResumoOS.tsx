import { ArrowRight, CheckCircle2, Clock3, Pencil } from "lucide-react";
import type { OrdemServico } from "../../services/ordensServico";
import { dinheiro } from "../../lib/formatacao";
import { quantidadeDocumento } from "../../lib/documentoCliente";

export function ResumoOS({
  os,
  ocupado,
  verSecao,
  editar,
  avancar,
  permitePagamento,
}: {
  os: OrdemServico;
  ocupado: boolean;
  verSecao: (secao: string) => void;
  editar?: () => void;
  avancar: (situacao: string) => void;
  permitePagamento: boolean;
}) {
  const itens = os.itens.filter((i) => i.situacao !== "cancelled");
  const servicos = itens.filter((i) => i.tipo === "service");
  const concluidos = servicos.filter((i) => i.situacao === "done").length;
  const encerrada =
    !!os.arquivado_em || ["delivered", "cancelled"].includes(os.situacao);
  const parada = os.paradas.some((p) => !p.encerrado_em);
  const proxima = (
    {
      open: ["in_progress", "Iniciar serviço"],
      in_progress: ["quality_check", "Conferir serviço"],
      quality_check: ["ready", "Pronto para entrega"],
      ready: ["delivered", "Registrar entrega"],
    } as Record<string, [string, string]>
  )[os.situacao];
  return (
    <div className="os-resumo-limpo">
      <section className="os-servicos-resumo" aria-label="Serviços e peças da OS">
        <div className="os-servicos-resumo-topo">
          <h3>Serviços e peças</h3>
          <span>
            {servicos.length
              ? `${concluidos} de ${servicos.length} ${servicos.length === 1 ? "serviço concluído" : "serviços concluídos"}`
              : `${itens.length} ${itens.length === 1 ? "item" : "itens"}`}
          </span>
        </div>
        {itens.length ? (
          <ul className="os-servicos-resumo-lista">
            {itens.slice(0, 6).map((i) => (
              <li key={i.id}>
                <div>
                  <strong>
                    <span className="os-resumo-quantidade">
                      {quantidadeDocumento(i.quantidade)} ×
                    </span>{" "}
                    {i.descricao}
                  </strong>
                  <small className={`os-resumo-item-status ${i.situacao}`}>
                    {i.situacao === "done" ? (
                      <CheckCircle2 size={14} aria-hidden="true" />
                    ) : (
                      <Clock3 size={14} aria-hidden="true" />
                    )}
                    {i.tipo === "part" ? "Peça · " : ""}
                    {i.situacao === "done"
                      ? "Concluído"
                      : i.situacao === "in_progress"
                        ? "Em execução"
                        : "A realizar"}
                  </small>
                </div>
                <span>
                  {dinheiro(Math.round(i.quantidade * i.preco_unitario_centavos))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="os-resumo-sem-itens">
            {os.orcamento_aguardando_id
              ? "Os itens serão incluídos após a aprovação do orçamento."
              : "Nenhum serviço ou peça incluído."}
          </p>
        )}
        {itens.length > 6 && (
          <button className="os-resumo-ver-itens" onClick={() => verSecao("execucao")}>
            Ver todos os {itens.length} itens{" "}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
        <div className="os-servicos-resumo-total">
          <div>
            <span>Total da OS</span>
            {!!os.desconto_centavos && (
              <small>Desconto de {dinheiro(os.desconto_centavos)} aplicado</small>
            )}
            {permitePagamento && (
              <button
                className="link-pagamento-os"
                onClick={() => verSecao("pagamento")}
              >
                Ver pagamento <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <strong>{dinheiro(os.total_centavos)}</strong>
        </div>
      </section>
      <div className="os-resumo-acoes">
        <div>
          {!encerrada && editar && (
            <button className="botao-secundario" disabled={ocupado} onClick={editar}>
              <Pencil size={16} aria-hidden="true" /> Editar OS
            </button>
          )}
          <button className="botao-secundario" onClick={() => verSecao("detalhes")}>
            Andamento e entrega
          </button>
        </div>
        {!encerrada &&
          (parada ? (
            <button
              className="botao-secundario os-resumo-parada"
              onClick={() => verSecao("execucao")}
            >
              Serviço parado · Ver pendência <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : (
            proxima &&
            !os.orcamento_aguardando_id && (
              <button
                className="botao-secundario"
                disabled={ocupado}
                onClick={() => avancar(proxima[0])}
              >
                {proxima[1]} <ArrowRight size={16} aria-hidden="true" />
              </button>
            )
          ))}
      </div>
    </div>
  );
}
