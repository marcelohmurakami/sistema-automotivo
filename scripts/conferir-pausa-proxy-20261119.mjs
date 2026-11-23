import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {preview} from 'vite';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const c=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(c=>c.especialidade==='retifica');
assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
const session=await sessaoQa(createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),c);
const server=await preview({build:{outDir:'output/picos-51-20261119/build-depois'},preview:{host:'127.0.0.1',port:0}});
const base=server.resolvedUrls.local[0],resultados=[];
try {
  let esperado;
  for(const etapa of ['primeira leitura','leitura imediata','retorno após 35 segundos']) {
    if(etapa.startsWith('retorno'))await new Promise(resolve=>setTimeout(resolve,35000));
    const t=performance.now();
    const r=await fetch(base+'_supabase/rest/v1/rpc/consultar_meu_acesso',{method:'POST',headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
    assert.equal(r.status,200);assert(r.headers.get('cache-control')?.includes('no-store'));
    const dados=await r.json();
    if(esperado)assert.deepEqual(dados,esperado);else esperado=dados;
    resultados.push({etapa,status:r.status,segundos:(performance.now()-t)/1000,mesmaIdentidadeEPermissoes:true});
    console.log('PASS',etapa,r.status);
  }
}finally{
  await new Promise(r=>server.httpServer.close(r));
  await writeFile('output/picos-51-20261119/pausa-proxy.json',JSON.stringify({metodo:'Mesma sessão de empresa fictícia, duas leituras e uma leitura após 35 segundos sem tráfego. Sem repetição de aplicação e sem cache de resposta.',resultados},null,2));
}
