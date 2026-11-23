import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, ShieldCheck, Copy, Check, Link2 } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroEquipe } from "../services/equipe";
import { Dialogo } from "../components/Dialogo";
import { PermissoesEquipe } from "../components/PermissoesEquipe";
import {
  equipeRpc,
  gerarConvite,
  equipeDemo,
  perfisEquipe,
  type EquipeDados,
  type MembroEquipe,
} from "../services/equipe";
import "./Equipe.css";

export function Equipe() {
  const a = useAcesso(),
    cache = useQueryClient();
  const [dadosDemo, setDadosDemo] = useState<EquipeDados>(() =>
    structuredClone(equipeDemo),
  );
  const [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const [convidando, setConvidando] = useState(false),
    [link, setLink] = useState("");
  const [editar, setEditar] = useState<MembroEquipe | null>(null);
  const [permissoes, setPermissoes] = useState<MembroEquipe | null>(null);
  const [ocupado, setOcupado] = useState(false),
    trava = useRef(false);
  const dono = a.oficina?.perfil === "owner";
  const q = useQuery({
    queryKey: ["equipe", a.usuario, a.oficina?.id, a.demo],
    enabled: dono && !a.demo,
    queryFn: () =>
      equipeRpc<EquipeDados>("consultar_equipe", { p_oficina: a.oficina!.id }),
    retry: false,
  });
  const dados = a.demo ? dadosDemo : q.data;
  async function executar(fn: () => Promise<void>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await fn();
      await cache.invalidateQueries({ queryKey: ["equipe"] });
    } catch (e) {
      setErro(erroEquipe(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function convidar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void executar(async () => {
      if (a.demo) {
        setAviso("Demonstração: entre na sua conta real para gerar um convite válido.");
        setConvidando(false);
        return;
      }
      const novo = await gerarConvite(
        a.oficina!.id,
        String(f.get("email")),
        String(f.get("perfil")),
      );
      setLink(novo);
      setConvidando(false);
    });
  }
  if (!dono)
    return (
      <section className="estado-acesso">
        <ShieldCheck size={32} />
        <h1>A equipe é administrada pelo proprietário.</h1>
        <p>
          Peça ao responsável pela empresa para convidar pessoas ou alterar seu acesso.
        </p>
      </section>
    );
  return (
    <div className="equipe-pagina">
      <header className="titulo-pagina">
        <div>
          <div className="sobretitulo">CADA PESSOA, O ACESSO CERTO</div>
          <h1>
            Minha equipe<span>.</span>
          </h1>
          <p>Convide quem trabalha com você e cuide dos acessos em um só lugar.</p>
        </div>
        <button
          className="botao-primario"
          onClick={() => {
            setErro("");
            setConvidando(true);
          }}
        >
          <UserPlus size={18} /> Convidar pessoa
        </button>
      </header>
      {a.permite("finance") && (
        <Link className="botao-secundario" to="/financeiro?aba=comissoes">
          Configurar comissões da equipe
        </Link>
      )}
      {a.demo && (
        <p className="aviso-cliente">
          Demonstração: alterações nesta tela são temporárias. Nenhum convite será
          enviado.
        </p>
      )}
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso-cliente">
          {aviso}
        </p>
      )}
      <section className="equipe-perfis" aria-label="O que cada perfil pode fazer">
        <article>
          <ShieldCheck />
          <h2>Proprietário</h2>
          <p>Administra equipe e empresa. Acessa os recursos contratados.</p>
        </article>
        <article>
          <Users />
          <h2>Gerente</h2>
          <p>
            Cuida da operação, configurações e financeiro, conforme o plano. Não altera
            a equipe.
          </p>
        </article>
        <article>
          <Check />
          <h2>Funcionário</h2>
          <p>
            Atende clientes e trabalha nos módulos operacionais do plano. Não acessa
            financeiro e relatórios de gestão.
          </p>
        </article>
      </section>
      {!a.demo && q.isPending ? (
        <p role="status">Carregando equipe…</p>
      ) : q.isError && !a.demo ? (
        <section className="os-painel">
          <p role="alert">{erroEquipe(q.error)}</p>
          <button className="botao-secundario" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </section>
      ) : (
        <>
          <section className="os-painel">
            <h2>
              Pessoas com acesso ao sistema{" "}
              <small>({dados?.membros.filter((m) => m.ativo).length} ativas)</small>
            </h2>
            <div className="equipe-lista">
              {dados?.membros.map((m) => (
                <article key={m.usuario_id} className="equipe-pessoa">
                  <span className="equipe-avatar">
                    <Users size={22} />
                  </span>
                  <div>
                    <strong>{m.email}</strong>
                    <p>
                      {perfisEquipe[m.perfil]} ·{" "}
                      {m.ativo ? "Acesso ativo" : "Acesso suspenso"}
                    </p>
                  </div>
                  {m.perfil === "owner" ? (
                    <span className="texto-suave">Responsável</span>
                  ) : (
                    <div className="dados-acoes">
                      <button
                        className="botao-secundario"
                        onClick={() => {
                          setErro("");
                          setEditar(m);
                        }}
                      >
                        Gerenciar
                      </button>
                      <button
                        className="botao-secundario"
                        onClick={() => setPermissoes(m)}
                      >
                        Permissões
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="os-painel">
            <h2>Convites</h2>
            <p className="texto-suave">
              Válidos por 7 dias. Ao gerar outro para o mesmo e-mail, o link anterior é
              revogado.
            </p>
            {!dados?.convites.length ? (
              <div className="equipe-vazio">
                <Link2 />
                <p>Nenhum convite por enquanto.</p>
                <small>Convide pelo e-mail e compartilhe o link com a pessoa.</small>
              </div>
            ) : (
              <div className="equipe-lista">
                {dados.convites.map((c) => (
                  <article className="equipe-pessoa" key={c.id}>
                    <div>
                      <strong>{c.email}</strong>
                      <p>
                        {perfisEquipe[c.perfil]} ·{" "}
                        {c.situacao === "pendente" &&
                        new Date(c.expira_em) <= new Date()
                          ? "expirado"
                          : c.situacao}
                      </p>
                      <small>
                        Validade: {new Date(c.expira_em).toLocaleString("pt-BR")}
                      </small>
                    </div>
                    {c.situacao === "pendente" && (
                      <button
                        disabled={ocupado}
                        className="botao-secundario"
                        onClick={() =>
                          void executar(async () => {
                            await equipeRpc("revogar_convite_equipe", {
                              p_oficina: a.oficina!.id,
                              p_convite: c.id,
                            });
                            setAviso("Convite revogado.");
                          })
                        }
                      >
                        Revogar
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {permissoes && (
        <Dialogo aberto titulo="Permissões por área" fechar={() => setPermissoes(null)}>
          <PermissoesEquipe membro={permissoes} />
        </Dialogo>
      )}
      {convidando && (
        <Dialogo
          aberto
          titulo="Convidar para a equipe"
          fechar={() => !ocupado && setConvidando(false)}
        >
          <form className="formulario-cliente" onSubmit={convidar}>
            <p>
              A pessoa deverá entrar com este e-mail confirmado para aceitar. O acesso
              será limitado ao plano da empresa.
            </p>
            <label>
              E-mail do funcionário
              <input
                name="email"
                type="email"
                maxLength={254}
                required
                autoComplete="email"
              />
            </label>
            <label>
              Perfil
              <select name="perfil" defaultValue="staff">
                <option value="staff">Funcionário</option>
                <option value="manager">Gerente</option>
              </select>
            </label>
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <button className="botao-primario" disabled={ocupado}>
              {ocupado ? "Gerando…" : "Gerar link de convite"}
            </button>
          </form>
        </Dialogo>
      )}
      {link && (
        <Dialogo aberto titulo="Convite pronto" fechar={() => setLink("")}>
          <div className="formulario-cliente">
            <p>
              Copie o link e envie à pessoa pelo canal que preferir. Nenhuma mensagem
              foi enviada automaticamente.
            </p>
            <label>
              Link do convite
              <input value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
            </label>
            <button
              className="botao-primario"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setAviso("Link copiado.");
                } catch {
                  setErro("Selecione o link acima e copie manualmente.");
                }
              }}
            >
              <Copy size={18} /> Copiar link
            </button>
            {aviso && <p role="status">{aviso}</p>}
            {erro && <p role="alert">{erro}</p>}
            <small>
              Este link aparece apenas agora. Se perder, gere outro convite para o mesmo
              e-mail.
            </small>
          </div>
        </Dialogo>
      )}
      {editar && (
        <Dialogo
          aberto
          titulo="Gerenciar acesso"
          fechar={() => !ocupado && setEditar(null)}
        >
          <form
            className="formulario-cliente"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void executar(async () => {
                const perfil = String(f.get("perfil")) as "manager" | "staff",
                  ativo = f.get("ativo") === "sim";
                if (a.demo)
                  setDadosDemo((d) => ({
                    ...d,
                    membros: d.membros.map((m) =>
                      m.usuario_id === editar.usuario_id
                        ? { ...m, perfil, ativo, revisao: m.revisao + 1 }
                        : m,
                    ),
                  }));
                else
                  await equipeRpc("alterar_membro_equipe", {
                    p_oficina: a.oficina!.id,
                    p_usuario: editar.usuario_id,
                    p_revisao: editar.revisao,
                    p_perfil: perfil,
                    p_ativo: ativo,
                  });
                setEditar(null);
                setAviso("Acesso atualizado.");
              });
            }}
          >
            <p>{editar.email}</p>
            <label>
              Perfil
              <select name="perfil" defaultValue={editar.perfil}>
                <option value="staff">Funcionário</option>
                <option value="manager">Gerente</option>
              </select>
            </label>
            <label>
              Acesso
              <select name="ativo" defaultValue={editar.ativo ? "sim" : "nao"}>
                <option value="sim">Ativo</option>
                <option value="nao">Suspenso</option>
              </select>
            </label>
            <p>
              Suspender bloqueia novas consultas e operações. O histórico da pessoa é
              preservado.
            </p>
            {erro && (
              <p role="alert" className="erro-formulario">
                {erro}
              </p>
            )}
            <button className="botao-primario" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Salvar acesso"}
            </button>
          </form>
        </Dialogo>
      )}
    </div>
  );
}
