import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { novoId } from "../lib/uuid";
import { erroPublico } from "../lib/supabase";
import { Dialogo } from "./Dialogo";
import {
  listarDistribuicao,
  salvarPerfilDistribuicao,
  localizarBase,
  textosDistribuicao,
  type PerfilDistribuicao,
  type PontoDistribuicao,
} from "../services/distribuicaoTecnicos";
import "./DistribuicaoAgenda.css";
const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const local = (s: string) =>
  s
    ? new Date(s)
        .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
        .replace(" ", "T")
        .slice(0, 16)
    : "";
const iso = (s: string) => (s ? new Date(`${s}:00-03:00`).toISOString() : "");
export function ConfiguracaoDistribuicao() {
  const a = useAcesso(),
    w = a.oficina!.id,
    cache = useQueryClient();
  const [aberto, setAberto] = useState(false),
    [perfil, setPerfil] = useState<PerfilDistribuicao | null>(null);
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const [locais, setLocais] = useState<{ nome: string; ponto: PontoDistribuicao }[]>(
      [],
    ),
    [indice, setIndice] = useState(0);
  const q = useQuery({
    queryKey: ["distribuicao", w],
    queryFn: ({ signal }) => listarDistribuicao(w, signal),
    enabled: aberto && !a.demo,
  });
  const trava = useRef(false);
  const gerente = ["owner", "manager"].includes(a.oficina!.perfil),
    auto = a.oficina!.ramo === "automotivo";
  function abrir(p?: PerfilDistribuicao) {
    setErro("");
    setLocais([]);
    setPerfil(
      p
        ? structuredClone(p)
        : {
            id: novoId(),
            nome: "",
            recurso_id: null,
            funcionario_id: null,
            ativo: true,
            habilidades: [],
            ferramentas: [],
            regioes: [],
            base_endereco: "",
            base_ponto: null,
            jornada: [1, 2, 3, 4, 5].flatMap((dia) => [
              { dia, inicio: "08:00", fim: "12:00" },
              { dia, inicio: "13:00", fim: "18:00" },
            ]),
            bloqueios: [],
            revisao: 0,
          },
    );
  }
  const alterar = (d: Partial<PerfilDistribuicao>) =>
    setPerfil((p) => (p ? { ...p, ...d } : p));
  return (
    <section className="distribuicao-config">
      <details onToggle={(e) => setAberto(e.currentTarget.open)}>
        <summary>Distribuição de técnicos e equipes</summary>
        <p>
          Cadastre uma vez as habilidades, regiões e horários. Ao agendar, o sistema
          escolhe uma equipe compatível e disponível.
        </p>
        {aviso && <p role="status">{aviso}</p>}
        {a.demo ? (
          <p>Disponível nas empresas conectadas.</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : q.isPending ? (
          <p role="status">Carregando…</p>
        ) : (
          <>
            {q.data.perfis.map((p) => (
              <div className="distribuicao-candidato" key={p.id}>
                <div>
                  <strong>
                    {p.nome}
                    {!p.ativo ? " · Inativo" : ""}
                  </strong>
                  <span>
                    {p.habilidades.join(" · ") || "Habilidades não configuradas"}
                  </span>
                  <small>
                    {p.regioes.length ? p.regioes.join(" · ") : "Todas as regiões"} ·{" "}
                    {p.base_ponto ? "Base localizada" : "Base sem coordenadas"}
                  </small>
                </div>
                {gerente && (
                  <button type="button" onClick={() => abrir(p)}>
                    Configurar
                  </button>
                )}
              </div>
            ))}
            {gerente && (
              <button
                type="button"
                className="botao-secundario"
                onClick={() => abrir()}
              >
                + Configurar técnico / equipe
              </button>
            )}
            {!gerente && (
              <p>
                Peça à gerência para ajustar as habilidades e a jornada das equipes.
              </p>
            )}
          </>
        )}
      </details>
      {perfil && (
        <Dialogo
          aberto
          titulo="Perfil para distribuição automática"
          fechar={() => {
            if (!ocupado) setPerfil(null);
          }}
          classe="dialogo-agendamento"
        >
          <form
            className="distribuicao-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (trava.current) return;
              trava.current = true;
              setOcupado(true);
              setErro("");
              try {
                const f = new FormData(e.currentTarget);
                await salvarPerfilDistribuicao(w, {
                  ...perfil,
                  habilidades: textosDistribuicao(String(f.get("habilidades"))),
                  ferramentas: textosDistribuicao(String(f.get("ferramentas"))),
                  regioes: textosDistribuicao(String(f.get("regioes"))),
                });
                await cache.invalidateQueries({ queryKey: ["distribuicao", w] });
                setPerfil(null);
                setAviso("Perfil salvo. Já pode ser usado na escolha automática.");
              } catch (e) {
                setErro(erroPublico(e));
              } finally {
                trava.current = false;
                setOcupado(false);
              }
            }}
          >
            {erro && <p role="alert">{erro}</p>}
            <fieldset disabled={ocupado}>
              {auto ? (
                <label>
                  Nome do técnico, box ou equipe
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={perfil.nome}
                    onChange={(e) => alterar({ nome: e.target.value })}
                    placeholder="Use o mesmo nome registrado na agenda"
                  />
                </label>
              ) : (
                <label>
                  Profissional / equipe da agenda
                  <select
                    required
                    value={perfil.recurso_id || ""}
                    onChange={(e) =>
                      alterar({
                        recurso_id: e.target.value,
                        nome:
                          q.data?.recursos.find((r) => r.id === e.target.value)?.nome ||
                          "",
                      })
                    }
                  >
                    <option value="">Selecione</option>
                    {q.data?.recursos
                      .filter((r) => r.ativo || r.id === perfil.recurso_id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nome}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Habilidades
                <input
                  required
                  name="habilidades"
                  defaultValue={perfil.habilidades.join("; ")}
                  maxLength={3000}
                  placeholder="Separe as habilidades por ponto e vírgula"
                />
              </label>
              <p className="texto-apoio">
                Use nomes objetivos para os serviços que esta pessoa ou equipe está
                habilitada a executar.
              </p>
              <label>
                Ferramentas e equipamentos disponíveis (opcional)
                <input
                  name="ferramentas"
                  defaultValue={perfil.ferramentas.join("; ")}
                  maxLength={3000}
                  placeholder="Separe por ponto e vírgula"
                />
              </label>
              <label>
                Regiões atendidas (opcional)
                <input
                  name="regioes"
                  defaultValue={perfil.regioes.join("; ")}
                  maxLength={3000}
                  placeholder="Em branco, atende todas as regiões"
                />
              </label>
              <label>
                Endereço da base de saída (opcional)
                <input
                  value={perfil.base_endereco}
                  maxLength={300}
                  onChange={(e) => {
                    alterar({ base_endereco: e.target.value, base_ponto: null });
                    setLocais([]);
                  }}
                  placeholder="Rua, número, bairro, cidade e estado"
                />
              </label>
              <button
                type="button"
                disabled={perfil.base_endereco.trim().length < 6}
                onClick={async () => {
                  if (trava.current) return;
                  trava.current = true;
                  setOcupado(true);
                  setErro("");
                  try {
                    setLocais(await localizarBase(w, perfil.base_endereco));
                    setIndice(0);
                  } catch (e) {
                    setErro(erroPublico(e));
                  } finally {
                    trava.current = false;
                    setOcupado(false);
                  }
                }}
              >
                Localizar base no mapa
              </button>
              {locais.length > 0 && (
                <div className="distribuicao-linha">
                  <label>
                    Confirme o local
                    <select
                      value={indice}
                      onChange={(e) => setIndice(Number(e.target.value))}
                    >
                      {locais.map((l, i) => (
                        <option value={i} key={i}>
                          {l.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      alterar({
                        base_endereco: locais[indice].nome,
                        base_ponto: locais[indice].ponto,
                      });
                      setLocais([]);
                    }}
                  >
                    Usar este local
                  </button>
                </div>
              )}
              {perfil.base_ponto && (
                <p role="status">
                  Base localizada. A proximidade será estimada em linha reta, sem
                  rastrear a pessoa.
                </p>
              )}
              <label>
                Funcionário vinculado (opcional)
                <select
                  value={perfil.funcionario_id || ""}
                  onChange={(e) => alterar({ funcionario_id: e.target.value || null })}
                >
                  <option value="">Sem vínculo</option>
                  {q.data?.funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </label>
              <p className="texto-apoio">
                O vínculo considera férias, ausências e afastamentos registrados. Para
                equipes, cadastre as indisponibilidades abaixo.
              </p>
              <strong>Jornada disponível · horário de Brasília</strong>
              {perfil.jornada.map((j, i) => (
                <div className="distribuicao-turno" key={i}>
                  <label>
                    Dia
                    <select
                      value={j.dia}
                      onChange={(e) =>
                        alterar({
                          jornada: perfil.jornada.map((x, n) =>
                            n === i ? { ...x, dia: Number(e.target.value) } : x,
                          ),
                        })
                      }
                    >
                      {dias.map((d, n) => (
                        <option value={n} key={n}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Início
                    <input
                      required
                      type="time"
                      value={j.inicio}
                      onChange={(e) =>
                        alterar({
                          jornada: perfil.jornada.map((x, n) =>
                            n === i ? { ...x, inicio: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      required
                      type="time"
                      value={j.fim}
                      onChange={(e) =>
                        alterar({
                          jornada: perfil.jornada.map((x, n) =>
                            n === i ? { ...x, fim: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remover turno ${i + 1}`}
                    onClick={() =>
                      alterar({ jornada: perfil.jornada.filter((_, n) => n !== i) })
                    }
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={perfil.jornada.length >= 28}
                onClick={() =>
                  alterar({
                    jornada: [
                      ...perfil.jornada,
                      { dia: 1, inicio: "08:00", fim: "18:00" },
                    ],
                  })
                }
              >
                + Adicionar turno
              </button>
              <details>
                <summary>Períodos de indisponibilidade (opcional)</summary>
                {perfil.bloqueios.map((b, i) => (
                  <div className="distribuicao-bloqueio" key={i}>
                    <label>
                      De
                      <input
                        required
                        type="datetime-local"
                        value={local(b.inicio)}
                        onChange={(e) =>
                          alterar({
                            bloqueios: perfil.bloqueios.map((x, n) =>
                              n === i ? { ...x, inicio: iso(e.target.value) } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Até
                      <input
                        required
                        type="datetime-local"
                        value={local(b.fim)}
                        onChange={(e) =>
                          alterar({
                            bloqueios: perfil.bloqueios.map((x, n) =>
                              n === i ? { ...x, fim: iso(e.target.value) } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Motivo
                      <input
                        maxLength={200}
                        value={b.motivo}
                        onChange={(e) =>
                          alterar({
                            bloqueios: perfil.bloqueios.map((x, n) =>
                              n === i ? { ...x, motivo: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        alterar({
                          bloqueios: perfil.bloqueios.filter((_, n) => n !== i),
                        })
                      }
                    >
                      Remover período
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={perfil.bloqueios.length >= 100}
                  onClick={() =>
                    alterar({
                      bloqueios: [
                        ...perfil.bloqueios,
                        { inicio: "", fim: "", motivo: "" },
                      ],
                    })
                  }
                >
                  + Indisponibilidade
                </button>
              </details>
              <label className="distribuicao-check">
                <input
                  type="checkbox"
                  checked={perfil.ativo}
                  onChange={(e) => alterar({ ativo: e.target.checked })}
                />{" "}
                Participar da distribuição automática
              </label>
              <button className="botao-primario" type="submit">
                {ocupado ? "Salvando…" : "Salvar perfil"}
              </button>
            </fieldset>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
