import assert from 'node:assert/strict';
import test from 'node:test';
import {importarTypescript} from './lib/importar-typescript.mjs';
const {calcularQuantidadesEntrega:calcular,limiteRecebimento:limite}=await importarTypescript('src/lib/recebimentoPedido.ts');
test('10 entregues e 4 rejeitadas aceitam 6, preservando 4 pendentes',()=>assert.deepEqual(calcular(10,4,10,'un'),{aceito:6,naoChegou:0,pendente:4}));
test('entrega parcial distingue ausência de recusa',()=>assert.deepEqual(calcular(6,2,10,'un'),{aceito:4,naoChegou:4,pendente:6}));
test('recusa total e nenhuma entrega não geram entrada aceita',()=>{assert.equal(calcular(10,10,10,'un').aceito,0);assert.equal(calcular(0,0,10,'un').pendente,10);});
test('saldo restante e valores fracionados respeitam unidade',()=>{assert.deepEqual(calcular(0.3,0.1,1,'kg'),{aceito:0.2,naoChegou:0.7,pendente:0.8});for(const args of [[1.5,0,10,'un'],[11,0,10,'un'],[5,6,10,'un'],[-1,0,10,'un'],[1,-1,10,'un'],[NaN,0,10,'un'],[1,Infinity,10,'un'],[1.0001,0,10,'kg']])assert.throws(()=>calcular(...args));});
test('reposição exclui créditos e encerramentos e não altera saldo de devolução',()=>{const i={quantidade:10,recebido:6,devolvido:4,reposto:1,creditado:1,sem_reposicao:1};assert.equal(limite(i,'compra'),4);assert.equal(limite(i,'reposicao'),1);assert.equal(limite(i,'devolucao'),3);});
