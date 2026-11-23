import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {criarBancoLocal} from './banco-local.mjs';
const db=await criarBancoLocal('20261009001400');
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
try{
 const u=randomUUID();await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
 const w=await one("select public.criar_oficina('Vales teste',null)"),f=randomUUID(),id=randomUUID();
 await one('select public.salvar_funcionario($1,$2,$3)',[w,f,{nome:'Teste'}]);
 const dados={tipo:'vale',inicio:'2026-01-01',descricao:'Adiantamento combinado',valor_centavos:50000};
 const registrar=(d,i=id)=>one('select public.registrar_evento_funcionario($1,$2,$3,$4)',[w,f,i,d]);
 await assert.rejects(registrar({...dados,valor_centavos:0}));await registrar(dados);await registrar(dados);
 const key=randomUUID(),pagar=(v,k=randomUUID(),o=w)=>one('select public.abater_vale_funcionario($1,$2,$3,$4,$5,$6)',[o,id,k,v,'2026-01-02','Devolução']);
 await assert.rejects(one('select public.situacao_evento_funcionario($1,$2,$3)',[w,id,'concluido']));
 await pagar(20000,key);await pagar(20000,key);
 const listar=()=>one('select public.listar_registros_funcionario($1,$2)',[w,f]);
 let r=(await listar())[0];assert.equal(r.abatimentos.length,1);assert.equal(r.situacao,'pendente');
 await assert.rejects(pagar(30001));await assert.rejects(one('select public.situacao_evento_funcionario($1,$2,$3)',[w,id,'cancelado']));
 await pagar(30000);r=(await listar())[0];assert.equal(r.situacao,'concluido');assert.equal(r.abatimentos.length,2);
 const w2=await one("select public.criar_oficina('Outra',null)");await assert.rejects(pagar(1,randomUUID(),w2));
 await registrar({...dados,tipo:'emprestimo'},randomUUID());
 console.log('PASS vales/empréstimos, valor positivo, abatimentos parciais, quitação, idempotência, limite do saldo e isolamento');
}finally{await db.close();}
