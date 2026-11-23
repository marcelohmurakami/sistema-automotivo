import test from 'node:test';
import assert from 'node:assert/strict';
import {dataSaoPaulo, diasAte, marcoAlerta, vencimentoMensal, proximoMes} from '../src/lib/alertas.ts';
test('marcos permanecem visíveis entre os dias e renovam a cada 30 dias',()=>{
  for(const [dia,marco] of [[6,null],[5,5],[4,5],[2,5],[1,1],[0,0],[-1,-1],[-4,-1],[-5,-5],[-9,-5],[-10,-10],[-29,-10],[-30,-30],[-59,-30],[-60,-60],[-90,-90],[-365,-360]]) assert.equal(marcoAlerta(dia),marco);
});
test('calendário de São Paulo e mudança de mês/ano',()=>{
  assert.equal(dataSaoPaulo(new Date('2027-01-01T02:00:00Z')),'2026-12-31');
  assert.equal(diasAte('2027-01-01','2026-12-31'),1);
  assert.equal(diasAte('2026-09-30','2026-10-01'),-1);
});
test('vencimentos mensais respeitam fevereiro e ano bissexto',()=>{
  assert.equal(vencimentoMensal('2026-02-01',31),'2026-02-28');
  assert.equal(vencimentoMensal('2028-02-01',30),'2028-02-29');
  assert.equal(vencimentoMensal('2026-04-01',31),'2026-04-30');
  assert.equal(vencimentoMensal('2026-03-01',31),'2026-03-31');
  assert.equal(proximoMes('2026-12-01'),'2027-01-01');
});
