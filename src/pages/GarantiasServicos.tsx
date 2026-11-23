import { novaOcorrencia, tiposOcorrencia } from "../lib/ocorrenciasAtendimento";
import { useState } from "react";
import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { consultarOcorrenciasServicos } from "../services/ocorrenciasServicos";
import {
  consultarDetalhesAtendimento,
  operarAtendimento,
} from "../services/servicosCompletos";
import { operacaoQualidade } from "../services/qualidadeAvancada";
import type { DocumentoQualidade } from "../lib/qualidadeAvancada";
import type { QualidadeAtendimento } from "../types/servicosCompletos";
import { erroPublico } from "../lib/supabase";
import { atualizarQualidade } from "../lib/atualizarQualidade";
import { usePeriodoRelatorios } from "../lib/usePeriodoRelatorios";
import { PeriodoRelatorios } from "../components/relatorios/ControlesRelatorios";
import { Dialogo } from "../components/Dialogo";
import { BuscaCompra } from "../components/BuscaCompra";
import {
  FormularioOcorrencia,
  ListaOcorrencias,
  ResumoOcorrencias,
} from "../components/qualidade/OcorrenciasAtendimento";

export function GarantiasServicos() {
  const a = useAcesso(),
    w = a.oficina!,
    qc = useQueryClient();
  const { periodo, aplicar, invalido } = usePeriodoRelatorios();
  const [busca, setBusca] = useState(""),
    [situacao, setSituacao] = useState("todas"),
    [tipo, setTipo] = useState(""),
    [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState(false),
    [edicao, setEdicao] = useState<QualidadeAtendimento | null>(null),
    [buscaOs, setBuscaOs] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [aviso, setAviso] = useState("");
  const permitido = w.perfil !== "staff" && a.permite("reports");
  const termoOs = useBuscaDebounced(buscaOs);
  const q = useQuery({
    queryKey: ["qualidade-servicos", w.id, periodo.inicio, periodo.fim, a.demo],
    queryFn: ({ signal }) =>
      consultarOcorrenciasServicos(a.demo, w.id, periodo.inicio, periodo.fim, signal),
    enabled: permitido,
  });
  const docs = useQuery({
    queryKey: ["qualidade-avancada", w.id, a.demo, "selecao-retorno", termoOs],
    queryFn: ({ signal }) =>
      operacaoQualidade<DocumentoQualidade[]>(
        a.demo,
        "buscar_documentos_qualidade",
        { p_oficina: w.id, p_busca: termoOs, p_retirada: false },
        signal,
      ),
    enabled: permitido && aberto && !edicao,
  });
  const d = useQuery({
    queryKey: ["detalhes-atendimento", w.id, edicao?.atendimento_id],
    queryFn: ({ signal }) =>
      consultarDetalhesAtendimento(a.demo, w.id, edicao!.atendimento_id, signal),
    enabled: permitido && aberto && !!edicao,
  });
  if (!permitido)
    return (
      <section>
        <p>O acompanhamento está disponível para gestores nos planos com relatórios.</p>
        <Link to="/planos">Ver meu plano</Link>
      </section>
    );
  const todos = q.data || [];
  const termo = busca
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const filtrados = todos
    .filter(
      (i) =>
        (!tipo || i.tipo === tipo) &&
        (situacao === "todas" ||
          (situacao === "resolvidas" ? !!i.resolvido_em : !i.resolvido_em)) &&
        `${i.cliente} ${i.titulo} ${i.motivo}`
          .toLocaleLowerCase("pt-BR")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(termo),
    )
    .sort(
      (a, b) =>
        Number(!!a.resolvido_em) - Number(!!b.resolvido_em) ||
        b.aberto_em.localeCompare(a.aberto_em) ||
        a.id.localeCompare(b.id),
    );
  const ultima = Math.max(0, Math.ceil(filtrados.length / 25) - 1),
    atual = Math.min(pagina, ultima);
  const fechar = () => {
    if (!ocupado) {
      setAberto(false);
      setEdicao(null);
    }
  };
  return (
    <section className="qserv" aria-label="Controle de retornos">
      <header className="qserv-cabecalho">
        <div>
          <h2>Ocorrências</h2>
          <p>Registre o problema, acompanhe a solução e confira o custo.</p>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            setEdicao(null);
            setBuscaOs("");
            setAviso("");
            setAberto(true);
          }}
        >
          <Plus size={18} />
          Registrar ocorrência
        </button>
      </header>
      <PeriodoRelatorios
        periodo={periodo}
        aplicar={(p) => {
          setPagina(0);
          aplicar(p);
        }}
        invalido={invalido}
      />
      {aviso && <p role="status">{aviso}</p>}
      {q.isPending ? (
        <p role="status">Carregando ocorrências…</p>
      ) : q.isError ? (
        <div role="alert">
          <p>{erroPublico(q.error)}</p>
          <button onClick={() => q.refetch()}>Tentar novamente</button>
        </div>
      ) : (
        <>
          <ResumoOcorrencias itens={todos} />
          <div className="qserv-filtros">
            <label>
              Buscar ocorrência
              <input
                type="search"
                value={busca}
                placeholder="Cliente, serviço ou problema"
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(0);
                }}
              />
            </label>
            <label>
              Situação
              <select
                value={situacao}
                onChange={(e) => {
                  setSituacao(e.target.value);
                  setPagina(0);
                }}
              >
                <option value="todas">Todas</option>
                <option value="abertas">Em aberto</option>
                <option value="resolvidas">Resolvidas</option>
              </select>
            </label>
            <label>
              Tipo
              <select
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value);
                  setPagina(0);
                }}
              >
                <option value="">Todos os tipos</option>
                {Object.entries(tiposOcorrencia).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <small>
            Ocorrências abertas no período selecionado. Clique na linha para atualizar
            ou resolver.
          </small>
          <ListaOcorrencias
            itens={filtrados.slice(atual * 25, atual * 25 + 25)}
            filtrada={!!busca || !!tipo || situacao !== "todas"}
            abrir={(i) => {
              setEdicao(i);
              setAberto(true);
              setAviso("");
            }}
          />
          {filtrados.length > 25 && (
            <div className="qserv-paginacao">
              <span>
                Página {atual + 1} de {ultima + 1}
              </span>
              <button disabled={!atual} onClick={() => setPagina(atual - 1)}>
                Anterior
              </button>
              <button disabled={atual === ultima} onClick={() => setPagina(atual + 1)}>
                Próxima
              </button>
            </div>
          )}
        </>
      )}
      {aberto && (
        <Dialogo
          aberto
          fechar={fechar}
          titulo={edicao?.revisao ? "Atualizar ocorrência" : "Registrar ocorrência"}
          classe="qserv-dialogo"
        >
          {!edicao ? (
            <div className="qserv-form">
              <p>Selecione a OS em que o problema aconteceu.</p>
              <BuscaCompra
                rotulo="Ordem de serviço"
                valor={buscaOs}
                alterar={setBuscaOs}
                selecionar={(opcao) => setEdicao(novaOcorrencia(opcao.id))}
                opcoes={(docs.data || [])
                  .filter((doc) => doc.origem === "atendimento")
                  .map((doc) => ({
                    id: doc.id,
                    nome: `OS #${doc.numero} · ${doc.cliente}`,
                    detalhe: doc.objeto,
                  }))}
                carregando={docs.isFetching}
              />
              {docs.isError && <p role="alert">{erroPublico(docs.error)}</p>}
            </div>
          ) : d.isPending ? (
            <p role="status">Carregando OS…</p>
          ) : d.isError ? (
            <p role="alert">{erroPublico(d.error)}</p>
          ) : (
            d.data && (
              <>
                <p className="qserv-contexto">
                  OS #{d.data.atendimento.numero} · {d.data.cliente.nome}
                  <br />
                  {d.data.objeto?.nome || d.data.atendimento.titulo}
                </p>
                <FormularioOcorrencia
                  key={edicao.id}
                  ocorrencia={edicao}
                  equipe={d.data.equipe}
                  ocupado={ocupado}
                  cancelar={fechar}
                  salvar={async (args) => {
                    setOcupado(true);
                    try {
                      await operarAtendimento(
                        a.demo,
                        w.id,
                        "salvar_qualidade_atendimento",
                        { p_atendimento: edicao.atendimento_id, ...args },
                      );
                      await atualizarQualidade(qc);
                      setAviso("Ocorrência salva.");
                      setAberto(false);
                      setEdicao(null);
                    } finally {
                      setOcupado(false);
                    }
                  }}
                />
              </>
            )
          )}
        </Dialogo>
      )}
    </section>
  );
}
