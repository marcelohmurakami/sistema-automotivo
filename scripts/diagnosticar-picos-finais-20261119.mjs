import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='output/picos-51-20261119';
const j=JSON.parse(await readFile(`${root}/comparacao-26/resultados.json`,'utf8'));
assert.equal(j.resultados.length,2304);
const rpces={Laudos:['listar_laudos'],Agenda:['consultar_produtividade','pagina_servicos'],Contatos:['consultar_oportunidades'],'Relatórios':['consultar_relatorio_financeiro','consultar_relatorios_servicos'],Garantia:['consultar_qualidade','consultar_relatorios_servicos','consultar_ocorrencias_servicos'],'Histórico':['consultar_historico_gestao'],Site:['administrar_site'],Offline:[]};
const explicar=r=>{
 const rpc=r.recursos.find(x=>rpces[r.nome].some(nome=>x.nome.endsWith('/'+nome)));
 const acesso=r.recursos.find(x=>x.nome.endsWith('/consultar_meu_acesso'));
 const traces=j.transportes.filter(t=>t.perfil===r.perfil&&t.mobile===r.mobile&&t.fase===r.fase&&t.rodada===r.rodada&&t.nome===r.nome&&(t.rota.endsWith('/consultar_meu_acesso')||rpces[r.nome].some(nome=>t.rota.endsWith('/'+nome))));
 return {perfil:r.perfil,dispositivo:r.mobile?'celular':'desktop',modulo:r.nome,rodada:r.rodada+1,fase:r.fase,totalS:r.segundos,acesso,consulta:rpc?{rpc:rpc.nome,inicioS:rpc.inicio/1000,duracaoS:rpc.duracao/1000,fimS:(rpc.inicio+rpc.duracao)/1000,intervaloAposRespostaS:r.segundos-(rpc.inicio+rpc.duracao)/1000}:null,assetsMaisDemorados:r.recursos.filter(x=>x.nome.includes('/assets/')).toSorted((a,b)=>b.duracao-a.duracao).slice(0,3),tarefasLongasS:r.longas.reduce((s,x)=>s+x.duracao/1000,0),traces};
};
const maiores=['antes','depois'].flatMap(f=>j.resultados.filter(r=>r.fase===f).toSorted((a,b)=>b.segundos-a.segundos).slice(0,12).map(explicar));
const controle51=JSON.parse(await readFile(`${root}/resumo.json`,'utf8')).comparacoes.filter(p=>p.eraUmDos51);
const piorasIndividuais=controle51.flatMap(p=>[0,1,2].flatMap(rodada=>{
 const linhas=j.resultados.filter(r=>r.perfil===p.perfil&&r.mobile===(p.dispositivo==='celular')&&r.nome===p.modulo&&r.rodada===rodada);
 const a=linhas.find(r=>r.fase==='antes'),d=linhas.find(r=>r.fase==='depois');
 return d.segundos>a.segundos?[{diferencaS:d.segundos-a.segundos,antes:explicar(a),depois:explicar(d)}]:[];
}));
const resultado={metodo:'Os registros são mantidos mesmo quando mais lentos. Intervalo após resposta inclui navegador e espera da automação; não é tempo isolado de renderização. tlsMs mede até secureConnect, incluindo DNS, TCP e TLS; upstreamMs é o cabeçalho informado pelo servidor, não EXPLAIN SQL.',maiores,piorasIndividuais};
await writeFile(`${root}/diagnostico-final.json`,JSON.stringify(resultado,null,2));
const ids=[...new Set([...maiores,...piorasIndividuais.map(p=>p.depois)].flatMap(r=>r.traces.map(t=>t.requestId)).filter(Boolean))];
assert(ids.every(id=>/^[\da-f-]{36}$/.test(id)));
const sql=`select log_attributes['request_id'] as request_id, log_attributes['request.path'] as rota, log_attributes['response.status_code'] as status, log_attributes['response.origin_time'] as origem_ms, log_attributes['response.headers.x_envoy_upstream_service_time'] as upstream_ms from logs where source='edge_logs' and log_attributes['request_id'] in (${ids.map(id=>`'${id}'`).join(',')}) limit 100`;
await writeFile(`${root}/consulta-logs.json`,JSON.stringify({project_id:'hzihxtjirttetnfdujcx',iso_timestamp_start:j.iniciadoEm,iso_timestamp_end:j.geradoEm,sql},null,2));
console.log(JSON.stringify({piorasIndividuais:piorasIndividuais.length,maiores:maiores.length,idsParaLogs:ids.length}));
