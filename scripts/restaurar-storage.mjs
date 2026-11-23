import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { verificarBackupStorage } from "./lib/backup-storage.mjs";
const [pasta, projeto, confirmacao] = process.argv.slice(2);
if (
  !pasta ||
  !/^[a-z]{20}$/.test(projeto || "") ||
  projeto === "hzihxtjirttetnfdujcx" ||
  confirmacao !== "--confirmar-copia-isolada"
)
  throw new Error(
    "Informe pasta, referência de OUTRO projeto Supabase e --confirmar-copia-isolada. O projeto automotivo é bloqueado.",
  );
const manifesto = await verificarBackupStorage(pasta);
if (projeto === manifesto.projeto)
  throw new Error(
    "A restauração precisa ocorrer em um projeto diferente da origem.",
  );
const chave = process.env.SUPABASE_RESTORE_SERVICE_ROLE_KEY;
if (!chave)
  throw new Error(
    "Configure a chave de servidor do projeto de destino em SUPABASE_RESTORE_SERVICE_ROLE_KEY.",
  );
const cliente = createClient(`https://${projeto}.supabase.co`, chave, {
  auth: { persistSession: false },
});
try {
 const { restaurarStorage }=await import('./lib/portabilidade-storage.mjs');
 const r=await restaurarStorage(cliente,resolve(pasta));
 console.log('Restauração isolada conferida:',r.copiados,'arquivos em',r.buckets,'recipientes.');
} catch(e) {console.error(e.message);process.exitCode=1;}
