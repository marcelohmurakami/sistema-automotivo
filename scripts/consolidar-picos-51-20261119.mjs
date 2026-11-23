import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='output/picos-51-20261119',j=JSON.parse(await readFile(root+'/comparacao-26/resultados.json','utf8'));
assert.equal(j.rodadas,3);assert.equal(j.resultados.length,2304);assert.deepEqual(j.falhas,[]);
assert.equal(new Set(j.resultados.map(r=>r.perfil)).size,26);
assert.equal(new Set(j.resultados.map(r=>[r.perfil,r.mobile,r.fase,r.rodada,r.nome].join('|'))).size,2304);
assert(j.resultados.every(r=>Number.isFinite(r.segundos)&&r.segundos>0));
const old=JSON.parse(await readFile('output/revisao-integral-20261119/diagnostico-tempos.json','utf8')).comparacoes;
const med=xs=>{const s=xs.toSorted((a,b)=>a-b);return (s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2};
const p95=xs=>xs.toSorted((a,b)=>a-b)[Math.ceil(xs.length*.95)-1];
const stats=xs=>xs.length?({n:xs.length,media:xs.reduce((s,x)=>s+x,0)/xs.length,mediana:med(xs),p95:p95(xs),maximo:Math.max(...xs),minimo:Math.min(...xs)}):({n:0,media:null,mediana:null,p95:null,maximo:null,minimo:null});
const pares=old.map(p=>{
 const mobile=p.dispositivo==='celular',rows=j.resultados.filter(r=>r.perfil===p.perfil&&r.nome===p.modulo&&r.mobile===mobile);
 const antes=stats(rows.filter(r=>r.fase==='antes').map(r=>r.segundos)),depois=stats(rows.filter(r=>r.fase==='depois').map(r=>r.segundos));
 assert.equal(antes.n,3);assert.equal(depois.n,3);
 const deltaAcesso=(p.depois.acessoS||0)-(p.antes.acessoS||0),deltaConsulta=(p.depois.consultaS||0)-(p.antes.consultaS||0);
 const transporte=['antes','depois'].map(fase=>{
  const traces=j.transportes.filter(t=>t.perfil===p.perfil&&t.mobile===mobile&&t.nome===p.modulo&&t.fase===fase&&t.rota.includes('/rpc/'));
  return {fase,requisoes:traces.length,novasConexoes:traces.filter(t=>t.novaConexao).length,reutilizadas:traces.filter(t=>t.reutilizada).length,tls:stats(traces.map(t=>t.tlsMs||0)),upstream:stats(traces.filter(t=>t.upstreamMs!=null).map(t=>t.upstreamMs))};
 });
 return {perfil:p.perfil,dispositivo:p.dispositivo,modulo:p.modulo,eraUmDos51:p.deltaS>0,registroAnterior:p.depois.totalS,
  diagnosticoOriginal:{trechoComMaiorAumento:deltaAcesso>=deltaConsulta?'Chamada de acesso':'Consulta do módulo',deltaAcessoS:deltaAcesso,deltaConsultaS:deltaConsulta,deltaFrontendS:(p.depois.entreAcessoEConsultaS||0)-(p.antes.entreAcessoEConsultaS||0),antes:p.antes,depois:p.depois},
  transporte,amostras:rows.map(x=>({fase:x.fase,rodada:x.rodada,segundos:x.segundos})),antes,depois,diferencaS:depois.mediana-antes.mediana,variacaoPercentual:(depois.mediana/antes.mediana-1)*100};
});
const resumo=[];for(const mobile of [false,true])for(const nome of [...new Set(j.resultados.map(r=>r.nome))]){const rs=j.resultados.filter(r=>r.mobile===mobile&&r.nome===nome);resumo.push({dispositivo:mobile?'celular CPU4x':'desktop',modulo:nome,antes:stats(rs.filter(r=>r.fase==='antes').map(r=>r.segundos)),depois:stats(rs.filter(r=>r.fase==='depois').map(r=>r.segundos))})}
const conexoes=['antes','depois'].map(fase=>{const t=j.transportes.filter(t=>t.fase===fase&&t.rota.includes('/rpc/'));return {fase,total:t.length,novas:t.filter(t=>t.novaConexao).length,reutilizadas:t.filter(t=>t.reutilizada).length,tlsMedianaMs:med(t.map(t=>t.tlsMs||0)),tlsP95Ms:p95(t.map(t=>t.tlsMs||0))}});
const falhasHttp={};for(const r of j.rede)if(r.status>=400){const k=r.rpc+' '+r.status;falhasHttp[k]=(falhasHttp[k]||0)+1}
const casos51=pares.filter(p=>p.eraUmDos51),resultado={metodo:j.metodo,amostras:j.resultados.length,pares:pares.length,casos51:casos51.length,casos51MaisRapidos:casos51.filter(x=>x.diferencaS<0).length,casos51MaisLentos:casos51.filter(x=>x.diferencaS>0).length,paresMaisRapidos:pares.filter(x=>x.diferencaS<0).length,paresMaisLentos:pares.filter(x=>x.diferencaS>0).length,conexoes,falhasHttp,resumo,comparacoes:pares};
const csv=rows=>'\ufeff'+rows.map(row=>row.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
const cab=['Perfil','Dispositivo','Módulo','Era um dos 51','Registro anterior (s)','Mediana antes (s)','Mediana depois (s)','Diferença (s)','Variação %','P95 antes (s)','P95 depois (s)','Máximo antes (s)','Máximo depois (s)','Trecho que mais piorou na auditoria anterior','Aumento original no acesso (s)','Aumento original na consulta (s)','Variação original no intervalo do frontend (s)','Conexões novas antes','Conexões novas depois','Conexões reutilizadas depois'];
const linha=p=>[p.perfil,p.dispositivo,p.modulo,p.eraUmDos51?'Sim':'Não',p.registroAnterior,p.antes.mediana,p.depois.mediana,p.diferencaS,p.variacaoPercentual,p.antes.p95,p.depois.p95,p.antes.maximo,p.depois.maximo,p.diagnosticoOriginal.trechoComMaiorAumento,p.diagnosticoOriginal.deltaAcessoS,p.diagnosticoOriginal.deltaConsultaS,p.diagnosticoOriginal.deltaFrontendS,p.transporte[0].novasConexoes,p.transporte[1].novasConexoes,p.transporte[1].reutilizadas].map(x=>typeof x==='number'?x.toFixed(3).replace('.',','):x);
await writeFile(root+'/resumo.json',JSON.stringify(resultado,null,2));await writeFile(root+'/tempos-26-subsistemas.csv',csv([cab,...pares.map(linha)]));await writeFile(root+'/51-casos-antes-depois.csv',csv([cab,...casos51.map(linha)]));
console.log(JSON.stringify({...resultado,comparacoes:undefined,resumo:undefined}));
