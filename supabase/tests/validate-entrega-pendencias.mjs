import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';import {resolve} from 'node:path';import {writeFile} from 'node:fs/promises';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const {criarCenarioSubsistemas}=await import('./subsistemas-fixture.mjs');
const {especialidades}=await import('../../src/lib/especialidades.ts');
const {db,registros,ids,login}=await criarCenarioSubsistemas();
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];const resultados=[];
try{for(const [perfil,r] of Object.entries(registros).filter(([p])=>especialidades[p].ramo==='automotivo')){
 let checks=0;const ok=(v,m)=>{assert(v,m);checks++;};await login(ids[perfil]);
 const call=(n,a=[])=>one(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a);
 const criar=async()=>{const v=await call('cadastrar_veiculo_orcamento',[r.w,r.cliente,'QA pendências '+uuid(),null]);return call('criar_os_pronta',[r.w,{cliente_id:r.cliente,veiculo_id:v,tipo_servico:especialidades[perfil].tipos[0],itens:[1,2,3].map(n=>({id:uuid(),tipo:'part',descricao:'Peça QA '+n,unidade:'un',quantidade:1,preco_unitario_centavos:1000,situacao:'pending'}))},uuid()]);};
 const ler=id=>call('consultar_ordem_servico',[r.w,id]);
 const normal=o=>call('mover_ordem_no_mapa',[r.w,o.id,o.revisao,'avancar']);
 const concluir=(o,itens,entrada=true)=>call('entregar_ordem_servico_com_pendencias',[r.w,o.id,o.revisao,itens,entrada,'Gerente autorizou manter informações desconhecidas pendentes.']);
 let o=await criar();const ausente=o.itens[0].id,controlada=o.itens[1].id,removida=o.itens[2].id,total=o.total_centavos;
 await call('vincular_estoque_item_os',[r.w,o.id,controlada,r.produto,'estoque',o.revisao]);o=await ler(o.id);
 await db.exec('reset role');await db.query('update public.ordens_servico set recebido_em=null where id=$1',[o.id]);await db.query("update public.itens_ordem_servico set removido_em=now(),removido_por=auth.uid(),situacao='cancelled' where id=$1",[removida]);await login(ids[perfil]);o=await ler(o.id);
 await assert.rejects(()=>normal(o),/entrada/);checks++;
 await assert.rejects(()=>concluir(o,[ausente],false),/entrada/);checks++;
 await db.exec('reset role');ok(await one('select count(*)::int from private.autorizacoes_entrega_pendente where ordem_servico_id=$1',[o.id])===0,'Falha reverte autorização');await login(ids[perfil]);
 await assert.rejects(()=>concluir(o,[ausente,controlada]),/vínculo de estoque/);checks++;
 await assert.rejects(()=>concluir({...o,revisao:o.revisao-1},[ausente]),e=>e.code==='PT409');checks++;
 await login(ids.stranger);await assert.rejects(()=>concluir(o,[ausente]),e=>e.code==='42501');checks++;await login(ids[perfil]);
 const staff=uuid();await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[staff]);await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values($1,$2,'staff',true)",[r.w,staff]);await login(staff);await assert.rejects(()=>concluir(o,[ausente]),e=>e.code==='42501');checks++;await login(ids[perfil]);
 await concluir(o,[ausente]);const final=await ler(o.id);ok(final.situacao==='delivered','Entregue');ok(final.recebido_em===null,'Data não inventada');ok(final.total_centavos===total,'Valor preservado');ok(final.itens.find(i=>i.id===ausente).origem_peca===null,'Origem desconhecida preservada');
 ok(final.historico.some(h=>h.tipo_evento==='delivery_pending_data'&&h.metadados.entrada_sem_data&&h.metadados.pecas_sem_origem[0].id===ausente),'Pendências visíveis no histórico');
 await db.exec('reset role');ok(Number(await one('select saldo from public.estoque_produtos where oficina_id=$1 and item_catalogo_id=$2',[r.w,r.produto]))===9,'Baixa só da peça vinculada');ok(await one('select count(*)::int from public.movimentacoes_estoque where ordem_servico_id=$1',[o.id])===1,'Sem baixa inventada nem peça removida');ok(await one('select count(*)::int from public.baixas_financeiras where oficina_id=$1',[r.w])===0,'Sem pagamento inventado');await login(ids[perfil]);
 await assert.rejects(()=>concluir(final,[ausente]),/exclusiva para OS prontas/);checks++;
 let segunda=await criar();await assert.rejects(()=>normal(segunda),/origem/);checks++;
 await assert.rejects(()=>concluir(segunda,[ausente],false),/vínculo de estoque/);checks++;
 // Autorização de origem desconhecida não pode permitir estoque negativo.
 await call('vincular_estoque_item_os',[r.w,segunda.id,segunda.itens[1].id,r.produto,'estoque',segunda.revisao]);segunda=await ler(segunda.id);
 await db.exec('reset role');await db.query('update public.itens_ordem_servico set quantidade=20 where id=$1',[segunda.itens[1].id]);await login(ids[perfil]);
 await assert.rejects(()=>concluir(segunda,[segunda.itens[0].id,segunda.itens[2].id],false),/insuficiente/);checks++;
 ok((await ler(segunda.id)).situacao==='ready','Falha mantém OS pronta');
 await db.exec('reset role');ok(await one('select count(*)::int from private.autorizacoes_entrega_pendente where ordem_servico_id=$1',[segunda.id])===0,'Falha de saldo reverte exceção');await login(ids[perfil]);
 resultados.push({perfil,ok:true,checks});console.log('PASS',perfil,checks);
}}catch(e){process.exitCode=1;console.error(e);}finally{await db.close();await writeFile('output/conclusao-prontas-20261105/testes.json',JSON.stringify({ok:!process.exitCode,resultados,total:resultados.reduce((n,r)=>n+r.checks,0)},null,2));}
