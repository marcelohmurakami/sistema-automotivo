import { useState } from "react";
import "./ProfissionalAgendamento.css";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { dinheiro } from "../../lib/formatacao";
import { erroPublico } from "../../lib/supabase";
import {
  listarProfissionaisAgenda,
  type EscolhaProfissional,
  type ServicoProfissional,
} from "../../services/gestaoFuncionario";
export function ProfissionalAgendamento({
  automotivo = false,
  recurso,
  alterarRecurso,
  recursos = [],
  inicial,
  escolherServico,
}: {
  automotivo?: boolean;
  recurso: string;
  alterarRecurso: (v: string) => void;
  recursos?: { id: string; nome: string; ativo: boolean }[];
  inicial?: EscolhaProfissional;
  escolherServico?: (s: ServicoProfissional) => void;
}) {
  const a = useAcesso(),
    w = a.oficina!;
  const q = useQuery({
    queryKey: ["profissionais-agenda", a.demo, w.id],
    queryFn: ({ signal }) => listarProfissionaisAgenda(a.demo, w.id, signal),
    staleTime: 30000,
  });
  const [escolha, setEscolha] = useState({
    recurso,
    servico: inicial?.item_catalogo_id ?? "",
  });
  const profissional = q.data?.find(
    (p) =>
      (automotivo ? p.nome_agenda.trim().toLocaleLowerCase() : p.recurso_id) ===
      (automotivo ? recurso.trim().toLocaleLowerCase() : recurso),
  );
  const servicoId = escolha.recurso === recurso ? escolha.servico : "",
    servico = profissional?.servicos.find((s) => s.id === servicoId);
  const valor = profissional
    ? {
        funcionario_id: profissional.id,
        ...(servico ? { item_catalogo_id: servico.id } : {}),
      }
    : {};
  return (
    <div className="profissional-agendamento">
      <input
        type="hidden"
        name="profissional"
        value={JSON.stringify(q.isPending && inicial ? inicial : valor)}
      />
      <label>
        Profissional / equipe
        <select
          value={profissional?.id ?? "manual"}
          onChange={(e) => {
            const p = q.data?.find((x) => x.id === e.target.value);
            alterarRecurso(
              p ? (automotivo ? p.nome_agenda : (p.recurso_id ?? "")) : "",
            );
            setEscolha({ recurso: "", servico: "" });
          }}
        >
          <option value="manual">
            {q.isPending ? "Carregando funcionários…" : "Outra equipe / seleção manual"}
          </option>
          {q.data
            ?.filter((p) => (p.ativo && p.atende_clientes) || p.id === profissional?.id)
            .map((p) => (
              <option key={p.id} value={p.id} disabled={!p.ativo || !p.atende_clientes}>
                {p.nome}
                {p.ativo && p.atende_clientes ? "" : " (indisponível)"}
              </option>
            ))}
        </select>
      </label>
      {profissional ? (
        <input
          type="hidden"
          name={automotivo ? "recurso" : "recurso_id"}
          value={recurso}
        />
      ) : automotivo ? (
        <label>
          Nome da equipe
          <input
            name="recurso"
            required
            minLength={2}
            maxLength={100}
            value={recurso}
            onChange={(e) => alterarRecurso(e.target.value)}
            placeholder="Nome do responsável ou equipe"
          />
        </label>
      ) : (
        <label>
          Equipe disponível
          <select
            name="recurso_id"
            required
            value={recurso}
            onChange={(e) => alterarRecurso(e.target.value)}
          >
            <option value="">Selecione</option>
            {recursos
              .filter((r) => r.ativo || r.id === recurso)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
          </select>
        </label>
      )}
      {q.isError && (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button
            type="button"
            className="botao-secundario"
            onClick={() => void q.refetch()}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {profissional && (
        <label>
          Serviço do funcionário (opcional)
          <select
            value={servicoId}
            onChange={(e) => {
              setEscolha({ recurso, servico: e.target.value });
              const s = profissional.servicos.find((s) => s.id === e.target.value);
              if (s) escolherServico?.(s);
            }}
          >
            <option value="">
              {profissional.servicos.length
                ? "Selecione um serviço"
                : "Nenhum serviço vinculado"}
            </option>
            {profissional.servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.descricao} · {dinheiro(s.preco_centavos)}
                {s.duracao_minutos ? ` · ${s.duracao_minutos} min` : ""}
              </option>
            ))}
          </select>
          {servico && (
            <small>
              Preço e duração deste funcionário: {dinheiro(servico.preco_centavos)}
              {servico.duracao_minutos ? ` · ${servico.duracao_minutos} min` : ""}.
            </small>
          )}
        </label>
      )}
    </div>
  );
}
