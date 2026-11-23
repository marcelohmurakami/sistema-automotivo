import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ordemComCusteio} from '../src/lib/apresentacaoDocumentoServico.ts';

test('OS recebida e aguardando autorização permitem conferir os custos',()=>{
 for(const orcamento_enviado of [undefined,'sim'])assert.equal(ordemComCusteio({situacao:'orcamento',dados:{documento:'ordem',orcamento_enviado}}),true);
});
test('orçamento e cancelamento não são confundidos com OS ativa',()=>{
 for(const dados of [{},{documento:'orcamento'}])assert.equal(ordemComCusteio({situacao:'orcamento',dados}),false);
 assert.equal(ordemComCusteio({situacao:'cancelado',dados:{documento:'ordem'}}),false);
});
test('custos disponíveis após aprovação, durante a execução e após conclusão',()=>{
 for(const situacao of ['aprovado','aberto','em_execucao','aguardando','concluido'])assert.equal(ordemComCusteio({situacao,dados:{}}),true);
});
