// Baixe apenas os arquivos. Importar aqui executaria código e CSS antes da navegação.
import { telas } from "./modulosNavegacao";
type Modulo = keyof typeof telas;
const preparados = new Set<string>();
let arquivosPorTela: Record<string, string[]> | undefined;
function prepararArquivo(caminho: string) {
  const url = new URL(caminho, location.origin);
  if (url.origin !== location.origin || preparados.has(url.href)) return;
  if (!url.pathname.startsWith(import.meta.env.DEV ? "/src/" : "/assets/")) return;
  if (
    performance
      .getEntriesByName(url.href)
      .some(
        (e) =>
          e.entryType === "resource" &&
          (e as PerformanceResourceTiming).responseStatus === 200,
      )
  )
    return;
  if (
    [
      ...document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
        "link[href],script[src]",
      ),
    ].some((e) => ("href" in e ? e.href : e.src) === url.href)
  )
    return;
  preparados.add(url.href);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = url.href;
  link.as = url.pathname.endsWith(".css") ? "style" : "script";
  link.fetchPriority = "low";
  link.dataset.preparacao = "true";
  link.onerror = () => {
    preparados.delete(url.href);
    link.remove();
  };
  if (link.relList.supports("prefetch")) document.head.append(link);
  else
    void fetch(url.href, { priority: "low", cache: "force-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("Preparação indisponível");
        return r.arrayBuffer();
      })
      .catch(() => preparados.delete(url.href));
}
export function prepararModulo(modulo: string) {
  if (!Object.hasOwn(telas, modulo)) return;
  const fonte = telas[modulo as Modulo];
  if (import.meta.env.DEV) {
    prepararArquivo("/" + fonte);
    return;
  }
  if (!arquivosPorTela) {
    try {
      arquivosPorTela = JSON.parse(
        document.getElementById("patio-preparacao")?.textContent || "{}",
      );
    } catch {
      arquivosPorTela = {};
    }
  }
  for (const caminho of arquivosPorTela?.[fonte] || []) prepararArquivo(caminho);
}
export function prepararRota(
  caminho: string,
  automotivo: boolean,
  prepararFormulario = false,
) {
  let url: URL;
  try {
    url = new URL(caminho, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  const comuns: Record<string, Modulo> = {
    "/clientes": "clientes",
    "/catalogo": "catalogo",
    "/estoque": "estoque",
    "/financeiro": "financeiro",
    "/compras": "compras",
    "/funcionarios": "funcionarios",
    "/historico": "historico",
    "/configuracoes": "gestao",
    "/garantias": "qualidade",
    "/fornecedores": "fornecedores",
    "/localizacao": "localizacao",
    "/meu-site": "site",
    "/execucao-offline": "offline",
    "/laudos": "laudos",
    "/contratos": "contratos",
    "/oportunidades": "oportunidades",
    "/equipe": "equipe",
    "/dados-seguranca": "seguranca",
    "/documentos": "documentos",
    "/relatorios": automotivo ? "relatorios" : "relatoriosServicos",
  };
  const internos: Record<string, Modulo> = automotivo
    ? {
        "/": "mapa",
        "/ordens-servico": "ordens",
        "/orcamentos": "orcamentos",
        "/agenda": "agenda",
        "/produtividade": "agenda",
      }
    : {
        "/": "servicos",
        "/atendimentos": "servicos",
        "/orcamentos": "servicos",
        "/agenda": "servicos",
        "/objetos": "servicos",
      };
  const modulo = comuns[url.pathname] || internos[url.pathname];
  if (modulo) prepararModulo(modulo);
  if (
    prepararFormulario ||
    url.searchParams.get("nova") === "1" ||
    url.searchParams.get("novo") === "1"
  ) {
    if (url.pathname === "/ordens-servico") prepararModulo("formularioOS");
    else if (url.pathname === "/orcamentos")
      prepararModulo(automotivo ? "formularioOrcamento" : "formularioServico");
    else if (!automotivo && url.pathname === "/atendimentos")
      prepararModulo("formularioServico");
  }
}
