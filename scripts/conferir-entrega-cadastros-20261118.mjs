import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('output/cadastros-compras-velocidade-20261118');
const ler=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const verificacoes=[];
for(const fase of ['antes','final-consolidado']){
 const x=await ler(fase+'/resultados.json');
 assert.equal(x.resultados.length,1144);assert.equal(x.verificacoes.length,1144);assert.equal(x.limpeza.length,52);assert.deepEqual(x.falhas,[]);assert(x.limpeza.every(x=>x.ok&&x.saldoFinal===0));
 assert.equal(new Set(x.resultados.map(x=>[x.perfil,x.mobile,x.nome].join('|'))).size,1144);
 assert.equal(new Set(x.resultados.map(x=>x.perfil)).size,26);
 verificacoes.push({nome:fase,medicoes:1144,jornadas:52,saldoFinalZero:true});
}
const consulta=await ler('consultas-consolidadas/resultados.json');assert.equal(consulta.resultados.length,1040);assert.deepEqual(consulta.falhas,[]);
assert.equal(new Set(consulta.resultados.map(x=>[x.perfil,x.mobile,x.fase,x.modulo,x.processo].join('|'))).size,1040);
verificacoes.push({nome:'consultas em pares',medicoes:1040});
const cancelamento=await ler('cancelamento-consolidado/resultados.json');assert.equal(cancelamento.limpeza.length,52);assert.equal(cancelamento.resultados.length,156);assert.deepEqual(cancelamento.falhas,[]);assert(cancelamento.limpeza.every(x=>x.ok));assert.equal(new Set(cancelamento.resultados.map(x=>x.perfil)).size,26);verificacoes.push({nome:'cancelamento com atraso controlado',jornadas:52,medicoes:156});
for(const[p,n]of [['adversos-final-valido-26',338],['layout-completo-26',624]]){const x=await ler(p+'/resultados.json');assert.equal(x.resultados.length,n);assert.deepEqual(x.falhas,[]);assert.deepEqual(x.erros,[]);assert(x.resultados.every(x=>x.ok));verificacoes.push({nome:p,verificacoes:n})}
const cache=await ler('cache-depois-26/resultados.json'),reteste=await ler('cache-depois-mecanica-reteste/resultados.json');assert.equal(cache.resultados.length+reteste.resultados.length,26);assert.deepEqual(reteste.falhas,[]);assert([...cache.resultados,...reteste.resultados].every(x=>x.consultas===1));
verificacoes.push({nome:'cache confirmado por perfil',verificacoes:26});
const entrega=await ler('validacao-entrega/resultados.json');assert.equal(entrega.resultados.length,88);assert.equal(entrega.limpeza.length,4);assert.deepEqual(entrega.falhas,[]);assert(entrega.limpeza.every(x=>x.ok));
verificacoes.push({nome:'build de entrega',jornadas:4,medicoes:88});
for(const[p,n]of [['suprimentos-interface',214],['contas-servicos-reteste',172],['tabela-precos',24]]){const x=await ler('regressao/'+p+'/interface.json');assert.equal(x.resultados.length,n);assert.deepEqual(x.errors||x.erros,[]);verificacoes.push({nome:p,verificacoes:n})}
for(const p of ['regressao/validate-contas-mensais-catalogo/banco.json','regressao/validate-suprimentos/banco.json','regressao/validate-localizacao-etiquetas/banco.json']){const x=await ler(p);assert(x.ok!==false);verificacoes.push({nome:p,lido:true})}
const html=await readFile(resolve(root,'relatorio.html'),'utf8'),links=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(x=>x[1]).filter(x=>!/^https?:|^#|^data:/.test(x));for(const link of links)assert((await stat(resolve(root,link))).isFile(),link);
const revisao=await ler('revisao-relatorio.json');assert(revisao.every(x=>x.paginaSemExcesso&&x.imagensCarregadas));
await writeFile(resolve(root,'conferencia-final.json'),JSON.stringify({geradoEm:new Date().toISOString(),ok:true,verificacoes,linksConferidos:new Set(links).size,limites:'Não publicado; Chrome móvel emulado; banco conectado apenas em empresas fictícias. Picos e execuções interrompidas estão preservados no relatório.'},null,2));
console.log(JSON.stringify({ok:true,verificacoes:verificacoes.length,linksConferidos:new Set(links).size}));
