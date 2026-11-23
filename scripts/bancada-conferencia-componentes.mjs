import {spawn} from 'node:child_process';import{readFile,writeFile,mkdir,readdir}from'node:fs/promises';import{resolve}from'node:path';
export const suites=[
 'verificar-pagamento-entrega','bancada-documentos-offline','verificar-calendario-layout',
 'verificar-agendamento-separado','verificar-financeiro-estoque','verificar-produtividade-equipe',
 'verificar-analises-gerenciais','verificar-custos-itens','verificar-recebimento-pedido',
 'verificar-logistica-estoque','verificar-estoque-complementar','verificar-suprimentos',
 'verificar-qualidade-avancada','verificar-dados-seguranca','verificar-contas-mensais-servicos',
 'verificar-conta-ficha','verificar-tabela-precos','verificar-desconto','verificar-orcamento-layout',
 'bancada-design-orcamentos','verificar-laudos','verificar-simplicidade','verificar-atalhos-historico',
 'conferir-dialogos-desempenho','conferir-pecas-desempenho','conferir-rastreabilidade-desempenho',
 'bancada-offline-unificado','bancada-offline-navegador','verificar-financeiro-detalhe','verificar-garantias-interface','verificar-garantias-auto',
];
const out=resolve(process.env.QA_BANCADA_OUTPUT||'output/conferencia-final-20261111/bancadas');await mkdir(out,{recursive:true});
const resultados=[];const filtros=process.env.QA_SUITES?.split(',');
const ultima=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().at(-1).slice(0,14);
for(const nome of suites.filter(n=>!filtros||filtros.includes(n))){
 const pasta=resolve(out,nome);await mkdir(pasta,{recursive:true});const inicio=Date.now();
 const r=await new Promise(ok=>{const proc=spawn(process.execPath,['scripts/'+nome+'.mjs'],{windowsHide:true,env:{...process.env,QA_OUTPUT:pasta,QA_COVERAGE_FILE:resolve(pasta,'cobertura.json'),PLAYWRIGHT_BROWSER:'C:/Program Files/Google/Chrome/Application/chrome.exe',DB_VALIDATION_RUNTIME:resolve('node_modules/@electric-sql/pglite/dist/index.js'),DB_VALIDATION_MIGRATION_LIMIT:ultima},stdio:['ignore','pipe','pipe']});let log='',timeout=false;const timer=setTimeout(()=>{timeout=true;proc.kill();},Number(process.env.QA_BANCADA_TIMEOUT||1800000));proc.stdout.on('data',d=>log+=d);proc.stderr.on('data',d=>log+=d);proc.on('error',e=>log+=e.message);proc.on('close',async code=>{clearTimeout(timer);await writeFile(resolve(pasta,'execucao.log'),log);ok({nome,inicio:new Date(inicio).toISOString(),duracaoMs:Date.now()-inicio,ok:code===0&&!timeout,code,timeout});});});
 resultados.push(r);await writeFile(resolve(out,'resultados.json'),JSON.stringify({migracao:ultima,resultados},null,2));console.log(JSON.stringify(r));
}
if(resultados.some(r=>!r.ok))process.exitCode=1;
