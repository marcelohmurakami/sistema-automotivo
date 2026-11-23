import { novoId } from "../../lib/uuid.ts";
import { CamposTaxaDiagnostico } from "../TaxaDiagnostico";
import { taxaDoFormulario } from "../../lib/diagnosticoOrcamento";
import {
  CamposPagamentoAtendimento,
  CampoResponsavel,
} from "../../components/CamposAtendimento";
import { normalizarTelefone } from "../../services/clientes";
import { AtendimentoExpresso } from "../../components/AtendimentoExpresso";
import { ExplicarItem, MargemOrcamento } from "../../components/OrcamentoInteligente";
import { SelecionarPacote } from "../../components/SelecionarPacote";
import { EditorItensOS } from "../../components/EditorItensOS";
import { quantidadeItemValida } from "../../lib/quantidadeItem";
import { useDesconto } from "../../lib/useDesconto";
import {
  novaFichaEspecialidade,
  perfilAtendimento,
  validarFichaEspecialidade,
} from "../../lib/perfisAtendimento";
import { EditorFichaEspecialidade } from "../FichaEspecialidade";
import { RecepcaoEspecializada } from "../RecepcaoEspecializada";
import { CampoDetalhesServico, CampoTipoServico } from "../../components/TipoServico";
import { chaveRascunho, lerRascunho, gravarRascunho } from "../../lib/rascunhos";
import { FotosOrcamento } from "../../components/FotosOrcamento";
import { SelecaoClienteVeiculo } from "../../components/SelecaoClienteVeiculo";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ItemEditorOS } from "../EditorItensOS";
import { useAcesso } from "../../auth/contexto";
import {
  type Auxiliares,
  type DadosProposta,
  type ItemProposta,
  type Proposta,
} from "../../services/orcamentos";
export function EditorOrcamento({
  anterior,
  clienteInicial = "",
  aux,
  salvar,
  cancelar,
  ocupado,
  erro,
}: {
  anterior?: Proposta;
  clienteInicial?: string;
  aux: Auxiliares;
  salvar: (d: DadosProposta, chave: string, fotos?: boolean) => void;
  cancelar: () => void;
  ocupado: boolean;
  erro: string;
}) {
  const acesso = useAcesso();
  const armazenamento = chaveRascunho(
    acesso.demo ? "demo" : acesso.usuario!,
    acesso.oficina!.id,
    anterior?.id,
    clienteInicial,
  );
  const [recuperado] = useState(() => {
    const r = lerRascunho(armazenamento);
    return !anterior ? r : null;
  });
  const [idRascunho] = useState(() => recuperado?.chave || novoId());
  const [taxa, setTaxa] = useState(
    recuperado?.dados.taxa_diagnostico ?? anterior?.versao.taxa_diagnostico,
  );
  const retifica = acesso.oficina?.especialidade === "retifica";
  const [carroLivre, setCarroLivre] = useState(
    recuperado?.dados.carro_livre ?? anterior?.versao.dados_veiculo.modelo ?? "",
  );
  const [motorLivre, setMotorLivre] = useState(
    recuperado?.dados.motor_livre ?? anterior?.versao.dados_veiculo.motor ?? "",
  );
  const [observacoes, setObservacoes] = useState(
    recuperado?.dados.observacoes ?? anterior?.versao.observacoes ?? "",
  );
  const [condicoes, setCondicoes] = useState(
    recuperado?.dados.condicoes ??
      anterior?.versao.condicoes ??
      "Serviços executados após a aprovação deste orçamento. Qualquer serviço adicional será apresentado para nova aprovação.",
  );
  const [salvoLocal, setSalvoLocal] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [cliente, setCliente] = useState(
    recuperado?.dados.cliente_id ??
      (anterior && !anterior.cliente_id
        ? "avulso"
        : (anterior?.cliente_id ?? clienteInicial)),
  );
  const [dadosAvulsos, setDadosAvulsos] = useState({
    nome:
      recuperado?.dados.cliente_nome_livre ?? anterior?.versao.dados_cliente.nome ?? "",
    telefone:
      recuperado?.dados.cliente_telefone_livre ??
      anterior?.versao.dados_cliente.telefone_e164 ??
      "",
  });
  const [veiculo, setVeiculo] = useState(
    recuperado?.dados.veiculo_id ?? anterior?.veiculo_id ?? "",
  );
  const [itens, setItens] = useState<ItemProposta[]>(
    (recuperado?.dados.itens ?? anterior?.itens ?? []).map((i) => ({
      ...i,
      id: i.id || novoId(),
    })),
  );
  const subtotal = itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos),
    0,
  );
  const controleDesconto = useDesconto(
    subtotal,
    recuperado?.dados.desconto_centavos ?? anterior?.versao.desconto_centavos ?? 0,
    recuperado?.desconto,
  );
  const desconto = controleDesconto.centavos;
  const estadoDesconto = controleDesconto.estado;
  const [outrosCustos, setOutrosCustos] = useState(
    recuperado?.dados.outros_custos_centavos ??
      anterior?.versao.outros_custos_centavos ??
      0,
  );
  const [editandoItem, setEditandoItem] = useState(false);
  const [tecnico, setTecnico] = useState(() => {
    const d = recuperado?.dados ?? anterior?.versao;
    return {
      forma_pagamento: d?.forma_pagamento || "Carteira",
      vencimento_pagamento:
        !d?.forma_pagamento || d.forma_pagamento === "Carteira"
          ? d?.vencimento_pagamento || null
          : null,
      responsavel: d?.responsavel || "",
      prioridade: d?.prioridade || "normal",
      pecas_a_trocar: d?.pecas_a_trocar ?? "",
      tipo_servico: d?.tipo_servico ?? "",
      detalhes_especialidade: d?.detalhes_especialidade ?? "",
      ficha_especialidade:
        d?.ficha_especialidade ??
        novaFichaEspecialidade(
          perfilAtendimento(acesso.oficina?.especialidade, acesso.oficina?.ramo).id,
        ),
      queixa_cliente: d?.queixa_cliente ?? "",
      diagnostico: d?.diagnostico ?? "",
      codigos_falha: d?.codigos_falha ?? "",
    };
  });
  const [erroLocal, setErroLocal] = useState("");
  const [criando, setCriando] = useState(false);
  const [pacoteOcupado, setPacoteOcupado] = useState(false);
  useEffect(() => {
    const fn = () => setOnline(navigator.onLine);
    window.addEventListener("online", fn);
    window.addEventListener("offline", fn);
    return () => {
      window.removeEventListener("online", fn);
      window.removeEventListener("offline", fn);
    };
  }, []);
  useEffect(() => {
    const salvarLocal = () =>
      gravarRascunho(armazenamento, {
        versao: 1,
        chave: idRascunho,
        atualizado: Date.now(),
        revisao: anterior?.revisao,
        desconto: estadoDesconto,
        dados: {
          taxa_diagnostico: taxa,
          ...tecnico,
          ...(retifica ? { carro_livre: carroLivre, motor_livre: motorLivre } : {}),
          cliente_nome_livre: cliente === "avulso" ? dadosAvulsos.nome : undefined,
          cliente_telefone_livre:
            cliente === "avulso" ? dadosAvulsos.telefone : undefined,
          outros_custos_centavos: outrosCustos,
          cliente_id: cliente,
          veiculo_id: veiculo,
          itens,
          desconto_centavos: desconto,
          observacoes,
          condicoes,
        },
      });
    const timer = window.setTimeout(() => setSalvoLocal(salvarLocal()), 0);
    window.addEventListener("pagehide", salvarLocal);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", salvarLocal);
    };
  }, [
    taxa,
    outrosCustos,
    tecnico,
    retifica,
    carroLivre,
    motorLivre,
    dadosAvulsos,
    armazenamento,
    idRascunho,
    anterior?.revisao,
    cliente,
    veiculo,
    itens,
    desconto,
    estadoDesconto,
    observacoes,
    condicoes,
  ]);
  const itensEditor = useMemo(
    () => itens.map((i) => ({ ...i, id: i.id!, situacao: "pending" })),
    [itens],
  );
  const detalhesItem = useCallback(
    (_: ItemEditorOS, n: number) => (
      <ExplicarItem
        item={itens[n]}
        itens={itens}
        alterar={(d) =>
          setItens((atuais) => atuais.map((i, j) => (j === n ? { ...i, ...d } : i)))
        }
      />
    ),
    [itens],
  );
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado || criando || pacoteOcupado) return;
    try {
      validarFichaEspecialidade(tecnico.ficha_especialidade);
    } catch (erro) {
      setErroLocal((erro as Error).message);
      return;
    }
    setErroLocal("");
    if (editandoItem) {
      setErroLocal("Confirme ou cancele o item em edição antes de salvar.");
      return;
    }
    if (itens.some((i) => !quantidadeItemValida(i.quantidade))) {
      setErroLocal("Informe quantidades inteiras entre 1 e 100.000 nos itens.");
      return;
    }
    const f = new FormData(e.currentTarget);
    if (desconto > subtotal) {
      setErroLocal("O desconto não pode ultrapassar o subtotal.");
      return;
    }
    let telefoneLivre = "";
    try {
      if (cliente === "avulso")
        telefoneLivre = normalizarTelefone(
          String(f.get("cliente_telefone_livre") || ""),
        );
    } catch (e) {
      setErroLocal((e as Error).message);
      return;
    }
    salvar(
      {
        ...tecnico,
        ...(retifica ? { carro_livre: carroLivre, motor_livre: motorLivre } : {}),
        cliente_nome_livre:
          cliente === "avulso"
            ? String(f.get("cliente_nome_livre") || "").trim()
            : undefined,
        cliente_telefone_livre:
          cliente === "avulso" ? telefoneLivre || undefined : undefined,
        outros_custos_centavos: outrosCustos,
        cliente_id: cliente,
        veiculo_id: veiculo,
        itens,
        desconto_centavos: desconto,
        taxa_diagnostico: taxaDoFormulario(f),
        observacoes: String(f.get("observacoes")),
        condicoes: String(f.get("condicoes")),
      },
      idRascunho,
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("name") === "anexar_fotos",
    );
  }
  return (
    <form className="formulario-cliente editor-proposta" onSubmit={enviar}>
      {anterior && anterior.situacao !== "draft" && (
        <p className="texto-suave">
          Ao salvar, será criada uma nova versão para aprovação. A proposta anterior
          ficará no histórico.
        </p>
      )}
      {(!salvoLocal || !online) && (
        <div className="rascunho-status" role="status">
          {!salvoLocal
            ? "Não foi possível guardar neste aparelho. Mantenha a tela aberta."
            : "Sem internet. Rascunho protegido neste aparelho; salve ao reconectar."}
        </div>
      )}
      <fieldset disabled={ocupado || criando || pacoteOcupado}>
        <SelecaoClienteVeiculo
          selecionarUnicoAoAbrir={!anterior && !recuperado && !!clienteInicial}
          entradaLivreRetifica={retifica}
          permitirAvulso
          dadosAvulsos={dadosAvulsos}
          alterarAvulsos={setDadosAvulsos}
          aux={aux}
          cliente={cliente}
          veiculo={veiculo}
          selecionarCliente={setCliente}
          selecionarVeiculo={setVeiculo}
          aoProcessar={setCriando}
        />
        {retifica && (
          <div className="dupla-campos">
            <label>
              Carro
              <input
                required
                maxLength={100}
                value={carroLivre}
                onChange={(e) => setCarroLivre(e.target.value)}
                placeholder="Ex.: Gol, Uno, Golf"
              />
            </label>
            <label>
              Motor
              <input
                required
                maxLength={160}
                value={motorLivre}
                onChange={(e) => setMotorLivre(e.target.value)}
                placeholder="Ex.: AP, CHT, Fiasa, TSI"
              />
            </label>
          </div>
        )}
        <CamposPagamentoAtendimento
          inicial={tecnico}
          alterar={(dados) =>
            setTecnico((v) => ({
              ...v,
              forma_pagamento: dados.forma_pagamento || "Carteira",
              vencimento_pagamento: dados.vencimento_pagamento || null,
            }))
          }
        />
        <EditorItensOS
          contexto="orçamento"
          itens={itensEditor}
          alterar={setItens}
          catalogo={aux.catalogo}
          desconto={controleDesconto}
          aoProcessar={setCriando}
          aoEditarItem={setEditandoItem}
          detalhesItem={detalhesItem}
          rodape={
            <label>
              Observações (opcional)
              <textarea
                name="observacoes"
                rows={2}
                className="atendimento-observacoes-compactas"
                maxLength={4000}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Informações e orientações para o cliente"
              />
            </label>
          }
        />
        <div className="formulario-opcionais">
          <CampoTipoServico
            inicial={tecnico.tipo_servico}
            aoAlterar={(tipo_servico) => setTecnico((v) => ({ ...v, tipo_servico }))}
          >
            {tecnico.ficha_especialidade.especialidade === "estetica" ? (
              <EditorFichaEspecialidade
                valor={tecnico.ficha_especialidade}
                alterar={(ficha_especialidade) =>
                  setTecnico((v) => ({ ...v, ficha_especialidade }))
                }
                mostrarChecklist={false}
              />
            ) : (
              <RecepcaoEspecializada
                valor={tecnico.ficha_especialidade}
                alterar={(ficha_especialidade) =>
                  setTecnico((v) => ({ ...v, ficha_especialidade }))
                }
              />
            )}
          </CampoTipoServico>
          <SelecionarPacote
            quantidade={itens.length}
            aoProcessar={setPacoteOcupado}
            adicionar={(novos) =>
              setItens((atuais) => [
                ...atuais,
                ...novos.map((i) => ({ ...i, id: novoId() })),
              ])
            }
          />
          <MargemOrcamento
            itens={itens}
            desconto={desconto}
            outros={outrosCustos}
            alterar={setOutrosCustos}
          />
          <details
            className="os-detalhes os-informacoes-adicionais orcamento-informacoes-adicionais"
            onInvalidCapture={(e) => {
              e.currentTarget.open = true;
            }}
          >
            <summary>Informações adicionais do orçamento (opcional)</summary>
            {acesso.permite("finance") && acesso.oficina?.perfil !== "staff" && (
              <CamposTaxaDiagnostico taxa={taxa} alterar={setTaxa} />
            )}
            {tecnico.ficha_especialidade.especialidade !== "estetica" && (
              <EditorFichaEspecialidade
                valor={tecnico.ficha_especialidade}
                alterar={(ficha_especialidade) =>
                  setTecnico((v) => ({ ...v, ficha_especialidade }))
                }
                mostrarChecklist={false}
                ocultarCampos={
                  perfilAtendimento(tecnico.ficha_especialidade.especialidade)
                    .recepcaoRapida
                }
              />
            )}
            <details className="os-detalhes">
              <summary>Relação de peças (opcional)</summary>
              <div className="orcamento-campos-opcionais">
                <label>
                  Peças trocadas ou a trocar (opcional)
                  <textarea
                    rows={2}
                    maxLength={5000}
                    value={tecnico.pecas_a_trocar}
                    onChange={(e) =>
                      setTecnico((v) => ({ ...v, pecas_a_trocar: e.target.value }))
                    }
                    placeholder="Ex.: 1 jogo de juntas — cliente vai providenciar"
                  />
                </label>
                <p className="texto-suave">
                  Lista informativa, sem somar valores ou movimentar o estoque.
                </p>
              </div>
            </details>
            <details className="os-detalhes">
              <summary>Relato, diagnóstico e responsável (opcional)</summary>
              <div className="orcamento-campos-opcionais">
                <CampoResponsavel
                  inicial={tecnico}
                  alterar={(campo, valor) =>
                    setTecnico((v) => ({ ...v, [campo]: valor }))
                  }
                />
                <AtendimentoExpresso
                  compacto
                  aplicar={(c) => {
                    setObservacoes((v) =>
                      [
                        v,
                        c.relato,
                        c.quilometragem != null
                          ? `KM informado: ${c.quilometragem}`
                          : "",
                        c.placa ? `Placa lida: ${c.placa}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n")
                        .slice(0, 4000),
                    );
                    setItens((v) =>
                      [
                        ...v,
                        ...c.itens.map((i) => ({
                          ...i,
                          id: novoId(),
                          unidade: "un",
                          preco_unitario_centavos: 0,
                        })),
                      ].slice(0, 100),
                    );
                    if (c.placa) {
                      const v = aux.veiculos.find(
                        (v) => v.placa?.replace(/[^A-Z0-9]/g, "") === c.placa,
                      );
                      const vinculo =
                        v && aux.vinculos.find((x) => x.veiculo_id === v.id);
                      if (v && vinculo) {
                        setCliente(vinculo.cliente_id);
                        setVeiculo(v.id);
                      }
                    }
                  }}
                />
                <p className="texto-suave">
                  O relato, o diagnóstico, os códigos e as fotos acompanham a conversão
                  em OS. Estas informações também ficam visíveis para o cliente no
                  orçamento.
                </p>
                <CampoDetalhesServico
                  observacoes={tecnico.detalhes_especialidade}
                  aoAlterar={(detalhes_especialidade) =>
                    setTecnico((v) => ({ ...v, detalhes_especialidade }))
                  }
                />
                {(
                  [
                    ["queixa_cliente", "O que o cliente relatou?"],
                    ["diagnostico", "Diagnóstico técnico"],
                    ["codigos_falha", "Códigos de falha / resultados de testes"],
                  ] as const
                ).map(([campo, titulo]) => (
                  <label key={campo}>
                    {titulo} (opcional)
                    <textarea
                      rows={3}
                      maxLength={5000}
                      value={tecnico[campo]}
                      onChange={(e) =>
                        setTecnico((v) => ({ ...v, [campo]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            </details>
            <details className="os-detalhes">
              <summary>Fotos e condições do orçamento (opcional)</summary>
              <div className="orcamento-campos-opcionais">
                {anterior ? (
                  <>
                    <FotosOrcamento
                      versao={anterior.versao.id}
                      rascunho={!anterior.versao.publicado_em}
                      aoProcessar={setCriando}
                    />
                    {anterior.versao.publicado_em && (
                      <p>
                        Salve a nova versão para acrescentar fotos. As fotos atuais
                        serão preservadas.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="orcamento-fotos-rascunho">
                    <p>
                      Salve o rascunho e anexe fotos das peças, defeitos e resultados de
                      testes. Elas serão preservadas nas próximas versões e na OS.
                    </p>
                    <button
                      type="submit"
                      name="anexar_fotos"
                      className="botao-secundario"
                      disabled={editandoItem}
                    >
                      Salvar e anexar fotos
                    </button>
                  </div>
                )}

                <label>
                  Condições de pagamento e execução (opcional)
                  <textarea
                    name="condicoes"
                    rows={3}
                    maxLength={4000}
                    value={condicoes}
                    onChange={(e) => setCondicoes(e.target.value)}
                  />
                </label>
              </div>
            </details>
          </details>
        </div>
      </fieldset>
      {(erro || erroLocal) && (
        <p className="erro-formulario" role="alert">
          {erroLocal || erro}
        </p>
      )}
      <div className="acoes-formulario">
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado || criando || pacoteOcupado}
          onClick={cancelar}
        >
          Cancelar
        </button>
        <button
          className="botao-primario"
          disabled={ocupado || criando || editandoItem || pacoteOcupado}
        >
          {ocupado ? "Salvando…" : anterior ? "Salvar alterações" : "Salvar orçamento"}
        </button>
      </div>
    </form>
  );
}
