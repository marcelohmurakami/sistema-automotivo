import {readFile,writeFile} from 'node:fs/promises';
const out='output/desempenho-20261111';
const med=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
const fases={};
for(const f of ['antes','depois'])fases[f]=(await Promise.all([1,2,3].map(i=>readFile(`${out}/navegador-${f}-${i}.json`,'utf8').then(JSON.parse)))).flatMap(r=>r.resultados);
const linhas=[];
for(const b of fases.antes.slice(0,36)){
 const resumo=f=>{const rs=fases[f].filter(r=>r.perfil===b.perfil&&r.rota===b.rota);return {ms:med(rs.map(r=>r.tempoMs)),minMs:Math.min(...rs.map(r=>r.tempoMs)),maxMs:Math.max(...rs.map(r=>r.tempoMs)),javascript:med(rs.map(r=>r.recursos.filter(x=>x.url.endsWith('.js')).reduce((s,x)=>s+x.bytes,0))),javascriptTransferido:med(rs.map(r=>r.recursos.filter(x=>x.url.endsWith('.js')).reduce((s,x)=>s+(x.transferencia||0),0))),arquivosJavaScriptBaixados:med(rs.map(r=>r.recursos.filter(x=>x.url.endsWith('.js')&&x.transferencia>0).length)),bloqueioMs:med(rs.map(r=>r.tarefasLongas.reduce((s,x)=>s+Math.max(0,x.duration-50),0))),consultas:med(rs.map(r=>r.consultas.length)),dom:med(rs.map(r=>r.dom)),ok:rs.every(r=>r.ok&&!r.erros.length&&!r.overflow)};};
 const antes=resumo('antes'),depois=resumo('depois');linhas.push({perfil:b.perfil,rota:b.rota,antes,depois,reducaoPercentual:Math.round((1-depois.ms/antes.ms)*1000)/10});
}
await writeFile(`${out}/comparacao.json`,JSON.stringify({execucoes:216,linhas},null,2));
console.table(linhas.map(x=>({perfil:x.perfil,rota:x.rota,antes:x.antes.ms,depois:x.depois.ms,ganho:x.reducaoPercentual,jsAntes:x.antes.javascript,jsDepois:x.depois.javascript,bloqAntes:Math.round(x.antes.bloqueioMs),bloqDepois:Math.round(x.depois.bloqueioMs)})));
