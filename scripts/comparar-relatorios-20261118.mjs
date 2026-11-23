import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {resumirServicos as depois} from '../src/lib/relatoriosServicos.ts';
import {resumirServicos as antes} from '../output/gestao-operacao-velocidade-20261118/antes/src/lib/relatoriosServicos.ts';
const resultados=[];
for(const quantidade of [0,1,100,3000]){
 const r={detalhes:[],abertos:[],agenda:[],qualidade:[],titulos:[],baixas:[],devedores:[],estoque:[],custeios:{}};
 for(let i=0;i<quantidade;i++){
  const id='os-'+i,equipe=Array.from({length:5},(_,j)=>({funcionario_id:'f'+((i+j)%200),nome:'Pessoa '+((i+j)%200),comissao_centavos:99+j,custo_hora_centavos:1800}));if(i%13===0)equipe.push({...equipe[0]});
  r.detalhes.push({atendimento:{id,numero:i,cliente_id:'c'+i%37,titulo:'Serviço',situacao:i%7?'concluido':'aprovado',data_servico:'2026-11-01',concluido_em:'2026-11-02T14:00:00Z',valor_centavos:10001+i,dados:{},ficha_especialidade:{especialidade:i%2?'assistencia_celulares':'limpeza_comercial',campos:{},checklist:{}}},cliente:{nome:'Cliente '+i%37},objeto:{nome:'Bem',dados:{}},comercial:{desconto_centavos:0,custo_extra_centavos:13,orcado_centavos:10000},itens:[{id:'i'+i,tipo:'servico',descricao:'Serviço',quantidade:1,unidade:'un',preco_centavos:10001+i,custo_centavos:100,origem:'externa'}],equipe,horas:equipe.map(e=>({funcionario_id:e.funcionario_id,inicio:'2026-11-01T12:00:00Z',fim:'2026-11-01T13:37:00Z'})),qualidade:[],eventos:[]});
  if(i%3===0)r.custeios[id]={custo:500,conferido:true,minutos:97,atribuicao_conferida:true,participantes:equipe.map(e=>({...e,minutos:97,receita:2000,comissoes:111}))};
 }
 const comparar=(filtro)=>{const a=antes(r,'2026-11-01','2026-11-30',filtro),d=depois(r,'2026-11-01','2026-11-30',filtro);assert.deepEqual(d,a)};
 for(const filtro of [{},{cliente:'c5'},{funcionario:'f7'},{subsetor:'assistencia_celulares'},{cliente:'c5',funcionario:'f7'},{funcionario:'ausente'}])comparar(filtro);
 const tempos={antes:[],depois:[]};for(let i=0;i<8;i++)for(const fase of i%2?['depois','antes']:['antes','depois']){const t=performance.now();(fase==='antes'?antes:depois)(r,'2026-11-01','2026-11-30');if(i>0)tempos[fase].push((performance.now()-t)/1000)}
 resultados.push({quantidade,funcionarios:200,filtrosComparados:6,conteudoInteiroIdentico:true,tempos});console.log('PASS',quantidade,'documentos, 6 filtros, igualdade completa');
}
const out='output/gestao-operacao-velocidade-20261118';await mkdir(out,{recursive:true});await writeFile(out+'/calculo-relatorios.json',JSON.stringify({ambiente:'Cálculo local em memória; ordem de medição alternada, aquecimento descartado. Não inclui rede nem digitação.',resultados},null,2));
