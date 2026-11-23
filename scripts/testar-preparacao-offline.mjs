import assert from 'node:assert/strict';import {test} from 'node:test';import {readFile} from 'node:fs/promises';import ts from 'typescript';
let numero=0;
async function carregar(dependencias){
 const fonte=await readFile('src/services/prepararOffline.ts','utf8');
 const js=ts.transpileModule(fonte,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const imports=js.match(/^import[^;]+;\s*/gm);assert.equal(imports.length,4,'A bancada substitui somente as quatro dependências externas conhecidas');
 const chave='__qaPreparo'+numero++;globalThis[chave]=dependencias;
 try{return await import('data:text/javascript;base64,'+Buffer.from(`const {rpc,guardarBase,baixarBaseOffline,consultarIdentidade}=globalThis[${JSON.stringify(chave)}];\n`+js.replace(/^import[^;]+;\s*/gm,'')).toString('base64'))}finally{delete globalThis[chave]}
}
const adiar=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise}};
test('preparação inicia leituras independentes juntas e grava somente depois das páginas completas',async()=>{
 const aux=adiar(),identidade=adiar(),pagina=adiar(),iniciados=[],salvos=[],cursores=[];
 const {prepararNovosAtendimentos}=await carregar({baixarBaseOffline:async()=>{iniciados.push('catalogo');return aux.promise},consultarIdentidade:async()=>{iniciados.push('identidade');return identidade.promise},rpc:async(n,p)=>{assert.equal(n,'pagina_servicos');iniciados.push('objetos');cursores.push(p.p_apos);return p.p_apos?{objetos:[{id:'b'}],proximo:null}:pagina.promise},guardarBase:async b=>salvos.push(b)});
 const p=prepararNovosAtendimentos('usuario',{id:'empresa',nome:'Empresa',ramo:'assistencia_tecnica',especialidade:'assistencia_celulares'});
 assert.deepEqual(iniciados,['catalogo','identidade','objetos']);assert.equal(salvos.length,0);
 pagina.resolve({objetos:[{id:'a'}],proximo:{nome:'A',id:'a'}});aux.resolve({catalogo:[{id:'peca'}]});await Promise.resolve();assert.equal(salvos.length,0);
 identidade.resolve({nome:'Empresa'});await p;assert.equal(salvos.length,1);assert.deepEqual(salvos[0].objetos,[{id:'a'},{id:'b'}]);assert.deepEqual(cursores,[null,{nome:'A',id:'a'}]);assert.equal(salvos[0].id,'usuario:empresa');assert.equal(salvos[0].aux.catalogo[0].id,'peca');
});
test('falha de uma página preserva a base anterior sem gravar download parcial',async()=>{
 const salvos=[];const {prepararNovosAtendimentos}=await carregar({baixarBaseOffline:async()=>({}),consultarIdentidade:async()=>({}),rpc:async(n,p)=>{if(p.p_apos)throw Error('Rede interrompida');return{objetos:[{id:'a'}],proximo:{nome:'A',id:'a'}}},guardarBase:async b=>salvos.push(b)});
 await assert.rejects(prepararNovosAtendimentos('u',{id:'e',nome:'Empresa',ramo:'limpeza'}),/Rede interrompida/);assert.deepEqual(salvos,[]);
});
test('automotivo mantém a base de veículos e não consulta objetos de outros ramos',async()=>{
 const salvos=[];const {prepararNovosAtendimentos}=await carregar({baixarBaseOffline:async()=>({veiculos:[{id:'v'}]}),consultarIdentidade:async()=>({nome:'Oficina'}),rpc:async()=>{throw Error('Consulta indevida')},guardarBase:async b=>salvos.push(b)});
 await prepararNovosAtendimentos('u',{id:'e',nome:'Oficina',ramo:'automotivo'});assert.equal(salvos.length,1);assert.deepEqual(salvos[0].objetos,[]);assert.equal(salvos[0].aux.veiculos[0].id,'v');
});
