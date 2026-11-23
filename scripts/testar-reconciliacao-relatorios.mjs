import assert from 'node:assert/strict';
import {test} from 'node:test';
import {indicadoresLimpeza} from '../src/lib/indicadoresLimpeza.ts';
import {resumirServicos} from '../src/lib/relatoriosServicos.ts';
const d={atendimento:{id:'doc',situacao:'concluido',cliente_id:'cliente',valor_centavos:10001,data_servico:'2026-11-02',ficha_especialidade:{especialidade:'limpeza_geral',campos:{area:'100'}}},cliente:{nome:'Cliente'},equipe:[],horas:[],qualidade:[],itens:[],comercial:{},eventos:[]};
const c={custo:5000,minutos:120,conferido:true,fontes_pendentes:0,atribuicao_revisar:false,participantes:[{funcionario_id:'um',nome:'Pessoa 1',receita:7501,vendas:0,custo:4000,contribuicao:3501,minutos:120,comissoes:123,garantias:0},{funcionario_id:'dois',nome:'Pessoa 2',receita:2500,vendas:10001,custo:1000,contribuicao:1500,minutos:0,comissoes:0,garantias:0}]};
const r={agora:'2026-11-02T12:00:00Z',detalhes:[d],abertos:[],agenda:[],qualidade:[],titulos:[],baixas:[],devedores:[],estoque:[],custeios:{doc:c}};
test('limpeza usa as horas da produção e mede área apenas com horas conhecidas',()=>{
 assert.equal(indicadoresLimpeza([d],r.custeios).produtividade,50);
 assert.equal(indicadoresLimpeza([d]).produtividade,null);
 assert.equal(indicadoresLimpeza([{...d,atendimento:{...d.atendimento,ficha_especialidade:{especialidade:'limpeza_geral',campos:{area:'0'}}}}],r.custeios).produtividade,null);
});
test('filtro por participante reconhece a atribuição sem vínculo legado e não inventa rateio',()=>{
 const x=resumirServicos(r,'2026-11-01','2026-11-30',{funcionario:'dois'});
 assert.equal(x.receita,10001);assert.equal(x.custo,5000);assert.equal(x.funcionarios.length,1);assert.equal(x.funcionarios[0].valor,2500);assert.equal(x.funcionarios[0].horas,0);
 const sem=resumirServicos({...r,custeios:{doc:{...c,participantes:[],atribuicao_revisar:true}}},'2026-11-01','2026-11-30');
 assert.equal(sem.funcionarios.length,0);assert.equal(sem.atribuicoesPendentes,1);
});
test('arredondamento, custos e horas da equipe conservam os totais',()=>{
 const x=resumirServicos(r,'2026-11-01','2026-11-30');
 assert.equal(x.funcionarios.reduce((s,p)=>s+p.valor,0),10001);assert.equal(x.horas,2);assert.equal(x.custosPendentes,0);assert.equal(x.funcionarios[0].comissoes,123);
});
test('transferência interna não aumenta o caixa operacional, despesas ou ranking de pagamento',()=>{
 const x=resumirServicos({...r,baixas:[{natureza:'receber',categoria:'transferencia',valor_centavos:99999,taxa_centavos:0,forma:'pix'},{natureza:'pagar',categoria:'transferencia',valor_centavos:99999,taxa_centavos:0,forma:'pix'}],titulos:[{natureza:'pagar',categoria:'transferencia',competencia:'2026-11-02',valor_centavos:99999}]},'2026-11-01','2026-11-30');
 assert.equal(x.entradas,0);assert.equal(x.saidas,0);assert.equal(x.formas.length,0);assert.equal(x.despesas.length,0);
});
