const normalizarNome = (valor) =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Grafias equivalentes não mudam o produto, sua aplicação ou seu preço.
// Peças não usam a aproximação ampla reservada à mão de obra.
export async function buscarProdutoCatalogo(busca, consultar) {
  const encontrado = await consultar(busca);
  if (encontrado.linhas.some((i) => i.tipo === "part")) return encontrado;
  const alternativo = /\bshampoo\b/i.test(busca)
    ? busca.replace(/\bshampoo\b/gi, "xampu")
    : /\bxampu\b/i.test(busca)
      ? busca.replace(/\bxampu\b/gi, "shampoo")
      : busca;
  return alternativo !== busca ? consultar(alternativo) : encontrado;
}
const ignorados = new Set([
  "de",
  "do",
  "da",
  "dos",
  "das",
  "e",
  "para",
  "no",
  "na",
  "em",
  "o",
  "a",
  "um",
  "uma",
  "servico",
  "servicos",
  "qa",
]);
export const termosNomeServico = (valor) =>
  normalizarNome(valor)
    .slice(0, 300)
    .match(/[a-z0-9]+/g)
    ?.filter((t) => !ignorados.has(t))
    .slice(0, 24)
    .map((t) =>
      t
        .slice(0, 64)
        .replace(/^retifica.*$/, "retific")
        .replace(/^cabecot.*$/, "cabecot")
        .replace(/^embuch.*$/, "embuch")
        .replace(/^(plainar|plaina|planeamento)$/, "plain")
        .replace(/^(polir|polimento)$/, "pol")
        .replace(/^(brunir|brunimento)$/, "brun")
        .replace(/s$/, ""),
    ) || [];

function proximidadePalavra(a, b) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 4) return 0;
  // Distância de edição, limitada ao tamanho de um token, aceita erros de digitação/fala.
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++)
      atual[j] = Math.min(
        atual[j - 1] + 1,
        anterior[j] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    anterior = atual;
  }
  return 1 - anterior[b.length] / Math.max(a.length, b.length);
}

export function compararNomeServico(pedido, descricao) {
  const p = termosNomeServico(pedido),
    d = termosNomeServico(descricao);
  if (!p.length || !d.length) return { exato: false, pontos: 0 };
  const proximidades = p.map((t) =>
    Math.max(...d.map((v) => proximidadePalavra(t, v))),
  );
  const exato = proximidades.every((p) => p === 1);
  return { exato, pontos: proximidades.reduce((s, p) => s + p, 0) / p.length };
}

export function classificarServicos(
  pedido,
  linhas,
  avaliar = () => ({ compativel: true, pontos: 0 }),
) {
  const candidatos = linhas
    .filter((i) => i.tipo === "service")
    .map((item) => ({
      item,
      ...avaliar(item),
      nome: compararNomeServico(pedido, item.descricao),
    }))
    .filter((i) => i.compativel);
  const exatos = candidatos.filter((i) => i.nome.exato);
  const classificados = (
    exatos.length ? exatos : candidatos.filter((i) => i.nome.pontos >= 0.45)
  ).sort(
    (a, b) =>
      b.nome.pontos - a.nome.pontos ||
      b.pontos - a.pontos ||
      a.item.descricao.localeCompare(b.item.descricao) ||
      String(a.item.id).localeCompare(String(b.item.id)),
  );
  const melhor = classificados[0],
    segundo = classificados[1];
  const empate = !!(
    melhor &&
    segundo &&
    melhor.nome.pontos === segundo.nome.pontos &&
    melhor.pontos === segundo.pontos
  );
  return {
    classificados,
    aproximado: !!melhor && (!melhor.nome.exato || empate),
    sugerido_id: melhor?.item.id || null,
  };
}

// Amplia apenas por palavras/prefixos do pedido; não baixa o catálogo completo.
export async function ampliarBuscaServico(pedido, consultar) {
  const palavras =
    normalizarNome(pedido)
      .match(/[a-z0-9]+/g)
      ?.filter((t) => !ignorados.has(t) && t.length >= 4) || [];
  const buscas = [
    ...new Set([
      ...palavras.slice(-2),
      ...palavras.slice(-1).map((t) => t.slice(0, 3)),
    ]),
  ].slice(0, 3);
  return Promise.all(buscas.map((busca) => consultar(busca)));
}

export async function sugerirServicosCatalogo(pedido, consultar) {
  const resultados = [await consultar(pedido)];
  let selecao = classificarServicos(pedido, resultados[0].linhas);
  if (!selecao.classificados.some((c) => c.nome.exato)) {
    resultados.push(...(await ampliarBuscaServico(pedido, consultar)));
    selecao = classificarServicos(pedido, [
      ...new Map(resultados.flatMap((r) => r.linhas).map((i) => [i.id, i])).values(),
    ]);
  }
  return {
    tipo: "catalogo",
    busca: pedido,
    linhas: selecao.classificados
      .slice(0, 30)
      .map(({ item }, i) => ({ ...item, sugerido: i === 0 })),
    limite: 30,
    pode_haver_mais:
      resultados.some((r) => r.pode_haver_mais) || selecao.classificados.length > 30,
    consultado_em: new Date().toISOString(),
    inicio: null,
    fim: null,
    sugerido_id: selecao.sugerido_id,
    aproximado: selecao.aproximado,
    orientacao: selecao.sugerido_id
      ? "Use o serviço sugerido como padrão editável. Se aproximado=true, avise que escolheu o nome mais parecido e preserve a expressão original do pedido."
      : "Não foi encontrado serviço parecido nesta busca. Tente uma palavra equivalente; se continuar vazio, peça somente a informação indispensável. Não invente item ou preço.",
  };
}
