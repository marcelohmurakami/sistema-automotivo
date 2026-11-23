// Inventário reproduzível de todos os componentes; não confunde análise estática com teste em navegador.
import ts from 'typescript';
import {readFile,writeFile,readdir,mkdir,cp,stat} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const out=resolve(process.env.QA_OUTPUT||'output/desempenho-20261111');
await mkdir(out,{recursive:true});
const modo=process.argv.includes('--antes')?'antes':'depois';
async function listar(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())files.push(...await listar(p));else files.push(p);}return files;}
const arquivos=(await listar('src')).filter(p=>/\.(tsx?|css)$/.test(p));
if(modo==='antes'){
 try{await stat(resolve(out,'antes.json'));throw Error('A linha de base já existe; não sobrescrever.');}catch(e){if(e.code!=='ENOENT')throw e;}
 await cp('src',resolve(out,'baseline/src'),{recursive:true});
 await cp('dist',resolve(out,'baseline/dist'),{recursive:true});
 for(const f of ['vite.config.ts','package.json','package-lock.json','index.html','vercel.json'])await cp(f,resolve(out,'baseline',f));
}
const registros=[];
for(const file of arquivos){
 const codigo=await readFile(file,'utf8'),nome=relative(process.cwd(),file).replaceAll('\\','/');
 const r={arquivo:nome,linhas:codigo.split('\n').length,bytes:Buffer.byteLength(codigo),sha256:createHash('sha256').update(codigo).digest('hex'),componentes:[],imports:[],consultas:[],efeitos:[],imagens:[],listas:0,memo:0,intervalos:[],eventos:[]};
 const ast=ts.createSourceFile(file,codigo,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const linha=n=>ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;
 function walk(n){
  if(ts.isImportDeclaration(n))r.imports.push({modulo:n.moduleSpecifier.text,tipo:!!n.importClause?.isTypeOnly,linha:linha(n)});
  if(ts.isFunctionDeclaration(n)&&n.name&&/^[A-Z]/.test(n.name.text))r.componentes.push(n.name.text);
  if(ts.isCallExpression(n)){
   const fn=n.expression.getText(ast);
   if(['useQuery','useInfiniteQuery'].includes(fn))r.consultas.push({linha:linha(n),codigo:n.getText(ast)});
   if(['useEffect','useLayoutEffect'].includes(fn))r.efeitos.push({linha:linha(n),codigo:n.getText(ast)});
   if(['useMemo','useCallback','memo'].includes(fn))r.memo++;
   if(/\.map$/.test(fn))r.listas++;
   if(/setInterval$/.test(fn))r.intervalos.push({linha:linha(n),codigo:n.getText(ast)});
   if(/addEventListener$/.test(fn))r.eventos.push({linha:linha(n),codigo:n.getText(ast).slice(0,250)});
  }
  if((ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n))&&n.tagName.getText(ast)==='img')r.imagens.push({linha:linha(n),codigo:n.getText(ast)});
  ts.forEachChild(n,walk);
 }
 if(!file.endsWith('.css'))walk(ast);
 registros.push(r);
}
const assets=[];for(const f of await listar('dist/assets')){const b=await readFile(f);assets.push({arquivo:relative(resolve('dist'),f).replaceAll('\\','/'),bytes:b.length,gzip:gzipSync(b).length});}
await writeFile(resolve(out,modo+'.json'),JSON.stringify({geradoEm:new Date().toISOString(),arquivos:registros,assets},null,2));
const componentes=registros.filter(r=>r.arquivo.endsWith('.tsx'));
console.log(JSON.stringify({fase:modo,arquivos:registros.length,arquivosTSX:componentes.length,componentes:componentes.reduce((n,r)=>n+r.componentes.length,0),consultas:registros.reduce((n,r)=>n+r.consultas.length,0),maiores:componentes.sort((a,b)=>b.bytes-a.bytes).slice(0,20).map(r=>({arquivo:r.arquivo,linhas:r.linhas,consultas:r.consultas.length})),assets:assets.sort((a,b)=>b.bytes-a.bytes).slice(0,10)},null,2));
