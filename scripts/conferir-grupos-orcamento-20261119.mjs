import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import * as antes from '../output/revisao-integral-20261119/antes/src/lib/orcamentoInteligente.ts';
import * as depois from '../src/lib/orcamentoInteligente.ts';
let seed=19487, verificacoes=0;
const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(let caso=0;caso<1500;caso++){
 const nomes=['','   ','Motor','Cabeçote','A','B','C','D',' E '];
 const itens=Array.from({length:rnd(101)},()=>({tipo:rnd(2)?'part':'service',grupo_servico:nomes[rnd(nomes.length)],depende_grupo:nomes[rnd(nomes.length)],quantidade:(rnd(500)+1)/10,preco_unitario_centavos:rnd(1000000)}));
 const escolhas=nomes.filter(()=>rnd(2)).map(n=>n.trim()||'Atendimento'),desconto=rnd(100000);
 for(const[fn,args]of [['gruposOrcamento',[itens]],['incluirDependencias',[itens,escolhas]],['retirarGrupo',[itens,escolhas,nomes[rnd(nomes.length)]]],['valorSelecionado',[itens,desconto,escolhas]]]){
  assert.deepEqual(depois[fn](...args),antes[fn](...args),`${fn}, caso ${caso}`);verificacoes++;
 }
}
const resultado={verificacoes,casos:1500,limiteItens:100,escopo:'Equivalência exata com snapshot anterior: ordem, grupos vazios, duplicados, dependências cíclicas, quantidades fracionadas, desconto e arredondamento. Não mede tempo de tela.'};
await mkdir('output/revisao-integral-20261119/grupos-orcamento',{recursive:true});await writeFile('output/revisao-integral-20261119/grupos-orcamento/resultado.json',JSON.stringify(resultado,null,2));console.log(resultado);
