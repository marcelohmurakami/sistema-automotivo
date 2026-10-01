import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { supabase } from "../lib/supabase";
import { erroEquipe } from "../services/equipe";
import { equipeRpc, perfisEquipe } from "../services/equipe";
import { normalizarTelefone } from "../services/clientes";
import "./Equipe.css";

export function CadastroConta() {
  const a = useAcesso(),
    [erro, setErro] = useState(""),
    [enviado, setEnviado] = useState(false),
    [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  if (a.usuario && !a.demo)
    return (
      <Navigate
        to={
          sessionStorage.getItem("patio_convite") ? "/convite" : "/nova-oficina"
        }
        replace
      />
    );
  async function cadastrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || trava.current) return;
    const f = new FormData(e.currentTarget);
    if (f.get("senha") !== f.get("confirmacao")) {
      setErro("As senhas precisam ser iguais.");
      return;
    }
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      a.usarContaReal();
      const { error } = await supabase.auth.signUp({
        email: String(f.get("email")).trim(),
        password: String(f.get("senha")),
        options: { emailRedirectTo: `${window.location.origin}/entrar` },
      });
      if (error) throw error;
      setEnviado(true);
    } catch {
      setErro(
        "Não foi possível concluir. Confira os dados e os requisitos da senha ou tente entrar se já possui conta.",
      );
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <main className="tela-acesso">
      <section className="cartao-acesso">
        <span className="simbolo-marca">
          <Building2 />
        </span>
        <div className="sobretitulo">COMECE PELO SIMPLES</div>
        <h1>Crie sua conta.</h1>
        {enviado ? (
          <div role="status">
            <Mail />
            <h2>Confira seu e-mail</h2>
            <p>
              Se o cadastro foi aceito, você receberá um link de confirmação.
              Depois, entre para configurar sua oficina ou aceitar o convite.
            </p>
            <Link className="botao-primario" to="/entrar">
              Ir para o login
            </Link>
          </div>
        ) : (
          <form className="formulario-cliente" onSubmit={cadastrar}>
            <p>
              Use seu próprio e-mail. Cada pessoa da equipe terá seu acesso.
            </p>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <label>
              Senha
              <input
                name="senha"
                type="password"
                minLength={8}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <small>
              Use pelo menos 8 caracteres. O serviço de acesso pode exigir uma
              senha mais forte.
            </small>
            <label>
              Confirme a senha
              <input
                name="confirmacao"
                type="password"
                minLength={8}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <button disabled={ocupado || !supabase} className="botao-primario">
              {ocupado ? "Criando conta…" : "Criar conta"}
            </button>
          </form>
        )}
        <p>
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </section>
    </main>
  );
}

export function NovaOficina() {
  const a = useAcesso(),
    navegar = useNavigate(),
    trava = useRef(false);
  const [chave] = useState(() => {
    const anterior = sessionStorage.getItem("patio_cadastro_oficina");
    if (anterior) return anterior;
    const id = crypto.randomUUID();
    sessionStorage.setItem("patio_cadastro_oficina", id);
    return id;
  });
  const [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false);
  const [etapa, setEtapa] = useState(1),
    [nome, setNome] = useState(""),
    [telefone, setTelefone] = useState("");
  const [logradouro, setLogradouro] = useState(""),
    [cidade, setCidade] = useState(""),
    [uf, setUf] = useState(""),
    [cep, setCep] = useState("");
  if (a.carregando)
    return (
      <main className="tela-acesso" role="status">
        Carregando…
      </main>
    );
  if (!a.usuario || a.demo) return <Navigate to="/entrar" replace />;
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trava.current) return;
    let normalizado: string;
    try {
      normalizado = normalizarTelefone(telefone);
    } catch (e) {
      setErro(erroEquipe(e));
      return;
    }
    setErro("");
    if (etapa === 1) {
      setEtapa(2);
      return;
    }
    trava.current = true;
    setOcupado(true);
    try {
      const id = await equipeRpc<string>("configurar_nova_oficina", {
        p_chave: chave,
        p_nome: nome.trim(),
        p_telefone: normalizado || "",
        p_endereco: { logradouro, cidade, uf, cep },
      });
      await a.atualizar();
      a.selecionarOficina(id);
      sessionStorage.removeItem("patio_cadastro_oficina");
      navegar("/clientes", { replace: true });
    } catch (e) {
      setErro(erroEquipe(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <main className="tela-acesso">
      <section className="cartao-acesso cadastro-oficina">
        <span className="simbolo-marca">
          <Building2 />
        </span>
        <div className="sobretitulo">PASSO {etapa} DE 2</div>
        <h1>Sua oficina no Pátio.</h1>
        <p>
          {etapa === 1
            ? "Alguns dados e você já pode começar a atender."
            : "Confira os dados antes de começar."}
        </p>
        <form className="formulario-cliente" onSubmit={salvar}>
          {etapa === 1 ? (
            <>
              <label>
                Nome da oficina
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="organization"
                />
              </label>
              <label>
                Telefone / WhatsApp
                <input
                  type="tel"
                  maxLength={20}
                  placeholder="(16) 99999-9999"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  autoComplete="tel"
                />
              </label>
              <label>
                Rua e número <small>(opcional)</small>
                <input
                  maxLength={200}
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  autoComplete="street-address"
                />
              </label>
              <div className="equipe-campos">
                <label>
                  Cidade
                  <input
                    maxLength={100}
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    autoComplete="address-level2"
                  />
                </label>
                <label>
                  UF
                  <input
                    maxLength={2}
                    pattern="[A-Za-z]{2}"
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    autoComplete="address-level1"
                  />
                </label>
              </div>
              <label>
                CEP
                <input
                  maxLength={9}
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  autoComplete="postal-code"
                />
              </label>
            </>
          ) : (
            <section className="equipe-resumo">
              <CheckCircle2 />
              <h2>{nome}</h2>
              <p>{telefone || "Telefone não informado"}</p>
              <p>
                {[logradouro, cidade, uf, cep].filter(Boolean).join(" · ") ||
                  "Endereço não informado"}
              </p>
              <strong>Plano Básico</strong>
              <p>
                Clientes, peças e serviços e notinhas. Você será o proprietário.
                Nenhum plano pago será contratado nesta etapa.
              </p>
            </section>
          )}
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <button className="botao-primario" disabled={ocupado}>
            {ocupado
              ? "Preparando oficina…"
              : etapa === 1
                ? "Conferir dados"
                : "Criar minha oficina"}
          </button>
          {etapa === 2 && (
            <button
              className="botao-secundario"
              type="button"
              disabled={ocupado}
              onClick={() => setEtapa(1)}
            >
              Voltar e editar
            </button>
          )}
        </form>
        <p>
          Você é funcionário? Abra o link de convite enviado pelo proprietário.
        </p>
        {a.oficina ? (
          <Link to="/">Voltar à minha oficina</Link>
        ) : (
          <button
            className="botao-secundario"
            onClick={() =>
              void a.sair().catch(() => setErro("Não foi possível sair."))
            }
          >
            Sair da conta
          </button>
        )}
      </section>
    </main>
  );
}

export function AceitarConvite() {
  const a = useAcesso(),
    navegar = useNavigate();
  const [token] = useState(() => {
    const novo = window.location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(novo)) {
      sessionStorage.setItem("patio_convite", novo);
      return novo;
    }
    if (novo) {
      sessionStorage.removeItem("patio_convite");
      return "";
    }
    return sessionStorage.getItem("patio_convite") || "";
  });
  const [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    trava = useRef(false);
  const convite = useQuery({
    queryKey: ["convite-equipe", a.usuario, token],
    enabled: !!a.usuario && !a.demo && !!token,
    retry: false,
    gcTime: 0,
    queryFn: () =>
      equipeRpc<{
        oficina: string;
        perfil: "staff" | "manager";
        email: string;
      }>("consultar_convite_equipe", { p_token: token }),
  });
  async function aceitar() {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const id = await equipeRpc<string>("aceitar_convite_equipe", {
        p_token: token,
      });
      await a.atualizar();
      a.selecionarOficina(id);
      sessionStorage.removeItem("patio_convite");
      navegar("/clientes", { replace: true });
    } catch (e) {
      setErro(erroEquipe(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <main className="tela-acesso">
      <section className="cartao-acesso">
        <span className="simbolo-marca">
          <ShieldCheck />
        </span>
        <h1>Vamos trabalhar juntos.</h1>
        <p>
          Entre com o e-mail que recebeu o convite. O acesso só será liberado
          após sua confirmação abaixo.
        </p>
        {!token ? (
          <p role="alert">
            Abra o link completo enviado pelo proprietário da oficina.
          </p>
        ) : a.carregando ? (
          <p role="status">Verificando sua conta…</p>
        ) : !a.usuario || a.demo ? (
          <>
            <Link
              className="botao-primario"
              to="/entrar"
              onClick={a.usarContaReal}
            >
              Já tenho conta · Entrar
            </Link>
            <Link
              className="botao-secundario"
              to="/cadastro"
              onClick={a.usarContaReal}
            >
              Criar minha conta
            </Link>
          </>
        ) : (
          <>
            <p>
              Conta atual: <strong>{a.email}</strong>
            </p>
            {convite.isPending ? (
              <p role="status">Conferindo convite…</p>
            ) : convite.isError ? (
              <p role="alert">
                {erroEquipe(convite.error)}{" "}
                <button
                  className="botao-secundario"
                  onClick={() => void convite.refetch()}
                >
                  Tentar novamente
                </button>
              </p>
            ) : (
              <section className="equipe-resumo">
                <h2>{convite.data.oficina}</h2>
                <p>
                  Você entrará como{" "}
                  {perfisEquipe[convite.data.perfil].toLowerCase()}.
                </p>
              </section>
            )}
            <button
              className="botao-primario"
              disabled={ocupado || !convite.isSuccess}
              onClick={() => void aceitar()}
            >
              {ocupado ? "Entrando na equipe…" : "Aceitar convite"}
            </button>
            <button
              className="botao-secundario"
              disabled={ocupado}
              onClick={() =>
                void a.sair().catch(() => setErro("Não foi possível sair."))
              }
            >
              Usar outra conta
            </button>
          </>
        )}
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <button
          className="botao-secundario"
          disabled={ocupado}
          onClick={() => {
            sessionStorage.removeItem("patio_convite");
            navegar("/entrar", { replace: true });
          }}
        >
          Voltar sem aceitar
        </button>
      </section>
    </main>
  );
}
