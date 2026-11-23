import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dividirPercentual,distribuirExecucao,csvDepartamentoPessoal,prepararAtribuicao} from '../src/lib/produtividadeEquipe.ts';
test('revisão descarta vínculos de fontes canceladas sem mudar participantes ou histórico',()=>{
 const dados={criterio:'manual',participantes:[{funcionario_id:'a',execucao_bp:10000,venda_bp:10000}],fontes:{ativa:'a',cancelada:'rateio'}};
 const atual=prepararAtribuicao(dados,[{chave:'ativa'}]);
 assert.deepEqual(atual.fontes,{ativa:'a'});assert.deepEqual(atual.participantes,dados.participantes);assert.equal(dados.fontes.cancelada,'rateio');
});
test('percentuais preservam 100% e desempate não depende da ordem',()=>{
 const a=[{id:'c',peso:1},{id:'a',peso:1},{id:'b',peso:1}];assert.deepEqual(dividirPercentual(a),{c:3333,a:3334,b:3333});assert.deepEqual(dividirPercentual([...a].reverse()),{b:3333,a:3334,c:3333});assert.equal(Object.values(dividirPercentual(Array.from({length:50},(_,i)=>({id:String(i),peso:i})))).reduce((a,b)=>a+b,0),10000);
});
test('horas seguem o vínculo explícito sem inventar tempo para fontes rateadas',()=>{
 const p=[{funcionario_id:'a',execucao_bp:0,venda_bp:10000},{funcionario_id:'b',execucao_bp:0,venda_bp:0}],f=[{chave:'h1',funcionario_id:'a',minutos:30},{chave:'h2',funcionario_id:'b',minutos:90}];
 assert.deepEqual(distribuirExecucao(p,'horas',f,{}).map(x=>x.execucao_bp),[2500,7500]);assert.deepEqual(distribuirExecucao(p,'horas',f,{h2:'a'}).map(x=>x.execucao_bp),[10000,0]);assert.throws(()=>distribuirExecucao(p,'horas',f,{h1:'rateio',h2:'rateio'}),/Não há horas/);
 assert.equal(distribuirExecucao(p,'igual',f,{})[0].venda_bp,10000);
});
test('CSV protege fórmulas, quebras e aspas, preserva versão e centavos',()=>{
 const ex={id:'QA',hash:'hash-QA',inicio:'2026-10-01',fim:'2026-10-31',dados:{versao:'patio.dp.v1',finalidade:'Não é folha',funcionarios:[{nome:'=HYPERLINK("url")',id:'a'}],lancamentos:[{rubrica:'Texto; "com aspas"\ne quebra',valor_centavos:20000}],ocorrencias:[],horas_produtivas:[],pendencias:['Conferir']}};
 const csv=csvDepartamentoPessoal(ex);assert(csv.startsWith('\ufeff'));assert(csv.includes('patio.dp.v1'));assert(csv.includes("'=HYPERLINK"));assert(csv.includes('"20000"'));assert(csv.includes('""com aspas""'));assert(csv.includes('Não é folha'));
});
