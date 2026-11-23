import {readFile,writeFile} from 'node:fs/promises';
const f='supabase/tests/validate-ocorrencias-consulta-leve.mjs';let s=await readFile(f,'utf8');
s=s.replace("'MFA pendente bloqueado');", "'MFA pendente bloqueado','PT403');");
s=s.replace('restricoes_acesso(oficina_id,usuario_id,regras)', 'restricoes_acesso(oficina_id,usuario_id,regras,autor)');
s=s.replace(`nenhum\\\"}')`, `nenhum\\\"}',$2)`);
await writeFile(f,s);
