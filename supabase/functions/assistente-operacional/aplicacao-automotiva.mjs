// Triagem comercial do catálogo, não é uma base de compatibilidade de peças.
// Famílias ambíguas (Palio, Fiesta etc.) continuam sem motor presumido.
import {
  termosNomeServico,
  classificarServicos,
  ampliarBuscaServico,
} from "./catalogo-assistente.mjs";
const normalizarAplicacao = (valor = "") =>
  String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const marcasAplicacao = [
  [
    "GM",
    /\b(gm|chevrolet)\b/,
    /\b(prisma|corsa|celta|classic|onix|cobalt|vectra|astra|meriva|montana|s10|spin|cruze)\b/,
  ],
  [
    "Fiat",
    /\bfiat\b/,
    /\b(palio|uno|siena|strada|punto|doblo|mobi|argo|toro|fiorino)\b/,
  ],
  ["Ford", /\bford\b/, /\b(fiesta|ecosport|ka|focus|escort|ranger)\b/],
  [
    "VW",
    /\b(vw|volkswagen)\b/,
    /\b(gol|voyage|saveiro|fox|golf|polo|amarok|santana|fusca|kombi)\b/,
  ],
  ["Renault", /\brenault\b/, /\b(clio|sandero|logan|duster|kwid)\b/],
  ["Peugeot", /\bpeugeot\b/, /\bpeugeot\b/],
  ["Citroën", /\bcitroen\b/, /\bcitroen\b/],
  ["Toyota", /\btoyota\b/, /\b(corolla|etios|hilux|yaris)\b/],
  ["Honda", /\bhonda\b/, /\b(civic|fit|city|hr-v|cr-v)\b/],
];
const familiasAplicacao = [
  ["GM Família 1", "GM", /\b(familia\s*1|spe\s*\/?\s*4)\b/],
  ["GM Família 2", "GM", /\bfamilia\s*2\b/],
  ["Fiasa", "Fiat", /\bfiasa\b/],
  ["Fire", "Fiat", /\bfire\b/],
  ["Firefly", "Fiat", /\bfirefly\b/],
  ["E.torQ", "Fiat", /\be[.\s-]?torq\b/],
  ["Rocam", "Ford", /\brocam\b/],
  ["Sigma", "Ford", /\bsigma\b/],
  ["AP", "VW", /\bap\b/],
  ["EA111", "VW", /\bea\s*111\b/],
  ["EA211", "VW", /\bea\s*211\b/],
];
const marcasNoTexto = (texto) =>
  marcasAplicacao.filter(([, re]) => re.test(texto)).map(([marca]) => marca);
const familiasNoTexto = (texto) =>
  familiasAplicacao.filter(([, , re]) => re.test(texto));
const cilindrosNoTexto = (texto) =>
  Number(texto.match(/\b([234568])\s*(?:cilindros?|cil\b)/)?.[1]) || null;

export function contextoAplicacaoAutomotiva(veiculo, motor = null) {
  veiculo = veiculo || "";
  const v = normalizarAplicacao(veiculo),
    m = normalizarAplicacao(motor || "");
  const marca =
    marcasAplicacao.find(([, re]) => re.test(v))?.[0] ||
    marcasAplicacao.find(([, , re]) => re.test(v))?.[0] ||
    null;
  const prisma = /\bprisma\b/.test(v);
  const familia = familiasNoTexto(m)[0];
  const sugerido = !motor?.trim() && prisma;
  const nomeMotor = motor?.trim() || (sugerido ? "GM Família 1" : null);
  const motorDefineAplicacao = !!motor?.trim();
  return {
    veiculo:
      marca && !marcasNoTexto(v).length ? `${marca} ${veiculo.trim()}` : veiculo.trim(),
    marca: familia?.[1] || marca,
    motor: nomeMotor,
    motor_sugerido: sugerido,
    familia: familia?.[0] || (sugerido ? "GM Família 1" : null),
    diesel: /\bdiesel\b/.test(m)
      ? true
      : /\b(flex|gasolina|etanol|alcool)\b/.test(m) ||
          familia ||
          (prisma && !motorDefineAplicacao)
        ? false
        : null,
    cilindros: cilindrosNoTexto(m) || (prisma && !motorDefineAplicacao ? 4 : null),
  };
}

export function avaliarAplicacaoAutomotiva(item, contexto) {
  const descricao = normalizarAplicacao(item.descricao);
  const marcas = marcasNoTexto(descricao),
    familias = familiasNoTexto(descricao).map(([nome]) => nome);
  const cilindros = cilindrosNoTexto(descricao);
  let motivo = null;
  if (contexto.marca && marcas.length && !marcas.includes(contexto.marca))
    motivo = "Marca de aplicação diferente";
  if (contexto.familia && familias.length && !familias.includes(contexto.familia))
    motivo = "Família de motor diferente";
  if (contexto.diesel === false && /\bdiesel\b/.test(descricao))
    motivo = "Aplicação diesel diferente da informada";
  if (
    contexto.diesel === true &&
    /\b(flex|gasolina|etanol)\b/.test(descricao) &&
    !/\bdiesel\b/.test(descricao)
  )
    motivo = "Combustível diferente do informado";
  if (contexto.cilindros && cilindros && cilindros !== contexto.cilindros)
    motivo = "Quantidade de cilindros diferente";
  return {
    compativel: !motivo,
    motivo,
    pontos:
      (marcas.includes(contexto.marca) ? 20 : 0) +
      (familias.includes(contexto.familia) ? 30 : 0) +
      (cilindros && cilindros === contexto.cilindros ? 5 : 0),
  };
}

export async function sugerirServicosAutomotivos(
  { servico, veiculo, motor },
  consultar,
) {
  if (!servico.trim()) throw Error("Informe o serviço para filtrar o catálogo.");
  const contexto = contextoAplicacaoAutomotiva(veiculo, motor);
  const termos = termosNomeServico(servico);
  const assunto = termos.find((t) =>
    /cabecot|virabrequim|bloco|freio|oleo|suspensao|biela|valvula|cilindro|mancal/.test(
      t,
    ),
  );
  const buscaAssunto = assunto === "cabecot" ? "cabeçote" : assunto;
  const buscas = [
    ...new Set([
      servico,
      buscaAssunto && contexto.marca ? `${buscaAssunto} ${contexto.marca}` : null,
      buscaAssunto,
    ]),
  ].filter(Boolean);
  const resultados = await Promise.all(buscas.map((busca) => consultar(busca)));
  let unicos = [
    ...new Map(resultados.flatMap((r) => r.linhas).map((i) => [i.id, i])).values(),
  ];
  const avaliar = (item) => avaliarAplicacaoAutomotiva(item, contexto);
  let selecao = classificarServicos(servico, unicos, avaliar);
  if (!selecao.classificados.some((c) => c.nome.exato)) {
    resultados.push(...(await ampliarBuscaServico(servico, consultar)));
    unicos = [
      ...new Map(resultados.flatMap((r) => r.linhas).map((i) => [i.id, i])).values(),
    ];
    selecao = classificarServicos(servico, unicos, avaliar);
  }
  const { classificados } = selecao;
  return {
    tipo: "catalogo",
    busca: servico,
    linhas: classificados
      .slice(0, 30)
      .map(({ item }, indice) => ({ ...item, sugerido: indice === 0 })),
    limite: 30,
    pode_haver_mais:
      resultados.some((r) => r.pode_haver_mais) || classificados.length > 30,
    consultado_em: new Date().toISOString(),
    inicio: null,
    fim: null,
    aplicacao: contexto,
    sugerido_id: selecao.sugerido_id,
    aproximado: selecao.aproximado,
    orientacao: selecao.sugerido_id
      ? "Use o serviço sugerido como padrão editável. Se aproximado=true, avise que selecionou o nome mais parecido e preserve a expressão original do usuário."
      : "Não encontrei serviço parecido com aplicação compatível. Refine a busca sem inventar item ou preço.",
    aviso_motor: contexto.motor_sugerido
      ? "Família sugerida pelo modelo do veículo; mostrar como sugestão editável. Não presume cilindrada, ano, código de peça ou óleo."
      : null,
  };
}
