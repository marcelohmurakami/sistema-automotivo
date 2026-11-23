import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
// Referência anterior: constrói um Intl por valor, preservada aqui para comparação independente do relatório local.
const moeda=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const quantidade=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(n);
const antigas={
 documentoCliente:{moedaDocumento:moeda,quantidadeDocumento:quantidade,dataDocumento:(v,h=true)=>!v||!Number.isFinite(Date.parse(v))?'Não informada':new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',...(h?{timeStyle:'short'}:{})}).format(new Date(v.length===10?v+'T12:00:00-03:00':v))},
 formatoEstoque:{numeroEstoque:n=>n===null?'Sem controle':quantidade(n)},
 analisesGerenciais:{formatarAnalise:(k,n)=>['receita','custo','margem'].includes(k)?moeda(n):k==='trabalho'?(n/60).toLocaleString('pt-BR',{maximumFractionDigits:1})+' h':n.toLocaleString('pt-BR',{maximumFractionDigits:1})+(['cobertura','ocupacao'].includes(k)?'%':k==='horas_pessoa'?' h':'')},
 dataServico:{dataServicoDoCampo:o=>o.data_servico||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(o.concluido_em||o.criado_em))},
 alertas:{dataSaoPaulo:d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)},
};
const bases=['documentoCliente','formatoEstoque','analisesGerenciais','dataServico','alertas'];
const pares={};for(const nome of bases)pares[nome]=[antigas[nome],await import(`../src/lib/${nome}.ts`)];
let verificacoes=0;
const igual=(nome,fn,args)=>{assert.deepEqual(pares[nome][1][fn](...args),pares[nome][0][fn](...args));verificacoes++;};
for(const n of [0,-0,1,-1,0.001,0.0001,1.2345,1234.56,999999999,NaN,Infinity,-Infinity]){
 for(const fn of ['moedaDocumento','quantidadeDocumento'])igual('documentoCliente',fn,[n]);
 igual('formatoEstoque','numeroEstoque',[n]);
 for(const chave of ['receita','custo','margem','cobertura','ocupacao','trabalho','horas_pessoa','outra'])igual('analisesGerenciais','formatarAnalise',[chave,n]);
}
igual('formatoEstoque','numeroEstoque',[null]);
for(const data of [null,'','invalida','2024-02-29','2026-11-11','2026-11-11T01:30:00Z','2026-11-11T23:59:59-03:00'])for(const hora of [true,false])igual('documentoCliente','dataDocumento',[data,hora]);
for(const data of ['2024-02-29T02:59:59Z','2024-02-29T03:00:00Z','2026-11-11T23:59:59Z']){igual('alertas','dataSaoPaulo',[new Date(data)]);igual('dataServico','dataServicoDoCampo',[{criado_em:data}]);}
const tempos=[];for(let i=0;i<5;i++){const run=lib=>{const inicio=performance.now();for(let n=0;n<2000;n++){lib.moedaDocumento(n*7);lib.quantidadeDocumento(n/3);}return performance.now()-inicio;};tempos.push({antes:run(pares.documentoCliente[0]),depois:run(pares.documentoCliente[1])});}
await mkdir('output/desempenho-20261111',{recursive:true});await writeFile('output/desempenho-20261111/formatadores.json',JSON.stringify({ok:true,verificacoes,tempos,nota:'Microbenchmark Node, 4.000 formatações por rodada; não representa tempo total de uma tela.'},null,2));console.log('PASS',verificacoes,'formatos idênticos; valores, datas e fuso preservados');
