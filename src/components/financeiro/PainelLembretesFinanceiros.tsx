import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Dialogo } from "../Dialogo";
import { dinheiro } from "../../lib/formatacao";
import { dataSaoPaulo } from "../../lib/alertas";
import {
  destinoLembrete,
  type atualizarLembretesFinanceiros,
  type LembretesFinanceiros,
  type PreferenciasLembretes,
} from "../../services/lembretesFinanceiros";
import type { AlvoAdiamento } from "./contextoLembretes";
type Salvar = (
  acao: Parameters<typeof atualizarLembretesFinanceiros>[3],
  dados?: Record<string, unknown>,
) => Promise<void>;
export function PainelLembretesFinanceiros({
  tela,
  dados,
  alvo,
  ocupado,
  erro,
  pagina,
  mudarPagina,
  carregando,
  recarregar,
  fechar,
  abrir,
  adiar,
  salvar,
}: {
  tela: string;
  dados?: LembretesFinanceiros;
  alvo?: AlvoAdiamento;
  ocupado: boolean;
  erro: string;
  pagina: number;
  mudarPagina: (p: number) => void;
  carregando: boolean;
  recarregar: () => void;
  fechar: () => void;
  abrir: (t: string) => void;
  adiar: (alvo?: AlvoAdiamento) => void;
  salvar: Salvar;
}) {
  return (
    <Dialogo
      aberto
      fechar={fechar}
      titulo={
        tela === "configurar"
          ? "Meus lembretes financeiros"
          : tela === "adiar"
            ? "Quando lembrar novamente?"
            : "Contas para conferir"
      }
      classe="dialogo-lembretes"
    >
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro} <button onClick={recarregar}>Tentar novamente</button>
        </p>
      )}
      {!dados && !erro && <p role="status">Carregando lembretes…</p>}
      {tela === "adiar" && (
        <Adiar
          key={alvo?.id ?? "resumo"}
          alvo={alvo}
          ocupado={ocupado}
          salvar={salvar}
        />
      )}
      {tela === "configurar" && dados && (
        <Configurar
          preferencias={dados.preferencias}
          ocupado={ocupado}
          salvar={salvar}
        />
      )}
      {tela === "pendencias" && dados && (
        <>
          <p>
            Contas vencidas ou que vencem hoje. Confira se o dinheiro já entrou ou saiu
            antes de registrar.
          </p>
          <div className="lembrete-acoes">
            <Link
              className="botao-secundario"
              to="/financeiro?novo=receber"
              onClick={fechar}
            >
              Recebi outro valor
            </Link>
            <Link
              className="botao-secundario"
              to="/financeiro?novo=pagar"
              onClick={fechar}
            >
              Paguei outra conta
            </Link>
            <button className="botao-texto" onClick={() => abrir("configurar")}>
              Configurar lembretes
            </button>
          </div>
          {carregando && <p role="status">Atualizando…</p>}
          {!dados.total && (
            <p className="estado-lista">Nenhuma conta pendente para lembrar agora.</p>
          )}
          <div className="lembretes-itens">
            {dados.itens.map((x) => (
              <article className="lembrete-item" key={`${x.tipo}:${x.id}`}>
                <div>
                  <small>
                    {x.natureza === "receber" ? "A receber" : "A pagar"} · {x.origem}
                  </small>
                  <h3>{x.descricao}</h3>
                  <p>Vencimento: {x.vencimento.split("-").reverse().join("/")}</p>
                  <strong>
                    {x.valor_pendente
                      ? "Valor a informar"
                      : dinheiro(x.valor_centavos ?? 0)}
                  </strong>
                </div>
                <div className="lembrete-acoes">
                  <Link
                    className="botao-primario"
                    to={destinoLembrete(x)}
                    onClick={fechar}
                  >
                    {x.valor_pendente ? "Informar valor" : "Registrar agora"}
                  </Link>
                  <button
                    className="botao-secundario"
                    disabled={ocupado}
                    onClick={() => adiar(x)}
                  >
                    Lembrar depois
                  </button>
                </div>
              </article>
            ))}
          </div>
          {dados.total > 20 && (
            <nav className="lembrete-paginacao" aria-label="Páginas de contas">
              <button
                className="botao-secundario"
                disabled={!pagina || carregando}
                onClick={() => mudarPagina(pagina - 1)}
              >
                Anterior
              </button>
              <span>
                Página {pagina + 1} de {Math.ceil(dados.total / 20)}
              </span>
              <button
                className="botao-secundario"
                disabled={(pagina + 1) * 20 >= dados.total || carregando}
                onClick={() => mudarPagina(pagina + 1)}
              >
                Próxima
              </button>
            </nav>
          )}
          <p className="texto-suave">
            Contas quitadas ou canceladas saem desta lista. Adiar um aviso não altera o
            vencimento.
          </p>
        </>
      )}
    </Dialogo>
  );
}
function Configurar({
  preferencias: p,
  ocupado,
  salvar,
}: {
  preferencias: PreferenciasLembretes;
  ocupado: boolean;
  salvar: Salvar;
}) {
  const [frequencia, setFrequencia] = useState(p.frequencia);
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void salvar("configurar", {
      mostrar_entrada: f.has("entrada"),
      frequencia,
      horario: f.get("horario") || p.horario.slice(0, 5),
    });
  }
  return (
    <form className="lembrete-formulario" onSubmit={enviar}>
      <p>
        Estas escolhas valem só para você nesta empresa. Os avisos aparecem enquanto o
        sistema estiver aberto.
      </p>
      <label className="lembrete-check">
        <input type="checkbox" name="entrada" defaultChecked={p.mostrar_entrada} />{" "}
        Mostrar contas para conferir na página inicial
      </label>
      <label>
        Conferência do dinheiro do dia
        <select
          value={frequencia}
          onChange={(e) =>
            setFrequencia(e.target.value as PreferenciasLembretes["frequencia"])
          }
        >
          <option value="uteis">De segunda a sexta</option>
          <option value="todos">Todos os dias</option>
          <option value="desligado">Desativada</option>
        </select>
      </label>
      {frequencia !== "desligado" && (
        <label>
          Lembrar a partir de
          <input
            name="horario"
            type="time"
            required
            defaultValue={p.horario.slice(0, 5)}
          />
          <small>
            Horário de São Paulo. Se estiver fora do sistema, verá o aviso ao voltar no
            mesmo dia.
          </small>
        </label>
      )}
      <button className="botao-primario" disabled={ocupado}>
        {ocupado ? "Salvando…" : "Salvar preferências"}
      </button>
      <button
        type="button"
        className="botao-secundario"
        disabled={ocupado}
        onClick={() => void salvar("reativar")}
      >
        Voltar a mostrar avisos adiados
      </button>
    </form>
  );
}
function Adiar({
  alvo,
  ocupado,
  salvar,
}: {
  alvo?: AlvoAdiamento;
  ocupado: boolean;
  salvar: Salvar;
}) {
  const [opcao, setOpcao] = useState("hora"),
    [erro, setErro] = useState("");
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    const f = new FormData(e.currentTarget);
    const amanha = new Date(`${dataSaoPaulo()}T12:00:00Z`);
    amanha.setUTCDate(amanha.getUTCDate() + 1);
    const ate =
      opcao === "hora"
        ? new Date(Date.now() + 3600000)
        : new Date(
            opcao === "amanha"
              ? `${amanha.toISOString().slice(0, 10)}T09:00:00-03:00`
              : `${f.get("data")}T${f.get("hora")}:00-03:00`,
          );
    if (
      !Number.isFinite(ate.getTime()) ||
      ate.getTime() <= Date.now() ||
      ate.getTime() > Date.now() + 366 * 86400000
    ) {
      setErro("Escolha um horário futuro, em até um ano.");
      return;
    }
    void salvar(alvo ? "adiar_item" : "adiar", {
      ...(alvo ?? {}),
      ate: ate.toISOString(),
    });
  }
  return (
    <form className="lembrete-formulario" onSubmit={enviar}>
      <p>
        {alvo ? alvo.descricao : "Adiar o resumo e a conferência diária."} O vencimento
        e o saldo das contas continuam iguais.
      </p>
      <label>
        Lembrar
        <select value={opcao} onChange={(e) => setOpcao(e.target.value)}>
          <option value="hora">Daqui a 1 hora</option>
          <option value="amanha">Amanhã às 9h</option>
          <option value="escolher">Escolher data e horário</option>
        </select>
      </label>
      {opcao === "escolher" && (
        <div className="lembrete-data">
          <label>
            Data
            <input required type="date" name="data" min={dataSaoPaulo()} />
          </label>
          <label>
            Horário
            <input required type="time" name="hora" />
          </label>
        </div>
      )}
      <small>
        Horário de São Paulo. O aviso reaparece no sistema a partir do horário
        escolhido.
      </small>
      {erro && <p role="alert">{erro}</p>}
      <button className="botao-primario" disabled={ocupado}>
        {ocupado ? "Salvando…" : "Confirmar lembrete"}
      </button>
    </form>
  );
}
