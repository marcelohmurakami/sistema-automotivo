import { novoId } from "./uuid.ts";
import { limparExecucoesUsuario, execucoesLocais } from "./execucaoOffline.ts";
import type { Ramo } from "./ramos";
import type { Auxiliares } from "../services/orcamentos";
import type { DocumentoOffline, ReciboDocumentoOffline } from "./documentoOffline";
import type { Identidade } from "../services/documentos";
export type BaseOffline = {
  especialidade?: string;
  identidade?: Identidade;
  objetos?: {
    id: string;
    cliente_id: string;
    nome: string;
    dados: Record<string, string>;
  }[];
  ramo?: Ramo;
  id: string;
  usuario: string;
  oficina: string;
  nome: string;
  atualizado: number;
  aux: Auxiliares;
};
export type FotoOffline = {
  id: string;
  imagem: string;
  fase: string;
  legenda: string;
  sincronizada: boolean;
};
export type RascunhoOffline = {
  documento?: DocumentoOffline;
  pedido_documento?: DocumentoOffline;
  pronto_envio?: boolean;
  recibo?: ReciboDocumentoOffline;
  ramo?: Ramo;
  objeto?: string;
  objeto_id?: string;
  data_servico?: string;
  revisao?: number;
  id: string;
  usuario: string;
  oficina: string;
  cliente_id: string;
  veiculo_id: string;
  relato: string;
  quilometragem: number | null;
  fotos: FotoOffline[];
  atualizado: number;
  os_id: string | null;
  situacao: "pendente" | "parcial" | "sincronizado";
  erro: string;
};
const nomeBanco = "patio-atendimento-offline-v1";
function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(nomeBanco, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("bases"))
        r.result.createObjectStore("bases", { keyPath: "id" });
      const s = r.result.objectStoreNames.contains("rascunhos")
        ? r.transaction!.objectStore("rascunhos")
        : r.result.createObjectStore("rascunhos", { keyPath: "id" });
      s.createIndex("usuario", "usuario");
      s.createIndex("usuario-oficina", ["usuario", "oficina"]);
      s.createIndex("usuario-oficina-situacao", ["usuario", "oficina", "situacao"]);
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () =>
      reject(
        new Error("Armazenamento local indisponível. Confira o espaço do aparelho."),
      );
  });
}
async function transacao<T>(
  store: string,
  modo: IDBTransactionMode,
  operar: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, modo);
    let resultado: T;
    const r = operar(t.objectStore(store));
    r.onsuccess = () => {
      resultado = r.result;
    };
    t.oncomplete = () => {
      db.close();
      resolve(resultado);
    };
    t.onerror = () => {
      db.close();
      reject(
        new Error(
          "Não foi possível guardar neste aparelho. Libere espaço e tente novamente.",
        ),
      );
    };
    t.onabort = t.onerror;
  });
}
export async function guardarBase(b: BaseOffline) {
  await transacao("bases", "readwrite", (s) => s.put(b));
}
export async function basesDoUsuario(
  usuario: string,
  incluirVencidas = false,
): Promise<BaseOffline[]> {
  const lista = await transacao<BaseOffline[]>("bases", "readonly", (s) => s.getAll());
  return lista.filter(
    (b) =>
      b.usuario === usuario &&
      (incluirVencidas || Date.now() - b.atualizado < 7 * 86400000),
  );
}
export async function rascunhosDoUsuario(
  usuario: string,
  oficina?: string,
): Promise<RascunhoOffline[]> {
  const lista = await transacao<RascunhoOffline[]>("rascunhos", "readonly", (s) =>
    oficina
      ? s.index("usuario-oficina").getAll([usuario, oficina])
      : s.index("usuario").getAll(usuario),
  );
  return lista
    .filter((r) => r.usuario === usuario && (!oficina || r.oficina === oficina))
    .sort((a, b) => b.atualizado - a.atualizado);
}
/** Consulta pontual dentro da trava de sincronização, com isolamento do titular. */
export async function rascunhoDoUsuario(usuario: string, oficina: string, id: string) {
  const r = await transacao<RascunhoOffline | undefined>("rascunhos", "readonly", (s) =>
    s.get(id),
  );
  return r?.usuario === usuario && r.oficina === oficina ? r : undefined;
}
/** O processo em segundo plano não carrega fotos/documentos que já foram enviados. */
export async function rascunhosPendentesDoUsuario(usuario: string, oficina: string) {
  const listas = await Promise.all(
    ["pendente", "parcial"].map((situacao) =>
      transacao<RascunhoOffline[]>("rascunhos", "readonly", (s) =>
        s.index("usuario-oficina-situacao").getAll([usuario, oficina, situacao]),
      ),
    ),
  );
  return listas.flat().sort((a, b) => b.atualizado - a.atualizado);
}
export async function guardarRascunhoOffline(r: RascunhoOffline) {
  if (
    !r.usuario ||
    !r.oficina ||
    !r.id ||
    r.relato.length > 4000 ||
    r.fotos.length > 12 ||
    r.fotos.some((f) => f.imagem.length > 2_000_000)
  )
    throw new Error("Confira o relato e o limite de 12 fotos por rascunho.");
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("rascunhos", "readwrite"),
      s = t.objectStore("rascunhos"),
      pedido = s.get(r.id);
    let conflito = false;
    pedido.onsuccess = () => {
      const anterior = pedido.result as RascunhoOffline | undefined;
      if (
        anterior &&
        (anterior.usuario !== r.usuario ||
          anterior.oficina !== r.oficina ||
          (anterior.revisao ?? 0) !== (r.revisao ?? 0) ||
          ((anterior.pedido_documento || anterior.recibo) &&
            JSON.stringify(anterior.documento) !== JSON.stringify(r.documento)) ||
          (anterior.recibo &&
            JSON.stringify(anterior.recibo) !== JSON.stringify(r.recibo)))
      ) {
        conflito = true;
        t.abort();
        return;
      }
      s.put({ ...r, revisao: (r.revisao ?? 0) + 1 });
    };
    t.oncomplete = () => {
      db.close();
      r.revisao = (r.revisao ?? 0) + 1;
      resolve();
    };
    t.onabort = () => {
      db.close();
      reject(
        new Error(
          conflito
            ? "Este rascunho mudou em outra aba. Reabra antes de continuar."
            : "Não foi possível guardar. Confira o espaço do aparelho.",
        ),
      );
    };
    t.onerror = () => {
      db.close();
      reject(new Error("Armazenamento indisponível."));
    };
  });
}
export async function excluirRascunhoOffline(
  usuario: string,
  oficina: string,
  id: string,
) {
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("rascunhos", "readwrite"),
      s = t.objectStore("rascunhos"),
      pedido = s.get(id);
    let mensagem = "Não foi possível remover a cópia local.";
    pedido.onsuccess = () => {
      const r = pedido.result as RascunhoOffline | undefined;
      if (r?.usuario !== usuario || r.oficina !== oficina) {
        mensagem = "Rascunho indisponível.";
        t.abort();
        return;
      }
      if (r.pedido_documento && r.situacao !== "sincronizado") {
        mensagem = "Confirme o envio pendente antes de remover este documento.";
        t.abort();
        return;
      }
      s.delete(id);
    };
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onabort = t.onerror = () => {
      db.close();
      reject(new Error(mensagem));
    };
  });
}
export async function limparOfflineUsuario(usuario: string) {
  await limparExecucoesUsuario(usuario);
  for (const store of ["bases", "rascunhos"]) {
    const lista = await transacao<{ id: string; usuario: string }[]>(
      store,
      "readonly",
      (s) => s.getAll(),
    );
    for (const r of lista.filter((r) => r.usuario === usuario))
      await transacao(store, "readwrite", (s) => s.delete(r.id));
  }
}
export async function pendenciasOfflineUsuario(usuario: string) {
  const lista = await transacao<RascunhoOffline[]>("rascunhos", "readonly", (s) =>
    s.getAll(),
  );
  const execucoes = await execucoesLocais(usuario);
  return (
    lista.some((r) => r.usuario === usuario && r.situacao !== "sincronizado") ||
    execucoes.some(
      (r) => r.pendente || r.pedido || r.fotos.some((f) => !f.sincronizada),
    )
  );
}
export const novoRascunhoOffline = (
  usuario: string,
  oficina: string,
): RascunhoOffline => ({
  id: novoId(),
  usuario,
  oficina,
  cliente_id: "",
  veiculo_id: "",
  relato: "",
  quilometragem: null,
  fotos: [],
  atualizado: Date.now(),
  os_id: null,
  situacao: "pendente",
  erro: "",
});
