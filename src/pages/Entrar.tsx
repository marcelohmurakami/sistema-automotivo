import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import { LockKeyhole, Wrench } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAcesso } from "../auth/contexto";
export function Entrar() {
  const acesso = useAcesso();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (acesso.demo || acesso.usuario)
    return (
      <Navigate
        to={
          sessionStorage.getItem("patio_convite") && !acesso.demo
            ? "/convite"
            : "/clientes"
        }
        replace
      />
    );
  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const dados = new FormData(e.currentTarget);
    setEnviando(true);
    setErro("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(dados.get("email")),
        password: String(dados.get("senha")),
      });
      if (error)
        setErro("Não foi possível entrar. Confira seu e-mail e senha.");
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
          <Wrench />
        </span>
        <div className="sobretitulo">BEM-VINDO AO PÁTIO</div>
        <h1>
          Sua oficina.
          <br />
          Tudo no lugar.
        </h1>
        <p>
          Entre para acessar os clientes e os recursos contratados pela sua
          empresa.
        </p>
        <form onSubmit={entrar} className="formulario-cliente">
          <label>
            E-mail
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Senha
            <input
              name="senha"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <button className="botao-primario" disabled={enviando || !supabase}>
            {enviando ? "Entrando…" : "Entrar na oficina"}
          </button>
        </form>
        <p>
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
        </p>
        {!supabase && (
          <p>Configure as variáveis do Supabase para acessar sua conta.</p>
        )}
        <button className="botao-secundario" onClick={acesso.demonstrar}>
          Explorar demonstração
        </button>
        <p>
          É sua primeira vez? <Link to="/cadastro">Criar conta</Link>
        </p>
        <small>
          Na demonstração, os dados são fictícios e ficam neste navegador.
        </small>
      </section>
    </main>
  );
}
export function ExigirSessao() {
  const acesso = useAcesso();
  if (acesso.carregando)
    return (
      <main className="tela-acesso" role="status">
        Carregando sua oficina…
      </main>
    );
  if (!acesso.demo && !acesso.usuario) return <Navigate to="/entrar" replace />;
  if (acesso.erro)
    return (
      <main className="tela-acesso">
        <section className="cartao-acesso">
          <h1>Não conseguimos validar seu acesso.</h1>
          <p role="alert">{acesso.erro}</p>
          <button
            className="botao-primario"
            onClick={() => void acesso.atualizar()}
          >
            Tentar novamente
          </button>
        </section>
      </main>
    );
  if (!acesso.oficina)
    return (
      <Navigate
        to={
          sessionStorage.getItem("patio_convite") ? "/convite" : "/nova-oficina"
        }
        replace
      />
    );
  return (
    <Outlet
      key={`${acesso.demo ? "demo" : acesso.usuario}:${acesso.oficina.id}:${acesso.oficina.perfil}`}
    />
  );
}
export function RecursoProtegido({
  recurso,
  children,
  prototipo = false,
}: {
  recurso: string;
  children: ReactNode;
  prototipo?: boolean;
}) {
  const acesso = useAcesso();
  if (
    acesso.oficina?.perfil === "staff" &&
    ["finance", "reports"].includes(recurso)
  )
    return (
      <section className="estado-acesso">
        <LockKeyhole size={32} />
        <h1>Disponível à gerência da oficina.</h1>
        <p>
          Seu perfil não permite acessar este módulo. Fale com o proprietário se
          precisar de outra permissão.
        </p>
      </section>
    );
  if (!acesso.permite(recurso))
    return (
      <section className="estado-acesso">
        <LockKeyhole size={32} />
        <h1>Este recurso não está disponível no seu plano.</h1>
        <p>
          Consulte os recursos contratados e a situação da assinatura da sua
          oficina.
        </p>
        <Link className="botao-primario" to="/planos">
          Ver meu plano
        </Link>
      </section>
    );
  if (prototipo && !acesso.demo)
    return (
      <section className="estado-acesso">
        <Wrench size={32} />
        <h1>Recurso incluído no seu plano.</h1>
        <p>
          A integração desta tela ainda está em desenvolvimento. O cadastro de
          clientes já está conectado à sua oficina.
        </p>
        <Link to="/clientes" className="botao-primario">
          Acessar clientes
        </Link>
      </section>
    );
  return children;
}
