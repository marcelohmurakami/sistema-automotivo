import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { rpc } from "../lib/rpc";
import { supabase, erroPublico } from "../lib/supabase";
import { baixarArquivo, nomeArquivoSeguro } from "../lib/portabilidade";
import { SecaoRecolhivel } from "./SecaoRecolhivel";
type Anexo = {
  id: string;
  nome: string;
  caminho: string;
  origem: string;
  id_externo: string;
};
export function AnexosImportados() {
  const a = useAcesso(),
    [busca, setBusca] = useState(""),
    [pagina, setPagina] = useState(0),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false);
  const [aberto, setAberto] = useState(false);
  const termoConsulta1 = useBuscaDebounced(busca);
  const q = useQuery({
    queryKey: ["anexos-importados", a.usuario, a.oficina?.id, termoConsulta1, pagina],
    enabled: aberto && !a.demo && a.oficina?.perfil === "owner",
    queryFn: ({ signal }) =>
      rpc<Anexo[]>(
        "listar_anexos_portabilidade",
        {
          p_oficina: a.oficina!.id,
          p_busca: termoConsulta1,
          p_pagina: pagina,
        },
        signal,
      ),
  });
  if (a.oficina?.perfil !== "owner") return null;
  return (
    <SecaoRecolhivel titulo="Arquivos do sistema anterior" aoAlternar={setAberto}>
      <div className="dados-bloco">
        <label>
          Buscar arquivo ou referência
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
          />
        </label>
        {q.isPending && !a.demo && <p>Consultando arquivos…</p>}
        {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
        {erro && <p role="alert">{erro}</p>}
        {q.data?.length === 0 && <p>Nenhum arquivo encontrado.</p>}
        <ul className="dados-lista">
          {q.data?.map((f) => (
            <li key={f.id}>
              <span>
                <strong>{f.nome}</strong>
                <small>
                  {f.origem} · {f.id_externo}
                </small>
              </span>
              <button
                disabled={busy}
                className="botao-secundario"
                onClick={async () => {
                  setBusy(true);
                  setErro("");
                  try {
                    const r = await supabase!.storage
                      .from("company-portability")
                      .download(f.caminho);
                    if (r.error) throw r.error;
                    baixarArquivo(nomeArquivoSeguro(f.nome), r.data);
                  } catch (e) {
                    setErro(erroPublico(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Baixar
              </button>
            </li>
          ))}
        </ul>
        <div className="dados-acoes">
          <button
            disabled={!pagina || q.isFetching}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <button
            disabled={q.data?.length !== 50 || q.isFetching}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      </div>
    </SecaoRecolhivel>
  );
}
