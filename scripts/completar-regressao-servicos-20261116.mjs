import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root='output/regressao-assistencia-manutencao-limpeza-20261116';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo!=='automotivo');
const grupos={assistencia_tecnica:'assistencia',manutencao_campo:'manutencao',limpeza:'limpeza'};
const anteriores=await Promise.all(Object.values(grupos).map(async g=>JSON.parse(await readFile(`${root}/${g}/resultados.json`,'utf8'))));
const completos=anteriores.flatMap(j=>j.documentos.filter(d=>d.pdf));
const pasta=root+'/retestes';await mkdir(pasta,{recursive:true});const r=[];
for(const c of contas)for(const width of [1920,390]){
 if(completos.filter(d=>d.perfil===c.especialidade&&d.width===width).length===4)continue;
 const out=pasta+'/'+c.especialidade+'-'+width;
 try{const old=JSON.parse(await readFile(out+'/resultados.json','utf8'));if(old.ok&&old.documentos.filter(d=>d.pdf).length===4){r.push({perfil:c.especialidade,width,ok:true,reutilizado:true});continue}}catch{}
 console.log('INICIO SEQUENCIAL',c.especialidade,width);
 const codigo=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/regressao-servicos-publicado-20261116.mjs'],{env:{...process.env,QA_PERFIS:c.especialidade,QA_TELAS:String(width),QA_OUTPUT:out},stdio:'inherit'});p.on('error',reject);p.on('exit',resolve)});
 r.push({perfil:c.especialidade,width,ok:codigo===0});await writeFile(pasta+'/resumo.json',JSON.stringify(r,null,2));
 if(r.slice(-2).length===2&&r.slice(-2).every(x=>!x.ok)){console.log('Interrompido após duas falhas sequenciais para investigar');break}
}
