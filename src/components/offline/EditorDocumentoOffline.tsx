import { useEffect, useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Dialogo } from "../Dialogo";
import { EditorItensOS } from "../EditorItensOS";
import { EditorFichaEspecialidade } from "../FichaEspecialidade";
import { useDesconto } from "../../lib/useDesconto";
import { erroPublico } from "../../lib/supabase";
import { ramos } from "../../lib/ramos";
import {
  validarDocumentoOffline,
  type DocumentoOffline,
} from "../../lib/documentoOffline";
import {
  guardarRascunhoOffline,
  type BaseOffline,
  type RascunhoOffline,
} from "../../lib/atendimentoOffline";

export function EditorDocumentoOffline({
  registro,
  base,
  fechar,
  atualizar,
  imprimir,
}: {
  registro: RascunhoOffline;
  base: BaseOffline;
  fechar: () => void;
  atualizar: () => Promise<void>;
  imprimir: (r: RascunhoOffline, janela?: Window) => void;
}) {
  const [d, setD] = useState(registro.documento!),
    [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [editandoItem, setEditandoItem] = useState(false),
    [salvo, setSalvo] = useState(true);
  const revisao = useRef(registro.revisao),
    fila = useRef(Promise.resolve()),
    vivo = useRef(true),
    alterado = useRef(false),
    finalizando = useRef(false);
  const subtotal = d.itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos),
    0,
  );
  const desconto = useDesconto(subtotal, 0, d.desconto);
  const atual = { ...d, desconto: desconto.estado };
  const atualRef = useRef(atual);
  useEffect(() => {
    atualRef.current = atual;
  });
  const auto = base.ramo === "automotivo" || !base.ramo,
    rotulo = auto ? "Veículo" : ramos[base.ramo!].objeto;
  const gravar = (dados: DocumentoOffline, pronto = false) => {
    const trabalho = fila.current
      .catch(() => {})
      .then(async () => {
        const r = {
          ...registro,
          revisao: revisao.current,
          documento: structuredClone(dados),
          pronto_envio: pronto,
          relato: dados.observacoes,
          cliente_id: dados.cliente.id,
          veiculo_id: auto ? dados.bem.id : "",
          objeto: dados.bem.nome,
          data_servico: dados.data,
          atualizado: Date.now(),
          erro: "",
        };
        await guardarRascunhoOffline(r);
        revisao.current = r.revisao;
        window.dispatchEvent(new Event("patio-offline-alterado"));
        return r;
      });
    fila.current = trabalho.then(
      () => {},
      () => {},
    );
    return trabalho;
  };
  const gravarRef = useRef(gravar);
  useEffect(() => {
    gravarRef.current = gravar;
  });
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  useEffect(() => {
    if (!alterado.current) {
      alterado.current = true;
      return;
    }
    setSalvo(false);
    const timer = window.setTimeout(() => {
      if (finalizando.current) return;
      void gravarRef
        .current(atualRef.current)
        .then((r) => {
          if (
            vivo.current &&
            JSON.stringify(r.documento) === JSON.stringify(atualRef.current)
          )
            setSalvo(true);
        })
        .catch((e) => {
          if (vivo.current) setErro(erroPublico(e));
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [d, desconto.estado]);
  useEffect(() => {
    if (salvo && !editandoItem) return;
    const proteger = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", proteger);
    return () => window.removeEventListener("beforeunload", proteger);
  }, [salvo, editandoItem]);
  async function salvar(pronto: boolean, nota = false) {
    if (finalizando.current) return;
    finalizando.current = true;
    const janela = nota ? window.open("", "_blank") : null;
    setOcupado(true);
    setErro("");
    try {
      if (pronto || nota) validarDocumentoOffline(atual);
      if (nota && !janela) throw Error("Permita abrir a janela de impressão.");
      const r = await gravar(atual, pronto);
      setSalvo(true);
      await atualizar();
      if (nota) imprimir(r, janela!);
      fechar();
    } catch (e) {
      janela?.close();
      finalizando.current = false;
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
    }
  }
  const selecionarCliente = (id: string) => {
    const c = base.aux.clientes.find((c) => c.id === id);
    setD({
      ...d,
      cliente: c
        ? { id: c.id, nome: c.nome, telefone: c.telefone_e164 || "" }
        : { id: "", nome: "", telefone: "" },
      bem: { id: "", nome: "", marca: "", motor: "", placa: "" },
    });
  };
  const bens = useMemo(() => {
    const vinculados = new Set(
      base.aux.vinculos
        .filter((l) => l.cliente_id === d.cliente.id)
        .map((l) => l.veiculo_id),
    );
    return auto
      ? base.aux.veiculos
          .filter((v) => vinculados.has(v.id))
          .map((v) => ({
            id: v.id,
            nome: v.modelo,
            marca: v.marca || "",
            placa: v.placa || "",
            motor: "",
          }))
      : (base.objetos || [])
          .filter((o) => o.cliente_id === d.cliente.id)
          .map((o) => ({
            id: o.id,
            nome: o.nome,
            marca: o.dados.marca || "",
            placa: "",
            motor: "",
          }));
  }, [auto, base, d.cliente.id]);
  return (
    <Dialogo
      aberto
      titulo={d.tipo === "os" ? "Nova OS sem internet" : "Novo orçamento sem internet"}
      fechar={() => {
        if (editandoItem) {
          setErro("Conclua ou cancele o item em edição antes de fechar.");
          return;
        }
        if (!ocupado) void salvar(false);
      }}
    >
      <form
        className="offline-documento"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar(true);
        }}
      >
        <p className="offline-ajuda" role="status">
          {editandoItem
            ? "Confirme o item em edição para guardá-lo"
            : salvo
              ? "Salvo neste aparelho"
              : "Guardando alterações…"}{" "}
          · {d.tipo === "os" ? "A OS" : "O orçamento"} será enviado após você salvar.
        </p>
        <fieldset disabled={ocupado}>
          <div className="offline-documento-grade">
            <label>
              Cliente
              <select
                value={d.cliente.id}
                onChange={(e) => selecionarCliente(e.target.value)}
              >
                <option value="">Informar novo cliente</option>
                {base.aux.clientes.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data do serviço
              <input
                type="date"
                required
                value={d.data}
                onChange={(e) => setD({ ...d, data: e.target.value })}
              />
            </label>
          </div>
          {!d.cliente.id && (
            <div className="offline-documento-grade">
              <label>
                Nome do cliente
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={d.cliente.nome}
                  onChange={(e) =>
                    setD({ ...d, cliente: { ...d.cliente, nome: e.target.value } })
                  }
                />
              </label>
              <label>
                Telefone (opcional)
                <input
                  type="tel"
                  maxLength={24}
                  value={d.cliente.telefone}
                  onChange={(e) =>
                    setD({ ...d, cliente: { ...d.cliente, telefone: e.target.value } })
                  }
                />
              </label>
            </div>
          )}
          {bens.length > 0 && (
            <label>
              {rotulo} cadastrado
              <select
                value={d.bem.id}
                onChange={(e) =>
                  setD({
                    ...d,
                    bem: bens.find((b) => b.id === e.target.value) || {
                      id: "",
                      nome: "",
                      marca: "",
                      placa: "",
                      motor: "",
                    },
                  })
                }
              >
                <option value="">Informar outro</option>
                {bens.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {rotulo}
            <input
              required
              minLength={2}
              maxLength={160}
              readOnly={!!d.bem.id}
              value={d.bem.nome}
              onChange={(e) => setD({ ...d, bem: { ...d.bem, nome: e.target.value } })}
            />
          </label>
          <EditorItensOS
            contexto={d.tipo === "os" ? "OS" : "orçamento"}
            itens={d.itens}
            alterar={(itens) => setD({ ...d, itens })}
            catalogo={base.aux.catalogo}
            desconto={desconto}
            nota={
              d.tipo === "os"
                ? {
                    mostrar: d.mostrar_desconto_nota,
                    alterar: (mostrar) =>
                      setD({ ...d, mostrar_desconto_nota: mostrar }),
                  }
                : undefined
            }
            aoEditarItem={setEditandoItem}
            aoProcessar={setOcupado}
            especialidade={d.especialidade}
            somenteLocal
          />
          <details className="os-detalhes">
            <summary>Identificação e pagamento (opcional)</summary>
            <div className="offline-documento-grade">
              <label>
                Marca
                <input
                  maxLength={100}
                  value={d.bem.marca}
                  readOnly={!!d.bem.id}
                  onChange={(e) =>
                    setD({ ...d, bem: { ...d.bem, marca: e.target.value } })
                  }
                />
              </label>
              {auto && (
                <>
                  <label>
                    Placa
                    <input
                      maxLength={8}
                      value={d.bem.placa}
                      readOnly={!!d.bem.id}
                      onChange={(e) =>
                        setD({
                          ...d,
                          bem: { ...d.bem, placa: e.target.value.toUpperCase() },
                        })
                      }
                    />
                  </label>
                  <label>
                    Motor
                    <input
                      maxLength={100}
                      value={d.bem.motor}
                      onChange={(e) =>
                        setD({ ...d, bem: { ...d.bem, motor: e.target.value } })
                      }
                    />
                  </label>
                </>
              )}
              <label>
                Forma de pagamento
                <select
                  value={d.forma_pagamento}
                  onChange={(e) => setD({ ...d, forma_pagamento: e.target.value })}
                >
                  {[
                    "Carteira",
                    "Pix",
                    "Dinheiro",
                    "Cartão de crédito",
                    "Cartão de débito",
                    "Boleto",
                    "Transferência",
                  ].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              {d.forma_pagamento === "Carteira" && (
                <label>
                  Vencimento
                  <input
                    type="date"
                    value={d.vencimento}
                    onChange={(e) => setD({ ...d, vencimento: e.target.value })}
                  />
                </label>
              )}
            </div>
            <p className="offline-ajuda">
              Definir a forma de pagamento não registra recebimento.
            </p>
          </details>
          <EditorFichaEspecialidade
            valor={d.ficha}
            alterar={(ficha) => setD({ ...d, ficha })}
          />
          <details className="os-detalhes">
            <summary>Observações e condições (opcional)</summary>
            {!auto && (
              <label>
                Descrição / título
                <input
                  maxLength={200}
                  value={d.titulo}
                  onChange={(e) => setD({ ...d, titulo: e.target.value })}
                />
              </label>
            )}
            <label>
              Observações
              <textarea
                maxLength={4000}
                rows={3}
                value={d.observacoes}
                onChange={(e) => setD({ ...d, observacoes: e.target.value })}
              />
            </label>
            <label>
              Condições
              <textarea
                maxLength={4000}
                rows={3}
                value={d.condicoes}
                onChange={(e) => setD({ ...d, condicoes: e.target.value })}
              />
            </label>
          </details>
        </fieldset>
        {erro && (
          <p role="alert" className="offline-erro">
            {erro}
          </p>
        )}
        <footer className="offline-documento-acoes">
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado || editandoItem}
            onClick={() => void salvar(false)}
          >
            Continuar depois
          </button>
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado || editandoItem}
            onClick={() => void salvar(true, true)}
          >
            <Printer size={17} />
            Salvar e imprimir
          </button>
          <button className="botao-primario" disabled={ocupado || editandoItem}>
            {ocupado
              ? "Guardando…"
              : d.tipo === "os"
                ? "Salvar OS"
                : "Salvar orçamento"}
          </button>
        </footer>
      </form>
    </Dialogo>
  );
}
