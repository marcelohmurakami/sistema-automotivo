import { dinheiro } from "../lib/formatacao";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Star } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { useCatalogoBusca } from "../lib/useCatalogoBusca";
import { interfaceRamo } from "../lib/interfaceRamo";

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
  const q = useCatalogoBusca(
    busca,
    "service",
    !["ready", "delivered", "cancelled"].includes(os.situacao) &&
      !os.orcamento_origem_id &&
      !os.orcamento_aguardando_id,
  );
  if (
    !a.permite("catalog") ||
    ["ready", "delivered", "cancelled"].includes(os.situacao) ||
    os.orcamento_origem_id ||
    os.orcamento_aguardando_id
  )
    return null;
  const itens = q.aguardando ? [] : q.data || [];
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
          placeholder={`Ex.: ${interfaceRamo(a.oficina?.ramo, os.ficha_especialidade?.especialidade || a.oficina?.especialidade).exemploServico}`}
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
        {itens.slice(0, busca.trim() ? 8 : 4).map((i) => (
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
      {itens.length > (busca.trim() ? 8 : 4) && (
        <p>Digite o nome para encontrar outros serviços.</p>
      )}
      {q.isSuccess && !itens.length && (
        <p>
          Nenhum serviço encontrado. Cadastre no catálogo ou adicione um item avulso
          abaixo.
        </p>
      )}
    </section>
  );
}
