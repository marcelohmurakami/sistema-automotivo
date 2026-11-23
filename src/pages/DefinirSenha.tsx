import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAcesso } from "../auth/contexto";
import { parametroRetorno, retornoPortal } from "../lib/retornoPortal";

export function DefinirSenha() {
  const retorno = retornoPortal(useLocation().search);
  const acesso = useAcesso();
  const navegar = useNavigate();
  const [verificando, setVerificando] = useState(true);
  const [sessaoValida, setSessaoValida] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true;
    async function conferir() {
      try {
        const resultado = await supabase?.auth.getSession();
        if (ativo) setSessaoValida(!!resultado?.data.session && !resultado.error);
      } finally {
        if (ativo) setVerificando(false);
      }
    }
    void conferir().catch(() => {
      if (ativo) setErro("Não foi possível validar o link. Verifique sua conexão.");
    });
    return () => {
      ativo = false;
    };
  }, []);
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || enviando || !sessaoValida) return;
    const dados = new FormData(e.currentTarget);
    const senha = String(dados.get("senha"));
    if (senha.length < 12) {
      setErro("Use pelo menos 12 caracteres.");
      return;
    }
    if (senha !== dados.get("confirmacao")) {
      setErro("As duas senhas precisam ser iguais.");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        setErro(
          error.code === "weak_password"
            ? "Escolha uma senha mais forte, com letras, números e símbolos."
            : "Não foi possível definir a senha. O link pode ter expirado; solicite outro e tente novamente.",
        );
        return;
      }
      acesso.usarContaReal();
      navegar(retorno ? retorno + "#area-cliente" : "/clientes", {
        replace: true,
      });
    } catch {
      setErro("Não foi possível conectar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <main className="tela-acesso">
      <section className="cartao-acesso">
        <span className="simbolo-marca">
          <LockKeyhole size={21} />
        </span>
        <div className="sobretitulo">SEU ACESSO AO PÁTIO</div>
        <h1>Defina sua senha.</h1>
        {verificando ? (
          <p role="status">Validando seu link…</p>
        ) : !sessaoValida ? (
          <>
            <p role="alert">
              {erro ||
                "Abra o link recebido por e-mail. Se ele expirou ou já foi usado, solicite um novo link de recuperação."}
            </p>
            <Link
              className="botao-secundario"
              to={retorno ? retorno + "#area-cliente" : "/entrar"}
            >
              Voltar para o acesso
            </Link>
            <Link to={"/recuperar-senha" + parametroRetorno(retorno)}>
              Solicitar novo link
            </Link>
          </>
        ) : (
          <>
            <p>Crie uma senha com pelo menos 12 caracteres para entrar na sua conta.</p>
            <form className="formulario-cliente" onSubmit={salvar}>
              <label>
                Nova senha
                <input
                  name="senha"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={enviando}
                />
              </label>
              <label>
                Confirmar senha
                <input
                  name="confirmacao"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={enviando}
                />
              </label>
              {erro && (
                <p className="erro-formulario" role="alert">
                  {erro}
                </p>
              )}
              <button className="botao-primario" disabled={enviando}>
                {enviando ? "Salvando…" : "Salvar senha e acessar"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
