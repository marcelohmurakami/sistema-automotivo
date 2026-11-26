import { ProfissionalAgendamento } from "../funcionarios/ProfissionalAgendamento";
import { dadosProfissional } from "../../services/gestaoFuncionario";
import { OpcoesDocumento, ResumoDocumento } from "../LayoutDocumentoServico";
import { AgendamentoRecorrente } from "../AgendamentoRecorrente";
import { regraFormulario } from "../../services/calendarioOperacao";
import { useQuery } from "@tanstack/react-query";
import { DistribuicaoAgenda } from "../DistribuicaoAgenda";
import { ReservaRecursos } from "../ReservaRecursos";
import { dadosRecursos } from "../../services/reservasRecursos";
import {
  dadosDistribuicao,
  type CandidatoTecnico,
} from "../../services/distribuicaoTecnicos";
import { CamposTaxaDiagnostico } from "../TaxaDiagnostico";
import { PlanejamentoVisita } from "../PlanejamentoVisita";
import { dadosVisita } from "../../lib/logisticaVisitas";
import { taxaDoFormulario } from "../../lib/diagnosticoOrcamento";
import { Camera } from "lucide-react";
import { EstadoCriacaoOS } from "../EstadoCriacaoOS";
import { CamposPagamentoAtendimento } from "../CamposAtendimento";
import { CampoEntregaPrometida } from "../PrazoEntrega";
import { tituloAtendimento } from "../../lib/tituloAtendimento";
import { dataSaoPaulo } from "../../lib/alertas";
import { useRef, useState, type FormEvent } from "react";
import { useAcesso } from "../../auth/contexto";
import { EditorFichaEspecialidade } from "../../components/FichaEspecialidade";
import { RecepcaoEspecializada } from "../../components/RecepcaoEspecializada";
import { CampoDetalhesServico, CampoTipoServico } from "../../components/TipoServico";
import { concluirReparo, etapasEmAndamento } from "../../lib/assistenciaTecnica";
import { dinheiro } from "../../lib/formatacao";
import { interfaceRamo } from "../../lib/interfaceRamo";
import { fichaDoAtendimento, subsetoresDoRamo } from "../../lib/operacaoServicos";
import {
  novaFichaEspecialidade,
  perfilAtendimento,
  validarFichaEspecialidade,
} from "../../lib/perfisAtendimento";
import { ramos, type Ramo } from "../../lib/ramos";
import { erroPublico } from "../../lib/supabase";
import { buscarSelecaoServicos } from "../../services/painelServicos";
import type { ObjetoServico } from "../../services/servicos";
import { consultarDetalhesAtendimento } from "../../services/servicosCompletos";
import { SelecaoOperacao } from "./SelecaoOperacao";
import { CadastroRapidoServico } from "./CadastroRapidoServico";
import { EditorItensOS, type ItemEditorOS } from "../EditorItensOS";
import { itensParaAtendimento } from "../../lib/itensServico";
import { totaisItens } from "../../lib/calculosAtendimento";
import { useDesconto } from "../../lib/useDesconto";
import { lerCatalogoDemo } from "../../lib/catalogo";
import { lerEstoqueDemo } from "../../services/estoque";

import {
  diaLocal,
  estadosAgenda,
  estadosServico,
  horaLocal,
  type PainelServicos,
} from "../../services/servicos";

import type { Editor } from "./tipos";
const camposObjeto: Record<Ramo, [string, string][]> = {
  automotivo: [],
  assistencia_tecnica: [
    ["marca", "Marca"],
    ["modelo", "Modelo"],
    ["serie", "Número de série / IMEI"],
    ["acessorios", "Acessórios recebidos"],
    ["condicao", "Condição na entrada"],
  ],
  manutencao_campo: [
    ["endereco", "Endereço completo"],
    ["equipamento", "Equipamento / instalação"],
    ["serie", "Identificação do equipamento"],
    ["contato", "Contato no local"],
    ["acesso", "Orientações de acesso"],
  ],
  limpeza: [
    ["endereco", "Endereço completo"],
    ["area", "Área em m²"],
    ["ambientes", "Ambientes"],
    ["contato", "Contato no local"],
    ["acesso", "Orientações de acesso"],
  ],
};
const camposAtendimento: Record<Ramo, [string, string][]> = {
  automotivo: [],
  assistencia_tecnica: [
    ["solicitacao", "Defeito relatado"],
    ["diagnostico", "Diagnóstico técnico"],
    ["execucao", "Reparo executado"],
    ["materiais", "Peças e materiais"],
    ["garantia", "Condições de garantia"],
    ["observacoes_cliente", "Observações para o cliente (impressas na nota)"],
  ],
  manutencao_campo: [
    ["solicitacao", "Problema / manutenção solicitada"],
    ["diagnostico", "Diagnóstico no local"],
    ["execucao", "Serviços executados"],
    ["materiais", "Materiais utilizados"],
    ["orientacoes", "Orientações ao cliente"],
  ],
  limpeza: [
    ["solicitacao", "Tipo de limpeza e escopo"],
    ["restricoes", "Superfícies e cuidados especiais"],
    ["execucao", "Serviço realizado"],
    ["materiais", "Produtos e materiais"],
    ["orientacoes", "Orientações ao cliente"],
  ],
};
export function FormularioServico({
  editor,
  ramo,
  dados,
  ocupado,
  erro,
  salvar: salvarRegistro,
}: {
  editor: Editor;
  ramo: Ramo;
  dados: PainelServicos;
  ocupado: boolean;
  erro: string;
  salvar: (
    f: string,
    args: Record<string, unknown>,
    abrirFotos?: boolean,
    pronto?: boolean,
  ) => void;
}) {
  const acesso = useAcesso();
  const orcamentoSimples =
    editor.tipo === "atendimento" && editor.item.dados.documento === "orcamento";
  const formularioSimples = editor.tipo === "atendimento";
  const destinoFotos = useRef(false);
  const destinoPronto = useRef(false);
  const [servicoPronto, setServicoPronto] = useState(false);
  const [entregaPrevista, setEntregaPrevista] = useState(
    editor.tipo === "atendimento" ? editor.item.dados.entrega_prevista_em || "" : "",
  );
  function salvar(f: string, args: Record<string, unknown>) {
    salvarRegistro(
      f,
      args,
      editor.tipo === "atendimento" && destinoFotos.current,
      editor.tipo === "atendimento" && destinoPronto.current,
    );
  }
  const podeEditarValores = acesso.oficina?.perfil !== "staff";
  const [itens, setItens] = useState<ItemEditorOS[]>([]);
  const controleDesconto = useDesconto(
    itens.reduce(
      (total, i) => total + Math.round(i.quantidade * i.preco_unitario_centavos),
      0,
    ),
  );
  const desconto = controleDesconto.centavos;
  const [mostrarDescontoNota, setMostrarDescontoNota] = useState(
    editor.tipo === "atendimento" && editor.item.mostrar_desconto_nota === true,
  );
  const [editandoItem, setEditandoItem] = useState(false);
  const [criandoItem, setCriandoItem] = useState(false);
  const [ficha, setFicha] = useState(() =>
    editor.tipo === "atendimento"
      ? fichaDoAtendimento(
          editor.item,
          perfilAtendimento(acesso.oficina?.especialidade, ramo).id,
        )
      : novaFichaEspecialidade(
          perfilAtendimento(acesso.oficina?.especialidade, ramo).id,
        ),
  );
  const fichasEmEdicao = useRef<Record<string, typeof ficha>>({});
  const [cliente, setCliente] = useState(
      "cliente_id" in editor.item ? editor.item.cliente_id : "",
    ),
    [erroLocal, setErroLocal] = useState("");
  const [objetoId, setObjetoId] = useState(
    editor.tipo === "atendimento" ? editor.item.objeto_id : "",
  );
  const [objetoEscolhido, setObjetoEscolhido] = useState<ObjetoServico>();
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const item = editor.item;
  const recorrente =
    editor.tipo === "agenda" &&
    !!editor.recorrente &&
    !item.revisao &&
    !acesso.demo &&
    acesso.oficina?.perfil !== "staff";
  const [quantidadeVisitas, setQuantidadeVisitas] = useState(recorrente ? 4 : 1);
  const [calculandoTrajeto, setCalculandoTrajeto] = useState(false);
  const [origemEquipe, setOrigemEquipe] = useState<CandidatoTecnico>();
  const [inicioAgenda, setInicioAgenda] = useState(
    editor.tipo === "agenda" ? editor.item.inicio : "",
  );
  const [fimAgenda, setFimAgenda] = useState(
    editor.tipo === "agenda"
      ? editor.item.revisao
        ? editor.item.fim
        : new Date(Date.parse(editor.item.inicio) + 3600000).toISOString()
      : "",
  );
  const [recursoAgenda, setRecursoAgenda] = useState(
    editor.tipo === "agenda" ? editor.item.recurso_id : "",
  );
  const [modoVisitas, setModoVisitas] = useState("independentes");
  const podeProgramarVisitas = ramo === "limpeza" && acesso.oficina?.perfil !== "staff";
  const [modeloVisitas, setModeloVisitas] = useState(
    editor.tipo === "agenda" ? editor.item.atendimento_id : "",
  );
  const consultaModelo = useQuery({
    queryKey: [
      "selecao-operacao",
      acesso.oficina!.id,
      acesso.demo,
      "atendimentos",
      "",
      "id",
      modeloVisitas,
    ],
    queryFn: ({ signal }) =>
      buscarSelecaoServicos(
        acesso.oficina!.id,
        acesso.demo,
        "atendimentos",
        "",
        "",
        modeloVisitas,
        signal,
      ),
    enabled: editor.tipo === "agenda" && !!modeloVisitas,
    staleTime: 60_000,
  });
  const visitasIndependentes =
    recorrente && podeProgramarVisitas && modoVisitas === "independentes";
  const aguardandoModelo =
    visitasIndependentes &&
    editor.tipo === "agenda" &&
    !item.revisao &&
    !consultaModelo.data?.[0];
  const linguagem = interfaceRamo(ramo, ficha.especialidade);
  const detalhes = useQuery({
    queryKey: ["detalhes-atendimento", acesso.oficina!.id, item.id],
    enabled: editor.tipo === "atendimento" && !!item.revisao,
    queryFn: ({ signal }) =>
      consultarDetalhesAtendimento(acesso.demo, acesso.oficina!.id, item.id, signal),
  });
  const totalPorItens = !!detalhes.data?.itens.length;
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    destinoFotos.current =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "fotos";
    const pronto =
      editor.tipo === "atendimento" &&
      !item.revisao &&
      editor.item.dados.documento === "ordem" &&
      servicoPronto &&
      !destinoFotos.current;
    destinoPronto.current = pronto;
    if (
      ocupado ||
      calculandoTrajeto ||
      editandoItem ||
      criandoItem ||
      cadastroAberto ||
      aguardandoModelo ||
      (editor.tipo === "atendimento" && !!item.revisao && !detalhes.data)
    )
      return;
    setErroLocal("");
    if (pronto && !itens.length) {
      setErroLocal("Inclua os serviços realizados antes de marcar como pronto.");
      return;
    }
    const f = new FormData(e.currentTarget),
      str = (k: string) => String(f.get(k) || "");
    const base = { p_id: item.id, p_revisao: item.revisao || null };
    if (editor.tipo === "recurso") {
      salvar("salvar_recurso_agenda", {
        ...base,
        p_nome: str("nome"),
        p_ativo: f.has("ativo"),
      });
      return;
    }
    let valores: Record<string, unknown> = {};
    if (editor.tipo === "objeto") {
      valores = {
        cliente_id: cliente,
        nome: str("nome"),
        arquivado: f.has("arquivado"),
        dados: {
          ...editor.item.dados,
          ...Object.fromEntries(camposObjeto[ramo].map(([k]) => [k, str(k)])),
        },
      };
    }
    if (editor.tipo === "atendimento") {
      try {
        validarFichaEspecialidade(ficha);
        if (!item.revisao && podeEditarValores)
          totaisItens(itensParaAtendimento(itens), desconto);
      } catch (erro) {
        setErroLocal((erro as Error).message);
        return;
      }
      const objeto =
        objetoEscolhido?.id === objetoId
          ? objetoEscolhido
          : detalhes.data?.objeto.id === objetoId
            ? detalhes.data.objeto
            : dados.objetos.find((o) => o.id === objetoId);
      const valor = Number(str("valor").replace(",", "."));
      if (!Number.isFinite(valor) || valor < 0) {
        setErroLocal("Informe um valor válido.");
        return;
      }
      valores = {
        ...editor.item,
        mostrar_desconto_nota: mostrarDescontoNota,
        cliente_id: cliente,
        ficha_especialidade: ficha,
        objeto_id: str("objeto_id"),
        titulo: tituloAtendimento(
          str("titulo"),
          item.revisao ? detalhes.data?.itens || [] : itens,
          objeto?.nome || "",
          linguagem.ordem,
        ),
        situacao: pronto ? "concluido" : str("situacao") || editor.item.situacao,
        valor_centavos: Math.round(valor * 100),
        vencimento:
          str("vencimento_pagamento") ||
          (item.revisao ? editor.item.vencimento : "") ||
          str("data_servico"),
        data_servico: str("data_servico"),
        taxa_diagnostico: taxaDoFormulario(f),
        dados: {
          ...editor.item.dados,
          forma_pagamento: str("forma_pagamento"),
          descricao_servico: str("titulo").trim(),
          entrega_prevista_em: entregaPrevista,
          observacoes_cliente: str("observacoes_cliente"),
          ...Object.fromEntries(camposAtendimento[ramo].map(([k]) => [k, str(k)])),
          ...(linguagem.assistencia ? { solicitacao: ficha.campos.defeito || "" } : {}),
          ...(linguagem.manutencao
            ? { solicitacao: ficha.campos.solicitacao || "" }
            : {}),
          tipo_servico: str("tipo_servico"),
          detalhes_especialidade: str("detalhes_especialidade"),
          checklist: str("checklist"),
          conferencia: str("conferencia"),
        },
      };
      if (ramo === "manutencao_campo" || ramo === "limpeza") {
        valores.ficha_especialidade = {
          ...ficha,
          campos: {
            ...ficha.campos,
            endereco_visita:
              ficha.campos.endereco_visita?.trim() || objeto?.dados.endereco || "",
          },
        };
      }
      if (
        linguagem.assistencia &&
        valores.situacao === "concluido" &&
        editor.item.situacao !== "concluido"
      ) {
        valores.ficha_especialidade = concluirReparo(
          { ...editor.item, ficha_especialidade: ficha },
          ficha.especialidade,
        ).ficha_especialidade;
      }
    }
    if (editor.tipo === "agenda") {
      const inicio = new Date(`${str("inicio")}:00-03:00`),
        fim = new Date(`${str("fim")}:00-03:00`);
      if (
        !Number.isFinite(inicio.getTime()) ||
        !Number.isFinite(fim.getTime()) ||
        fim <= inicio
      ) {
        setErroLocal("O término deve ser posterior ao início.");
        return;
      }
      valores = {
        atendimento_id: str("atendimento_id"),
        recurso_id: str("recurso_id"),
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        situacao: str("situacao"),
        observacoes: str("observacoes"),
        distribuicao: dadosDistribuicao(f),
        profissional: dadosProfissional(f),
        recursos_reservados: dadosRecursos(f),
        ...(recorrente ? { regra_calendario: regraFormulario(f) } : {}),
        ...dadosVisita(f),
      };
      if (recorrente) {
        salvar(
          visitasIndependentes
            ? "programar_visitas_limpeza"
            : acesso.demo
              ? "agendar_serie_servico"
              : "programar_agenda_calendario",
          {
            p_chave: item.id,
            p_dados: visitasIndependentes
              ? { ...valores, nova_situacao: str("nova_situacao") }
              : valores,
            p_quantidade: Number(str("quantidade")),
            ...(visitasIndependentes || acesso.demo
              ? { p_intervalo: Number(str("intervalo")) }
              : {}),
            ...(visitasIndependentes
              ? {
                  p_revisao: consultaModelo.data?.[0]?.revisao,
                }
              : {}),
          },
        );
        return;
      }
    }
    salvar(
      editor.tipo === "objeto"
        ? "salvar_objeto_atendimento"
        : editor.tipo === "atendimento"
          ? !item.revisao && podeEditarValores
            ? "criar_atendimento_com_itens"
            : "salvar_atendimento_servico"
          : "salvar_agenda_servico",
      {
        ...base,
        p_dados: valores,
        ...(!item.revisao && editor.tipo === "atendimento" && podeEditarValores
          ? { p_itens: itensParaAtendimento(itens), p_desconto: desconto }
          : {}),
      },
    );
  }
  const dataInput = (v: string) => `${diaLocal(v)}T${horaLocal(v)}`;
  const rodapeItens =
    editor.tipo === "atendimento" ? (
      <>
        <CampoEntregaPrometida
          inicial={entregaPrevista || null}
          situacao={editor.item.situacao === "concluido" ? "ready" : "open"}
          alterar={(iso) => {
            setEntregaPrevista(iso || "");
            setFicha((atual) => ({
              ...atual,
              campos: {
                ...atual.campos,
                prazo_servico: iso ? dataSaoPaulo(new Date(iso)) : "",
              },
            }));
          }}
        />
        {!entregaPrevista && ficha.campos.prazo_servico && (
          <p className="texto-suave">
            Prazo já registrado:{" "}
            {ficha.campos.prazo_servico.split("-").reverse().join("/")}. Horário não
            informado.
          </p>
        )}
        <label>
          Descrição do serviço (opcional)
          <textarea
            name="titulo"
            rows={2}
            maxLength={180}
            placeholder={`Ex.: ${linguagem.exemploServico}`}
            defaultValue={editor.item.dados.descricao_servico ?? editor.item.titulo}
          />
        </label>
        <label>
          Observações (opcional)
          <textarea
            name="observacoes_cliente"
            rows={2}
            maxLength={3000}
            className="atendimento-observacoes-compactas"
            defaultValue={editor.item.dados.observacoes_cliente || ""}
          />
        </label>
        <p className="texto-suave">
          Estas observações aparecem na impressão da OS, abaixo dos serviços e{" "}
          {linguagem.assistencia ? "peças" : "materiais"}.
        </p>
      </>
    ) : null;
  const campoDataServico =
    editor.tipo === "atendimento" ? (
      <label>
        Data do serviço
        <input
          name="data_servico"
          type="date"
          required
          defaultValue={editor.item.data_servico || diaLocal(new Date())}
        />
      </label>
    ) : null;
  const campoPagamento =
    editor.tipo === "atendimento" ? (
      <CamposPagamentoAtendimento
        vencimentoDireto
        inicial={{
          forma_pagamento: editor.item.dados.forma_pagamento || "Carteira",
          vencimento_pagamento: item.revisao ? editor.item.vencimento : "",
        }}
      />
    ) : null;
  return (
    <form
      className={`formulario-cliente servicos-formulario assistencia-formulario${editor.tipo === "atendimento" ? " formulario-ordem-compartilhado" : ""}${formularioSimples ? " documento-simples" : ""}`}
      onSubmit={enviar}
    >
      {editor.tipo === "atendimento" && !!item.revisao && detalhes.isPending && (
        <p role="status">Conferindo os itens e valores da ordem…</p>
      )}
      {editor.tipo === "atendimento" && detalhes.isError && (
        <p role="alert">
          {erroPublico(detalhes.error)}{" "}
          <button type="button" onClick={() => void detalhes.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      <fieldset
        disabled={
          ocupado || (editor.tipo === "atendimento" && !!item.revisao && !detalhes.data)
        }
      >
        {editor.tipo === "recurso" ? (
          <>
            <label>
              Nome
              <input
                name="nome"
                required
                minLength={2}
                maxLength={120}
                defaultValue={editor.item.nome}
              />
            </label>
            <label>
              <input type="checkbox" name="ativo" defaultChecked={editor.item.ativo} />{" "}
              Ativo para novos agendamentos
            </label>
          </>
        ) : editor.tipo === "objeto" ? (
          <>
            <SelecaoOperacao
              tipo="clientes"
              rotulo="Cliente"
              valor={cliente}
              selecionar={(id) => {
                setCliente(id);
                setObjetoId("");
                setObjetoEscolhido(undefined);
              }}
            />
            <label>
              {ramos[ramo].objeto}
              <input
                name="nome"
                required
                minLength={2}
                maxLength={160}
                placeholder={
                  linguagem.assistencia
                    ? `Ex.: ${linguagem.exemploEquipamento}`
                    : undefined
                }
                defaultValue={editor.item.nome}
              />
            </label>
            {camposObjeto[ramo].map(([k, v]) => (
              <label key={k}>
                {linguagem.assistencia && k === "serie" ? linguagem.identificacao : v}
                <input
                  name={k}
                  maxLength={1500}
                  required={k === "endereco"}
                  placeholder={
                    linguagem.assistencia
                      ? k === "acessorios"
                        ? linguagem.acessorios
                        : k === "condicao"
                          ? "Riscos, trincas, sinais de líquido e funcionamento na entrada"
                          : undefined
                      : undefined
                  }
                  defaultValue={editor.item.dados[k] || ""}
                />
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                name="arquivado"
                defaultChecked={editor.item.arquivado}
              />{" "}
              Arquivar cadastro
            </label>
          </>
        ) : editor.tipo === "atendimento" ? (
          <>
            <div className="documento-identificacao">
              <div className="dupla-campos">
                <SelecaoOperacao
                  tipo="clientes"
                  rotulo="Cliente"
                  valor={cliente}
                  selecionar={(id) => {
                    setCliente(id);
                    setObjetoId("");
                    setObjetoEscolhido(undefined);
                  }}
                />
                <input type="hidden" name="objeto_id" value={objetoId} />
                <SelecaoOperacao
                  tipo="objetos"
                  selecionarUnico={!editor.item.revisao}
                  rotulo={ramos[ramo].objeto}
                  cliente={cliente}
                  valor={objetoId}
                  selecionar={(id, item) => {
                    setObjetoId(id);
                    setObjetoEscolhido(
                      item && "nome" in item && "dados" in item ? item : undefined,
                    );
                  }}
                />
              </div>
              <CadastroRapidoServico
                ramo={ramo}
                especialidade={ficha.especialidade}
                cliente={cliente}
                aoAbrir={setCadastroAberto}
                selecionarCliente={(id) => {
                  setCliente(id);
                  setObjetoId("");
                  setObjetoEscolhido(undefined);
                }}
                selecionarObjeto={(objeto) => {
                  setCliente(objeto.cliente_id);
                  setObjetoId(objeto.id);
                  setObjetoEscolhido(objeto);
                }}
              />
            </div>
            <div className="servicos-filtros">
              {!item.revisao && podeEditarValores ? (
                <input
                  type="hidden"
                  name="valor"
                  value={
                    Math.max(
                      0,
                      itens.reduce(
                        (s, i) =>
                          s + Math.round(i.quantidade * i.preco_unitario_centavos),
                        0,
                      ) - desconto,
                    ) / 100
                  }
                />
              ) : (
                <label>
                  Valor total (R$)
                  <input
                    name="valor"
                    type="number"
                    readOnly={totalPorItens}
                    required
                    min="0"
                    max="100000000"
                    step="0.01"
                    defaultValue={editor.item.valor_centavos / 100}
                  />
                  {totalPorItens && (
                    <small>
                      Calculado pelos itens. Para alterar, abra{" "}
                      {linguagem.assistencia
                        ? "Serviços e peças"
                        : "Serviços e materiais"}{" "}
                      no resumo.
                    </small>
                  )}
                </label>
              )}
            </div>
            {!item.revisao && podeEditarValores && (
              <div className="assistencia-campo-largo">
                <EditorItensOS
                  especialidade={ficha.especialidade}
                  simplificado
                  contexto={
                    editor.item.situacao === "orcamento" &&
                    editor.item.dados.documento === "orcamento"
                      ? "orçamento"
                      : "OS"
                  }
                  itens={itens}
                  alterar={setItens}
                  catalogo={
                    acesso.demo
                      ? lerCatalogoDemo(acesso.oficina!.id).map((c) => ({
                          ...c,
                          custo_centavos:
                            lerEstoqueDemo().produtos.find(
                              (p) => p.id === c.id && p.saldo != null,
                            )?.custo_centavos ?? c.custo_centavos,
                        }))
                      : []
                  }
                  desconto={controleDesconto}
                  nota={{
                    mostrar: mostrarDescontoNota,
                    alterar: setMostrarDescontoNota,
                  }}
                  aoEditarItem={setEditandoItem}
                  aoProcessar={setCriandoItem}
                  vincularEstoque
                  detalhesItem={(i) =>
                    i.tipo === "part" ? (
                      <small>
                        {i.produto_estoque_id
                          ? "Item do estoque · baixa ao concluir"
                          : "Item avulso · fornecimento externo"}
                      </small>
                    ) : null
                  }
                />
              </div>
            )}
            <OpcoesDocumento
              nota={
                !orcamentoSimples
                  ? { mostrar: mostrarDescontoNota, alterar: setMostrarDescontoNota }
                  : undefined
              }
              desconto={
                !item.revisao && podeEditarValores ? controleDesconto : undefined
              }
            >
              {linguagem.limpeza && (
                <label className="assistencia-campo-largo">
                  Escopo combinado com o cliente
                  <textarea
                    name="solicitacao"
                    rows={2}
                    maxLength={2000}
                    defaultValue={editor.item.dados.solicitacao || ""}
                    placeholder="Ambientes ou bens incluídos, prioridades e o que será feito nesta visita."
                  />
                </label>
              )}

              {campoDataServico}
              {campoPagamento}
              {rodapeItens}
              {acesso.permite("service_media") && (
                <section
                  className="servicos-atalho-fotos"
                  aria-label="Fotos do atendimento"
                >
                  <div>
                    <strong>
                      <Camera size={18} aria-hidden="true" /> Fotos antes e depois
                    </strong>
                    <p>Salve os dados e envie as fotos do equipamento ou serviço.</p>
                  </div>
                  <button
                    type="submit"
                    name="apos_salvar"
                    value="fotos"
                    className="botao-secundario"
                    disabled={
                      ocupado ||
                      editandoItem ||
                      criandoItem ||
                      cadastroAberto ||
                      (!!item.revisao && !detalhes.data)
                    }
                  >
                    Salvar e adicionar fotos
                  </button>
                </section>
              )}
              <div className="formulario-opcionais servicos-opcionais">
                <CampoTipoServico
                  key={ficha.especialidade}
                  especialidade={ficha.especialidade}
                  inicial={editor.item.dados.tipo_servico}
                >
                  <RecepcaoEspecializada valor={ficha} alterar={setFicha} />
                </CampoTipoServico>
                <details className="os-detalhes os-informacoes-adicionais">
                  <summary>Informações adicionais do atendimento (opcional)</summary>
                  <div className="dupla-campos">
                    <label>
                      Especialidade do atendimento
                      <select
                        value={ficha.especialidade}
                        disabled={
                          !!editor.item.revisao && !!editor.item.ficha_especialidade
                        }
                        onChange={(e) => {
                          fichasEmEdicao.current[ficha.especialidade] = ficha;
                          setFicha(
                            fichasEmEdicao.current[e.target.value] ||
                              novaFichaEspecialidade(e.target.value),
                          );
                        }}
                      >
                        {subsetoresDoRamo(ramo).map(([id, p]) => (
                          <option key={id} value={id}>
                            {p.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!!item.revisao && (
                      <>
                        <label>
                          Situação
                          <select name="situacao" defaultValue={editor.item.situacao}>
                            {Object.entries(estadosServico)
                              .filter(
                                ([k]) =>
                                  item.revisao ||
                                  !["concluido", "cancelado"].includes(k),
                              )
                              .map(([k, v]) => (
                                <option key={k} value={k}>
                                  {k === "orcamento" && linguagem.assistencia
                                    ? "Recebido / orçamento em análise"
                                    : v}
                                </option>
                              ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>

                  {podeEditarValores &&
                    acesso.permite("finance") &&
                    editor.item.situacao === "orcamento" && (
                      <CamposTaxaDiagnostico
                        bloqueado={!!item.revisao && !detalhes.data}
                        key={`${item.id}:${detalhes.data?.atendimento.revisao || 0}`}
                        taxa={detalhes.data?.taxa_diagnostico}
                      />
                    )}
                  {linguagem.assistencia && (
                    <details className="os-detalhes assistencia-campo-largo">
                      <summary>Recepção e defeito relatado (opcional)</summary>
                      <label className="assistencia-campo-largo">
                        Defeito relatado pelo cliente
                        <textarea
                          rows={2}
                          maxLength={1500}
                          value={ficha.campos.defeito || ""}
                          placeholder="O que não funciona? Quando começou? Em quais condições acontece?"
                          onChange={(e) =>
                            setFicha({
                              ...ficha,
                              campos: { ...ficha.campos, defeito: e.target.value },
                            })
                          }
                        />
                      </label>
                    </details>
                  )}

                  <EditorFichaEspecialidade
                    etapasPermitidas={
                      editor.item.situacao === "concluido"
                        ? undefined
                        : etapasEmAndamento(ficha.especialidade)
                    }
                    etapaBloqueada={
                      linguagem.assistencia && editor.item.situacao === "concluido"
                    }
                    valor={ficha}
                    alterar={setFicha}
                    mostrarEtapa
                    gruposRecolhiveis
                    ocultarCampos={[
                      "prazo_servico",
                      ...(linguagem.assistencia ? ["defeito"] : []),
                      ...(perfilAtendimento(ficha.especialidade).recepcaoRapida || []),
                    ]}
                  />
                  <details className="os-detalhes ficha-anotacoes">
                    <summary>Anotações complementares (opcional)</summary>
                    <CampoDetalhesServico
                      especialidade={ficha.especialidade}
                      observacoes={editor.item.dados.detalhes_especialidade}
                    />
                    {camposAtendimento[ramo]
                      .filter(
                        ([k]) =>
                          k !== "observacoes_cliente" &&
                          !(linguagem.limpeza && k === "solicitacao"),
                      )
                      .filter(
                        ([k]) =>
                          !(linguagem.assistencia || linguagem.manutencao) ||
                          k !== "solicitacao",
                      )
                      .map(([k, v]) => (
                        <label key={k}>
                          {v}
                          <textarea
                            name={k}
                            maxLength={3000}
                            rows={2}
                            defaultValue={editor.item.dados[k] || ""}
                          />
                        </label>
                      ))}
                    <label>
                      Checklist de execução (um item por linha)
                      <textarea
                        name="checklist"
                        maxLength={3000}
                        rows={3}
                        defaultValue={editor.item.dados.checklist || ""}
                      />
                    </label>
                    <label>
                      Conferência final / aceite do cliente
                      <textarea
                        name="conferencia"
                        maxLength={3000}
                        rows={2}
                        defaultValue={editor.item.dados.conferencia || ""}
                      />
                    </label>
                  </details>
                </details>
              </div>
            </OpcoesDocumento>
            {formularioSimples && !item.revisao && podeEditarValores && (
              <ResumoDocumento
                acao={
                  editor.item.dados.documento === "ordem" ? (
                    <EstadoCriacaoOS
                      pronto={servicoPronto}
                      alterar={setServicoPronto}
                    />
                  ) : undefined
                }
                contexto={orcamentoSimples ? "orçamento" : "OS"}
                subtotal={itens.reduce(
                  (total, i) =>
                    total + Math.round(i.quantidade * i.preco_unitario_centavos),
                  0,
                )}
                desconto={desconto}
              />
            )}
          </>
        ) : (
          <>
            <input type="hidden" name="atendimento_id" value={modeloVisitas} />
            <SelecaoOperacao
              tipo="atendimentos"
              rotulo="Atendimento"
              valor={modeloVisitas}
              selecionar={setModeloVisitas}
            />
            <ProfissionalAgendamento recurso={recursoAgenda} alterarRecurso={setRecursoAgenda} recursos={dados.recursos} inicial={editor.item.profissional} escolherServico={s=>{if(s.duracao_minutos&&inicioAgenda)setFimAgenda(new Date(Date.parse(inicioAgenda)+s.duracao_minutos*60000).toISOString());}}/>
            <div className="servicos-filtros">
              <label>
                {recorrente ? "Primeiro agendamento (Brasília)" : "Início (Brasília)"}
                <input
                  name="inicio"
                  required
                  type="datetime-local"
                  defaultValue={dataInput(editor.item.inicio)}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    setInicioAgenda(v ? new Date(`${v}:00-03:00`).toISOString() : "");
                  }}
                />
              </label>
              <label>
                Término (Brasília)
                <input
                  name="fim"
                  required
                  type="datetime-local"
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    setFimAgenda(v ? new Date(`${v}:00-03:00`).toISOString() : "");
                  }}
                  value={fimAgenda ? dataInput(fimAgenda) : ""}
                />
              </label>
            </div>
            {recorrente && (
              <AgendamentoRecorrente
                quantidade={quantidadeVisitas}
                alterar={setQuantidadeVisitas}
                inicio={inicioAgenda}
                fim={fimAgenda}
              />
            )}
            <PlanejamentoVisita
              inicial={editor.item}
              aoDefinirFim={setFimAgenda}
              inicio={inicioAgenda}
              fim={fimAgenda}
              clienteId={consultaModelo.data?.[0]?.cliente_id}
              objetoId={consultaModelo.data?.[0]?.objeto_id}
              reservas={dados.agenda.filter((x) => x.recurso_id === recursoAgenda)}
              destinoSugerido={
                consultaModelo.data?.[0]?.ficha_especialidade?.campos.endereco_visita ||
                dados.objetos.find((x) => x.id === consultaModelo.data?.[0]?.objeto_id)
                  ?.dados.endereco ||
                ""
              }
              aoProcessar={setCalculandoTrajeto}
              origemEquipe={origemEquipe}
            />
            <DistribuicaoAgenda
              id={editor.item.id}
              inicial={editor.item.distribuicao}
              aoEscolher={(c) => {
                setRecursoAgenda(c.recurso_id || "");
                setOrigemEquipe(c);
              }}
              aoProcessar={setCalculandoTrajeto}
            />
            <label>
              Situação
              <select name="situacao" defaultValue={editor.item.situacao}>
                {Object.entries(estadosAgenda).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observações
              <textarea
                name="observacoes"
                maxLength={2000}
                defaultValue={editor.item.observacoes}
              />
            </label>
            {recorrente && podeProgramarVisitas && (
              <section className="servicos-secao-form">
                <label>
                  Como organizar as visitas?
                  <select
                    value={modoVisitas}
                    onChange={(e) => setModoVisitas(e.target.value)}
                  >
                    <option value="independentes">
                      Um atendimento e uma cobrança por visita
                    </option>
                    <option value="mesmo">Várias etapas do mesmo atendimento</option>
                  </select>
                </label>
                {visitasIndependentes ? (
                  <>
                    <p>
                      Cada data incluída na programação terá um novo atendimento com os
                      itens e a equipe do modelo. Datas excluídas não geram
                      atendimentos. Confira a quantidade em “Ver datas previstas”. O
                      modelo permanece como está; horas, consumo, vistoria e cobrança
                      serão registrados em cada visita.
                    </p>
                    <p>
                      <strong>
                        Valor por visita:{" "}
                        {consultaModelo.data?.[0]
                          ? dinheiro(consultaModelo.data[0].valor_centavos)
                          : "Carregando valor…"}
                      </strong>{" "}
                      · Vencimento inicial no dia de cada visita; você pode ajustá-lo
                      depois.
                    </p>
                    <label>
                      Situação das novas visitas
                      <select name="nova_situacao" defaultValue="orcamento">
                        <option value="orcamento">
                          Orçamento · ainda precisa de aprovação
                        </option>
                        <option value="aprovado">
                          Aprovado · cliente já autorizou as visitas
                        </option>
                      </select>
                    </label>
                    <p>
                      A programação não baixa produtos nem gera cobranças
                      automaticamente.
                    </p>
                  </>
                ) : (
                  <p>
                    Todos os agendamentos usarão o mesmo atendimento. Os itens e a
                    cobrança serão únicos para o serviço inteiro.
                  </p>
                )}
              </section>
            )}
            <p>
              {linguagem.assistencia
                ? "Informe o horário do atendimento. Em visitas, o deslocamento de ida é reservado separadamente."
                : "Informe o horário no local. O deslocamento de ida é reservado antes da visita."}
            </p>
            <ReservaRecursos
              id={editor.item.id}
              inicial={editor.item.recursos_reservados}
              resumo={editor.item.resumo_recursos}
              inicio={inicioAgenda}
              fim={fimAgenda}
            />
          </>
        )}
      </fieldset>
      {(erro || erroLocal) && <p role="alert">{erroLocal || erro}</p>}
      {aguardandoModelo && consultaModelo.isError && (
        <p role="alert">
          {erroPublico(consultaModelo.error)}{" "}
          <button type="button" onClick={() => void consultaModelo.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      <button
        className={`botao-primario${editor.tipo === "atendimento" ? " acao-salvar-fixa" : ""}`}
        disabled={
          ocupado ||
          calculandoTrajeto ||
          editandoItem ||
          criandoItem ||
          cadastroAberto ||
          aguardandoModelo ||
          (editor.tipo === "atendimento" && !!item.revisao && !detalhes.data)
        }
      >
        {ocupado
          ? "Salvando…"
          : recorrente
            ? "Salvar agendamentos recorrentes"
            : editor.tipo === "agenda"
              ? "Salvar agendamento"
              : editor.tipo === "atendimento" && !item.revisao
                ? editor.item.dados.documento === "orcamento"
                  ? "Salvar orçamento"
                  : servicoPronto
                    ? "Salvar ordem de serviço"
                    : "Abrir ordem de serviço"
                : "Salvar"}
      </button>
    </form>
  );
}
