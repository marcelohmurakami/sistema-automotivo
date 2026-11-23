import ts from 'typescript';
import {readFileSync,writeFileSync} from 'node:fs';
const files=['src/pages/Compras.tsx','src/pages/Historico.tsx','src/pages/HistoricoImportado.tsx','src/pages/Notinhas.tsx','src/pages/MeuSite.tsx','src/components/AnexosImportados.tsx','src/components/SelecaoTitular.tsx','src/components/DetalhesAtendimento.tsx','src/components/EtapasExecucao.tsx'];
const manifest=[];
for(const file of files){
 let s=readFileSync(file,'utf8'), sf=ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],n=0;
 function walk(node){
  if(ts.isCallExpression(node)&&node.expression.getText(sf)==='useQuery'){
   const ids=[];function scan(v){if(ts.isIdentifier(v)&&/^busca(?:Fornecedor|Peca)?$/.test(v.text)&&!(ts.isPropertyAccessExpression(v.parent)&&v.parent.name===v))ids.push(v);ts.forEachChild(v,scan);}scan(node);
   if(ids.length){let statement=node;while(statement.parent&&!ts.isVariableStatement(statement))statement=statement.parent;if(!ts.isVariableStatement(statement))throw Error(file);
    const names=[...new Set(ids.map(i=>i.text))],map=Object.fromEntries(names.map(x=>[x,`termoConsulta${++n}`]));
    for(const id of ids)edits.push({start:id.getStart(sf),end:id.end,text:ts.isShorthandPropertyAssignment(id.parent)?`${id.text}: ${map[id.text]}`:map[id.text]});
    edits.push({start:statement.getStart(sf),end:statement.getStart(sf),text:names.map(x=>`const ${map[x]} = useBuscaDebounced(${x});\n  `).join('')});manifest.push({arquivo:file,consultas:names,linha:sf.getLineAndCharacterOfPosition(node.pos).line+1});
   }
  }ts.forEachChild(node,walk);
 }walk(sf);
 if(!edits.length)continue;
 for(const e of edits.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);
 if(!s.includes('import { useBuscaDebounced }'))s=`import { useBuscaDebounced } from "../lib/useBuscaDebounced";\n`+s;
 writeFileSync(file,s);
}
writeFileSync('output/desempenho-20261111/buscas-otimizadas.json',JSON.stringify(manifest,null,2));
