import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const pasta='output/operacao-simplificada-20261104';
const ler=async p=>JSON.parse(await readFile(p,'utf8'));
const pacote=await ler(pasta+'/pacote-publicacao.json'),banco=await ler(pasta+'/publicado-banco.json');
assert(banco.ok&&banco.empresas===26);
const log=await readFile(pasta+'/deploy.log','utf8');
const deploy=JSON.parse(log.slice(log.indexOf('{'))).deployment;
assert.equal(deploy.readyState,'READY');
assert.equal(deploy.productionUrl,'https://patio-gestao-peach.vercel.app');
const sha=b=>createHash('sha256').update(b).digest('hex');
const get=async path=>{const r=await fetch(deploy.productionUrl+path,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path);return r;};
const health=await (await get('/health.json?validacao='+Date.now())).json();assert.equal(health.build,pacote.build);
const arquivos=['index.html','sw.js',...pacote.arquivos.filter(x=>/\.(js|css)$/.test(x.arquivo)).map(x=>x.arquivo)];
for(let i=0;i<arquivos.length;i+=6){await Promise.all(arquivos.slice(i,i+6).map(async arquivo=>{
 const response=await get('/'+arquivo);const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(sha(bytes),sha(await readFile(resolve(pacote.destino,arquivo))),arquivo+' diverge');
}));}
const publicacao={publicado:true,data:new Date().toISOString(),url:deploy.productionUrl,build:health.build,deployment:deploy.id,migracoes:['20261103185805','20261104112413','20261104113110'],arquivosConferidos:arquivos.length,consultasBanco:banco.verificacoes,empresas:26};
await writeFile(pasta+'/publicacao.json',JSON.stringify(publicacao,null,2));
const resumo=await ler(pasta+'/resumo.json');await writeFile(pasta+'/resumo.json',JSON.stringify({...resumo,publicado:true,publicacao},null,2));
let relatorio=await readFile(pasta+'/relatorio.html','utf8');
relatorio=relatorio.replace('Operação simplificada — validação local','Operação simplificada — publicação verificada').replace('<p class="status"><strong>Implementação e validação locais concluídas.</strong><br>Este relatório não comprova publicação. As alterações de banco e frontend desta entrega ainda não foram aplicadas ao site publicado.</p>',`<p class="status"><strong>Publicado e conferido em 04/11/2026.</strong><br>As três migrações foram aplicadas e o frontend publicado em <a href="${publicacao.url}">Pátio Gestão</a>. A identificação do build e ${arquivos.length} arquivos servidos foram conferidos. ${banco.verificacoes} consultas no banco publicado passaram nas 26 empresas fictícias.</p>`);
relatorio=relatorio.replace(/<h2>Publicação pendente<\/h2>[\s\S]*?<\/main>/,`<h2>Publicação conferida</h2><p>Migrações 20261103185805, 20261104112413 e 20261104113110 aplicadas. A conferência posterior consultou lucro, compras e garantia nas empresas fictícias, sem criar pagamentos. Os testes de gravação, recebimento, estorno e conflito descritos acima foram realizados na bancada local isolada.</p><p><a href="publicacao.json">Identificação da versão e arquivos publicados</a> · <a href="publicado-banco.json">Consultas após aplicação</a></p></main>`);
await writeFile(pasta+'/relatorio.html',relatorio);console.log(JSON.stringify(publicacao));
