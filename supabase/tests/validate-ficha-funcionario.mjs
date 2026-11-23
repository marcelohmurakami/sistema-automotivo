import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarBancoLocal } from './banco-local.mjs';
const db=await criarBancoLocal('20261009001300');
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
try{
 const u=randomUUID();await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
 const w=await one("select public.criar_oficina('Ficha teste',null)"),id=randomUUID();
 const dados={nome:'Teste',admissao:'2026-01-01',salario_centavos:300000,dados:{jornada:'8h',emergencia_nome:'Contato'}};
 const salvar=(d,r=null)=>one('select public.salvar_funcionario($1,$2,$3,$4)',[w,id,d,r]);
 const listar=()=>one('select public.listar_registros_funcionario($1,$2)',[w,id]);
 await salvar(dados);await salvar(dados);assert.equal((await listar()).length,1);
 await salvar({...dados,salario_centavos:350000},1);assert.equal((await listar()).length,2);
 await assert.rejects(salvar({...dados,desligamento:'2025-01-01'},2));
 await assert.rejects(salvar({...dados,salario_centavos:-1},2));
 assert.equal((await listar()).length,2);
 const f=(await one('select public.listar_funcionarios($1)',[w]))[0];assert.equal(f.revisao,2);assert.equal(f.salario_centavos,350000);assert.equal(f.dados.jornada,'8h');
 const event=randomUUID(),data={tipo:'ferias',inicio:'2026-12-01',fim:'2026-12-15',descricao:'Período combinado'};
 const registrar=(d,key=event,of=w)=>one('select public.registrar_evento_funcionario($1,$2,$3,$4)',[of,id,key,d]);
 await registrar(data);await registrar(data);assert.equal((await listar()).length,3);
 await assert.rejects(registrar({...data,fim:'2026-11-01'},randomUUID()));
 await assert.rejects(registrar({...data,tipo:'salario'},randomUUID()));
 await one('select public.situacao_evento_funcionario($1,$2,$3)',[w,event,'concluido']);assert.equal((await listar()).find(r=>r.id===event).situacao,'concluido');
 const w2=await one("select public.criar_oficina('Outra ficha',null)");await assert.rejects(registrar(data,randomUUID(),w2));assert.deepEqual(await one('select public.listar_registros_funcionario($1,$2)',[w2,id]),[]);
 await db.exec(`reset role;update public.membros_oficina set perfil='staff' where oficina_id='${w}' and usuario_id='${u}';set role authenticated;`);
 await assert.rejects(listar());await assert.rejects(salvar(dados,2));
 await assert.rejects(one('select public.salvar_funcionario_basico($1,$2,$3,$4)',[w,id,dados,2]));
 console.log('PASS ficha completa, histórico salarial, repetição sem duplicar, datas e salário inválidos com rollback, histórico de férias e acesso isolado');
}finally{await db.close();}
