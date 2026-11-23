import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAcesso } from "../../auth/contexto";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { Dialogo } from "../Dialogo";
import { BuscaCompra } from "../BuscaCompra";
import { SecaoRecolhivel } from "../SecaoRecolhivel";
import { rpc } from "../../lib/rpc";
import { erroPublico } from "../../lib/supabase";
import { dinheiro } from "../../lib/formatacao";
import { atualizarQualidade } from "../../lib/atualizarQualidade";
import { tiposOcorrencia } from "../../lib/ocorrenciasAtendimento";
import { listarFuncionarios } from "../../services/funcionarios";
import {
  salvarQualidade,
  opcoesQualidade,
  custoQualidade,
  motivosQualidade,
  situacoesQualidade,
  type OcorrenciaQualidade,
} from "../../services/qualidade";
import "./QualidadeServicos.css";

const localData = (s: string) => {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function OcorrenciaAutomotiva({
  inicial,
  fechar,
  aoSalvar,
}: {
  inicial: OcorrenciaQualidade;
  fechar: () => void;
  aoSalvar: () => void;
}) {
  const a = useAcesso(),
    oficina = a.oficina!,
    qc = useQueryClient();
  const [edicao, setEdicao] = useState(inicial),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [buscaOS, setBuscaOS] = useState(""),
    [buscaRetorno, setBuscaRetorno] = useState(""),
    [mostrarHistorico, setMostrarHistorico] = useState(false);
  const trava = useRef(false);
  const termoOS = useBuscaDebounced(buscaOS);
  const termoRetorno = useBuscaDebounced(buscaRetorno);
  const funcionarios = useQuery({
    queryKey: ["funcionarios", a.demo, oficina.id],
    queryFn: ({ signal }) => listarFuncionarios(a.demo, oficina.id, signal),
  });
  const ordens = useQuery({
    queryKey: ["qualidade-os", a.demo, oficina.id, termoOS],
    queryFn: ({ signal }) =>
      opcoesQualidade(a.demo, oficina.id, termoOS, undefined, signal),
    enabled: !edicao.revisao && !edicao.ordem_original_id,
  });
  const original = useQuery({
    queryKey: ["qualidade-os-id", a.demo, oficina.id, edicao.ordem_original_id],
    queryFn: ({ signal }) =>
      opcoesQualidade(a.demo, oficina.id, "", edicao.ordem_original_id, signal),
    enabled: !!edicao.ordem_original_id,
  });
  const retornos = useQuery({
    queryKey: ["qualidade-retorno", a.demo, oficina.id, termoRetorno],
    queryFn: ({ signal }) =>
      opcoesQualidade(a.demo, oficina.id, termoRetorno, undefined, signal),
    enabled: !!termoRetorno && !edicao.ordem_retrabalho_id,
  });
  const retorno = useQuery({
    queryKey: ["qualidade-os-id", a.demo, oficina.id, edicao.ordem_retrabalho_id],
    queryFn: ({ signal }) =>
      opcoesQualidade(a.demo, oficina.id, "", edicao.ordem_retrabalho_id!, signal),
    enabled: !!edicao.ordem_retrabalho_id,
  });
  const historico = useQuery({
    queryKey: ["qualidade-historico", oficina.id, edicao.id, edicao.revisao],
    queryFn: ({ signal }) =>
      rpc<
        {
          id: number;
          revisao: number;
          ocorrido_em: string;
          depois: OcorrenciaQualidade;
        }[]
      >(
        "consultar_historico_qualidade",
        { p_oficina: oficina.id, p_id: edicao.id },
        signal,
      ),
    enabled: !a.demo && mostrarHistorico && !!edicao.revisao,
  });
  function mudar<K extends keyof OcorrenciaQualidade>(k: K, v: OcorrenciaQualidade[K]) {
    setEdicao((e) => ({ ...e, [k]: v }));
  }
  const encerrar = () => {
    if (!trava.current) fechar();
  };
  const os = original.data?.[0],
    osRetorno = retorno.data?.[0];
  return (
    <Dialogo
      aberto
      fechar={encerrar}
      titulo={edicao.revisao ? "Atualizar ocorrência" : "Registrar ocorrência"}
      classe="qserv-dialogo"
    >
      {edicao.ordem_original_id && (
        <p className="qserv-contexto">
          OS #{os?.numero || edicao.numero_os || "…"} ·{" "}
          {os?.cliente || edicao.cliente || "Carregando…"}
          {(os?.veiculo || edicao.veiculo) && (
            <>
              <br />
              {os?.veiculo || edicao.veiculo}
            </>
          )}
          <br />
          <Link to={"/ordens-servico?os=" + edicao.ordem_original_id}>
            Abrir ordem de serviço
          </Link>
        </p>
      )}
      <form
        className="qserv-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (trava.current) return;
          setErro("");
          if (
            edicao.situacao === "resolvida" &&
            new Date(edicao.resolvido_em || new Date().toISOString()).getTime() <
              new Date(edicao.aberto_em).getTime()
          ) {
            setErro("A resolução não pode ser anterior à abertura.");
            return;
          }
          trava.current = true;
          setOcupado(true);
          try {
            await salvarQualidade(a.demo, oficina.id, edicao);
            await atualizarQualidade(qc);
            aoSalvar();
          } catch (e) {
            setErro(erroPublico(e));
          } finally {
            trava.current = false;
            setOcupado(false);
          }
        }}
      >
        <fieldset disabled={ocupado}>
          {!edicao.revisao && (
            <BuscaCompra
              rotulo="OS original"
              valor={buscaOS || (os ? `OS #${os.numero} · ${os.cliente}` : "")}
              alterar={(v) => {
                setBuscaOS(v);
                setEdicao((e) => ({ ...e, ordem_original_id: "", item_os_id: null }));
              }}
              opcoes={(ordens.data || []).map((o) => ({
                id: o.id,
                nome: `OS #${o.numero} · ${o.cliente}`,
                detalhe: o.veiculo,
              }))}
              selecionar={(o) => {
                setBuscaOS(o.nome);
                const selecionada = ordens.data?.find((x) => x.id === o.id);
                setEdicao((e) => ({
                  ...e,
                  ordem_original_id: o.id,
                  numero_os: selecionada?.numero,
                  cliente: selecionada?.cliente,
                  item_os_id: null,
                }));
              }}
              carregando={ordens.isFetching}
              obrigatorio
            />
          )}
          {(ordens.isError || original.isError) && (
            <p role="alert">{erroPublico(ordens.error || original.error)}</p>
          )}
          <div className="qserv-campos">
            <label>
              Tipo
              <select
                value={edicao.tipo}
                onChange={(e) =>
                  mudar("tipo", e.target.value as OcorrenciaQualidade["tipo"])
                }
              >
                {Object.entries(tiposOcorrencia).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data de abertura
              <input
                required
                type="datetime-local"
                value={localData(edicao.aberto_em)}
                onChange={(e) => {
                  if (e.target.value)
                    mudar("aberto_em", new Date(e.target.value).toISOString());
                }}
              />
            </label>
          </div>
          <label>
            Problema / motivo
            <textarea
              required
              minLength={5}
              maxLength={3000}
              rows={3}
              value={edicao.descricao}
              placeholder="O que aconteceu e o que precisa ser corrigido?"
              onChange={(e) => mudar("descricao", e.target.value)}
            />
          </label>
          <SecaoRecolhivel
            titulo="Solução e encerramento (opcional)"
            aberta={edicao.situacao === "resolvida"}
          >
            <label>
              Situação
              <select
                value={edicao.situacao}
                onChange={(e) =>
                  mudar("situacao", e.target.value as OcorrenciaQualidade["situacao"])
                }
              >
                {Object.entries(situacoesQualidade).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Diagnóstico
              <textarea
                rows={2}
                maxLength={3000}
                value={edicao.diagnostico}
                onChange={(e) => mudar("diagnostico", e.target.value)}
              />
            </label>
            <label>
              Solução
              <textarea
                rows={2}
                maxLength={3000}
                required={edicao.situacao === "resolvida"}
                minLength={3}
                value={edicao.solucao}
                onChange={(e) => mudar("solucao", e.target.value)}
              />
            </label>
            {edicao.situacao === "resolvida" && (
              <label>
                Resolvida em
                <input
                  type="datetime-local"
                  required
                  value={localData(edicao.resolvido_em || new Date().toISOString())}
                  onChange={(e) => {
                    if (e.target.value)
                      mudar("resolvido_em", new Date(e.target.value).toISOString());
                  }}
                />
              </label>
            )}
            <BuscaCompra
              rotulo="OS de retrabalho (se houver)"
              valor={
                buscaRetorno ||
                (osRetorno ? `OS #${osRetorno.numero} · ${osRetorno.cliente}` : "")
              }
              alterar={(v) => {
                setBuscaRetorno(v);
                mudar("ordem_retrabalho_id", null);
              }}
              opcoes={(retornos.data || [])
                .filter((o) => o.id !== edicao.ordem_original_id)
                .map((o) => ({ id: o.id, nome: `OS #${o.numero} · ${o.cliente}` }))}
              selecionar={(o) => {
                setBuscaRetorno(o.nome);
                mudar("ordem_retrabalho_id", o.id);
              }}
              carregando={retornos.isFetching}
            />
            {(retornos.isError || retorno.isError) && (
              <p role="alert">{erroPublico(retornos.error || retorno.error)}</p>
            )}
          </SecaoRecolhivel>
          <SecaoRecolhivel titulo="Classificação e responsável (opcional)">
            <div className="qserv-campos">
              <label>
                Motivo
                <select
                  value={edicao.motivo}
                  onChange={(e) =>
                    mudar("motivo", e.target.value as OcorrenciaQualidade["motivo"])
                  }
                >
                  {Object.entries(motivosQualidade).map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cobertura
                <select
                  value={edicao.cobertura}
                  onChange={(e) => mudar("cobertura", e.target.value)}
                >
                  <option value="em_analise">Em análise</option>
                  <option value="coberta">Coberta pela garantia</option>
                  <option value="nao_coberta">Não coberta</option>
                  <option value="nao_aplicavel">Não se aplica</option>
                </select>
              </label>
              <label>
                Serviço relacionado
                <select
                  value={edicao.item_os_id || ""}
                  onChange={(e) => mudar("item_os_id", e.target.value || null)}
                >
                  <option value="">Não identificado</option>
                  {edicao.item_os_id &&
                    !os?.servicos.some((s) => s.id === edicao.item_os_id) && (
                      <option value={edicao.item_os_id}>
                        {edicao.servico || "Serviço registrado anteriormente"}
                      </option>
                    )}
                  {os?.servicos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.descricao}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Funcionário relacionado
                <select
                  value={edicao.funcionario_id || ""}
                  onChange={(e) => mudar("funcionario_id", e.target.value || null)}
                >
                  <option value="">Não identificado</option>
                  {edicao.funcionario_id &&
                    !funcionarios.data?.some((f) => f.id === edicao.funcionario_id) && (
                      <option value={edicao.funcionario_id}>
                        {edicao.funcionario || "Responsável registrado anteriormente"}
                      </option>
                    )}
                  {funcionarios.data?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {funcionarios.isError && (
              <p role="alert">{erroPublico(funcionarios.error)}</p>
            )}
            <label className="qserv-checkbox">
              <input
                type="checkbox"
                checked={edicao.reclamacao}
                onChange={(e) => mudar("reclamacao", e.target.checked)}
              />
              Houve reclamação do cliente
            </label>
            <label className="qserv-checkbox">
              <input
                type="checkbox"
                checked={edicao.houve_retrabalho}
                onChange={(e) => mudar("houve_retrabalho", e.target.checked)}
              />
              Houve retrabalho
            </label>
          </SecaoRecolhivel>
          <SecaoRecolhivel titulo="Horas e custos do retorno (opcional)">
            <small>
              Registre os custos adicionais do retorno. A OS vinculada não será somada
              novamente.
            </small>
            <div className="qserv-campos">
              <label>
                Horas de retrabalho
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  value={edicao.horas_retrabalho}
                  onChange={(e) => mudar("horas_retrabalho", Number(e.target.value))}
                />
              </label>
              {(
                [
                  ["custo_hora_centavos", "Custo por hora (R$)"],
                  ["custo_pecas_centavos", "Peças (R$)"],
                  ["outros_custos_centavos", "Outros custos (R$)"],
                  ["reembolso_centavos", "Reembolso ao cliente (R$)"],
                  ["recuperado_centavos", "Recuperado do fornecedor/cliente (R$)"],
                ] as const
              ).map(([k, n]) => (
                <label key={k}>
                  {n}
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="0.01"
                    value={edicao[k] / 100}
                    onChange={(e) => mudar(k, Math.round(Number(e.target.value) * 100))}
                  />
                </label>
              ))}
            </div>
            <p className="qserv-contexto">
              Custo líquido registrado:{" "}
              <strong>{dinheiro(custoQualidade(edicao))}</strong>
            </p>
            <label className="qserv-checkbox">
              <input
                type="checkbox"
                checked={edicao.custos_conferidos}
                onChange={(e) => mudar("custos_conferidos", e.target.checked)}
              />
              Conferi todos os custos, inclusive quando iguais a zero
            </label>
          </SecaoRecolhivel>
          <SecaoRecolhivel titulo="Avaliação do cliente (opcional)">
            <label>
              Nota informada pelo cliente
              <select
                value={edicao.nota_cliente || ""}
                onChange={(e) =>
                  mudar("nota_cliente", e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Ainda não avaliado</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comentário
              <textarea
                rows={2}
                maxLength={2000}
                value={edicao.comentario_cliente}
                onChange={(e) => mudar("comentario_cliente", e.target.value)}
              />
            </label>
          </SecaoRecolhivel>
          {!!edicao.revisao && !a.demo && (
            <SecaoRecolhivel
              titulo="Histórico de alterações (opcional)"
              aoAlternar={setMostrarHistorico}
            >
              {historico.isFetching && <p role="status">Carregando histórico…</p>}
              {historico.data?.map((h) => (
                <p key={h.id}>
                  Revisão {h.revisao} ·{" "}
                  {new Date(h.ocorrido_em).toLocaleString("pt-BR")} ·{" "}
                  {situacoesQualidade[h.depois.situacao]} ·{" "}
                  {dinheiro(custoQualidade(h.depois))}
                </p>
              ))}
              {historico.isError && <p role="alert">{erroPublico(historico.error)}</p>}
            </SecaoRecolhivel>
          )}
          {erro && (
            <p role="alert" className="qserv-erro">
              {erro}
            </p>
          )}
          <div className="qserv-acoes">
            <button type="button" className="botao-secundario" onClick={encerrar}>
              Cancelar
            </button>
            <button
              className="botao-primario"
              disabled={ocupado || !edicao.ordem_original_id}
            >
              {ocupado ? "Salvando…" : "Salvar ocorrência"}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialogo>
  );
}
