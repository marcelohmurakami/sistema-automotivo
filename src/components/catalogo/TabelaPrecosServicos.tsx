import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Search } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import { dinheiro } from "../../lib/formatacao";
import { erroPublico } from "../../lib/supabase";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { usePaginacaoCursor } from "../../lib/usePaginacaoCursor";
import { paginaCatalogo, type CursorCatalogo } from "../../services/catalogo";
import {
  imprimirTabelaServicos,
  type ServicoTabelaPrecos,
} from "../../services/impressaoTabelaServicos";
import { Dialogo } from "../Dialogo";
import "./TabelaPrecosServicos.css";

export function TabelaPrecosServicos({ fechar }: { fechar: () => void }) {
  const a = useAcesso(),
    oficina = a.oficina!.id;
  const [busca, setBusca] = useState("");
  const termo = useBuscaDebounced(busca);
  const paginas = usePaginacaoCursor<CursorCatalogo>(JSON.stringify([oficina, termo]));
  const [selecionados, setSelecionados] = useState<Record<string, ServicoTabelaPrecos>>(
    {},
  );
  const [erro, setErro] = useState("");
  const [progresso, setProgresso] = useState<number | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  const controlador = useRef<AbortController | null>(null);
  useEffect(() => () => controlador.current?.abort(), []);
  const consulta = useQuery({
    queryKey: ["catalogo", a.demo, oficina, "tabela-precos", termo, paginas.cursor],
    queryFn: ({ signal }) =>
      paginaCatalogo(a.demo, oficina, termo, "ativos", false, paginas.cursor, signal),
  });
  const itens = (consulta.data?.itens || []).filter(
    (i) => i.tipo === "service" && !i.arquivado_em,
  );
  const quantidade = Object.keys(selecionados).length;
  const carregando = progresso !== null;
  function selecionar(item: ServicoTabelaPrecos, marcado: boolean) {
    setSelecionados((atuais) => {
      const novos = { ...atuais };
      if (marcado)
        novos[item.id] = {
          id: item.id,
          descricao: item.descricao,
          preco_padrao_centavos: item.preco_padrao_centavos,
        };
      else delete novos[item.id];
      return novos;
    });
  }
  async function selecionarTodos() {
    if (controlador.current) return;
    const controle = new AbortController();
    controlador.current = controle;
    setProgresso(0);
    setErro("");
    const novos: Record<string, ServicoTabelaPrecos> = {};
    const visitados = new Set<string>();
    let carregados = 0;
    let cursor: CursorCatalogo | null = null;
    try {
      do {
        const pagina = await paginaCatalogo(
          a.demo,
          oficina,
          termo,
          "ativos",
          false,
          cursor,
          controle.signal,
        );
        if (controle.signal.aborted) return;
        for (const item of pagina.itens)
          if (item.tipo === "service" && !item.arquivado_em) {
            if (!novos[item.id]) carregados++;
            novos[item.id] = {
              id: item.id,
              descricao: item.descricao,
              preco_padrao_centavos: item.preco_padrao_centavos,
            };
          }
        setProgresso(carregados);
        cursor = pagina.proximo;
        if (cursor) {
          if (visitados.has(cursor.id))
            throw new Error(
              "Não foi possível carregar todos os serviços. Tente novamente.",
            );
          visitados.add(cursor.id);
        }
      } while (cursor);
      setSelecionados((atuais) => ({ ...atuais, ...novos }));
    } catch (e) {
      if (!controle.signal.aborted) setErro(erroPublico(e));
    } finally {
      controlador.current = null;
      setProgresso(null);
    }
  }
  async function imprimir() {
    if (!quantidade || imprimindo || carregando) return;
    setErro("");
    setImprimindo(true);
    try {
      await imprimirTabelaServicos(a.oficina!.nome, Object.values(selecionados));
    } catch {
      setErro(
        "Não foi possível abrir a impressão. Permita a abertura da janela no navegador e tente novamente. Sua seleção foi mantida.",
      );
    } finally {
      setImprimindo(false);
    }
  }
  return (
    <Dialogo
      aberto
      fechar={fechar}
      titulo="Imprimir tabela de preços"
      classe="dialogo-tabela-precos"
    >
      <div className="tabela-precos-selecao">
        <p>Marque os serviços que devem aparecer na tabela.</p>
        <label className="tabela-precos-busca">
          <Search size={18} aria-hidden="true" />
          <input
            className="tabela-precos-termo"
            type="search"
            aria-label="Buscar serviços para imprimir"
            placeholder="Buscar serviço…"
            value={busca}
            disabled={carregando}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <div className="tabela-precos-comandos">
          <button
            className="botao-secundario"
            disabled={
              carregando || consulta.isFetching || !itens.length || busca !== termo
            }
            onClick={() => void selecionarTodos()}
          >
            {termo ? "Selecionar resultados" : "Selecionar todos"}
          </button>
          <button
            className="botao-secundario"
            disabled={!quantidade || carregando}
            onClick={() => setSelecionados({})}
          >
            Limpar seleção
          </button>
          <span role="status">{quantidade} selecionado(s)</span>
        </div>
        {carregando && (
          <p role="status">
            Carregando serviços: {progresso}{" "}
            <button
              className="botao-secundario"
              onClick={() => controlador.current?.abort()}
            >
              Cancelar seleção
            </button>
          </p>
        )}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        {consulta.isPending ? (
          <p role="status">Carregando serviços…</p>
        ) : consulta.isError ? (
          <div role="alert">
            <p>{erroPublico(consulta.error)}</p>
            <button
              className="botao-secundario"
              onClick={() => void consulta.refetch()}
            >
              Tentar novamente
            </button>
          </div>
        ) : !itens.length ? (
          <p>Nenhum serviço encontrado.</p>
        ) : (
          <div
            className="tabela-precos-lista"
            role="group"
            aria-label="Serviços disponíveis"
          >
            {itens.map((item) => (
              <label key={item.id} className="tabela-precos-linha">
                <input
                  type="checkbox"
                  checked={!!selecionados[item.id]}
                  disabled={carregando || consulta.isFetching}
                  onChange={(e) => selecionar(item, e.target.checked)}
                />
                <span>{item.descricao}</span>
                <strong>{dinheiro(item.preco_padrao_centavos)}</strong>
              </label>
            ))}
          </div>
        )}
        <div className="tabela-precos-paginacao">
          <button
            className="botao-secundario"
            disabled={!paginas.pagina || consulta.isFetching || carregando}
            onClick={paginas.anterior}
          >
            Anterior
          </button>
          <span>Página {paginas.pagina + 1}</span>
          <button
            className="botao-secundario"
            disabled={!consulta.data?.proximo || consulta.isFetching || carregando}
            onClick={() =>
              consulta.data?.proximo && paginas.proxima(consulta.data.proximo)
            }
          >
            Próxima
          </button>
        </div>
        <button
          className="botao-primario tabela-precos-imprimir"
          disabled={!quantidade || carregando || imprimindo}
          onClick={() => void imprimir()}
        >
          <Printer size={18} />
          {imprimindo
            ? "Preparando impressão…"
            : `Imprimir ${quantidade || ""} serviço${quantidade === 1 ? "" : "s"}`}
        </button>
      </div>
    </Dialogo>
  );
}
