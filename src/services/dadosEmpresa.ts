import { rpc } from "../lib/rpc";
import { supabase } from "../lib/supabase";
import { baixarArquivo, nomeArquivoSeguro } from "../lib/portabilidade";
export type ConfigDados = {
  oficina_id: string;
  dados: Record<string, string>;
  revisao: number;
};
export type SolicitacaoPrivacidade = {
  id: string;
  cliente_id?: string;
  tipo: string;
  solicitante: string;
  situacao: string;
  prazo: string;
  identidade: string;
  decisao: string;
  revisao: number;
};
export type DadosEmpresa = {
  configuracao: ConfigDados | null;
  solicitacoes: SolicitacaoPrivacidade[];
  importacoes: {
    id: string;
    origem: string;
    criado_em: string;
    resumo: { novos: number; repetidos: number };
  }[];
};
export const consultarDadosEmpresa = (w: string, signal?: AbortSignal) =>
  rpc<DadosEmpresa>("consultar_dados_empresa", { p_oficina: w }, signal);
type Manifesto = {
  formato: string;
  empresa: Record<string, unknown>;
  gerado_em: string;
  tabelas: { tabela: string; quantidade: number; assinatura: string }[];
};
type Diretorio = {
  getDirectoryHandle: (nome: string, op: { create: boolean }) => Promise<Diretorio>;
  getFileHandle: (
    nome: string,
    op: { create: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (b: Uint8Array) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};
/** Pasta no desktop grava cada lote sem acumular os registros na RAM. */
export async function escolherPastaExportacao(): Promise<Diretorio | null> {
  const picker = (
    window as unknown as { showDirectoryPicker?: () => Promise<Diretorio> }
  ).showDirectoryPicker;
  return picker ? picker.call(window) : null;
}
export async function exportarEmpresa(
  w: string,
  pasta: Diretorio | null,
  progresso: (s: string) => void,
  signal: AbortSignal,
  solicitacao?: string,
) {
  const funcao = solicitacao ? "exportar_dados_titular" : "exportar_dados_empresa";
  const escopo = solicitacao
    ? { p_oficina: w, p_solicitacao: solicitacao }
    : { p_oficina: w };
  const manifesto = await rpc<Manifesto>(funcao, escopo, signal);
  const arquivos: Record<string, Uint8Array> = {},
    integridade: { arquivo: string; sha256: string; tamanho: number }[] = [];
  let tamanhoTotal = 0;
  const enc = new TextEncoder();
  const gravar = async (nome: string, bytes: Uint8Array) => {
    signal.throwIfAborted();
    tamanhoTotal += bytes.byteLength;
    if (!pasta && tamanhoTotal > 80_000_000)
      throw Error(
        "Esta exportação é grande para baixar como ZIP. Use Chrome ou Edge no computador e escolha uma pasta.",
      );
    const sha = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    if (pasta) {
      const f = await pasta.getFileHandle(nome, { create: true }),
        out = await f.createWritable();
      try {
        await out.write(bytes);
      } finally {
        await out.close();
      }
    } else arquivos[nome] = bytes;
    integridade.push({ arquivo: nome, sha256: sha, tamanho: bytes.byteLength });
  };
  const destino = pasta
    ? await pasta.getDirectoryHandle("patio-" + w + "-" + Date.now(), { create: true })
    : null;
  pasta = destino;
  const anexos: { bucket: string; caminho: string; nome: string; hash?: string }[] = [];
  for (const t of manifesto.tabelas) {
    let cursor: string | null = null,
      n = 0,
      pagina = 0;
    do {
      progresso(`Exportando ${t.tabela.replaceAll("_", " ")} · ${n}/${t.quantidade}`);
      const p: { linhas: Record<string, unknown>[]; cursor: string | null } = await rpc(
        funcao,
        { ...escopo, p_tabela: t.tabela, p_cursor: cursor },
        signal,
      );
      if (!p.linhas.length) break;
      if (p.cursor === cursor)
        throw Error("A exportação não avançou. Tente novamente.");
      await gravar(
        `${t.tabela}-${String(++pagina).padStart(5, "0")}.json`,
        enc.encode(JSON.stringify(p.linhas)),
      );
      if (t.tabela === "arquivos")
        for (const a of p.linhas)
          if (a.situacao === "ready")
            anexos.push({
              bucket: String(a.recipiente),
              caminho: String(a.caminho_arquivo),
              nome: String(a.id),
              hash: typeof a.sha256 === "string" ? a.sha256 : undefined,
            });
      if (t.tabela === "anexos_portabilidade")
        for (const a of p.linhas)
          if (a.situacao === "pronto")
            anexos.push({
              bucket: "company-portability",
              caminho: String(a.caminho),
              nome: String(a.id) + "-" + String(a.nome),
              hash: String(a.sha256),
            });
      cursor = p.cursor;
      n += p.linhas.length;
    } while (cursor);
    if (n !== t.quantidade)
      throw Error("Os dados mudaram durante a exportação. Gere uma nova cópia.");
  }
  for (let i = 0; i < anexos.length; i++) {
    signal.throwIfAborted();
    const a = anexos[i];
    progresso(`Baixando anexos · ${i + 1}/${anexos.length}`);
    const { data, error } = await supabase!.storage.from(a.bucket).download(a.caminho);
    if (error) throw Error("Um anexo não pôde ser baixado. A cópia não foi concluída.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (a.hash && /^[a-f0-9]{64}$/.test(a.hash)) {
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== a.hash)
        throw Error("Um anexo mudou ou está corrompido. A cópia não foi concluída.");
    }
    await gravar("anexo-" + nomeArquivoSeguro(a.nome), bytes);
  }
  progresso("Conferindo a integridade da cópia…");
  const fim = await rpc<Manifesto>(funcao, { ...escopo, p_conferir: true }, signal);
  if (
    JSON.stringify(manifesto.tabelas) !== JSON.stringify(fim.tabelas) ||
    JSON.stringify(manifesto.empresa) !== JSON.stringify(fim.empresa)
  )
    throw Error(
      "Os dados mudaram durante a exportação. A pasta não recebeu um manifesto de conclusão; gere uma nova cópia.",
    );
  const final = enc.encode(
    JSON.stringify(
      { ...manifesto, completo: true, anexos, arquivos: integridade },
      null,
      2,
    ),
  );
  await gravar("manifesto.json", final);
  if (!pasta) {
    const { zipSync } = await import("fflate");
    const zip = zipSync(arquivos, { level: 0 });
    baixarArquivo(
      solicitacao ? "dados-cliente-para-revisao.zip" : "dados-empresa.zip",
      new Blob([new Uint8Array(zip)], { type: "application/zip" }),
    );
  }
  return { arquivos: integridade.length, anexos: anexos.length };
}
export async function importarAnexo(
  w: string,
  origem: string,
  idExterno: string,
  file: File,
) {
  if (file.size > 26214400 || file.size < 1)
    throw Error("Use um arquivo de até 25 MB.");
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  const identidade = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([w, origem, idExterno, file.name, hash]),
        ),
      ),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  const id = [
    identidade.slice(0, 8),
    identidade.slice(8, 12),
    identidade.slice(12, 16),
    identidade.slice(16, 20),
    identidade.slice(20, 32),
  ].join("-");
  const caminho = await rpc<string>("reservar_anexo_portabilidade", {
    p_oficina: w,
    p_id: id,
    p_dados: {
      origem,
      id_externo: idExterno,
      nome: file.name,
      tamanho: file.size,
      sha256: hash,
      tipo: file.type,
    },
  });
  const r = await supabase!.storage
    .from("company-portability")
    .upload(caminho, file, { upsert: false, contentType: file.type });
  if (r.error && String((r.error as { statusCode?: string }).statusCode) !== "409")
    throw Error("O arquivo não foi enviado. Confira a conexão antes de repetir.");
  await rpc("confirmar_anexo_portabilidade", { p_oficina: w, p_id: id });
  return id;
}
