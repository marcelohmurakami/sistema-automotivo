import {readFile,writeFile} from 'node:fs/promises';
import postcss from 'postcss';
for(const [path,escopo] of [['src/pages/Gestao.css','.gestao-pagina'],['src/components/RelatoriosGestao.css','.gestao-detalhes']]){
 const root=postcss.parse(await readFile(path,'utf8'));
 root.walkRules(rule=>{rule.selectors=rule.selectors.map(s=>s.includes(escopo)?s:`:where(${escopo}) `+s)});
 await writeFile(path,root.toString());
}
