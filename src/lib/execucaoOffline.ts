import type { FichaEspecialidade } from "./perfisAtendimento";
import type { FotoOffline } from "./atendimentoOffline";
export type BaseExecucao = {
  id: string;
  agenda_id: string | null;
  documento_id: string | null;
  automotivo: boolean;
  agenda_revisao: number | null;
  documento_revisao: number | null;
  cliente: string;
  objeto: string;
  titulo: string;
  numero: string | null;
  inicio: string | null;
  fim: string | null;
  endereco: string;
  situacao: string | null;
  agenda_situacao: string | null;
  ficha: FichaEspecialidade | null;
  especialidade: string;
  itens: { descricao: string; quantidade: number }[];
};
export type DadosExecucao = {
  situacao: string | null;
  ficha: FichaEspecialidade | null;
  anotacoes: string;
  iniciado_em: string;
  finalizado_em: string;
  visita_concluida?: boolean;
};
export type ExecucaoLocal = {
  id: string;
  usuario: string;
  oficina: string;
  empresa: string;
  preparado: number;
  revisao: number;
  base: BaseExecucao;
  dados: DadosExecucao;
  fotos: FotoOffline[];
  pendente: boolean;
  chave: string;
  pedido?: { base: BaseExecucao; dados: DadosExecucao };
  resposta?: BaseExecucao;
  erro: string;
  conflito: boolean;
};
/** Só libera edição quando o banco recusou e desfez a transação; falhas de rede têm resultado desconhecido. */
export function tratarFalhaExecucao(r: ExecucaoLocal, codigo: unknown) {
  r.conflito = codigo === "PT409" && !r.resposta;
  if (!r.resposta && ["22023", "23514", "23P01"].includes(String(codigo)))
    r.pedido = undefined;
}
const banco = "patio-execucao-offline-v1";
const abrir = () =>
  new Promise<IDBDatabase>((ok, no) => {
    const r = indexedDB.open(banco, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore("execucoes", { keyPath: "id" });
      s.createIndex("usuario", "usuario");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(Error("Não foi possível abrir os dados do aparelho."));
  });
export async function execucoesLocais(usuario: string): Promise<ExecucaoLocal[]> {
  const db = await abrir();
  return new Promise((ok, no) => {
    const t = db.transaction("execucoes"),
      r = t.objectStore("execucoes").index("usuario").getAll(usuario);
    t.oncomplete = () => {
      db.close();
      ok(r.result);
    };
    t.onerror = () => {
      db.close();
      no(Error("Não foi possível ler o aparelho."));
    };
  });
}
export async function execucaoDoUsuario(
  usuario: string,
  oficina: string,
  id: string,
): Promise<ExecucaoLocal | undefined> {
  const db = await abrir();
  return new Promise((ok, no) => {
    const t = db.transaction("execucoes"),
      r = t.objectStore("execucoes").get(id);
    t.oncomplete = () => {
      db.close();
      const dado = r.result as ExecucaoLocal | undefined;
      ok(dado?.usuario === usuario && dado.oficina === oficina ? dado : undefined);
    };
    t.onabort = t.onerror = () => {
      db.close();
      no(Error("Não foi possível ler o aparelho."));
    };
  });
}
export async function guardarExecucao(r: ExecucaoLocal) {
  if (
    r.fotos.length > 12 ||
    r.fotos.some(
      (f) =>
        !f.imagem.startsWith("data:image/jpeg;base64,") || f.imagem.length > 2000000,
    )
  )
    throw Error("Use até 12 fotos de até 2 MB por atendimento.");
  const db = await abrir();
  return new Promise<void>((ok, no) => {
    const t = db.transaction("execucoes", "readwrite"),
      s = t.objectStore("execucoes"),
      get = s.get(r.id);
    let conflito = false;
    get.onsuccess = () => {
      const old = get.result as ExecucaoLocal | undefined;
      if (
        old &&
        (old.usuario !== r.usuario ||
          old.oficina !== r.oficina ||
          old.revisao !== r.revisao)
      ) {
        conflito = true;
        t.abort();
        return;
      }
      s.put({ ...r, revisao: r.revisao + 1 });
    };
    t.oncomplete = () => {
      db.close();
      r.revisao++;
      ok();
    };
    t.onabort = t.onerror = () => {
      db.close();
      no(
        Error(
          conflito
            ? "Este atendimento mudou em outra aba. Feche e abra novamente."
            : "Não foi possível salvar no aparelho. Confira o espaço disponível.",
        ),
      );
    };
  });
}
export async function excluirExecucao(usuario: string, id: string) {
  const db = await abrir();
  return new Promise<void>((ok, no) => {
    const t = db.transaction("execucoes", "readwrite"),
      s = t.objectStore("execucoes"),
      get = s.get(id);
    get.onsuccess = () => {
      if (get.result?.usuario !== usuario) {
        t.abort();
        return;
      }
      s.delete(id);
    };
    t.oncomplete = () => {
      db.close();
      ok();
    };
    t.onabort = t.onerror = () => {
      db.close();
      no(Error("Registro indisponível."));
    };
  });
}
export async function limparExecucoesUsuario(usuario: string) {
  for (const r of await execucoesLocais(usuario)) await excluirExecucao(usuario, r.id);
}
export const novaExecucao = (
  usuario: string,
  oficina: string,
  empresa: string,
  b: BaseExecucao,
): ExecucaoLocal => ({
  id: `${usuario}:${oficina}:${b.id}`,
  usuario,
  oficina,
  empresa,
  preparado: Date.now(),
  revisao: 0,
  base: b,
  dados: {
    situacao: b.situacao,
    ficha: structuredClone(b.ficha),
    anotacoes: "",
    iniciado_em: "",
    finalizado_em: "",
  },
  fotos: [],
  pendente: false,
  chave: crypto.randomUUID(),
  erro: "",
  conflito: false,
});
export type ConflitoExecucao = {
  campo: string;
  local: string | boolean | null;
  remoto: string | boolean | null;
};
/** Mescla somente mudanças independentes; divergências exigem uma escolha explícita. */
export function compararExecucao(
  r: ExecucaoLocal,
  remoto: BaseExecucao,
  escolhas: Record<string, "local" | "remoto"> = {},
) {
  const dados = structuredClone(r.dados),
    conflitos: ConflitoExecucao[] = [];
  const escolher = (
    campo: string,
    base: string | boolean | null,
    local: string | boolean | null,
    atual: string | boolean | null,
  ) => {
    if (local === base) return atual;
    if (atual === base || atual === local) return local;
    if (escolhas[campo]) return escolhas[campo] === "local" ? local : atual;
    conflitos.push({ campo, local, remoto: atual });
    return local;
  };
  dados.situacao = escolher(
    "Situação",
    r.base.situacao,
    r.dados.situacao,
    remoto.situacao,
  ) as string | null;
  if (dados.ficha && remoto.ficha) {
    dados.ficha.etapa = String(
      escolher(
        "Etapa",
        r.base.ficha?.etapa ?? "",
        dados.ficha.etapa,
        remoto.ficha.etapa,
      ),
    );
    for (const tipo of ["campos", "checklist"] as const) {
      const keys = new Set([
        ...Object.keys(r.base.ficha?.[tipo] || {}),
        ...Object.keys(dados.ficha[tipo]),
        ...Object.keys(remoto.ficha[tipo]),
      ]);
      for (const k of keys) {
        const vazio = tipo === "campos" ? "" : false;
        const v = escolher(
          `${tipo}.${k}`,
          r.base.ficha?.[tipo][k] ?? vazio,
          dados.ficha[tipo][k] ?? vazio,
          remoto.ficha[tipo][k] ?? vazio,
        );
        if (tipo === "campos") dados.ficha.campos[k] = String(v);
        else dados.ficha.checklist[k] = Boolean(v);
      }
    }
  } else if (!dados.ficha) dados.ficha = structuredClone(remoto.ficha);
  return { dados, conflitos };
}
