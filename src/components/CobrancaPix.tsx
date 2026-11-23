import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";
import { dinheiro } from "../lib/formatacao";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useAcesso } from "../auth/contexto";
import { supabase, erroPublico } from "../lib/supabase";

import type { TituloFinanceiro } from "../services/financeiro";
import { atualizarIntegracoes } from "../lib/atualizarIntegracoes";
import { Dialogo } from "./Dialogo";
import "../pages/OficinaAgil.css";
type Cobranca = {
  id: string;
  situacao: string;
  valor_centavos: number;
  codigo_pix: string | null;
  expira_em: string | null;
  ambiente: string;
  conciliacao_manual: boolean;
};
const situacoes: Record<string, string> = {
  criando: "Geração em conferência",
  pendente: "Aguardando pagamento",
  aprovado: "Recebido",
  cancelado: "Cancelado",
  expirado: "Vencido",
  falhou: "Não gerado",
  divergente: "Conferir no financeiro",
  estornado: "Reembolsado",
};
async function chamar(d: Record<string, unknown>, signal?: AbortSignal) {
  const { data, error } = await supabase!.functions.invoke("pix-os", {
    body: d,
    signal,
  });
  if (error) {
    let message = "Recebimento Pix ainda não configurado ou indisponível.";
    try {
      const body = await error.context?.json();
      if (body?.erro) message = body.erro;
    } catch {
      /* A função pode ainda não estar publicada. */
    }
    throw new Error(message);
  }
  if (data.erro) throw new Error(data.erro);
  return data;
}
function Codigo({ c }: { c: Cobranca }) {
  const [qr, setQr] = useState(""),
    [aviso, setAviso] = useState("");
  useEffect(() => {
    let ativo = true;
    if (c.codigo_pix)
      QRCode.toDataURL(c.codigo_pix, { width: 260, margin: 2 })
        .then((r) => {
          if (ativo) setQr(r);
        })
        .catch(() => {
          if (ativo) setAviso("Use o código copia e cola abaixo.");
        });
    return () => {
      ativo = false;
    };
  }, [c.codigo_pix]);
  return (
    <>
      {qr && <img className="agil-qr" src={qr} alt="QR code Pix desta cobrança" />}
      <label>
        Pix copia e cola
        <textarea readOnly value={c.codigo_pix || ""} rows={3} />
      </label>
      <button
        type="button"
        className="botao-secundario"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(c.codigo_pix || "");
            setAviso("Código copiado.");
          } catch {
            setAviso("Selecione o código acima para copiar.");
          }
        }}
      >
        Copiar Pix
      </button>
      {aviso && <small role="status">{aviso}</small>}
    </>
  );
}
export function CobrancaPix({
  titulo,
  preparar,
  restante,
}: {
  titulo: TituloFinanceiro | null;
  preparar?: () => Promise<TituloFinanceiro>;
  restante: number;
}) {
  const a = useAcesso(),
    cache = useQueryClient(),
    [aberto, setAberto] = useState(false),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState(""),
    [atual, setAtual] = useState<Cobranca | null>(null),
    [chave, setChave] = useState(() => novoId()),
    [tituloLocal, setTituloLocal] = useState<TituloFinanceiro | null>(null);
  const t = titulo || tituloLocal;
  const trava = useRef(false);
  const config = useQuery({
    queryKey: ["pix-config", a.oficina!.id],
    enabled: aberto && !a.demo,
    queryFn: ({ signal }) =>
      chamar({ oficina: a.oficina!.id, acao: "configuracao" }, signal),
    retry: false,
    staleTime: 60000,
  });
  const q = useQuery({
    queryKey: ["pix-os", a.oficina!.id, t?.id],
    enabled: aberto && !!t && !a.demo,
    queryFn: ({ signal }) =>
      rpc<Cobranca[]>(
        "consultar_cobrancas_pix",
        {
          p_oficina: a.oficina!.id,
          p_titulo: t!.id,
        },
        signal,
      ),
    refetchInterval: 10000,
  });
  const cobranca = q.data?.find((c) => c.id === atual?.id) ?? atual;
  async function operar(
    acao: string,
    c?: Cobranca,
    extras: Record<string, unknown> = {},
  ) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    try {
      const conta = t ?? (await preparar?.());
      if (!conta) throw new Error("Prepare o recebimento desta OS primeiro.");
      setTituloLocal(conta);
      const r = await chamar({
        oficina: a.oficina!.id,
        titulo: conta.id,
        chave: c?.id || chave,
        acao,
        ...extras,
      });
      setAtual(r.cobranca);
      setChave(novoId());
      await cache.invalidateQueries({ queryKey: ["pix-os"] });
      await atualizarIntegracoes(cache);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button className="botao-secundario" onClick={() => setAberto(true)}>
        Cobranças Pix
      </button>
      <Dialogo
        aberto={aberto}
        titulo="Receber por Pix"
        fechar={() => !busy && setAberto(false)}
      >
        <div className="agil-pagina">
          <p>
            Gere o sinal ou o saldo da OS. O recebimento só entra no financeiro após a
            confirmação do provedor.
          </p>
          {a.demo || config.isError || config.data?.disponivel === false ? (
            <p className="agil-alerta">
              {a.demo
                ? "Disponível na conta real."
                : "Conecte a conta de recebimento da empresa para liberar QR code e confirmação automática. Por enquanto, registre o Pix recebido em “Receber pagamento”."}
            </p>
          ) : config.isPending ? (
            <p>Conferindo conexão…</p>
          ) : (
            <>
              <p>
                Ambiente:{" "}
                <strong>
                  {config.data?.ambiente === "teste"
                    ? "TESTE · sem cobrança de clientes reais"
                    : "Produção"}
                </strong>
              </p>
              {restante > 0 && (
                <form
                  className="agil-pagina"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void operar("criar", undefined, {
                      valor_centavos: Math.round(Number(f.get("valor")) * 100),
                      email: String(f.get("email")),
                    });
                  }}
                >
                  <div className="agil-grade">
                    <label>
                      Valor a cobrar (R$)
                      <input
                        name="valor"
                        type="number"
                        min="0.01"
                        max={restante / 100}
                        step="0.01"
                        defaultValue={restante / 100}
                        required
                      />
                    </label>
                    <label>
                      E-mail do pagador
                      <input
                        name="email"
                        type="email"
                        maxLength={254}
                        required
                        autoComplete="email"
                      />
                    </label>
                  </div>
                  <button
                    className="botao-primario"
                    disabled={busy || !config.data?.disponivel}
                  >
                    {busy ? "Consultando…" : "Gerar cobrança Pix"}
                  </button>
                </form>
              )}
            </>
          )}
          {erro && (
            <p role="alert" className="agil-alerta">
              {erro}
            </p>
          )}
          {cobranca && (
            <div className="agil-card">
              <h3>
                {dinheiro(cobranca.valor_centavos)} · {situacoes[cobranca.situacao]}
              </h3>
              {cobranca.expira_em && (
                <p>Validade: {new Date(cobranca.expira_em).toLocaleString("pt-BR")}</p>
              )}
              {cobranca.codigo_pix && cobranca.situacao === "pendente" && (
                <Codigo key={`${cobranca.id}:${cobranca.codigo_pix}`} c={cobranca} />
              )}
              <button
                className="botao-secundario"
                disabled={busy}
                onClick={() => void operar("consultar", cobranca)}
              >
                Conferir no provedor
              </button>
              {cobranca.conciliacao_manual && (
                <p className="agil-alerta">
                  Há diferença entre o provedor e o saldo. Confira os lançamentos no
                  financeiro antes de registrar outro pagamento.
                </p>
              )}
            </div>
          )}
          {!!q.data?.length && (
            <div>
              <h3>Cobranças desta OS</h3>
              {q.data.map((c) => (
                <div className="agil-etapa" key={c.id}>
                  <strong>
                    {dinheiro(c.valor_centavos)} · {situacoes[c.situacao]}
                  </strong>
                  <div className="agil-acoes">
                    <button className="botao-secundario" onClick={() => setAtual(c)}>
                      Ver cobrança
                    </button>
                    {["pendente", "criando"].includes(c.situacao) && (
                      <button
                        className="botao-secundario"
                        disabled={busy}
                        onClick={() => void operar("cancelar", c)}
                      >
                        Cancelar no provedor
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialogo>
    </>
  );
}
