import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const raiz='output/picos-51-20261119';
const j=JSON.parse(await readFile(`${raiz}/controle-pintura/resultados.json`,'utf8'));
assert.equal(j.resultados.length,414);assert.deepEqual(j.falhas,[]);
const offline=j.resultados.filter(r=>r.nome==='Offline'),originais=j.resultados.filter(r=>r.nome!=='Offline');
assert.equal(offline.length,312);assert.equal(originais.length,102);
const med=xs=>{const s=xs.toSorted((a,b)=>a-b);return (s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2};
const stats=xs=>({n:xs.length,mediana:med(xs),p95:xs.toSorted((a,b)=>a-b)[Math.ceil(xs.length*.95)-1],maximo:Math.max(...xs)});
const pares=[];
for(const perfil of new Set(offline.map(r=>r.perfil)))for(const mobile of [false,true]) {
  const linhas=offline.filter(r=>r.perfil===perfil&&r.mobile===mobile);
  const antes=stats(linhas.filter(r=>r.fase==='antes').map(r=>r.segundos));
  const depois=stats(linhas.filter(r=>r.fase==='depois').map(r=>r.segundos));
  assert.equal(antes.n,3);assert.equal(depois.n,3);
  pares.push({perfil,dispositivo:mobile?'celular':'desktop',antes,depois,diferencaS:depois.mediana-antes.mediana});
}
const resumo= [false,true].map(mobile=>({dispositivo:mobile?'celular':'desktop',antes:stats(offline.filter(r=>r.mobile===mobile&&r.fase==='antes').map(r=>r.segundos)),depois:stats(offline.filter(r=>r.mobile===mobile&&r.fase==='depois').map(r=>r.segundos))}));
const resultado={metodo:j.metodo,amostras:j.resultados.length,casosOriginais:originais.length,amostrasOffline:offline.length,paresOffline:pares.length,offlineMaisRapidos:pares.filter(p=>p.diferencaS<0).length,offlineMaisLentos:pares.filter(p=>p.diferencaS>0).length,resumoOffline:resumo,comparacoesOffline:pares};
await writeFile(`${raiz}/resumo-controle.json`,JSON.stringify(resultado,null,2));
const rows=[['Subsistema','Dispositivo','Mediana antes (s)','Mediana depois (s)','Diferença (s)','P95 antes (s)','P95 depois (s)','Máximo antes (s)','Máximo depois (s)'],...pares.map(p=>[p.perfil,p.dispositivo,p.antes.mediana,p.depois.mediana,p.diferencaS,p.antes.p95,p.depois.p95,p.antes.maximo,p.depois.maximo])];
await writeFile(`${raiz}/offline-conteudo-completo.csv`,'\ufeff'+rows.map(r=>r.map(v=>'"'+String(typeof v==='number'?v.toFixed(3).replace('.',','):v).replaceAll('"','""')+'"').join(';')).join('\r\n'));
console.log(JSON.stringify({...resultado,comparacoesOffline:undefined}));
