export type OrdemRelatorioOficina = {
  id: string;
  numero: number;
  cliente: string;
  veiculo: string;
  responsavel: string | null;
  situacao: string;
  data_servico: string | null;
  criado_em: string;
  recebido_em: string | null;
  concluido_em: string | null;
  entregue_em: string | null;
  cancelado_em: string | null;
  entrega_prevista_em: string | null;
  paradas: {
    motivo: string;
    iniciado_em: string | null;
    encerrado_em: string | null;
  }[];
  servicos: { descricao: string; quantidade: number }[];
};
export type DadosRelatorioOficina = {
  agora: string;
  ordens: OrdemRelatorioOficina[];
};
const diaMs = 86400000;
const formatoDataSP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
});
const deslocar = (v: string, dias: number) =>
  new Date(Date.parse(v) + dias * diaMs).toISOString().slice(0, 10);
export const nomeEtapaOficina: Record<string, string> = {
  open: "Recebidas / diagnóstico",
  paused: "Paradas",
  in_progress: "Em execução",
  quality_check: "Conferência e testes",
  ready: "Aguardando retirada",
  delivered: "Entregues",
  cancelled: "Canceladas",
};
export const nomeMotivoOficina: Record<string, string> = {
  parts: "Peças",
  approval: "Aprovação do cliente",
  third_party: "Terceiros",
  capacity: "Capacidade da oficina",
  diagnosis: "Diagnóstico",
  other: "Outros motivos",
};
export function mesDoRelatorio(data: string, deslocamento = 0) {
  const [ano, mes] = data.split("-").map(Number);
  return {
    inicio: new Date(Date.UTC(ano, mes - 1 + deslocamento, 1))
      .toISOString()
      .slice(0, 10),
    fim: new Date(Date.UTC(ano, mes + deslocamento, 0)).toISOString().slice(0, 10),
  };
}
export function validarPeriodoOficina(inicio: string, fim: string) {
  for (const d of [inicio, fim]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !Number.isFinite(Date.parse(d)) ||
      new Date(d).toISOString().slice(0, 10) !== d
    )
      throw new Error("Escolha datas válidas para o relatório.");
  }
  if (inicio > fim || Date.parse(fim) - Date.parse(inicio) > 366 * diaMs)
    throw new Error("Escolha um período de até 367 dias.");
}
function media(valores: number[]) {
  return valores.length
    ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10
    : null;
}
function duracoes(
  os: OrdemRelatorioOficina[],
  de: "recebido_em" | "concluido_em",
  ate: "concluido_em" | "entregue_em",
) {
  const valores = os.flatMap((o) =>
    o[de] && o[ate] && Date.parse(o[ate]!) >= Date.parse(o[de]!)
      ? [(Date.parse(o[ate]!) - Date.parse(o[de]!)) / diaMs]
      : [],
  );
  return { dias: media(valores), amostra: valores.length };
}
// Une intervalos da mesma OS: paradas simultâneas não duplicam o tempo parado.
function horasUnidas(intervalos: [number, number][]) {
  let fim = -Infinity,
    total = 0;
  for (const [a, b] of intervalos.sort((x, y) => x[0] - y[0])) {
    total += Math.max(0, b - Math.max(a, fim));
    fim = Math.max(fim, b);
  }
  return total / 3600000;
}
export function detalharOficina(
  dados: DadosRelatorioOficina,
  inicio: string,
  fim: string,
) {
  validarPeriodoOficina(inicio, fim);
  const agora = Date.parse(dados.agora);
  const datas = new Map<string, string>();
  const dataSP = (v: string) => {
    if (!datas.has(v)) datas.set(v, formatoDataSP.format(new Date(v)));
    return datas.get(v)!;
  };
  const dataEntrada = (o: OrdemRelatorioOficina) =>
    o.data_servico || dataSP(o.recebido_em || o.criado_em);
  const noPeriodo = (data: string | null, i = inicio, f = fim) =>
    !!data && dataSP(data) >= i && dataSP(data) <= f;
  const entradaNoPeriodo = (o: OrdemRelatorioOficina, i = inicio, f = fim) =>
    dataEntrada(o) >= i && dataEntrada(o) <= f;
  const ativa = (o: OrdemRelatorioOficina) =>
    !["delivered", "cancelled"].includes(o.situacao);
  const paradasAbertas = (o: OrdemRelatorioOficina) =>
    ativa(o) ? o.paradas.filter((p) => !p.encerrado_em) : [];
  const atrasada = (o: OrdemRelatorioOficina) =>
    ativa(o) && !!o.entrega_prevista_em && Date.parse(o.entrega_prevista_em) < agora;
  const concluidas = (i: string, f: string) =>
    dados.ordens.filter(
      (o) =>
        ["ready", "delivered"].includes(o.situacao) && noPeriodo(o.concluido_em, i, f),
    );
  const entregues = (i: string, f: string) =>
    dados.ordens.filter(
      (o) => o.situacao === "delivered" && noPeriodo(o.entregue_em, i, f),
    );
  const indicadores = (i: string, f: string) => ({
    entradas: dados.ordens.filter((o) => entradaNoPeriodo(o, i, f)).length,
    concluidas: concluidas(i, f).length,
    entregues: entregues(i, f).length,
    canceladas: dados.ordens.filter(
      (o) => o.situacao === "cancelled" && noPeriodo(o.cancelado_em, i, f),
    ).length,
  });
  const inicioAnterior = deslocar(
    inicio,
    -((Date.parse(fim) - Date.parse(inicio)) / diaMs + 1),
  );
  const fimAnterior = deslocar(inicio, -1);
  const ordensPeriodo = dados.ordens.filter((o) => entradaNoPeriodo(o));
  const abertas = ordensPeriodo.filter(ativa);
  const prontas = concluidas(inicio, fim),
    saidas = entregues(inicio, fim);
  const prazo = (
    os: OrdemRelatorioOficina[],
    campo: "concluido_em" | "entregue_em",
  ) => {
    const avaliadas = os.filter((o) => o.entrega_prevista_em && o[campo]);
    const pontuais = avaliadas.filter(
      (o) => Date.parse(o[campo]!) <= Date.parse(o.entrega_prevista_em!),
    ).length;
    return {
      no_prazo: pontuais,
      atrasadas: avaliadas.length - pontuais,
      sem_prazo: os.length - avaliadas.length,
      total: os.length,
    };
  };
  const detalharOS = (o: OrdemRelatorioOficina) => ({
    ...o,
    data_entrada: dataEntrada(o),
    parada: paradasAbertas(o).length > 0,
    atrasada: atrasada(o),
    etapa: paradasAbertas(o).length ? "paused" : o.situacao,
    dias_na_oficina: o.recebido_em
      ? Math.max(
          0,
          (Math.min(agora, Date.parse(o.entregue_em || o.cancelado_em || dados.agora)) -
            Date.parse(o.recebido_em)) /
            diaMs,
        )
      : null,
    dias_pronta:
      o.situacao === "ready" && o.concluido_em
        ? Math.max(0, (agora - Date.parse(o.concluido_em)) / diaMs)
        : null,
    motivos: [
      ...new Set(
        paradasAbertas(o).map((p) => nomeMotivoOficina[p.motivo] || "Outros motivos"),
      ),
    ].join(" · "),
  });
  const ordenar = (
    a: ReturnType<typeof detalharOS>,
    b: ReturnType<typeof detalharOS>,
  ) =>
    Number(b.atrasada) - Number(a.atrasada) ||
    Number(b.parada) - Number(a.parada) ||
    (b.dias_na_oficina ?? 0) - (a.dias_na_oficina ?? 0) ||
    b.numero - a.numero;
  const ordens = ordensPeriodo.map(detalharOS).sort(ordenar);
  const anteriores = dados.ordens
    .filter((o) => ativa(o) && dataEntrada(o) < inicio)
    .map(detalharOS)
    .sort(ordenar);
  const etapas = Object.entries(nomeEtapaOficina).map(([id, nome]) => ({
    id,
    nome,
    quantidade: ordens.filter((o) => o.etapa === id).length,
  }));
  const faixas = [
    { nome: "Até 2 dias", min: 0, max: 2 },
    { nome: "3 a 7 dias", min: 2, max: 7 },
    { nome: "8 a 15 dias", min: 7, max: 15 },
    { nome: "Mais de 15 dias", min: 15, max: Infinity },
  ];
  const idade = faixas.map((f, index) => ({
    nome: f.nome,
    quantidade: ordens.filter(
      (o) =>
        ativa(o) &&
        o.dias_na_oficina !== null &&
        (index === 0 || o.dias_na_oficina > f.min) &&
        o.dias_na_oficina <= f.max,
    ).length,
  }));
  const responsaveis = new Map<
    string,
    {
      nome: string;
      abertas: number;
      paradas: number;
      atrasadas: number;
      entregues: number;
    }
  >();
  for (const o of [...abertas, ...saidas]) {
    const nome = o.responsavel?.trim() || "Sem responsável";
    const r = responsaveis.get(nome) || {
      nome,
      abertas: 0,
      paradas: 0,
      atrasadas: 0,
      entregues: 0,
    };
    r.abertas += Number(ativa(o));
    r.paradas += Number(paradasAbertas(o).length > 0);
    r.atrasadas += Number(atrasada(o));
    r.entregues += Number(o.situacao === "delivered");
    responsaveis.set(nome, r);
  }
  const servicos = new Map<
    string,
    { nome: string; quantidade: number; ordens: Set<string> }
  >();
  for (const o of saidas)
    for (const s of o.servicos) {
      const nome = s.descricao.trim();
      if (!nome || s.quantidade <= 0) continue;
      const chave = nome.toLocaleLowerCase("pt-BR");
      const r = servicos.get(chave) || {
        nome,
        quantidade: 0,
        ordens: new Set<string>(),
      };
      r.quantidade += Number(s.quantidade);
      r.ordens.add(o.id);
      servicos.set(chave, r);
    }
  const motivos = new Map<
    string,
    {
      motivo: string;
      ordens: Set<string>;
      intervalos: Map<string, [number, number][]>;
    }
  >();
  const intervalosOS = new Map<string, [number, number][]>();
  let semDataParada = 0;
  const comeco = Date.parse(inicio + "T00:00:00-03:00"),
    final = Math.min(agora, Date.parse(deslocar(fim, 1) + "T00:00:00-03:00"));
  for (const o of dados.ordens)
    for (const p of o.paradas) {
      if (!p.iniciado_em) {
        if (entradaNoPeriodo(o)) semDataParada++;
        continue;
      }
      const a = Math.max(comeco, Date.parse(p.iniciado_em));
      const b = Math.min(
        final,
        Date.parse(p.encerrado_em || dados.agora),
        Date.parse(o.entregue_em || o.cancelado_em || dados.agora),
      );
      if (b <= a) continue;
      const m = motivos.get(p.motivo) || {
        motivo: p.motivo,
        ordens: new Set<string>(),
        intervalos: new Map<string, [number, number][]>(),
      };
      m.ordens.add(o.id);
      m.intervalos.set(o.id, [...(m.intervalos.get(o.id) || []), [a, b]]);
      motivos.set(p.motivo, m);
      intervalosOS.set(o.id, [...(intervalosOS.get(o.id) || []), [a, b]]);
    }
  const porDia = new Map<
    string,
    {
      data: string;
      entradas: number;
      concluidas: number;
      entregues: number;
      canceladas: number;
    }
  >();
  for (let d = inicio; d <= fim; d = deslocar(d, 1))
    porDia.set(d, {
      data: d,
      entradas: 0,
      concluidas: 0,
      entregues: 0,
      canceladas: 0,
    });
  for (const o of dados.ordens) {
    const entrada = porDia.get(dataEntrada(o));
    if (entrada) entrada.entradas++;
    for (const [campo, contador, valido] of [
      ["concluido_em", "concluidas", ["ready", "delivered"].includes(o.situacao)],
      ["entregue_em", "entregues", o.situacao === "delivered"],
      ["cancelado_em", "canceladas", o.situacao === "cancelled"],
    ] as const) {
      const ponto = valido && o[campo] ? porDia.get(dataSP(o[campo]!)) : null;
      if (ponto) ponto[contador]++;
    }
  }
  const serie = [...porDia.values()];
  return {
    inicio,
    fim,
    agora: dados.agora,
    inicio_anterior: inicioAnterior,
    fim_anterior: fimAnterior,
    atual: indicadores(inicio, fim),
    anterior: indicadores(inicioAnterior, fimAnterior),
    serie,
    tempo_conclusao: duracoes(prontas, "recebido_em", "concluido_em"),
    tempo_entrega: duracoes(saidas, "recebido_em", "entregue_em"),
    tempo_retirada: duracoes(saidas, "concluido_em", "entregue_em"),
    prazo_conclusao: prazo(prontas, "concluido_em"),
    prazo_entrega: prazo(saidas, "entregue_em"),
    situacao: {
      total: ordens.length,
      abertas: abertas.length,
      paradas: abertas.filter((o) => paradasAbertas(o).length).length,
      atrasadas: abertas.filter(atrasada).length,
      prontas: abertas.filter((o) => o.situacao === "ready").length,
      sem_previsao: abertas.filter((o) => !o.entrega_prevista_em).length,
      sem_responsavel: abertas.filter((o) => !o.responsavel?.trim()).length,
      sem_entrada: abertas.filter((o) => !o.recebido_em).length,
    },
    etapas,
    idade,
    ordens,
    anteriores,
    responsaveis: [...responsaveis.values()].sort(
      (a, b) =>
        b.abertas - a.abertas ||
        b.entregues - a.entregues ||
        a.nome.localeCompare(b.nome),
    ),
    servicos: [...servicos.values()]
      .map((s) => ({
        nome: s.nome,
        quantidade: Math.round(s.quantidade * 1000) / 1000,
        ordens: s.ordens.size,
      }))
      .sort((a, b) => b.ordens - a.ordens || a.nome.localeCompare(b.nome)),
    paradas: {
      ordens: intervalosOS.size,
      horas: [...intervalosOS.values()].reduce((s, x) => s + horasUnidas(x), 0),
      sem_data: semDataParada,
      motivos: [...motivos.values()]
        .map((m) => ({
          motivo: m.motivo,
          quantidade: m.ordens.size,
          horas: [...m.intervalos.values()].reduce((s, x) => s + horasUnidas(x), 0),
        }))
        .sort((a, b) => b.horas - a.horas || a.motivo.localeCompare(b.motivo)),
    },
  };
}
export type RelatorioOficina = ReturnType<typeof detalharOficina>;
export function serieOficinaAgrupada(
  serie: RelatorioOficina["serie"],
  mensal: boolean,
) {
  const grupos = new Map<string, RelatorioOficina["serie"][number]>();
  for (const s of serie) {
    const data = mensal ? s.data.slice(0, 7) : s.data;
    const g = grupos.get(data) || {
      data,
      entradas: 0,
      concluidas: 0,
      entregues: 0,
      canceladas: 0,
    };
    for (const k of ["entradas", "concluidas", "entregues", "canceladas"] as const)
      g[k] += s[k];
    grupos.set(data, g);
  }
  return [...grupos.values()];
}
export function linhasOficinaCSV(d: RelatorioOficina): unknown[][] {
  const ref = d.inicio + " a " + d.fim,
    linhas: unknown[][] = [];
  for (const [periodo, x, data] of [
    ["atual", d.atual, ref],
    ["anterior", d.anterior, d.inicio_anterior + " a " + d.fim_anterior],
  ] as const)
    for (const [k, n] of [
      ["Entradas", x.entradas],
      ["Concluídas", x.concluidas],
      ["Entregues", x.entregues],
      ["Canceladas", x.canceladas],
    ] as const)
      linhas.push(["Movimento " + periodo, k, n, data]);
  for (const [k, v] of [
    ["Até ficar pronto", d.tempo_conclusao],
    ["Até entregar", d.tempo_entrega],
    ["Espera pela retirada", d.tempo_retirada],
  ] as const)
    linhas.push(
      ["Tempo (dias corridos)", k, v.dias ?? "Sem dados", ref],
      ["Amostra", k, v.amostra, ref],
    );
  for (const [k, v] of [
    ["Conclusão", d.prazo_conclusao],
    ["Entrega", d.prazo_entrega],
  ] as const)
    linhas.push(
      ["Prazos " + k, "No prazo", v.no_prazo, ref],
      ["Prazos " + k, "Atrasadas", v.atrasadas, ref],
      ["Prazos " + k, "Sem data prometida", v.sem_prazo, ref],
    );
  for (const s of d.serie)
    for (const k of ["entradas", "concluidas", "entregues", "canceladas"] as const)
      linhas.push(["Evolução", k, s[k], s.data]);
  for (const e of d.etapas)
    linhas.push(["Situação atual das entradas do período", e.nome, e.quantidade, ref]);
  for (const e of d.idade)
    linhas.push(["Permanência das OS abertas do período", e.nome, e.quantidade, ref]);
  linhas.push(
    ["Paradas", "OS afetadas", d.paradas.ordens, ref],
    [
      "Paradas",
      "Horas corridas sem sobreposição por OS",
      d.paradas.horas.toFixed(1),
      ref,
    ],
  );
  for (const p of d.paradas.motivos)
    linhas.push(
      ["Motivos de parada", nomeMotivoOficina[p.motivo] || p.motivo, p.quantidade, ref],
      [
        "Horas por motivo",
        nomeMotivoOficina[p.motivo] || p.motivo,
        p.horas.toFixed(1),
        ref,
      ],
    );
  for (const r of d.responsaveis)
    for (const k of ["abertas", "paradas", "atrasadas", "entregues"] as const)
      linhas.push(["Responsável / " + k, r.nome, r[k], ref]);
  for (const s of d.servicos)
    linhas.push(
      ["Serviços / OS entregues", s.nome, s.ordens, ref],
      ["Serviços / unidades", s.nome, s.quantidade, ref],
    );
  linhas.push(
    [],
    [
      "Detalhamento",
      "OS",
      "Cliente",
      "Motor / veículo",
      "Data do serviço",
      "Situação atual",
      "Responsável",
      "Data prometida",
      "Dias na oficina",
      "Atrasada",
      "Motivos abertos",
    ],
  );
  for (const [grupo, lista] of [
    ["Entradas do período", d.ordens],
    ["Pendências anteriores", d.anteriores],
  ] as const)
    for (const o of lista)
      linhas.push([
        grupo,
        o.numero,
        o.cliente,
        o.veiculo,
        o.data_entrada,
        nomeEtapaOficina[o.etapa],
        o.responsavel || "Sem responsável",
        o.entrega_prevista_em,
        o.dias_na_oficina?.toFixed(1) ?? "",
        o.atrasada ? "Sim" : "Não",
        o.motivos,
      ]);
  return linhas;
}
