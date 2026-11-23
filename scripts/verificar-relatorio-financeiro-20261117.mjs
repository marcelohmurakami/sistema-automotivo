import assert from 'node:assert/strict';
import {readFile,access,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const root=resolve('output/financeiro-velocidade-20261117');
const ler=async fase=>JSON.parse(await readFile(resolve(root,fase,'resultados.json'),'utf8'));
const antes=await ler('antes-26'),depois=await ler('depois-otimizado-26'),reteste=await ler('reteste-otimizado');
const complemento=reteste.resultados.filter(r=>!depois.resultados.some(x=>x.perfil===r.perfil&&x.mobile===r.mobile&&x.nome===r.nome));
assert.equal(antes.resultados.length,1040);assert.equal(depois.resultados.length+complemento.length,1040);assert(complemento.length>0);
for(const rows of [antes.resultados,[...depois.resultados,...complemento]]){
 assert.equal(new Set(rows.map(x=>x.perfil)).size,26);
 for(const perfil of new Set(rows.map(x=>x.perfil)))for(const mobile of [false,true]){
  const caso=rows.filter(x=>x.perfil===perfil&&x.mobile===mobile);assert.equal(caso.length,20);assert.equal(new Set(caso.map(x=>x.nome)).size,20);
 }
}
assert(depois.falhas.length>0);assert(depois.falhas.every(f=>f.etapa==='Criar conta mensal variável'&&f.errosNavegador.length===0));const intermediaria=await ler('depois-final-26');assert.equal(intermediaria.falhas.length,1);
const cobertura=[];
for(const [fase,casos,medidas] of [['antes-26',52,1040],['depois-otimizado-26',52,depois.resultados.length],['reteste-otimizado',depois.falhas.length,depois.falhas.length*20],['mensais-reproducao',2,4],['mensais-corrigidos-26',52,260],['reteste-retifica',2,40],['aberturas-diagnostico',24,24],['controle-antes',8,48],['controle-depois-final',8,48],['cache-depois-final',8,8],['consultas-depois',52,592],['totais-depois',52,312],...['alternado-antes-1','alternado-depois-1','alternado-depois-2','alternado-antes-2'].map(f=>[f,8,24])]){
 const d=await ler(fase);assert.equal(d.limpeza.length,casos,fase);assert(d.limpeza.every(x=>x.ok),fase);assert.equal(d.resultados.length,medidas,fase);if(fase!=='depois-otimizado-26')assert.equal(d.falhas.length,0,fase);
 cobertura.push({fase,casos,medidas,falhas:d.falhas.length,encerramentosConferidos:true});
}
assert.equal((await ler('totais-depois')).verificacoes.filter(x=>x.nome.startsWith('Total do histórico confere com resumo:')).length,312);
for(const arquivo of JSON.parse(await readFile(resolve(root,'arquivos-alterados.json'),'utf8'))){
 assert.equal(createHash('sha256').update(await readFile(arquivo.arquivo)).digest('hex'),arquivo.depoisSha256,arquivo.arquivo);
}
const html=await readFile(resolve(root,'relatorio.html'),'utf8');
assert(!/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|"(?:access_token|refresh_token|senha|password)"\s*:/i.test(html));
const links=[...new Set([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]))];
for(const link of links){assert(!/^https?:/.test(link));await access(resolve(root,link));}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const visual=[];
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const p=await browser.newPage({viewport});await p.goto(pathToFileURL(resolve(root,'relatorio.html')).href);
 assert.equal(await p.locator('h1').count(),1);assert.equal(await p.locator('img').count(),3);
 assert(await p.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)));
 const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert(overflow<=2,'Relatório ultrapassa a tela: '+overflow);
 const imagem='relatorio-'+viewport.width+'.png';await p.screenshot({path:resolve(root,imagem)});visual.push({largura:viewport.width,overflow,imagem});
 if(viewport.width===1440){await p.getByRole('heading',{name:'Comparação dos 20 processos nos 26 subsistemas',exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:resolve(root,'relatorio-comparacao.png')});}
 await p.close();
}}finally{await browser.close();}
await writeFile(resolve(root,'verificacao-entrega.json'),JSON.stringify({geradoEm:new Date().toISOString(),cobertura,totaisConferidos:312,linksConferidos:links.length,hashesFonteConferidos:8,visual},null,2));
console.log(JSON.stringify({cobertura,linksConferidos:links.length,visual},null,2));
