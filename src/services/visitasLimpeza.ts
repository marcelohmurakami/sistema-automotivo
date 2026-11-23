import { novoId } from "../lib/uuid.ts";
import { consultarDetalhesAtendimento, operarAtendimento } from "./servicosCompletos";
import { gravarServico, diaLocal, lerServicosDemo } from "./servicos";
import { fichaProximaLimpeza } from "../lib/limpeza";

/** A demonstração usa as mesmas operações e restaura o conjunto em caso de conflito. */
export async function programarVisitasLimpezaDemo(
  oficina: string,
  args: Record<string, unknown>,
) {
  const d = args.p_dados as Record<string, string>,
    n = Number(args.p_quantidade),
    intervalo = Number(args.p_intervalo);
  if (
    !args.p_chave ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > 52 ||
    ![1, 7, 14, 30].includes(intervalo) ||
    !["agendado", "confirmado"].includes(d.situacao) ||
    !["orcamento", "aprovado"].includes(d.nova_situacao)
  )
    throw Error("Confira a repetição, o agendamento e a situação das novas visitas.");
  const key = `patio_series_limpeza:${oficina}`;
  const series = JSON.parse(localStorage.getItem(key) || "{}") as Record<
    string,
    { pedido: string; ids: string[] }
  >;
  const pedido = JSON.stringify(args),
    idSerie = String(args.p_chave),
    anterior = series[idSerie];
  if (anterior) {
    if (anterior.pedido !== pedido)
      throw Error("Esta programação já foi criada com outros dados. Atualize a tela.");
    return anterior.ids;
  }
  const modelo = await consultarDetalhesAtendimento(true, oficina, d.atendimento_id),
    a = modelo.atendimento;
  if (a.revisao !== args.p_revisao)
    throw Error("Atendimento alterado. Atualize a tela.");
  if (a.situacao === "cancelado")
    throw Error("Selecione um atendimento de limpeza não cancelado.");
  const ficha = fichaProximaLimpeza(a);
  const ini = Date.parse(d.inicio),
    fim = Date.parse(d.fim);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim <= ini)
    throw Error("O término deve ser posterior ao início.");
  const painel = lerServicosDemo(oficina);
  if (!painel.recursos.some((r) => r.id === d.recurso_id && r.ativo))
    throw Error("Equipe indisponível.");
  const backup = [
    key,
    `patio_servicos:${oficina}`,
    `patio_detalhes_servicos:${oficina}`,
  ].map((k) => [k, localStorage.getItem(k)] as const);
  const ids: string[] = [];
  try {
    for (let i = 0; i < n; i++) {
      const id = novoId(),
        inicio = new Date(ini + i * intervalo * 86400000).toISOString(),
        final = new Date(fim + i * intervalo * 86400000).toISOString(),
        data = diaLocal(inicio);
      await gravarServico(
        "salvar_atendimento_servico",
        oficina,
        {
          p_id: id,
          p_dados: {
            id,
            cliente_id: a.cliente_id,
            objeto_id: a.objeto_id,
            titulo: a.titulo,
            situacao: "orcamento",
            valor_centavos: a.valor_centavos,
            data_servico: data,
            vencimento: data,
            ficha_especialidade: {
              ...ficha,
              campos: { ...ficha.campos, prazo_servico: diaLocal(final) },
            },
            dados: {
              solicitacao: a.dados.solicitacao || "",
              tipo_servico: a.dados.tipo_servico || "",
            },
          },
        },
        true,
      );
      const revisao = () =>
        lerServicosDemo(oficina).atendimentos.find((x) => x.id === id)!.revisao;
      if (modelo.itens.length)
        await operarAtendimento(true, oficina, "salvar_itens_atendimento", {
          p_atendimento: id,
          p_revisao: revisao(),
          p_itens: modelo.itens.map((x) => ({ ...x, id: novoId() })),
          p_desconto: modelo.comercial.desconto_centavos || 0,
          p_custo_extra: 0,
          p_motivo: "",
        });
      if (modelo.equipe.length)
        await operarAtendimento(true, oficina, "salvar_equipe_atendimento", {
          p_atendimento: id,
          p_revisao: revisao(),
          p_equipe: modelo.equipe.map((e) => ({
            funcionario_id: e.funcionario_id,
            percentual: e.percentual,
            custo_hora_centavos: e.custo_hora_centavos,
          })),
        });
      if (d.nova_situacao === "aprovado")
        await gravarServico(
          "salvar_atendimento_servico",
          oficina,
          {
            p_id: id,
            p_revisao: revisao(),
            p_dados: {
              ...lerServicosDemo(oficina).atendimentos.find((x) => x.id === id)!,
              situacao: "aprovado",
            },
          },
          true,
        );
      await gravarServico(
        "salvar_agenda_servico",
        oficina,
        { p_id: id, p_dados: { ...d, atendimento_id: id, inicio, fim: final } },
        true,
      );
      ids.push(id);
    }
    series[idSerie] = { pedido, ids };
    localStorage.setItem(key, JSON.stringify(series));
    return ids;
  } catch (e) {
    for (const [k, v] of backup) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
    throw e;
  }
}
