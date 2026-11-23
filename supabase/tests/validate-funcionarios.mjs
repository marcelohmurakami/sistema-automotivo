import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarBancoLocal } from './banco-local.mjs';
const db=await criarBancoLocal('20261009001100');
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
try {
 const u=randomUUID();await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
 const w=await one("select public.criar_oficina('Funcionários teste',null)");
 const id=randomUUID(),dados={nome:'João',funcao:'Mecânico',telefone:'11999999999',ativo:true};
 const salvar=(d,rev=null,of=w)=>one('select public.salvar_funcionario($1,$2,$3,$4)',[of,id,d,rev]);
 await salvar(dados);await salvar(dados);
 let lista=await one('select public.listar_funcionarios($1)',[w]);assert.equal(lista.length,1);assert.equal(lista[0].revisao,1);
 await salvar({...dados,ativo:false},1);lista=await one('select public.listar_funcionarios($1)',[w]);assert.equal(lista[0].ativo,false);
 await assert.rejects(salvar(dados,1),/alterado/);
 await salvar(dados,2);assert.equal((await one('select public.listar_funcionarios($1)',[w]))[0].ativo,true);
 const w2=await one("select public.criar_oficina('Outra empresa',null)");await assert.rejects(salvar(dados,3,w2),/indisponível/);
 await db.exec('reset role');assert.equal(await one('select count(*)::int from auth.users'),1);assert.equal(await one('select count(*)::int from public.membros_oficina where oficina_id=$1',[w]),1);
 await db.exec(`update public.membros_oficina set perfil='staff' where oficina_id='${w}' and usuario_id='${u}';set role authenticated;`);
 await assert.rejects(one('select public.listar_funcionarios($1)',[w]),/gerência/);await assert.rejects(salvar(dados,3),/gerência/);
 console.log('PASS cadastro sem login, edição, inativação e reativação, idempotência, revisão e isolamento de acesso');
}finally{await db.close();}
