import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { erroPublico } from "../../lib/supabase";
import { listarFornecedores } from "../../services/compras";
import { listarEstoque, type ProdutoEstoque } from "../../services/estoque";
import { BuscaCompra } from "../BuscaCompra";
import { useBusca } from "./helpers";
import { LerProduto } from "./EtiquetasEstoque";
export function EstadoConsulta({
  loading,
  error,
}: {
  loading: boolean;
  error: unknown;
}) {
  return (
    <>
      {loading && <p role="status">Carregando…</p>}
      {!!error && (
        <p className="erro-formulario" role="alert">
          {erroPublico(error)}
        </p>
      )}
    </>
  );
}
export function Paginacao({
  pagina,
  total,
  alterar,
}: {
  pagina: number;
  total: number;
  alterar: (p: number) => void;
}) {
  return (
    <div className="supr-paginacao">
      <span>
        {total} registros · Página {pagina + 1}
      </span>
      <button type="button" disabled={!pagina} onClick={() => alterar(pagina - 1)}>
        Anterior
      </button>
      <button
        type="button"
        disabled={(pagina + 1) * 30 >= total}
        onClick={() => alterar(pagina + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
export function EscolherFornecedor({
  selecionar,
  obrigatorio = true,
}: {
  selecionar: (id: string) => void;
  obrigatorio?: boolean;
}) {
  const a = useAcesso(),
    [busca, setBusca] = useState(""),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "fornecedores", a.oficina!.id, v, a.demo],
    queryFn: ({ signal }) =>
      listarFornecedores(a.demo, a.oficina!.id, v, false, 0, signal),
  });
  return (
    <>
      <BuscaCompra
        rotulo={obrigatorio ? "Fornecedor" : "Fornecedor preferencial (opcional)"}
        valor={busca}
        alterar={(v) => {
          setBusca(v);
          selecionar("");
        }}
        opcoes={(q.data?.itens ?? []).map((f) => ({ id: f.id, nome: f.nome }))}
        selecionar={(o) => {
          setBusca(o.nome);
          selecionar(o.id);
        }}
        carregando={q.isFetching || busca !== v}
        obrigatorio={obrigatorio}
      />
      <EstadoConsulta loading={false} error={q.error} />
    </>
  );
}
export function EscolherProduto({
  selecionar,
}: {
  selecionar: (p: ProdutoEstoque) => void;
}) {
  const a = useAcesso(),
    [busca, setBusca] = useState(""),
    v = useBusca(busca);
  const q = useQuery({
    queryKey: ["suprimentos", "produtos", a.oficina!.id, v, a.demo],
    queryFn: ({ signal }) =>
      listarEstoque(a.demo, a.oficina!.id, v, "controlados", 0, signal),
  });
  return (
    <>
      <BuscaCompra
        rotulo="Adicionar produto"
        valor={busca}
        alterar={setBusca}
        opcoes={(q.data?.itens ?? []).map((p) => ({
          id: p.id,
          nome: p.descricao,
          detalhe: `${p.disponivel ?? p.saldo ?? 0} ${p.unidade} disponíveis`,
        }))}
        selecionar={(o) => {
          const p = q.data?.itens.find((p) => p.id === o.id);
          if (p) selecionar(p);
          setBusca("");
        }}
        carregando={q.isFetching || busca !== v}
      />
      {!a.demo && <LerProduto selecionar={selecionar} />}
      <EstadoConsulta loading={false} error={q.error} />
    </>
  );
}
