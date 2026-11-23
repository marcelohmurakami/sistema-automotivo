import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { rpc } from "../lib/rpc";
import { erroEquipe, type MembroEquipe } from "../services/equipe";
import "../pages/DadosSeguranca.css";
const modulos: Record<string, string> = {
  clientes: "Clientes e bens",
  catalogo: "Catálogo de serviços e peças",
  orcamentos: "Orçamentos",
  atendimentos: "Atendimentos e qualidade",
  agenda: "Agenda e recursos",
  estoque: "Estoque e compras",
  financeiro: "Financeiro e custos",
  relatorios: "Relatórios",
  equipe: "Funcionários e produtividade",
  arquivos: "Fotos e documentos",
  site: "Site e portal",
  integracoes: "Integrações e assistente",
  administracao: "Demais operações de gestão",
};
type Restricao = {
  usuario_id: string;
  regras: Record<string, string>;
  revisao: number;
};
export function PermissoesEquipe({ membro }: { membro: MembroEquipe }) {
  const a = useAcesso(),
    w = a.oficina!.id,
    [busy, setBusy] = useState(false),
    [aviso, setAviso] = useState(""),
    [erro, setErro] = useState("");
  const q = useQuery({
    queryKey: ["restricoes-acesso", a.usuario, w],
    enabled: !a.demo,
    queryFn: ({ signal }) =>
      rpc<Restricao[]>("consultar_restricoes_acesso", { p_oficina: w }, signal),
    retry: false,
  });
  const atual = q.data?.find((r) => r.usuario_id === membro.usuario_id);
  return (
    <div className="dados-bloco">
      <p>{membro.email}</p>
      <p>
        Limite o acesso por área. “Padrão do perfil” mantém as permissões do gerente ou
        funcionário e do plano contratado.
      </p>
      {q.isPending && !a.demo ? (
        <p role="status">Consultando permissões…</p>
      ) : q.isError ? (
        <p role="alert">{erroEquipe(q.error)}</p>
      ) : (
        <form
          key={atual?.revisao || 0}
          className="dados-permissoes"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            const regras = Object.fromEntries(new FormData(e.currentTarget));
            setBusy(true);
            setErro("");
            setAviso("");
            void (async () => {
              try {
                if (!a.demo) {
                  await rpc("salvar_restricoes_acesso", {
                    p_oficina: w,
                    p_usuario: membro.usuario_id,
                    p_regras: regras,
                    p_revisao: atual?.revisao || 0,
                  });
                  await q.refetch();
                }
                setAviso(
                  a.demo
                    ? "Demonstração: nenhuma permissão real foi alterada."
                    : "Permissões atualizadas. As novas operações já respeitam estes limites.",
                );
              } catch (e) {
                setErro(erroEquipe(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {Object.entries(modulos).map(([k, n]) => (
            <label key={k}>
              {n}
              <select
                name={k}
                defaultValue={atual?.regras[k] || "padrao"}
                disabled={busy}
              >
                <option value="padrao">Padrão do perfil</option>
                <option value="leitura">Somente consultar</option>
                <option value="nenhum">Sem acesso</option>
              </select>
            </label>
          ))}
          <button className="botao-primario" disabled={busy}>
            {busy ? "Salvando…" : "Salvar permissões"}
          </button>
        </form>
      )}
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
    </div>
  );
}
