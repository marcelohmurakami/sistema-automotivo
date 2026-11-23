import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const pasta='output/jornada-assistencia-campo-20261110';
const cred=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const contas=cred.contas.filter(c=>['assistencia_tecnica','manutencao_campo'].includes(c.ramo));
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const client=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const anon=client(),resultados=[];
for(let i=0;i<contas.length;i++){
 const c=contas[i],outro=contas[(i+1)%contas.length];assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const s=JSON.parse(await readFile(`${pasta}/${c.especialidade}.json`,'utf8')),t=JSON.parse(await readFile(`${pasta}/${outro.especialidade}.json`,'utf8'));
 const db=client();const login=await db.auth.signInWithPassword({email:c.email,password:c.senha});assert(!login.error);
 const rejeita=async(nome,args,cli=db)=>{const r=await cli.rpc(nome,args);assert(r.error||r.data==null,'Acesso indevido: '+nome);};
 await rejeita('consultar_detalhes_atendimento',{p_oficina:c.empresa_id,p_atendimento:t.documentos.fluxo.id});
 await rejeita('consultar_detalhes_atendimento',{p_oficina:outro.empresa_id,p_atendimento:t.documentos.fluxo.id});
 await rejeita('consultar_lucro_documento',{p_oficina:c.empresa_id,p_documento:t.documentos.fluxo.id});
 await rejeita('consultar_detalhes_atendimento',{p_oficina:c.empresa_id,p_atendimento:s.documentos.fluxo.id},anon);
 const {data,error}=await db.rpc('consultar_detalhes_atendimento',{p_oficina:c.empresa_id,p_atendimento:s.documentos.fluxo.id});assert(!error&&data.atendimento.id===s.documentos.fluxo.id);
 resultados.push({perfil:c.especialidade,ok:true,checks:['Outro documento bloqueado','Outra empresa bloqueada','Lucro de outra empresa bloqueado','Leitura anônima bloqueada','Documento próprio continua acessível']});
 await db.auth.signOut();console.log('PASS',c.especialidade,5);
}
await writeFile(`${pasta}/isolamento.json`,JSON.stringify({ok:true,resultados},null,2));
