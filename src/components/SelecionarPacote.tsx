import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { consultarProdutividade, itensPacote } from "../services/produtividade";
import type { ItemProposta } from "../services/orcamentos";
import { erroPublico } from "../lib/supabase";
import { SecaoRecolhivel } from "./SecaoRecolhivel";
export function SelecionarPacote({
  adicionar,
  quantidade,
  aoProcessar,
}: {
  adicionar: (itens: ItemProposta[]) => void;
  quantidade: number;
  aoProcessar: (ocupado: boolean) => void;
}) {
  const a = useAcesso();
  const trava = useRef(false);
  const [busy, setBusy] = useState(false),
    [aberto, setAberto] = useState(false),
    [erro, setErro] = useState("");
  const q = useQuery({
    queryKey: ["produtividade", a.oficina!.id, a.usuario],
    enabled: aberto && !a.demo && a.permite("work_orders"),
    queryFn: () => consultarProdutividade(a.oficina!.id),
  });
  if (!a.permite("work_orders") || a.demo) return null;
  return (
    <SecaoRecolhivel
      titulo="Pacotes de serviços"
      classe="pacotes-servicos-compacto"
      aoAlternar={setAberto}
    >
      <label>
        Adicionar pacote de serviços
        <select
          disabled={busy || q.isPending}
          value=""
          onChange={async (e) => {
            const id = e.target.value;
            if (!id || trava.current) return;
            trava.current = true;
            setBusy(true);
            aoProcessar(true);
            setErro("");
            try {
              const itens = await itensPacote(a.oficina!.id, id);
              if (quantidade + itens.length > 100)
                throw Error("O orçamento permite até 100 itens.");
              adicionar(itens);
            } catch (e) {
              setErro(erroPublico(e));
            } finally {
              trava.current = false;
              setBusy(false);
              aoProcessar(false);
            }
          }}
        >
          <option value="">{busy ? "Adicionando…" : "Escolha um pacote"}</option>
          {q.data?.pacotes
            .filter((p) => p.ativo)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
        </select>
      </label>
      {q.isSuccess && !q.data.pacotes.some((p) => p.ativo) && (
        <p>Nenhum pacote de serviços ativo.</p>
      )}
      {(erro || q.isError) && <p role="alert">{erro || erroPublico(q.error)}</p>}
    </SecaoRecolhivel>
  );
}
