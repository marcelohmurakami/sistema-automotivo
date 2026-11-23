import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
import {chromium} from './lib/chrome-conferencia.mjs';
const out='output/revisao-integral-20261119/tema-gestao';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
const caminhos=['src/pages/Gestao.css','src/components/RelatoriosGestao.css'];
try{
 for(const width of [1920,390]){
  const p=await browser.newPage({viewport:{width,height:900}});
  for(const versao of ['antes','depois']){
   const css=await Promise.all(caminhos.map(c=>readFile(versao==='antes'?'output/revisao-integral-20261119/antes/'+c:c,'utf8')));
   const html='<main class="gestao-pagina"><header class="gestao-cabecalho"><h2>Configurações</h2></header><p class="gestao-vazio">Nenhuma ocorrência</p></main><section class="gestao-detalhes"><header class="gestao-cabecalho"><h2>Relatórios</h2></header><p class="gestao-vazio">Sem registros para estes filtros</p></section>';
   const medir=async(ordem)=>{await p.setContent(html);for(const i of ordem)await p.addStyleTag({content:css[i]});return p.evaluate(()=>[...document.querySelectorAll('.gestao-cabecalho,.gestao-cabecalho h2,.gestao-vazio')].map(el=>{const s=getComputedStyle(el);return Object.fromEntries(['display','padding','margin','gap','flexWrap','flexDirection','alignItems','justifyContent','fontSize','textAlign'].map(k=>[k,s[k]]))}))};
   const a=await medir([0,1]),b=await medir([1,0]);const igual=JSON.stringify(a)===JSON.stringify(b);
   if(versao==='antes')assert.equal(igual,false,'Reproduzir colisão original');else assert.equal(igual,true,'Navegação não pode mudar aparência de outro módulo');
   resultados.push({width,versao,caso:'Carregar CSS de histórico/configurações e relatórios em ordem inversa',aparenciaIndependeDaOrdem:igual});
  }
  await p.close();
 }
 for(const versao of ['antes','depois']){
  const entrada=versao==='antes'?'output/revisao-integral-20261119/antes/src/lib/tema.ts':'src/lib/tema.ts';
  const fonte=await readFile(entrada,'utf8');
  const pacote=ts.transpileModule(fonte,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const p=await browser.newPage();
  // Documento isolado; nunca deixa o site ou a rede determinar o resultado.
  await p.setContent('<html><body>Teste de aparência</body></html>');
  await p.evaluate(()=>{const armazenamento=new Map([['patio_tema','claro']]);window.qaTema={armazenamento,bloqueado:true,media:new EventTarget()};Object.assign(window.qaTema.media,{matches:false});window.matchMedia=()=>window.qaTema.media;Object.defineProperty(window,'localStorage',{value:{getItem:k=>armazenamento.get(k)??null,setItem(k,v){if(window.qaTema.bloqueado)throw new DOMException('Sem armazenamento','QuotaExceededError');armazenamento.set(k,v)}}});});
  await p.addScriptTag({content:`(()=>{const exports={};const require=()=>({useSyncExternalStore:(_assinar,ler)=>ler()});${pacote}\nwindow.temaQA=exports;})()`});
  const r=await p.evaluate(()=>{temaQA.definirTema('escuro');const escolhido=temaQA.useTema(),aplicado=document.documentElement.dataset.tema;qaTema.media.dispatchEvent(new Event('change'));const aposSistema=document.documentElement.dataset.tema;window.dispatchEvent(new StorageEvent('storage',{key:'outra-chave'}));const aposOutraChave=document.documentElement.dataset.tema;qaTema.armazenamento.set('patio_tema','claro');window.dispatchEvent(new StorageEvent('storage',{key:'patio_tema'}));const aposOutraAba={selecionado:temaQA.useTema(),aplicado:document.documentElement.dataset.tema};qaTema.bloqueado=false;temaQA.definirTema('escuro');return {escolhido,aplicado,aposSistema,aposOutraChave,aposOutraAba,retomouGravacao:qaTema.armazenamento.get('patio_tema')}});
  if(versao==='antes'){assert.equal(r.escolhido,'claro');assert.equal(r.aposSistema,'claro')}else{assert.equal(r.escolhido,'escuro');assert.equal(r.aposSistema,'escuro');assert.equal(r.aposOutraChave,'escuro')}
  assert.deepEqual(r.aposOutraAba,{selecionado:'claro',aplicado:'claro'});assert.equal(r.retomouGravacao,'escuro');resultados.push({versao,caso:'Quota de armazenamento, mudança de sistema e sincronização entre abas',...r});await p.close();
 }
}finally{await browser.close();await writeFile(out+'/resultado.json',JSON.stringify(resultados,null,2))}
console.log(JSON.stringify(resultados));
