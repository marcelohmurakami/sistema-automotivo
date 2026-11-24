import { OpcoesDocumento, ResumoDocumento } from "../LayoutDocumentoServico";
import { EstadoCriacaoOS } from "../EstadoCriacaoOS";
import { FotosCriacaoOS } from "./FotosCriacaoOS";
import type { FotoOffline } from "../../lib/atendimentoOffline";
import {
  CamposPagamentoAtendimento,
  CampoResponsavel,
} from "../../components/CamposAtendimento";
import { normalizarTelefone } from "../../services/clientes";
import { especialidadePadrao } from "../../lib/especialidades";
import {
  novaFichaEspecialidade,
  perfilAtendimento,
  validarFichaEspecialidade,
} from "../../lib/perfisAtendimento";
import { EditorFichaEspecialidade } from "../FichaEspecialidade";
import { RecepcaoEspecializada } from "../RecepcaoEspecializada";
import { CampoDetalhesServico, CampoTipoServico } from "../../components/TipoServico";
import { AtendimentoExpresso } from "../../components/AtendimentoExpresso";
import { CampoEntregaPrometida } from "../../components/PrazoEntrega";
import { entregaDoCampo } from "../../lib/entregaPrometida";
import { EditorItensOS, type ItemEditorOS } from "../../components/EditorItensOS";
import { SelecaoClienteVeiculo } from "../../components/SelecaoClienteVeiculo";
import { dataServicoDoCampo } from "../../lib/dataServico";
import { quantidadeItemValida } from "../../lib/quantidadeItem";
import { useDesconto } from "../../lib/useDesconto";
import { useState, type FormEvent } from "react";
import { useAcesso } from "../../auth/contexto";
import { type Auxiliares } from "../../services/orcamentos";
import { type OrdemServico } from "../../services/ordensServico";
export function FormularioOS({
  aux,
  anterior,
  clienteInicial = "",
  ocupado,
  salvar,
}: {
  aux: Auxiliares;
  anterior?: OrdemServico;
  clienteInicial?: string;
  ocupado: boolean;
  salvar: (d: Record<string, unknown>, fotos: FotoOffline[]) => void;
}) {
  const acessoFormulario = useAcesso();
  const especialidade =
    acessoFormulario.oficina?.especialidade ||
    especialidadePadrao(acessoFormulario.oficina?.ramo);
  const checklistCompleto = Object.keys(anterior?.checklist || {});
  const [ficha, setFicha] = useState(
    () => anterior?.ficha_especialidade ?? novaFichaEspecialidade(especialidade),
  );
  const [criando, setCriando] = useState(false);
  const [fotos, setFotos] = useState<FotoOffline[]>([]);
  const [fotoAssistida, setFotoAssistida] = useState<FotoOffline | null>(null);
  const [preparandoFotos, setPreparandoFotos] = useState(false);
  const [preparandoAssistida, setPreparandoAssistida] = useState(false);
  const [itemEmEdicao, setItemEmEdicao] = useState(false);
  const [servicoPronto, setServicoPronto] = useState(false);
  const [dataServico, setDataServico] = useState(() => dataServicoDoCampo(anterior));
  const [relatoRapido, setRelatoRapido] = useState<string | null>(null);
  const [kmRapido, setKmRapido] = useState<number | null>(null);
  const [erroEntrega, setErroEntrega] = useState("");
  const [cliente, setCliente] = useState(
    anterior && !anterior.cliente_id
      ? "avulso"
      : (anterior?.cliente_id ?? clienteInicial),
  );
  const [veiculo, setVeiculo] = useState(anterior?.veiculo_id ?? "");
  const [itens, setItens] = useState<ItemEditorOS[]>(
    () => anterior?.itens.map((i) => ({ ...i })) ?? [],
  );
  const controleDesconto = useDesconto(
    itens.reduce(
      (total, i) => total + Math.round(i.quantidade * i.preco_unitario_centavos),
      0,
    ),
    anterior?.desconto_centavos ?? 0,
  );
  const desconto = controleDesconto.centavos;
  const [mostrarDescontoNota, setMostrarDescontoNota] = useState(
    anterior?.mostrar_desconto_nota === true,
  );
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (itemEmEdicao || preparandoFotos || preparandoAssistida) return;
    if (fotos.length + (fotoAssistida ? 1 : 0) > 12) {
      setErroEntrega("Use até 12 fotos, incluindo a foto da leitura assistida.");
      return;
    }
    if (
      !anterior?.orcamento_aguardando_id &&
      itens.some((i) => !quantidadeItemValida(i.quantidade))
    ) {
      setErroEntrega("Informe quantidades inteiras entre 1 e 100.000 nos itens.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const d: Record<string, unknown> = Object.fromEntries(f);
    try {
      validarFichaEspecialidade(ficha);
    } catch (erro) {
      setErroEntrega((erro as Error).message);
      return;
    }
    d.ficha_especialidade = ficha;
    d.mostrar_desconto_nota = mostrarDescontoNota;
    d.cliente_id = cliente === "avulso" ? null : cliente;
    if (cliente === "avulso") {
      d.cliente_nome_livre = String(f.get("cliente_nome_livre") || "").trim();
      try {
        d.cliente_telefone_livre = normalizarTelefone(
          String(f.get("cliente_telefone_livre") || ""),
        );
      } catch (e) {
        setErroEntrega((e as Error).message);
        return;
      }
    }
    d.veiculo_id = veiculo;
    if (!anterior?.orcamento_aguardando_id) {
      d.itens = itens.map((i) => ({
        id: i.id,
        item_catalogo_id: i.item_catalogo_id ?? null,
        descricao: i.descricao.trim(),
        tipo: i.tipo,
        unidade: i.unidade,
        quantidade: i.quantidade,
        preco_unitario_centavos: i.preco_unitario_centavos,
        situacao: i.situacao,
        ...(acessoFormulario.oficina?.perfil !== "staff" &&
        Object.hasOwn(i, "custo_unitario_previsto_centavos")
          ? {
              custo_unitario_previsto_centavos: i.custo_unitario_previsto_centavos,
              custo_ajustado: i.custo_ajustado ?? false,
            }
          : {}),
      }));
      d.desconto_centavos = desconto;
    }
    try {
      d.entrega_prevista_em = entregaDoCampo(String(d.entrega_prevista_em || ""));
      setErroEntrega("");
    } catch (erro) {
      setErroEntrega((erro as Error).message);
      return;
    }
    d.checklist = Object.fromEntries(
      checklistCompleto.map((c, i) => [c, f.get("check-" + i) === "on"]),
    );
    d.servico_pronto = !anterior && servicoPronto;
    if (d.servico_pronto && !itens.some((i) => i.situacao !== "cancelled")) {
      setErroEntrega("Inclua os serviços realizados antes de marcar como pronto.");
      return;
    }
    d.prioridade = anterior?.prioridade || "normal";
    salvar(d, [...fotos, ...(fotoAssistida ? [fotoAssistida] : [])]);
  }
  const campo = (nome: keyof OrdemServico, titulo: string, tipo = "text") => (
    <label>
      {titulo.includes("(opcional)") ? titulo : `${titulo} (opcional)`}
      <input
        name={nome}
        type={tipo}
        min={tipo === "number" ? 0 : undefined}
        max={nome === "combustivel_percentual" ? 100 : undefined}
        maxLength={160}
        key={nome === "quilometragem_entrada" ? String(kmRapido) : nome}
        defaultValue={String(
          nome === "quilometragem_entrada" && kmRapido != null
            ? kmRapido
            : (anterior?.[nome] ?? ""),
        )}
      />
    </label>
  );
  const texto = (nome: keyof OrdemServico, titulo: string) => (
    <label>
      {titulo.includes("(opcional)") ? titulo : `${titulo} (opcional)`}
      <textarea
        name={nome}
        maxLength={5000}
        rows={nome === "resumo_cliente" ? 2 : 3}
        className={
          nome === "resumo_cliente" ? "atendimento-observacoes-compactas" : undefined
        }
        key={nome === "queixa_cliente" ? relatoRapido : nome}
        defaultValue={String(
          nome === "queixa_cliente" && relatoRapido != null
            ? relatoRapido
            : (anterior?.[nome] ?? ""),
        )}
      />
    </label>
  );
  const campoDataServico = (
    <label>
      Data do serviço
      <input
        name="data_servico"
        type="date"
        required
        value={dataServico}
        onChange={(e) => setDataServico(e.target.value)}
      />
    </label>
  );
  const complementoItens = (
    <>
      <CampoEntregaPrometida
        inicial={anterior?.entrega_prevista_em}
        situacao={anterior?.situacao}
      />
      {texto("resumo_cliente", "Observações (opcional)")}
      <p className="texto-suave">Aparece na nota do cliente.</p>
    </>
  );
  return (
    <form
      className={`formulario-cliente${!anterior ? " documento-simples" : ""}`}
      onSubmit={enviar}
    >
      <fieldset disabled={ocupado || criando}>
        <div className="documento-identificacao">
          {!anterior || !anterior.cliente_id ? (
            <SelecaoClienteVeiculo
              focoInicial={!!anterior}
              selecionarUnicoAoAbrir={!anterior && !!clienteInicial}
              campoAoLadoDoCliente={anterior ? campoDataServico : undefined}
              permitirAvulso
              dadosAvulsos={{
                nome: anterior?.dados_cliente.nome || "",
                telefone: anterior?.dados_cliente.telefone_e164 || "",
              }}
              entradaLivreRetifica={especialidade === "retifica"}
              aux={aux}
              cliente={cliente}
              veiculo={veiculo}
              selecionarCliente={setCliente}
              selecionarVeiculo={setVeiculo}
              aoProcessar={setCriando}
            />
          ) : (
            <div className="dupla-campos">
              <p className="aviso-cliente">
                {anterior.dados_cliente.nome} · {anterior.dados_veiculo.modelo} ·{" "}
                {especialidade === "retifica"
                  ? anterior.dados_veiculo.motor || "Motor não informado"
                  : anterior.dados_veiculo.placa || "Sem placa"}
              </p>
              {campoDataServico}
            </div>
          )}
          {especialidade === "retifica" && (
            <div className="dupla-campos">
              <label>
                Carro
                <input
                  name="carro_livre"
                  required
                  maxLength={160}
                  placeholder="Ex.: Gol, Uno, Golf"
                  defaultValue={anterior?.dados_veiculo.modelo || ""}
                />
              </label>
              <label>
                Motor
                <input
                  name="motor_livre"
                  required
                  maxLength={160}
                  placeholder="Ex.: AP, CHT, Fiasa, TSI"
                  defaultValue={anterior?.dados_veiculo.motor || ""}
                />
              </label>
            </div>
          )}
        </div>
        {anterior && <CamposPagamentoAtendimento inicial={anterior} />}
        <EditorItensOS
          simplificado={!anterior}
          itens={itens}
          alterar={setItens}
          catalogo={aux.catalogo}
          desconto={controleDesconto}
          nota={{ mostrar: mostrarDescontoNota, alterar: setMostrarDescontoNota }}
          anterior={anterior}
          aoProcessar={setCriando}
          aoEditarItem={setItemEmEdicao}
          rodape={anterior ? complementoItens : undefined}
        />
        <OpcoesDocumento
          ativo={!anterior}
          desconto={!anterior ? controleDesconto : undefined}
          nota={{ mostrar: mostrarDescontoNota, alterar: setMostrarDescontoNota }}
        >
          {!anterior && (
            <>
              {campoDataServico}
              <CamposPagamentoAtendimento />
              {complementoItens}
              <FotosCriacaoOS
                fotos={fotos}
                alterar={setFotos}
                processando={setPreparandoFotos}
              />
            </>
          )}
          {!anterior && (
            <EstadoCriacaoOS pronto={servicoPronto} alterar={setServicoPronto} />
          )}
          <div className="formulario-opcionais">
            <CampoTipoServico inicial={anterior?.tipo_servico}>
              {ficha.especialidade === "estetica" ? (
                <EditorFichaEspecialidade valor={ficha} alterar={setFicha} />
              ) : (
                <RecepcaoEspecializada valor={ficha} alterar={setFicha} />
              )}
            </CampoTipoServico>
            <details className="os-detalhes os-informacoes-adicionais">
              <summary>Informações adicionais do atendimento (opcional)</summary>
              {anterior && (
                <FotosCriacaoOS
                  fotos={fotos}
                  alterar={setFotos}
                  processando={setPreparandoFotos}
                />
              )}
              {ficha.especialidade !== "estetica" && (
                <EditorFichaEspecialidade
                  valor={ficha}
                  alterar={setFicha}
                  ocultarCampos={perfilAtendimento(ficha.especialidade).recepcaoRapida}
                />
              )}
              <details className="os-detalhes">
                <summary>Relação de peças (opcional)</summary>
                {texto("pecas_a_trocar", "Peças trocadas ou a trocar (opcional)")}
                <p className="texto-suave">
                  Informe quantidades, referências e fornecedor. Lista informativa, sem
                  valores ou baixa de estoque.
                </p>
              </details>
              <details className="os-detalhes">
                <summary>
                  Relato do cliente e preenchimento por voz ou foto (opcional)
                </summary>
                <AtendimentoExpresso
                  aoPrepararFoto={setPreparandoAssistida}
                  aoSelecionarFoto={(imagem) =>
                    setFotoAssistida(
                      imagem
                        ? {
                            id: crypto.randomUUID(),
                            imagem,
                            fase: "before",
                            legenda: "Foto da leitura assistida na criação da OS",
                            sincronizada: false,
                          }
                        : null,
                    )
                  }
                  aplicar={(c) => {
                    setRelatoRapido(
                      [
                        c.relato,
                        c.placa ? `Placa lida: ${c.placa}` : "",
                        ...c.itens.map((i) => `${i.quantidade} × ${i.descricao}`),
                      ]
                        .filter(Boolean)
                        .join("\n"),
                    );
                    if (c.quilometragem != null) setKmRapido(c.quilometragem);
                    if (!anterior && c.placa) {
                      const v = aux.veiculos.find(
                        (v) => v.placa?.replace(/[^A-Z0-9]/g, "") === c.placa,
                      );
                      const link = v && aux.vinculos.find((x) => x.veiculo_id === v.id);
                      if (v && link) {
                        setCliente(link.cliente_id);
                        setVeiculo(v.id);
                      }
                    }
                  }}
                />
                {texto("queixa_cliente", "O que o cliente relatou?")}
              </details>
              <details className="os-detalhes">
                <summary>Entrada, diagnóstico e garantia (opcional)</summary>
                <CampoResponsavel inicial={anterior} />
                <div className="dupla-campos">
                  {campo("quilometragem_entrada", "Quilometragem de entrada", "number")}
                  {campo("combustivel_percentual", "Combustível (%)", "number")}
                </div>
                {texto("pertences", "Pertences e condições de entrada")}
                <CampoDetalhesServico observacoes={anterior?.detalhes_especialidade} />
                {texto("diagnostico", "Diagnóstico técnico")}
                {texto("codigos_falha", "Códigos de falha / resultados de testes")}
                {texto("observacoes_internas", "Observações internas")}
                <div className="dupla-campos">
                  {campo("quilometragem_saida", "Quilometragem de saída", "number")}
                  {campo("garantia_ate", "Garantia até", "date")}
                </div>
                {texto("condicoes_garantia", "Condições da garantia")}
              </details>
              {!!checklistCompleto.length && (
                <details className="os-detalhes">
                  <summary>Checklist anterior do atendimento</summary>
                  {checklistCompleto.map((c, i) => (
                    <label className="os-check" key={c}>
                      <input
                        type="checkbox"
                        name={"check-" + i}
                        defaultChecked={anterior?.checklist?.[c] ?? false}
                      />
                      {c}
                    </label>
                  ))}
                </details>
              )}
            </details>
          </div>
        </OpcoesDocumento>
        {!anterior && (
          <ResumoDocumento
            contexto="OS"
            subtotal={controleDesconto.subtotal}
            desconto={desconto}
          />
        )}
        {erroEntrega && (
          <p role="alert" className="erro-formulario">
            {erroEntrega}
          </p>
        )}
        <button
          className="botao-primario acao-salvar-fixa"
          type="submit"
          disabled={itemEmEdicao || preparandoFotos || preparandoAssistida}
        >
          {ocupado
            ? "Salvando…"
            : anterior
              ? "Salvar alterações da OS"
              : servicoPronto
                ? "Salvar como pronto e imprimir"
                : "Abrir ordem de serviço"}
        </button>
        {itemEmEdicao && (
          <p className="texto-suave">
            Confirme ou cancele o item em edição antes de salvar a OS.
          </p>
        )}
      </fieldset>
    </form>
  );
}
