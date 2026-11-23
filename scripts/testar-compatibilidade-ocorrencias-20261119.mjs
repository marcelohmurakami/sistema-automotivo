import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
const fonte=await readFile('src/services/ocorrenciasServicos.ts','utf8');
const semImports=fonte.replace(/^import[\s\S]*?from ["'][^"']+["'];\r?\n/gm,'');
const codigo=ts.transpileModule(semImports,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('export async function','async function');
const resultados=[];const caso=async(nome,fn)=>{await fn();resultados.push({nome,ok:true})};
let agora=1000;
function montar(resposta){const chamadas=[];const novo=new Function('rpc','consultarRelatoriosServicos','validarPeriodoServicos','Date',codigo+';return consultarOcorrenciasServicos;')(async(n,args,signal)=>{chamadas.push({tipo:'novo',n,args,signal});return resposta()},async(...args)=>{chamadas.push({tipo:'legado',args});return {qualidade:[{id:'legado'}]}},(i,f)=>{if(!i||!f||i>f)throw Error('Período inválido')},{now:()=>agora});return {novo,chamadas};}
await caso('Endpoint novo retorna ocorrências sem carregar o relatório',async()=>{const m=montar(()=>[{id:'atual'}]),s=new AbortController().signal;assert.deepEqual(await m.novo(false,'empresa','2026-11-01','2026-11-19',s),[{id:'atual'}]);assert.equal(m.chamadas.length,1);assert.equal(m.chamadas[0].signal,s)});
await caso('Endpoint ausente usa compatibilidade e tenta novamente após 5 minutos',async()=>{const m=montar(()=>{throw {code:'PGRST202'}});assert.deepEqual(await m.novo(false,'empresa','2026-11-01','2026-11-19'),[{id:'legado'}]);await m.novo(false,'outra','2026-11-01','2026-11-19');assert.equal(m.chamadas.filter(c=>c.tipo==='novo').length,1);assert.equal(m.chamadas.at(-1).args[1],'outra');agora+=300001;await m.novo(false,'empresa','2026-11-01','2026-11-19');assert.equal(m.chamadas.filter(c=>c.tipo==='novo').length,2)});
for(const code of ['42501','PT403','22023','57014','PGRST301'])await caso(code+' não dispara consulta alternativa',async()=>{const m=montar(()=>{throw {code}});await assert.rejects(m.novo(false,'empresa','2026-11-01','2026-11-19'),e=>e.code===code);assert.equal(m.chamadas.length,1)});
await caso('Falha de rede não dispara outra requisição',async()=>{const m=montar(()=>{throw new TypeError('Failed to fetch')});await assert.rejects(m.novo(false,'empresa','2026-11-01','2026-11-19'));assert.equal(m.chamadas.length,1)});
await caso('Período inválido falha antes da rede',async()=>{const m=montar(()=>[]);await assert.rejects(m.novo(false,'empresa','',''));assert.equal(m.chamadas.length,0)});
await caso('Demonstração continua sem chamada de rede',async()=>{const m=montar(()=>{throw Error('Não deve consultar')});await m.novo(true,'demo','2026-11-01','2026-11-19');assert.deepEqual(m.chamadas.map(c=>c.tipo),['legado'])});
await writeFile('output/picos-51-20261119/compatibilidade.json',JSON.stringify({ok:true,resultados},null,2));console.log('PASS',resultados.length);
