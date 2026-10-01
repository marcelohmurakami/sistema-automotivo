import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Star } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { listarCatalogo } from "../services/catalogo";
import { filtrarCatalogo } from "../lib/catalogo";
import { dinheiro } from "../services/orcamentos";
import { erroPublico } from "../lib/supabase";
import type { OrdemServico } from "../services/ordensServico";
export function ServicosNaOS({
  os,
  ocupado,
  executar,
  operar,
}: {
  os: OrdemServico;
  ocupado: boolean;
  executar: (fn: () => Promise<unknown>) => Promise<void>;
  operar: (acao: string, dados: Record<string, unknown>) => Promise<void>;
}) {
  const a = useAcesso(),
    [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["catalogo", a.demo, a.oficina!.id],
    queryFn: () => listarCatalogo(a.demo, a.oficina!.id),
    enabled: a.permite("catalog"),
  });
  if (
    !a.permite("catalog") ||
    ["ready", "delivered", "cancelled"].includes(os.situacao) ||
    os.orcamento_origem_id
  )
    return null;
  const itens = filtrarCatalogo(
    q.data ?? [],
    busca,
    "service",
    "ativos",
    false,
  );
  return (
    <section className="estoque-os">
      <div className="os-linha">
        <h3>Serviços do catálogo</h3>
        <Link to="/catalogo">Administrar catálogo</Link>
      </div>
      <label>
        Encontrar serviço
        <input
          aria-label="Buscar serviço para OS"
          placeholder="Ex.: alinhamento…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </label>
      {q.isPending && <p>Carregando serviços…</p>}
      {q.isError && (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Tentar novamente</button>
        </p>
      )}
      <div className="catalogo-rapido">
        {itens.slice(0, 8).map((i) => (
          <button
            key={i.id}
            disabled={ocupado || os.itens.length >= 100}
            onClick={() =>
              void executar(() =>
                operar("adicionar_servico_catalogo_os", {
                  p_revisao: os.revisao,
                  p_servico: i.id,
                }),
              )
            }
          >
            <Plus size={16} />
            <span>
              {i.favorito && <Star size={12} />} {i.descricao}
              <small>
                {dinheiro(i.preco_padrao_centavos)} / {i.unidade}
              </small>
            </span>
          </button>
        ))}
      </div>
      {itens.length > 8 && <p>Digite o nome para encontrar outros serviços.</p>}
      {q.isSuccess && !itens.length && (
        <p>
          Nenhum serviço encontrado. Cadastre no catálogo ou adicione um item
          avulso abaixo.
        </p>
      )}
    </section>
  );
}
