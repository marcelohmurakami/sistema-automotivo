import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
const chave = process.env.SUPABASE_BACKUP_SERVICE_ROLE_KEY;
if (!chave)
  throw new Error(
    "Configure SUPABASE_BACKUP_SERVICE_ROLE_KEY somente no terminal seguro. Nunca use VITE_ para esta chave.",
  );
const pasta = resolve(
  "backups",
  `storage-${new Date().toISOString().replaceAll(":", "-")}`,
);
await mkdir(pasta, { recursive: true });
await mkdir(join(pasta, "objetos"));
const cliente = createClient(
  "https://hzihxtjirttetnfdujcx.supabase.co",
  chave,
  { auth: { persistSession: false } },
);
try {
 const { copiarStorage } = await import('./lib/portabilidade-storage.mjs');
 const m=await copiarStorage(cliente,pasta,'hzihxtjirttetnfdujcx');
 console.log('Backup completo:',m.buckets.length,'recipientes,',m.itens.length,'arquivos em',pasta,'Execute também o backup do banco.');
} catch(e) { console.error(e.message); process.exitCode=1; }
