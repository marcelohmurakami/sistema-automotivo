import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarBancoLocal } from './banco-local.mjs';
const db=await criarBancoLocal('20261009000800');
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
try {
 const u=randomUUID();await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
 const w=await one("select public.criar_oficina('Teste OS pronta',null)");
 await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';set role authenticated;`);
 const v=await one("select public.cadastrar_veiculo_orcamento($1,null,'Gol',null)",[w]);
 const d={cliente_nome_livre:'Teste rápido',cliente_id:null,veiculo_id:v,itens:[{id:randomUUID(),tipo:'service',descricao:'Ajuste rápido',unidade:'serv',quantidade:1,preco_unitario_centavos:15000,situacao:'pending'}],desconto_centavos:0};
 const key=randomUUID();
 const o=await one('select public.criar_os_pronta($1,$2,$3)',[w,d,key]);
 assert.equal(o.situacao,'ready');assert.ok(o.concluido_em);assert.equal(o.itens[0].situacao,'done');assert.equal(o.total_centavos,15000);assert.ok(o.vencimento_pagamento);
 const repeat=await one('select public.criar_os_pronta($1,$2,$3)',[w,d,key]);assert.equal(repeat.id,o.id);assert.equal(repeat.revisao,o.revisao);
 const v2=await one("select public.cadastrar_veiculo_orcamento($1,null,'Outro carro',null)",[w]);
 const normal=await one('select public.salvar_os_com_itens($1,$2,$3)',[w,{...d,veiculo_id:v2,itens:[{...d.itens[0],id:randomUUID()}]},randomUUID()]);assert.equal(normal.situacao,'open');
 await assert.rejects(one('select public.criar_os_pronta($1,$2,$3)',[w,{...d,itens:[]},randomUUID()]),/Inclua/);
 await assert.rejects(one('select public.criar_os_pronta($1,$2,$3,$4)',[w,d,randomUUID(),o.id]),/exclusiva/);
 await db.exec('reset role');assert.equal(await one('select count(*)::int from public.baixas_financeiras where oficina_id=$1',[w]),0);
 const outsider=randomUUID();await db.exec(`insert into auth.users values('${outsider}');select set_config('request.jwt.claim.sub','${outsider}',false);set role authenticated;`);
 await assert.rejects(one('select public.criar_os_pronta($1,$2,$3)',[w,d,randomUUID()]));
 console.log('PASS criação pronta e normal, itens concluídos, data e vencimento, repetição sem duplicar, sem baixa de pagamento, acesso isolado');
}finally{await db.close();}
