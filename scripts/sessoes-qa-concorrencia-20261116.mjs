import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const arquivo='output/contas-teste/sessoes-concorrencia-20261116.local.json';
let cache;
// Sessões efêmeras, somente das contas fictícias. Nunca entram no relatório.
export async function sessaoQa(cli,conta){
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
 if(!cache){try{cache=JSON.parse(await readFile(arquivo,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;cache={}}}
 const anterior=cache[conta.empresa_id];
 const r=anterior?.expires_at>Date.now()/1000+300
   ? await cli.auth.setSession({access_token:anterior.access_token,refresh_token:anterior.refresh_token})
   : await cli.auth.signInWithPassword({email:conta.email,password:conta.senha});
 assert.ifError(r.error);assert(r.data.session);
 cache[conta.empresa_id]=r.data.session;
 await writeFile(arquivo,JSON.stringify(cache));
 return r.data.session;
}
