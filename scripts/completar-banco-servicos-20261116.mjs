import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root='output/regressao-assistencia-manutencao-limpeza-20261116',out=root+'/banco';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo!=='automotivo');
await mkdir(out+'/tentativas-iniciais',{recursive:true});
const perfis=[];
for(const c of contas){
 let j;try{j=JSON.parse(await readFile(`${out}/${c.especialidade}.json`,'utf8'))}catch{}
 if(j?.ok)continue;
 perfis.push(c.especialidade);
 if(j)await copyFile(`${out}/${c.especialidade}.json`,`${out}/tentativas-iniciais/${c.especialidade}.json`,1).catch(e=>{if(e.code!=='EEXIST')throw e});
}
if(perfis.length){
 console.log('Retomando',perfis.join(', '));
 await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/regressao-servicos-banco-20261116.mjs'],{env:{...process.env,QA_PERFIS:perfis.join(',')},stdio:'inherit'});p.on('error',reject);p.on('exit',resolve)});
}
const res=await Promise.all(contas.map(async c=>{const j=JSON.parse(await readFile(`${out}/${c.especialidade}.json`,'utf8'));return{perfil:c.especialidade,ok:j.ok,checks:j.checks?.length,falha:j.falha}}));
await writeFile(out+'/consolidado.json',JSON.stringify({ok:res.every(x=>x.ok),resultados:res},null,2));
console.log(res.filter(x=>x.ok).length+'/'+res.length);if(res.some(x=>!x.ok))process.exitCode=1;
