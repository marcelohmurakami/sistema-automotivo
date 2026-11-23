import{spawn}from'node:child_process';import{mkdir,writeFile,readFile}from'node:fs/promises';import{resolve}from'node:path';
const root=resolve('output/regressao-mapa-orcamentos-os-20261116'),h=await fetch('https://patio-gestao-peach.vercel.app/health.json?qa='+Date.now()).then(r=>r.json()),resultados=[];
const tarefas=[
 ['compartilhado/acesso-publicado','scripts/verificar-acesso-publicado-regressao.mjs',{}],
 ['compartilhado/fotos-final-2','scripts/verificar-fotos-tres-modulos.mjs',{}],
 ['os/completo-reteste','scripts/medir-os-publicado.mjs',{QA_COMPLETO:'1'}],
 ['os/consulta-reteste','scripts/medir-os-consulta.mjs',{QA_OS_FONTE:resolve(root,'os/completo-reteste/resultados.json')}],
 ['os/entrega-sem-repeticao/lava_rapido-reteste','scripts/verificar-pagamento-entrega-publicado.mjs',{QA_PERFIL:'lava_rapido',QA_PERDER_RESPOSTA:'1'}],
];
for(const[nome,script,extra]of tarefas){
 const out=resolve(root,nome);await mkdir(out,{recursive:true});const env={...process.env,QA_FASE:'reteste-final',QA_OUTPUT:out,QA_EXPECTED_BUILD:h.build};for(const k of['QA_PERFIS','QA_COMPLETO','QA_PRONTO','QA_RAPIDO','QA_PERFIL','QA_PERDER_RESPOSTA'])delete env[k];Object.assign(env,extra);
 let log='';const inicio=Date.now(),codigo=await new Promise(ok=>{const c=spawn(process.execPath,[script],{env,windowsHide:true});c.stdout.on('data',b=>{log+=b;process.stdout.write(b)});c.stderr.on('data',b=>{log+=b;process.stderr.write(b)});c.on('exit',ok);c.on('error',e=>{log+=e.stack;ok(1)})});
 await writeFile(resolve(out,'execucao.log'),log);let arquivo='resultados.json',dados;for(const n of['resultados.json','resumo.json'])try{dados=JSON.parse(await readFile(resolve(out,n),'utf8'));arquivo=n;break}catch{}
 resultados.push({nome,script,codigo,ok:codigo===0&&dados?.ok===true,segundos:(Date.now()-inicio)/1000,resultado:nome+'/'+arquivo});await writeFile(resolve(root,'execucoes-retestes-finais.json'),JSON.stringify({build:h.build,resultados},null,2));console.log(codigo===0?'CONCLUÍDO':'FALHOU',nome);
}
if(resultados.some(r=>!r.ok))process.exitCode=1;
