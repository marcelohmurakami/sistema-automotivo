import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';

const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;
assert.equal(contas.length,26);
const resultados=[];
try {
  for(const [i,c] of contas.entries()) {
    assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
    const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    await sessaoQa(cli,c);
    const t=performance.now(),r=await cli.rpc('consultar_lembretes_financeiros',{p_oficina:c.empresa_id,p_pagina:0}).retry(false);
    const segundos=(performance.now()-t)/1000;
    assert.ifError(r.error);
    assert.equal(r.status,200);
    assert(Array.isArray(r.data.itens));
    assert(r.data.preferencias);
    assert(Number.isInteger(r.data.total));
    const outra=await cli.rpc('consultar_lembretes_financeiros',{p_oficina:contas[(i+1)%contas.length].empresa_id,p_pagina:0}).retry(false);
    assert.equal(outra.error?.code,'42501');
    resultados.push({perfil:c.especialidade,status:r.status,segundos,itens:r.data.itens.length,total:r.data.total,outraEmpresaBloqueada:true,checks:2,ok:true});
    console.log('PASS',c.especialidade,r.status,segundos.toFixed(3));
  }
} catch(e) { console.error(e.message);process.exitCode=1; }
finally {
  await writeFile('output/picos-51-20261119/lembretes-remotos.json',JSON.stringify({ok:!process.exitCode,metodo:'Consulta da API publicada em 26 empresas fictícias; sem alterações de preferências, adiamentos ou pagamentos; sem repetição automática. A função de consulta executa a geração de contas recorrentes já prevista no sistema, quando aplicável, somente nessas empresas de teste.',geradoEm:new Date().toISOString(),resultados},null,2));
}
