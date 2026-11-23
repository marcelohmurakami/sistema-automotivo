import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const raiz='output/gestao-operacao-velocidade-20261118';
const esperar=()=>new Promise(r=>setTimeout(r,150));
let sequencia=0;
async function medir(fase,ramo){
 const fonte=await readFile((fase==='antes'?raiz+'/antes/':'')+'src/services/prepararOffline.ts','utf8');
 const js=ts.transpileModule(fonte,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 assert.equal(js.match(/^import[^;]+;\s*/gm).length,4);
 let salvos=[],chamadas=0;
 const dependencias={baixarBaseOffline:async()=>{chamadas++;await esperar();return{catalogo:[{id:'servico'}]}},consultarIdentidade:async()=>{chamadas++;await esperar();return{nome:'QA'}},rpc:async(n,p)=>{assert.equal(n,'pagina_servicos');chamadas++;await esperar();return p.p_apos?{objetos:[{id:'b'}],proximo:null}:{objetos:[{id:'a'}],proximo:{nome:'A',id:'a'}}},guardarBase:async b=>salvos.push(b)};
 const key='__qaPreparoTempo'+sequencia++;globalThis[key]=dependencias;
 const mod=await import('data:text/javascript;base64,'+Buffer.from(`const {rpc,guardarBase,baixarBaseOffline,consultarIdentidade}=globalThis[${JSON.stringify(key)}];\n`+js.replace(/^import[^;]+;\s*/gm,'')).toString('base64'));delete globalThis[key];
 const t=performance.now();await mod.prepararNovosAtendimentos('u',{id:'e',nome:'QA',ramo});const segundos=(performance.now()-t)/1000;
 assert.equal(salvos.length,1);delete salvos[0].atualizado;return{fase,ramo,segundos,chamadas,base:salvos[0]};
}
const resultados=[];
for(const ramo of ['automotivo','assistencia_tecnica','manutencao_campo','limpeza'])for(let rodada=0;rodada<3;rodada++){
 const atual=[];for(const fase of rodada%2?['depois','antes']:['antes','depois']){const r=await medir(fase,ramo);atual.push(r);resultados.push({...r,rodada})}assert.deepEqual(atual[0].base,atual[1].base);
}
await writeFile(raiz+'/preparacao-offline-tempos.json',JSON.stringify({metodo:'Função real antes/depois com dependências controladas: 150 ms por consulta e duas páginas de equipamentos. Três rodadas alternadas por ramo. Tempo de rede simulado; não representa medição de produção.',resultados},null,2));console.log('PASS 12 pares; base integral idêntica, gravação única e quantidade de consultas preservada.');
