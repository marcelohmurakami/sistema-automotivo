import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas,resultados=[];
try{for(const [i,c] of contas.entries()){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});await sessaoQa(cli,c);
 const args={p_oficina:c.empresa_id,p_inicio:'2026-11-01',p_fim:'2026-11-19'};const anterior=await cli.rpc(c.ramo==='automotivo'?'consultar_qualidade':'consultar_relatorios_servicos',args).retry(false);assert.ifError(anterior.error);
 if(c.ramo==='automotivo'){const r=await cli.rpc('consultar_ocorrencias_servicos',args).retry(false);assert(r.error);resultados.push({perfil:c.especialidade,ok:true,checks:2,consultaAutomotivaPreservada:true});continue;}
 const r=await cli.rpc('consultar_ocorrencias_servicos',args).retry(false);assert.ifError(r.error);assert.deepEqual(r.data,anterior.data.qualidade);
 const outra=await cli.rpc('consultar_ocorrencias_servicos',{...args,p_oficina:contas[(i+1)%contas.length].empresa_id}).retry(false);assert.equal(outra.error?.code,'42501');
 const invalido=await cli.rpc('consultar_ocorrencias_servicos',{...args,p_fim:'2026-10-01'}).retry(false);assert.equal(invalido.error?.code,'22023');
 resultados.push({perfil:c.especialidade,ok:true,checks:3,ocorrencias:r.data.length,caracteresAntes:JSON.stringify(anterior.data).length,caracteresDepois:JSON.stringify(r.data).length});console.log('PASS',c.especialidade);
}}catch(e){console.error(e.message);process.exitCode=1;}finally{await writeFile('output/picos-51-20261119/ocorrencias-remotas.json',JSON.stringify({ok:!process.exitCode,metodo:'Somente leituras autenticadas em empresas fictícias no Supabase publicado. Sem registrar, resolver ou pagar ocorrências.',resultados},null,2));}
