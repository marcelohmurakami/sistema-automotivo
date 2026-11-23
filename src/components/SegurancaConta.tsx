import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAcesso } from "../auth/contexto";

export function SegurancaConta({ confirmar = false }: { confirmar?: boolean }) {
  const a = useAcesso(),
    cache = useQueryClient();
  const trava = useRef(false);
  const [novo, setNovo] = useState<{ id: string; qr: string; segredo: string } | null>(
    null,
  );
  const [selecionado, setSelecionado] = useState("");
  const [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const [busy, setBusy] = useState(false),
    [remover, setRemover] = useState("");
  const fatores = useQuery({
    queryKey: ["fatores-mfa", a.usuario],
    enabled: !!a.usuario && !a.demo,
    queryFn: async () => {
      const r = await supabase!.auth.mfa.listFactors();
      if (r.error) throw r.error;
      return r.data.totp;
    },
    retry: false,
  });
  async function executar(fn: () => Promise<void>) {
    if (trava.current) return;
    trava.current = true;
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      await fn();
    } catch {
      setErro(
        "Não foi possível confirmar. Confira o código e a conexão e tente novamente.",
      );
    } finally {
      trava.current = false;
      setBusy(false);
    }
  }
  async function atualizar() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["fatores-mfa"] }),
      cache.invalidateQueries({ queryKey: ["seguranca-sessao"] }),
      cache.invalidateQueries({ queryKey: ["acesso"] }),
    ]);
  }
  function verificar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = String(new FormData(e.currentTarget).get("codigo") || "").trim();
    const factorId = novo?.id || selecionado || fatores.data?.[0]?.id;
    if (!factorId || !/^\d{6}$/.test(codigo)) {
      setErro("Digite os seis números do autenticador.");
      return;
    }
    void executar(async () => {
      const r = await supabase!.auth.mfa.challengeAndVerify({ factorId, code: codigo });
      if (r.error) throw r.error;
      setNovo(null);
      setAviso("Autenticação confirmada.");
      await atualizar();
    });
  }
  if (a.demo)
    return <p>Entre na conta real para ativar a verificação em duas etapas.</p>;
  return (
    <section className="dados-bloco">
      <h2>{confirmar ? "Confirme que é você" : "Verificação em duas etapas"}</h2>
      <p>
        {confirmar
          ? "Abra seu autenticador e digite o código de seis números."
          : "Proteja sua conta com um aplicativo autenticador. O código será pedido ao entrar."}
      </p>
      {fatores.isPending && <p role="status">Consultando sua proteção…</p>}
      {fatores.isError && (
        <p role="alert">
          Não foi possível consultar os autenticadores.{" "}
          <button onClick={() => void fatores.refetch()}>Tentar novamente</button>
        </p>
      )}
      {!confirmar && !novo && (
        <>
          <ul className="dados-lista">
            {fatores.data?.map((f) => (
              <li key={f.id}>
                <span>{f.friendly_name || "Autenticador"}</span>
                <button
                  className="botao-secundario"
                  disabled={busy}
                  onClick={() => setRemover(f.id)}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <button
            className="botao-primario"
            disabled={busy || fatores.isPending || fatores.isError}
            onClick={() =>
              void executar(async () => {
                const r = await supabase!.auth.mfa.enroll({
                  factorType: "totp",
                  friendlyName: "Autenticador · " + new Date().toLocaleString("pt-BR"),
                  issuer: "Pátio Gestão",
                });
                if (r.error) throw r.error;
                const { default: QRCode } = await import("qrcode");
                setNovo({
                  id: r.data.id,
                  qr: await QRCode.toDataURL(r.data.totp.uri, {
                    width: 240,
                    margin: 2,
                  }),
                  segredo: r.data.totp.secret,
                });
              })
            }
          >
            {fatores.data?.length
              ? "Adicionar autenticador reserva"
              : "Ativar proteção"}
          </button>
        </>
      )}
      {novo && (
        <>
          <p>1. Leia o QR no aplicativo. 2. Digite o código para concluir.</p>
          <img
            className="dados-qr"
            src={novo.qr}
            alt="QR para configurar seu autenticador"
          />
          <details>
            <summary>Não consigo ler o QR</summary>
            <label>
              Chave manual
              <input
                readOnly
                value={novo.segredo}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          </details>
        </>
      )}
      {(novo || confirmar) && (
        <form className="formulario-cliente" onSubmit={verificar}>
          {confirmar && (fatores.data?.length || 0) > 1 && (
            <label>
              Autenticador
              <select
                value={selecionado || fatores.data?.[0]?.id}
                onChange={(e) => setSelecionado(e.target.value)}
              >
                {fatores.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.friendly_name || "Autenticador"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Código do autenticador
            <input
              name="codigo"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              autoFocus
            />
          </label>
          <button className="botao-primario" disabled={busy}>
            {busy ? "Confirmando…" : "Confirmar código"}
          </button>
          {novo && (
            <button
              type="button"
              className="botao-secundario"
              disabled={busy}
              onClick={() =>
                void executar(async () => {
                  const r = await supabase!.auth.mfa.unenroll({ factorId: novo.id });
                  if (r.error) throw r.error;
                  setNovo(null);
                  await atualizar();
                })
              }
            >
              Cancelar configuração
            </button>
          )}
        </form>
      )}
      {remover && (
        <div role="alert" className="aviso-cliente">
          <p>
            Remover este autenticador? Se for o único, sua conta ficará sem a segunda
            etapa. É preciso confirmar sua sessão com um código antes de remover.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void executar(async () => {
                const r = await supabase!.auth.mfa.unenroll({ factorId: remover });
                if (r.error) throw r.error;
                const refresh = await supabase!.auth.refreshSession();
                if (refresh.error) throw refresh.error;
                setRemover("");
                await atualizar();
                setAviso("Autenticador removido.");
              })
            }
          >
            Confirmar remoção
          </button>
          <button disabled={busy} onClick={() => setRemover("")}>
            Manter
          </button>
        </div>
      )}
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      <details>
        <summary>Perdi o aparelho / como recuperar</summary>
        <p>
          Use o autenticador reserva, se tiver. Se perdeu todos, solicite recuperação ao
          suporte. O responsável deve verificar sua identidade antes de remover o fator.
          Redefinir a senha não desativa esta proteção.
        </p>
        <Link to="/ajuda">Abrir ajuda e suporte</Link>
      </details>
      {confirmar && (
        <button
          className="botao-secundario"
          disabled={busy}
          onClick={() => void executar(a.sair)}
        >
          Sair desta conta
        </button>
      )}
    </section>
  );
}
