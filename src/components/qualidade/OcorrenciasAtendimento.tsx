import { novaOcorrencia, tiposOcorrencia } from "../../lib/ocorrenciasAtendimento";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialogo } from "../Dialogo";
import { SecaoRecolhivel } from "../SecaoRecolhivel";
import { ListaQualidade, ResumoQualidade } from "./ApresentacaoOcorrencias";
import { erroPublico } from "../../lib/supabase";
import type {
  DetalhesAtendimento,
  QualidadeAtendimento,
} from "../../types/servicosCompletos";
import "./QualidadeServicos.css";

export function ResumoOcorrencias({ itens }: { itens: QualidadeAtendimento[] }) {
  const abertas = itens.filter((i) => !i.resolvido_em).length;
  return (
    <ResumoQualidade
      abertas={abertas}
      resolvidas={itens.length - abertas}
      custo={itens.reduce((s, i) => s + i.custo_centavos, 0)}
    />
  );
}
type Linha = QualidadeAtendimento & { cliente?: string; titulo?: string };
export function ListaOcorrencias({
  itens,
  abrir,
  ocupado = false,
  filtrada = false,
}: {
  itens: Linha[];
  abrir: (i: Linha) => void;
  ocupado?: boolean;
  filtrada?: boolean;
}) {
  return (
    <ListaQualidade
      ocupado={ocupado}
      filtrada={filtrada}
      abrir={(id) => {
        const i = itens.find((i) => i.id === id);
        if (i) abrir(i);
      }}
      itens={itens.map((i) => ({
        id: i.id,
        tipo: tiposOcorrencia[i.tipo],
        abertura: i.aberto_em.slice(0, 10).split("-").reverse().join("/"),
        descricao: i.motivo,
        cliente: i.cliente,
        referencia: i.titulo,
        situacao: i.resolvido_em ? "Resolvida" : "Em aberto",
        tom: i.resolvido_em ? "resolvida" : "aberta",
        custo: i.custo_centavos,
        detalheCusto: i.minutos ? i.minutos + " min de retrabalho" : "Custo registrado",
      }))}
    />
  );
}

export function FormularioOcorrencia({
  ocorrencia: i,
  equipe,
  ocupado,
  salvar,
  cancelar,
}: {
  ocorrencia: QualidadeAtendimento;
  equipe: DetalhesAtendimento["equipe"];
  ocupado: boolean;
  salvar: (args: Record<string, unknown>) => Promise<unknown>;
  cancelar: () => void;
}) {
  const [erro, setErro] = useState("");
  return (
    <form
      className="qserv-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (ocupado) return;
        const f = new FormData(e.currentTarget);
        setErro("");
        if (
          f.get("resolvido") &&
          String(f.get("resolvido")) < String(f.get("aberto"))
        ) {
          setErro("A resolução não pode ser anterior à abertura.");
          return;
        }
        try {
          await salvar({
            p_id: i.id,
            p_revisao: i.revisao || null,
            p_dados: {
              tipo: f.get("tipo"),
              motivo: f.get("motivo"),
              solucao: f.get("solucao"),
              aberto_em: f.get("aberto"),
              resolvido_em: f.get("resolvido") || null,
              funcionario_id: f.get("funcionario") || null,
              custo_centavos: Math.round(Number(f.get("custo")) * 100),
              minutos: Number(f.get("minutos")),
              nota: f.get("nota") ? Number(f.get("nota")) : null,
            },
          });
        } catch (e) {
          setErro(erroPublico(e));
        }
      }}
    >
      <fieldset disabled={ocupado}>
        <div className="qserv-campos">
          <label>
            Tipo
            <select name="tipo" defaultValue={i.tipo}>
              {Object.entries(tiposOcorrencia).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data de abertura
            <input type="date" name="aberto" required defaultValue={i.aberto_em} />
          </label>
        </div>
        <label>
          Problema / motivo
          <textarea
            name="motivo"
            required
            minLength={3}
            maxLength={2000}
            rows={3}
            defaultValue={i.motivo}
            placeholder="O que aconteceu e o que precisa ser corrigido?"
          />
        </label>
        <SecaoRecolhivel
          titulo="Solução e encerramento (opcional)"
          aberta={!!i.resolvido_em || !!i.solucao}
        >
          <label>
            Solução e providências
            <textarea
              name="solucao"
              maxLength={3000}
              rows={3}
              defaultValue={i.solucao}
            />
          </label>
          <label>
            Resolvido em
            <input type="date" name="resolvido" defaultValue={i.resolvido_em || ""} />
            <small>Preencha a data para marcar a ocorrência como resolvida.</small>
          </label>
        </SecaoRecolhivel>
        <SecaoRecolhivel titulo="Custos, tempo e responsável (opcional)">
          <div className="qserv-campos">
            <label>
              Custo do retorno (R$)
              <input
                name="custo"
                type="number"
                min="0"
                step="0.01"
                defaultValue={i.custo_centavos / 100}
              />
            </label>
            <label>
              Tempo de retrabalho (minutos)
              <input
                name="minutos"
                type="number"
                min="0"
                step="1"
                defaultValue={i.minutos}
              />
            </label>
            <label>
              Funcionário relacionado
              <select name="funcionario" defaultValue={i.funcionario_id || ""}>
                <option value="">Não informado</option>
                {i.funcionario_id &&
                  !equipe.some((e) => e.funcionario_id === i.funcionario_id) && (
                    <option value={i.funcionario_id}>
                      Responsável registrado anteriormente
                    </option>
                  )}
                {equipe.map((e) => (
                  <option key={e.id} value={e.funcionario_id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Avaliação do cliente
              <select name="nota" defaultValue={i.nota || ""}>
                <option value="">Não avaliado</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} de 5
                  </option>
                ))}
              </select>
            </label>
          </div>
        </SecaoRecolhivel>
        {erro && (
          <p role="alert" className="qserv-erro">
            {erro}
          </p>
        )}
        <div className="qserv-acoes">
          <button type="button" className="botao-secundario" onClick={cancelar}>
            Cancelar
          </button>
          <button type="submit" className="botao-primario">
            {ocupado ? "Salvando…" : "Salvar ocorrência"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

export function OcorrenciasAtendimento({
  d,
  executar,
  ocupado,
}: {
  d: DetalhesAtendimento;
  executar: (nome: string, args: Record<string, unknown>) => Promise<unknown>;
  ocupado: boolean;
}) {
  const [edicao, setEdicao] = useState<QualidadeAtendimento | null>(null);
  const fechar = () => {
    if (!ocupado) setEdicao(null);
  };
  return (
    <section className="qserv" aria-label="Garantia e retrabalho">
      <header className="qserv-cabecalho">
        <div>
          <h3>Garantia e retrabalho</h3>
          <p>Retornos e reclamações desta OS.</p>
        </div>
        <button
          className="botao-primario"
          disabled={ocupado}
          onClick={() => setEdicao(novaOcorrencia(d.atendimento.id))}
        >
          <Plus size={18} />
          Registrar ocorrência
        </button>
      </header>
      {d.qualidade.length > 0 && <ResumoOcorrencias itens={d.qualidade} />}
      <ListaOcorrencias itens={d.qualidade} abrir={setEdicao} ocupado={ocupado} />
      {edicao && (
        <Dialogo
          aberto
          fechar={fechar}
          titulo={edicao.revisao ? "Atualizar ocorrência" : "Registrar ocorrência"}
          classe="qserv-dialogo"
        >
          <p className="qserv-contexto">
            OS #{d.atendimento.numero} · {d.cliente.nome}
          </p>
          <FormularioOcorrencia
            key={edicao.id}
            ocorrencia={edicao}
            equipe={d.equipe}
            ocupado={ocupado}
            cancelar={fechar}
            salvar={async (args) => {
              await executar("salvar_qualidade_atendimento", args);
              setEdicao(null);
            }}
          />
        </Dialogo>
      )}
    </section>
  );
}
