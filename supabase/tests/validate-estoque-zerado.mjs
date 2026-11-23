import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarBancoLocal } from './banco-local.mjs';
const db=await criarBancoLocal('20261009001200');
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
try {
 const u=randomUUID(); await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
 const w=await one("select public.criar_oficina('Teste estoque zerado',null)");
 await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';set role authenticated;`);
 const ids=Array.from({length:27},()=>randomUUID());
 for(const id of ids) await one('select public.salvar_produto_estoque($1,$2,$3)',[w,{descricao:'Peça teste',unidade:'un'},id]);
 await one('select public.movimentar_estoque($1,$2,$3,$4,$5,$6,$7)',[w,ids[0],'entrada',2,'Entrada de teste',randomUUID(),1]);
 await db.exec(`reset role;update public.itens_catalogo set arquivado_em=now() where id='${ids[1]}';insert into public.itens_catalogo(id,oficina_id,tipo,descricao) values('${randomUUID()}','${w}','part','Sem controle');set role authenticated;`);
 const r=await one("select public.listar_estoque($1,'','zerado',0)",[w]);
 assert.equal(r.resumo.zerados,25);assert.equal(r.total,25);assert.equal(r.itens.length,24);assert.ok(r.itens.every(p=>p.saldo===0));
 const next=await one("select public.listar_estoque($1,'','zerado',1)",[w]);assert.equal(next.itens.length,1);
 const empty=await one("select public.listar_estoque($1,'inexistente','zerado',0)",[w]);assert.equal(empty.total,0);assert.equal(empty.resumo.zerados,25);
 const compra=await one("select public.listar_estoque($1,'','controlados',0)",[w]);assert.equal(compra.total,26);assert.equal(compra.itens.length,24);assert.ok(compra.itens.every(p=>p.saldo!==null&&!p.arquivado_em));
 const compraBusca=await one("select public.listar_estoque($1,'Sem controle','controlados',0)",[w]);assert.equal(compraBusca.total,0);
 console.log('PASS contagem global, saldo zero, exclusão de arquivados e não controlados, busca e paginação');
}finally{await db.close();}
