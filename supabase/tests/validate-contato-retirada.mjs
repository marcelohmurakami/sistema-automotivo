import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {criarBancoLocal} from './banco-local.mjs';
const db=await criarBancoLocal('20261009001700');
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
try {
 const u=randomUUID();await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
 const w=await one("select public.criar_oficina('Teste retirada',null)");
 await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';set role authenticated;`);
 const c=(await one('select public.salvar_cliente($1,$2)',[w,{nome:'Cliente teste'}])).id;
 const v=await one('select public.cadastrar_veiculo_orcamento($1,$2,$3,$4)',[w,c,'Motor teste',null]);
 const os=(await one('select public.salvar_ordem_servico($1,$2,$3)',[w,{cliente_id:c,veiculo_id:v},randomUUID()])).id;
 const read=async()=> (await one('select public.consultar_oportunidades($1)',[w])).itens.filter(x=>x.origem==='retirada');
 assert.equal((await read()).length,0);
 await db.exec('reset role');await db.query("update public.ordens_servico set situacao='ready',concluido_em=now() where id=$1",[os]);await db.exec('set role authenticated');
 let r=(await read())[0];assert.equal(r.ordem_servico_id,os);assert.equal(r.cliente,'Cliente teste');assert.equal(r.recebido_centavos,0);
 const contato=(d)=>one('select public.acompanhar_oportunidade($1,$2,$3,$4)',[w,'retirada',os,d]);
 await assert.rejects(contato({acao:'orcamento'}));
 await contato({situacao:'contatado',anotacao:'Busca amanhã',proximo_contato:'2026-10-10'});
 r=(await read())[0];assert.equal(r.anotacao,'Busca amanhã');assert.equal(r.situacao,'contatado');assert.equal(r.proximo_contato,'2026-10-10');
 await assert.rejects(contato({situacao:'adiado',revisao:0}));
 await db.exec('reset role');await db.query("update public.ordens_servico set situacao='delivered',entregue_em=now() where id=$1",[os]);await db.exec('set role authenticated');
 assert.equal((await read()).length,0);
 await db.exec('reset role');await db.query("update public.ordens_servico set situacao='ready',cliente_id=null where id=$1",[os]);await db.exec('set role authenticated');
 r=(await read())[0];assert.equal(r.cliente,'Cliente teste');assert.equal(r.veiculo,'Motor teste');
 const other=randomUUID();await db.exec(`reset role;insert into auth.users values('${other}');select set_config('request.jwt.claim.sub','${other}',false);set role authenticated;`);await assert.rejects(read);
 console.log('PASS retiradas: só prontas, OS existente, contato persistido, revisão, saída ao entregar, dados avulsos e isolamento');
} finally {await db.close();}
