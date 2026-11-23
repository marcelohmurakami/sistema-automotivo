import {readFile,readdir} from 'node:fs/promises';
export const root='output/regressao-assistencia-manutencao-limpeza-20261116';
export async function lerRodadas(){
 const dirs=['assistencia','manutencao','limpeza'];
 try{for(const d of await readdir(root+'/retestes',{withFileTypes:true}))if(d.isDirectory()){dirs.push('retestes/'+d.name+'/tentativa-inicial');dirs.push('retestes/'+d.name)}}catch{}
 const r=[];for(const dir of dirs)try{const j=JSON.parse(await readFile(`${root}/${dir}/resultados.json`,'utf8'));r.push({...j,pasta:dir})}catch{}
 return r;
}
export async function matrizConcluida(){
 const r=await lerRodadas(),docs=new Map();
 for(const j of r)for(const d of j.documentos.filter(d=>d.pdf))docs.set(`${d.perfil}-${d.width}-${d.caso}`,{...d,pasta:j.pasta});
 return [...docs.values()];
}
