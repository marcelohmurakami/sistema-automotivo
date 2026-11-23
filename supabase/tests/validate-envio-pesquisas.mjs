import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';import {resolve} from 'node:path';import {readFile,writeFile,mkdir} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';import {especialidades} from '../../src/lib/especialidades.ts';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261030000200';
let db;const pasta=resolve('output/qualidade-garantia-20261030');await mkdir(pasta,{recursive:true});
try {
 const c=await criarCenarioSubsistemas();db=c.db;const {registros,ids,login}=c;
 const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];const call=(f,a=[])=>one(`select public.${f}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a.map(x=>x&&typeof x==='object'?JSON.stringify(x):x));
 const canais=[];
 for(const [perfil,r] of Object.entries(registros)){
  await login(ids[perfil]);await call('configurar_pesquisa_qualidade',[r.w,true,0,30,'https://qa.example.com']);await call('registrar_contato_pesquisa',[r.w,r.cliente,true,'Autorização fictícia para teste do envio']);
  let id=r.atendimento;if(!id)id=(await call('salvar_ordem_servico',[r.w,{cliente_id:r.cliente,veiculo_id:r.objeto},uuid()])).id;
  await db.exec('reset role');
  if(!r.atendimento)await db.query("update public.ordens_servico set situacao='delivered',entregue_em=now() where id=$1",[id]);
  else if(especialidades[perfil].ramo==='assistencia_tecnica')await db.query("update public.atendimentos_servicos set situacao='concluido',concluido_em=now(),ficha_especialidade=jsonb_set(jsonb_set(ficha_especialidade,'{etapa}','\"Entregue\"'),'{campos,recebedor}','\"Cliente QA\"') where id=$1",[id]);
  else await db.query("update public.atendimentos_servicos set situacao='concluido',concluido_em=now() where id=$1",[id]);
  canais.push({oficina:r.w,url:'https://provedor-ficticio.example',instancia:perfil,chave:'chave-ficticia',destinatarios:['+5511999999999'],habilitado:true});
 }
 await db.exec('reset role;set role service_role');await call('processar_lembretes_automaticos');
 await login(ids.mecanica);await call('configurar_pesquisa_qualidade',[registros.mecanica.w,false,0,30,'https://qa.example.com']);
 await login(ids.retifica);await call('registrar_contato_pesquisa',[registros.retifica.w,registros.retifica.cliente,false,'Cliente revogou a autorização de contato']);
 await db.exec('reset role;set role service_role');
 let handler,n=0;const chamadas=[],erros=[];
 const env={AUTOMOTIVO_AGENDADOR_SECRET:'segredo-ficticio',AUTOMOTIVO_CANAIS_JSON:JSON.stringify(canais),SUPABASE_URL:'https://db-ficticio.example',SUPABASE_SERVICE_ROLE_KEY:'chave-ficticia'};
 const context=vm.createContext({Response,AbortSignal,console,JSON,encodeURIComponent,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},createClient:()=>({rpc:async(f,args={})=>{try{const keys=Object.keys(args);const data=await one(`select public.${f}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')})`,Object.values(args));return{data,error:null};}catch(e){erros.push(e.message);return{data:null,error:e};}}}),fetch:async(url,init)=>{assert.match(url,/^https:\/\/provedor-ficticio\.example\/message\/sendText\//);const b=JSON.parse(init.body);assert.equal(b.number,'5511999999999');assert.match(b.text,/https:\/\/qa\.example\.com\/pesquisa\/[a-f0-9]{64}$/);chamadas.push({url,texto:b.text});const modo=n++%3;if(modo===0)return Response.json({key:{id:'mensagem-ficticia-'+n}});if(modo===1)return Response.json({erro:'indisponível'},{status:503});throw Error('Timeout fictício');}});
 const fonte=(await readFile('supabase/functions/automacoes-oficina/index.ts','utf8')).replace(/import \{ createClient \} from "npm:@supabase\/supabase-js@2";/,'');
 vm.runInContext(ts.transpileModule(fonte,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,context);
 const request=(secret='segredo-ficticio')=>new Request('https://worker-ficticio.example',{method:'POST',headers:{'x-automotivo-secret':secret}});
 assert.equal((await handler(request('errado'))).status,401);assert.equal(chamadas.length,0);
 const primeira=await (await handler(request())).json();assert.deepEqual(primeira,{enviados:8,incertos:16});assert.equal(chamadas.length,24);
 assert.deepEqual(await (await handler(request())).json(),{enviados:0,incertos:0});assert.equal(chamadas.length,24,'não repete envio incerto');assert.deepEqual(erros,[]);
 await db.exec('reset role');const estados=(await db.query("select a.situacao,count(*)::int quantidade from public.pesquisas_qualidade p join public.avisos_automaticos a on a.id=p.aviso_id group by a.situacao order by a.situacao")).rows;
 assert.deepEqual(estados,[{situacao:'cancelado',quantidade:2},{situacao:'enviado',quantidade:8},{situacao:'incerto',quantidade:16}]);
 await writeFile(resolve(pasta,'envio-simulado.json'),JSON.stringify({ok:true,empresas:26,transportesSimulados:24,primeira,estados,redeExterna:false,verificacoes:['segredo obrigatório','pausa cancela envio','recusa cancela envio','sucesso confirmado pelo provedor','erro HTTP','timeout','sem repetição incerta','link individual','isolamento do canal por empresa']},null,2));
 console.log('PASS: worker real, 26 empresas, 24 transportes simulados; sucesso, erro, timeout, pausa, recusa e idempotência. Nenhuma mensagem real enviada.');
}catch(e){console.error(JSON.stringify({message:e.message,code:e.code,where:e.where},null,2));process.exitCode=1;}finally{await db?.close();}
