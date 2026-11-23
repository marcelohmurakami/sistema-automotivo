import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { supabase } from "../lib/supabase";
import { parametroRetorno, retornoPortal } from "../lib/retornoPortal";

export function RecuperarSenha() {
  const retorno = retornoPortal(useLocation().search);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!supabase || enviando) return;
    const email = String(new FormData(evento.currentTarget).get("email")).trim();
    setEnviando(true);
    setErro("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: new URL(
          "/definir-senha" + parametroRetorno(retorno),
          window.location.origin,
        ).href,
      });
      if (error) throw error;
      setEnviado(true);
    } catch {
      setErro(
        "Não foi possível solicitar o link agora. Aguarde alguns minutos e tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }
  return (
    <main className="tela-acesso">
      <section className="cartao-acesso">
        <span className="simbolo-marca">
          <LockKeyhole />
        </span>
        <h1>Recupere seu acesso.</h1>
        {enviado ? (
          <p role="status">
            Se houver uma conta com esse e-mail, você receberá um link para definir uma
            nova senha. Confira também a caixa de spam.
          </p>
        ) : (
          <>
            <p>
              Informe o e-mail usado na sua conta. Você receberá um link seguro para
              criar uma nova senha.
            </p>
            <form onSubmit={enviar} className="formulario-cliente">
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={enviando}
                />
              </label>
              {erro && (
                <p role="alert" className="erro-formulario">
                  {erro}
                </p>
              )}
              <button className="botao-primario" disabled={enviando || !supabase}>
                {enviando ? "Enviando…" : "Enviar link de recuperação"}
              </button>
            </form>
          </>
        )}
        <Link to={retorno ? retorno + "#area-cliente" : "/entrar"}>
          Voltar para o acesso
        </Link>
      </section>
    </main>
  );
}
