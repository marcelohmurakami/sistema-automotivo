import { useBuscaDebounced } from "../lib/useBuscaDebounced";
import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";
import { dinheiro } from "../lib/formatacao";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { listarClientes } from "../services/clientes";
import { type ItemProposta } from "../services/orcamentos";
import {
  consultarIdentidade,
  type Notinha,
  type DetalhesNotinha,
} from "../services/documentos";
import { erroPublico } from "../lib/supabase";
import { Dialogo } from "../components/Dialogo";
import "./Documentos.css";
const vazio = (): ItemProposta => ({
  tipo: "service",
  descricao: "",
  quantidade: 1,
  unidade: "un",
  preco_unitario_centavos: 0,
});
export function Notinhas() {
  const a = useAcesso(),
    qc = useQueryClient();
  const [nova, setNova] = useState(false),
    [cliente, setCliente] = useState(""),
    [busca, setBusca] = useState(""),
    [itens, setItens] = useState([vazio()]),
    [desconto, setDesconto] = useState(0),
    [obs, setObs] = useState(""),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [cancelar, setCancelar] = useState<Notinha | null>(null);
  const [detalhes, setDetalhes] = useState<DetalhesNotinha>({
    assinatura: "recebimento",
  });
  const trava = useRef(false),
    chave = useRef(novoId());
  const pdfEmAndamento = useRef(false);
  const [gerandoPdf, setGerandoPdf] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["notinhas", a.demo, a.oficina!.id],
    queryFn: async ({ signal }) =>
      a.demo
        ? (JSON.parse(localStorage.getItem("patio_notinhas_demo") || "[]") as Notinha[])
        : rpc<Notinha[]>("listar_notinhas", { p_oficina: a.oficina!.id }, signal),
  });
  const termoConsulta1 = useBuscaDebounced(busca);
  const c = useQuery({
    enabled: nova,
    queryKey: ["clientes-notinha", a.demo, a.oficina!.id, termoConsulta1],
    queryFn: ({ signal }) =>
      listarClientes(a.demo, a.oficina!.id, termoConsulta1, false, 0, signal),
  });
  const total = itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos),
    0,
  );
  async function executar(fn: () => Promise<void>) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    try {
      await fn();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["notinhas"] }),
        qc.invalidateQueries({ queryKey: ["ficha-cliente"] }),
      ]);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  function alterar(index: number, d: Partial<ItemProposta>) {
    setItens(itens.map((i, n) => (n === index ? { ...i, ...d } : i)));
  }
  async function baixar(nota: Notinha) {
    if (pdfEmAndamento.current) return;
    pdfEmAndamento.current = true;
    setGerandoPdf(nota.id);
    setErro("");
    try {
      const { gerarPdfNotinha } = await import("../services/pdfDocumentos");
      gerarPdfNotinha(nota).save(`notinha-${nota.numero}.pdf`);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      pdfEmAndamento.current = false;
      setGerandoPdf(null);
    }
  }
  return (
    <div className="documentos-pagina">
      <header className="titulo-pagina">
        <div>
          <div className="sobretitulo">ATENDIMENTO SEM COMPLICAÇÃO</div>
          <h1>
            Notinhas<span>.</span>
          </h1>
          <p>Registre peças e serviços e entregue um documento ao cliente.</p>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            chave.current = novoId();
            setItens([vazio()]);
            setCliente("");
            setDesconto(0);
            setObs("");
            setErro("");
            setDetalhes({
              assinatura: "recebimento",
              data_servico: new Date().toLocaleDateString("en-CA", {
                timeZone: "America/Sao_Paulo",
              }),
            });
            setNova(true);
          }}
        >
          Nova notinha
        </button>
      </header>
      <p className="texto-suave">
        Documento sem valor fiscal. A emissão não registra pagamento nem movimenta o
        estoque.
      </p>
      {erro && !nova && !cancelar && <p role="alert">{erro}</p>}
      {q.isError ? (
        <p role="alert">{erroPublico(q.error)}</p>
      ) : q.isPending ? (
        <p>Carregando…</p>
      ) : (
        <>
          <p className="texto-suave">Últimas 100 emissões</p>
          <div className="documentos-grade">
            {q.data.map((n) => (
              <article className="os-painel" key={n.id}>
                <small>
                  #{String(n.numero).padStart(4, "0")} ·{" "}
                  {n.situacao === "cancelled" ? "Cancelada" : "Emitida"}
                </small>
                <h2>{n.dados_cliente.nome}</h2>
                <p>{new Date(n.emitido_em).toLocaleDateString("pt-BR")}</p>
                <strong>{dinheiro(n.total_centavos)}</strong>
                <div className="acoes-proposta">
                  <button
                    className="botao-secundario"
                    disabled={!!gerandoPdf}
                    onClick={() => void baixar(n)}
                  >
                    {gerandoPdf === n.id ? "Gerando PDF…" : "Baixar PDF"}
                  </button>
                  {n.situacao === "issued" && a.oficina?.perfil !== "staff" && (
                    <button
                      className="botao-secundario"
                      onClick={() => {
                        setErro("");
                        setCancelar(n);
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!q.data.length && (
            <section className="os-painel">
              <h2>Sua primeira notinha começa aqui</h2>
              <p>Escolha o cliente, informe os itens e emita o PDF.</p>
            </section>
          )}
        </>
      )}
      <Dialogo
        aberto={nova}
        fechar={() => {
          if (!busy) setNova(false);
        }}
        titulo="Nova notinha"
        classe="dialogo-orcamento"
      >
        <form
          className="documentos-form"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(async () => {
              if (
                detalhes.pix_copia_cola &&
                (!detalhes.pix_copia_cola.startsWith("000201") ||
                  !/br\.gov\.bcb\.pix/i.test(detalhes.pix_copia_cola))
              )
                throw new Error(
                  "Cole um código Pix copia e cola válido, gerado pelo banco.",
                );
              if (a.demo) {
                const nota: Notinha = {
                  id: chave.current,
                  numero: Math.max(0, ...(q.data || []).map((n) => n.numero)) + 1,
                  situacao: "issued",
                  emitido_em: new Date().toISOString(),
                  detalhes,
                  dados_cliente: {
                    telefone_e164: c.data?.itens.find((c) => c.id === cliente)
                      ?.telefone_e164,
                    endereco: c.data?.itens.find((c) => c.id === cliente)?.endereco,
                    nome:
                      c.data?.itens.find((c) => c.id === cliente)?.nome || "Cliente",
                  },
                  dados_oficina: await consultarIdentidade(true, a.oficina!.id),
                  itens,
                  subtotal_centavos: total,
                  desconto_centavos: desconto,
                  total_centavos: total - desconto,
                  observacoes: obs,
                  cliente_id: cliente,
                };
                localStorage.setItem(
                  "patio_notinhas_demo",
                  JSON.stringify([nota, ...(q.data || [])]),
                );
              } else
                await rpc("emitir_notinha_detalhada", {
                  p_oficina: a.oficina!.id,
                  p_chave: chave.current,
                  p_cliente: cliente,
                  p_itens: itens,
                  p_desconto: desconto,
                  p_observacoes: obs,
                  p_detalhes: detalhes,
                });
              setNova(false);
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Buscar cliente
              <input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setCliente("");
                }}
                placeholder="Nome ou telefone"
              />
            </label>
            <label>
              Cliente
              <select
                required
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
              >
                <option value="">Selecione um cliente</option>
                {c.data?.itens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            {c.isError && <p role="alert">{erroPublico(c.error)}</p>}
            <fieldset className="os-detalhes">
              <legend>Dados do atendimento</legend>
              <div className="dupla-campos">
                {(
                  [
                    ["data_servico", "Data do serviço", "date"],
                    ["vencimento", "Vencimento", "date"],
                    ["veiculo", "Veículo / equipamento", "text"],
                    ["motor", "Motor / componente", "text"],
                    ["empresa_cliente", "Empresa do cliente (opcional)", "text"],
                    ["documento_cliente", "CPF/CNPJ do cliente (opcional)", "text"],
                    ["forma_pagamento", "Forma de pagamento combinada", "text"],
                  ] as const
                ).map(([campo, label, tipo]) => (
                  <label key={campo}>
                    {label}
                    <input
                      type={tipo}
                      maxLength={180}
                      value={detalhes[campo] || ""}
                      onChange={(e) =>
                        setDetalhes((atual) => ({
                          ...atual,
                          [campo]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                Confirmação na assinatura
                <select
                  value={detalhes.assinatura || "recebimento"}
                  onChange={(e) =>
                    setDetalhes((atual) => ({
                      ...atual,
                      assinatura: e.target.value as DetalhesNotinha["assinatura"],
                    }))
                  }
                >
                  <option value="recebimento">
                    Recebimento e conferência dos serviços
                  </option>
                  <option value="pendente">Recebimento com pagamento pendente</option>
                </select>
              </label>
              <label>
                Pix copia e cola (opcional)
                <textarea
                  maxLength={1024}
                  rows={2}
                  value={detalhes.pix_copia_cola || ""}
                  onChange={(e) =>
                    setDetalhes((atual) => ({
                      ...atual,
                      pix_copia_cola: e.target.value.trim(),
                    }))
                  }
                  placeholder="Cole o código fornecido pelo seu banco para mostrar o QR Code no PDF"
                />
              </label>
            </fieldset>
            {itens.map((i, n) => (
              <div className="documento-item" key={n}>
                <label>
                  Descrição
                  <input
                    required
                    maxLength={300}
                    value={i.descricao}
                    onChange={(e) => alterar(n, { descricao: e.target.value })}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={i.tipo}
                    onChange={(e) =>
                      alterar(n, {
                        tipo: e.target.value as ItemProposta["tipo"],
                      })
                    }
                  >
                    <option value="service">Serviço</option>
                    <option value="part">Peça</option>
                  </select>
                </label>
                <label>
                  Quantidade
                  <input
                    type="number"
                    required
                    min="0.001"
                    max="10000"
                    step="0.001"
                    value={i.quantidade}
                    onChange={(e) => alterar(n, { quantidade: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Preço (R$)
                  <input
                    type="number"
                    required
                    min="0"
                    max="1000000"
                    step="0.01"
                    value={i.preco_unitario_centavos / 100}
                    onChange={(e) =>
                      alterar(n, {
                        preco_unitario_centavos: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="botao-secundario"
                  disabled={itens.length === 1}
                  onClick={() => setItens(itens.filter((_, x) => x !== n))}
                >
                  Remover item
                </button>
              </div>
            ))}
            <button
              type="button"
              className="botao-secundario"
              disabled={itens.length >= 100}
              onClick={() => setItens([...itens, vazio()])}
            >
              Adicionar peça ou serviço
            </button>
            <label>
              Desconto (R$)
              <input
                type="number"
                min="0"
                max={total / 100}
                step="0.01"
                value={desconto / 100}
                onChange={(e) => setDesconto(Math.round(Number(e.target.value) * 100))}
              />
            </label>
            <label>
              Observações
              <textarea
                maxLength={2000}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </label>
            <h2>Total: {dinheiro(total - desconto)}</h2>
            <p>
              A notinha emitida preserva os itens e valores. Para corrigir, cancele e
              emita outra.
            </p>
            <button className="botao-primario">
              {busy ? "Emitindo…" : "Emitir notinha"}
            </button>
          </fieldset>
          {erro && <p role="alert">{erro}</p>}
        </form>
      </Dialogo>
      <Dialogo
        aberto={!!cancelar}
        fechar={() => {
          if (!busy) setCancelar(null);
        }}
        titulo="Cancelar notinha"
      >
        <p>O documento continuará no histórico, marcado como cancelado.</p>
        {erro && <p role="alert">{erro}</p>}
        <button
          className="botao-primario"
          disabled={busy}
          onClick={() =>
            void executar(async () => {
              if (a.demo)
                localStorage.setItem(
                  "patio_notinhas_demo",
                  JSON.stringify(
                    q.data!.map((n) =>
                      n.id === cancelar!.id ? { ...n, situacao: "cancelled" } : n,
                    ),
                  ),
                );
              else
                await rpc("cancelar_notinha", {
                  p_oficina: a.oficina!.id,
                  p_nota: cancelar!.id,
                });
              setCancelar(null);
            })
          }
        >
          Confirmar cancelamento
        </button>
      </Dialogo>
    </div>
  );
}
