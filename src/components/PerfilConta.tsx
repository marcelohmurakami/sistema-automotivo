import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import "./PerfilConta.css";

export function PerfilConta() {
  const acesso = useAcesso();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState("");
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fecharFora = (evento: PointerEvent) => {
      if (!container.current?.contains(evento.target as Node)) setAberto(false);
    };
    const fecharEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setAberto(false);
        gatilho.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fecharFora);
    document.addEventListener("keydown", fecharEscape);
    return () => {
      document.removeEventListener("pointerdown", fecharFora);
      document.removeEventListener("keydown", fecharEscape);
    };
  }, [aberto]);

  const sair = async () => {
    if (saindo) return;
    setSaindo(true);
    setErro("");
    try {
      await acesso.sair();
      setAberto(false);
    } catch {
      setErro("Não foi possível sair. Tente novamente.");
    } finally {
      setSaindo(false);
    }
  };

  return (
    <div
      className="conta-cabecalho"
      ref={container}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setAberto(false);
      }}
    >
      <button
        ref={gatilho}
        type="button"
        className="perfil-cabecalho"
        aria-label="Menu da conta"
        aria-expanded={aberto}
        aria-controls={menuId}
        onClick={() => setAberto(!aberto)}
      >
        <span className="avatar-usuario">M</span>
        <div>
          <strong>{acesso.demo ? "Marcelo" : "Minha conta"}</strong>
          <small>
            {acesso.oficina?.perfil === "staff"
              ? "Colaborador"
              : acesso.oficina?.perfil === "manager"
                ? "Gerente"
                : "Administrador"}
          </small>
        </div>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {aberto && (
        <nav id={menuId} className="menu-conta" aria-label="Opções da conta">
          <p className="identificacao-conta">
            <strong>{acesso.demo ? "Demonstração" : "Conta conectada"}</strong>
            <span>
              {acesso.demo ? "Dados fictícios neste navegador" : acesso.email}
            </span>
          </p>
          {acesso.oficinas.length > 1 && (
            <label>
              Empresa
              <select
                aria-label="Empresa ativa"
                value={acesso.oficina?.id}
                onChange={(e) => {
                  acesso.selecionarOficina(e.target.value);
                  setAberto(false);
                }}
              >
                {acesso.oficinas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Link to="/configuracoes" onClick={() => setAberto(false)}>
            <Settings2 size={18} aria-hidden="true" />
            Configurações da conta
          </Link>
          <button type="button" disabled={saindo} onClick={() => void sair()}>
            <LogOut size={18} aria-hidden="true" />
            {saindo
              ? "Saindo…"
              : acesso.demo
                ? "Entrar na minha conta"
                : "Sair da conta"}
          </button>
          <Link to="/ajuda" onClick={() => setAberto(false)}>
            Ajuda e suporte
          </Link>
          {erro && <p role="alert">{erro}</p>}
        </nav>
      )}
    </div>
  );
}
