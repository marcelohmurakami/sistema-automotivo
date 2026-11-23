import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTransporteSupabase } from '../src/lib/transporteSupabase.ts';
const origem='https://projeto.supabase.co';
test('REST preserva POST, JSON, parâmetros, autorização e sinal; não envia cookies nem usa cache',async()=>{
 const calls=[];const sinal=new AbortController();const body=JSON.stringify({nome:'Teste & valor',valor:12.34});
 const f=criarTransporteSupabase(origem,'/_supabase',async(...a)=>{calls.push(a);return new Response('{}')});
 await f(origem+'/rest/v1/rpc/salvar?x=1&y=2',{method:'POST',body,signal:sinal.signal,headers:{Authorization:'Bearer ficticio',apikey:'publica','Content-Type':'application/json'},credentials:'include',cache:'force-cache'});
 assert.equal(calls.length,1);assert.equal(calls[0][0],'/_supabase/rest/v1/rpc/salvar?x=1&y=2');
 assert.equal(calls[0][1].method,'POST');assert.equal(calls[0][1].body,body);assert.equal(calls[0][1].signal,sinal.signal);assert.equal(calls[0][1].headers.Authorization,'Bearer ficticio');assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].cache,'no-store');
});
test('Auth usa a mesma rota para login, renovação, MFA e saída',async()=>{
 const calls=[];const f=criarTransporteSupabase(origem,'/_supabase',async(u)=>{calls.push(String(u));return new Response('{}')});
 for(const path of ['token?grant_type=password','token?grant_type=refresh_token','factors/abc/verify','logout','user'])await f(origem+'/auth/v1/'+path);
 assert.deepEqual(calls,['token?grant_type=password','token?grant_type=refresh_token','factors/abc/verify','logout','user'].map(p=>'/_supabase/auth/v1/'+p));
});
test('Storage, funções, outro projeto e domínios parecidos permanecem diretos',async()=>{
 const calls=[];const f=criarTransporteSupabase(origem,'/_supabase',async(u)=>{calls.push(String(u));return new Response('{}')});
 const urls=[origem+'/storage/v1/object/x',origem+'/functions/v1/x','https://outro.supabase.co/rest/v1/x','https://projeto.supabase.co.exemplo.com/auth/v1/user',origem+'/rest/v11/x'];
 for(const u of urls)await f(u);assert.deepEqual(calls,urls);
});
test('Sem rota configurada mantém conexão direta',async()=>{
 let chamada;await criarTransporteSupabase(origem,'',async u=>{chamada=u;return new Response('{}')})(origem+'/rest/v1/x');assert.equal(chamada,origem+'/rest/v1/x');
});
test('403, 500 e falha de rede não causam nova tentativa de gravação',async()=>{
 for(const status of [403,500,0]){let n=0;const f=criarTransporteSupabase(origem,'/_supabase',async()=>{n++;if(!status)throw new TypeError('rede');return new Response('negado',{status})});
 if(status)assert.equal((await f(origem+'/rest/v1/rpc/gravar',{method:'POST'})).status,status);else await assert.rejects(f(origem+'/rest/v1/rpc/gravar',{method:'POST'}),TypeError);assert.equal(n,1)}
});
test('Request completo preserva método, corpo e cancelamento sem perder headers',async()=>{
 const anterior=globalThis.location;globalThis.location={origin:'https://sistema.test'};
 try{let request,options;const controller=new AbortController();const input=new Request(origem+'/rest/v1/rpc/gravar',{method:'POST',body:'{"x":1}',headers:{Authorization:'Bearer qa'},signal:controller.signal});
 await criarTransporteSupabase(origem,'/_supabase',async(r,o)=>{request=r;options=o;return new Response('{}')})(input);
 assert.equal(request.url,'https://sistema.test/_supabase/rest/v1/rpc/gravar');assert.equal(request.method,'POST');assert.equal(await request.text(),'{"x":1}');assert.equal(request.headers.get('Authorization'),'Bearer qa');controller.abort();assert.equal(request.signal.aborted,true);assert.equal(options.credentials,'omit');
 }finally{if(anterior===undefined)delete globalThis.location;else globalThis.location=anterior}
});
