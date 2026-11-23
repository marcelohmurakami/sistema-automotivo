import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {criarBancoLocal} from '../supabase/tests/banco-local.mjs';
const p=process.argv[2]||'backups/retifica-estacao-20261008';
const {w,u,rows}=JSON.parse(await readFile(`${p}/convertido.json`,'utf8'));
const sql=await readFile(`${p}/importar.sql`,'utf8');
const db=await criarBancoLocal('20261008000300');
try{
 await db.exec(`alter table auth.users add column email text;insert into auth.users values('${u}','marcelomurakami.dev@gmail.com'),('00000000-0000-4000-8000-000000000001','staff@example.com');`);
 await db.exec(sql);
 for(const [t,rs]of Object.entries(rows))assert.equal(Number((await db.query(`select count(*) n from ${t.startsWith('private.')?t:'public.'+t}`)).rows[0].n),rs.length,t);
 const totais=(await db.query(`select sum(total_centavos) total from public.ordens_servico where situacao='delivered'`)).rows[0];assert.equal(Number(totais.total),65373500);
 assert.equal(Number((await db.query(`select count(*) n from ordens_servico o where total_centavos<>(select coalesce(sum(total_item_centavos),0) from itens_ordem_servico i where i.ordem_servico_id=o.id)-desconto_centavos`)).rows[0].n),0);
 const saldo=(await db.query(`select natureza,sum(aberto_centavos) saldo from private.financeiro_saldos group by natureza order by natureza`)).rows;assert.deepEqual(saldo.map(r=>[r.natureza,Number(r.saldo)]),[['pagar',200000],['receber',282000]]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${u}',false);`);
 const acesso=(await db.query('select public.consultar_meu_acesso() a')).rows[0].a;assert.equal(acesso[0].perfil,'manager');assert.equal(acesso[0].ramo,'automotivo');
 const arquivo=(await db.query(`select public.consultar_historico_importado('${w}','anotacoes_gerais') a`)).rows[0].a;assert.equal(arquivo.total,1);
 const pago=rows['private.saldos_importados'].find(s=>s.valor_centavos===100000&&rows.titulos_financeiros.some(t=>t.id===s.titulo_id&&t.valor_centavos===150000));assert(pago);
 await db.query(`select public.baixar_titulo_financeiro('${w}','${pago.titulo_id}','00000000-0000-4000-8000-000000000002',50000,0,'2026-10-08','caixa','dinheiro','Teste local do saldo restante')`);
 const detalhe=(await db.query(`select public.consultar_titulo_alerta('${w}','${pago.titulo_id}') d`)).rows[0].d;assert.equal(Number(detalhe.aberto_centavos),0);
 let erro=false;try{await db.query(`select public.baixar_titulo_financeiro('${w}','${pago.titulo_id}','00000000-0000-4000-8000-000000000003',1,0,'2026-10-08','caixa','dinheiro','Excesso')`);}catch{erro=true;}assert(erro);
 await db.exec(`reset role;insert into public.membros_oficina(oficina_id,usuario_id,perfil)values('${w}','00000000-0000-4000-8000-000000000001','staff');set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`);
 erro=false;try{await db.query(`select public.consultar_historico_importado('${w}')`);}catch(e){erro=e.code==='42501';}assert(erro);
 await db.exec('reset role');erro=false;try{await db.exec(sql);}catch(e){erro=e.message.includes('Empresa já existe');await db.exec('rollback');}assert(erro);
 console.log('PASS: contagens, totais de OS/itens, saldos, gerente, arquivo, baixa parcial, excesso negado, colaborador negado e reexecução bloqueada.');
}finally{await db.close();}
