// Execução sequencial e auditável. Somente as contas fictícias dos roteiros são usadas.
import {spawn} from 'node:child_process';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {resolve} from 'node:path';
const root=resolve('output/regressao-mapa-orcamentos-os-20261116'),modo=process.argv[2]||'publicado';await mkdir(root,{recursive:true});
const perfis=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo==='automotivo').map(c=>c.especialidade);
const tarefas=modo==='publicado'?[
 ['mapa/fluxos','scripts/medir-mapa-publicado.mjs',{}],
 ['mapa/continuo','scripts/medir-mapa-publicado.mjs',{QA_DIRETO:'1'}],
 ['orcamentos/simples-edicao','scripts/medir-orcamentos-publicado.mjs',{}],
 ['orcamentos/completo','scripts/medir-orcamentos-publicado.mjs',{QA_COMPLETO:'1'}],
 ['orcamentos/cadastrados','scripts/medir-orcamentos-publicado.mjs',{QA_RAPIDO:'1'}],
 ['os/simples-edicao','scripts/medir-os-publicado.mjs',{}],
 ['os/completo','scripts/medir-os-publicado.mjs',{QA_COMPLETO:'1'}],
 ['os/pronto-pagamento','scripts/medir-os-publicado.mjs',{QA_PRONTO:'1'}],
 ['os/cadastrados','scripts/medir-os-publicado.mjs',{QA_RAPIDO:'1'}],
 ['os/consulta','scripts/medir-os-consulta.mjs',{QA_OS_FONTE:resolve(root,'os/completo/resultados.json')}],
]:modo==='complementar'?[
 ['orcamentos/aprovacao-conversao','scripts/verificar-ciclo-orcamento-os-publicado.mjs',{}],
 ['mapa/controles','scripts/medir-controles-mapa-publicado.mjs',{QA_DOCUMENTOS:['mapa/fluxos','mapa/continuo'].map(p=>resolve(root,p,'resultados.json')).join('|')}],
 ...perfis.map(p=>['os/entrega-sem-repeticao/'+p,'scripts/verificar-pagamento-entrega-publicado.mjs',{QA_PERFIL:p}]),
]:modo==='volume'?[
 ['mapa/volume','scripts/medir-mapa-controlado.mjs',{}],
 ['orcamentos/volume','scripts/medir-orcamentos-controlado.mjs',{}],
 ['os/volume','scripts/medir-os-controlado.mjs',{}],
]:[
 ['mapa/resiliencia','scripts/verificar-mapa-resiliencia.mjs',{}],
 ['orcamentos/interface','scripts/verificar-orcamentos-agilidade.mjs',{}],
 ['os/interface','scripts/verificar-os-agilidade.mjs',{}],
 ['os/pagamento-entrega','scripts/verificar-pagamento-entrega.mjs',{}],
 ['compartilhado/offline','scripts/bancada-documentos-offline.mjs',{}],
];
let buildAtual;
if(['publicado','complementar'].includes(modo)){const h=await fetch('https://patio-gestao-peach.vercel.app/health.json?qa='+Date.now()).then(r=>r.json());buildAtual=h.build;await writeFile(resolve(root,'build-publicado.json'),JSON.stringify({build:h.build,verificadoEm:new Date().toISOString()},null,2));}
const resultados=[];
for(const [nome,arquivo,opcoes]of tarefas){
 if(process.env.QA_TAREFAS&&!process.env.QA_TAREFAS.split('|').includes(nome))continue;
 const pasta=resolve(root,nome);await mkdir(pasta,{recursive:true});
 const env={...process.env,QA_OUTPUT:pasta,QA_FASE:'depois-regressao',QA_FIXTURE_BUILD:resolve(root,'fixtures-build')};
 for(const k of ['QA_PERFIS','QA_COMPLETO','QA_PRONTO','QA_RAPIDO','QA_DIRETO','QA_REMEDIR_BUSCA','QA_PERFIL'])delete env[k];
 if(buildAtual)env.QA_EXPECTED_BUILD=buildAtual;Object.assign(env,opcoes);
 let log='';const inicio=Date.now();const codigo=await new Promise(ok=>{const p=spawn(process.execPath,[arquivo],{env,windowsHide:true});p.stdout.on('data',b=>{log+=b;process.stdout.write(b)});p.stderr.on('data',b=>{log+=b;process.stderr.write(b)});p.on('error',e=>{log+=e.stack;ok(1)});p.on('exit',ok)});
 await writeFile(resolve(pasta,'execucao.log'),log);let arquivoResultado='resultados.json',dados;
 for(const n of ['resultados.json','interface.json','resultado.json','resumo.json'])try{dados=JSON.parse(await readFile(resolve(pasta,n),'utf8'));arquivoResultado=n;break}catch{}
 resultados.push({nome,script:arquivo,codigo,ok:codigo===0&&!!dados&&dados.ok!==false,segundos:(Date.now()-inicio)/1000,resultado:nome+'/'+arquivoResultado,log:nome+'/execucao.log'});
 await writeFile(resolve(root,'execucoes-'+modo+(process.env.QA_TAREFAS?'-reteste':'')+'.json'),JSON.stringify({geradoEm:new Date().toISOString(),modo,build:buildAtual,resultados},null,2));
 console.log(codigo===0?'CONCLUÍDO':'FALHOU',nome);
}
if(resultados.some(r=>!r.ok))process.exitCode=1;
