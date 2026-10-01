import assert from 'node:assert/strict';
import {criarBancoLocal} from './banco-local.mjs';
const db=await criarBancoLocal('20261001000600');let n=0;
const uid='97000000-0000-4000-8000-000000000001',other='97000000-0000-4000-8000-000000000002',product='97000000-0000-4000-8001-000000000001';
const esc=v=>`'${String(v).replaceAll("'","''")}'`,js=v=>esc(JSON.stringify(v))+'::jsonb';
const scalar=async sql=>Object.values((await db.query(sql)).rows[0])[0];
const ok=(a,msg)=>{assert.ok(a,msg);n++;console.log('PASS',msg)};
const fail=async(sql,code,msg)=>{await assert.rejects(()=>db.exec(sql),e=>e.code===code);n++;console.log('PASS',msg)};
const login=async(id,role='authenticated')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`);
try{
 await db.exec(`insert into auth.users values('${uid}'),('${other}')`);await login(uid);const w=await scalar("select public.criar_oficina('Teste estoque',null)");
 await fail(`select public.listar_estoque('${w}')`,'42501','Básico não acessa estoque');
 await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}'`);await login(uid);
 await db.exec(`select public.salvar_produto_estoque('${w}',${js({descricao:'Filtro de óleo',codigo:'FLT-01',unidade:'un',preco_padrao_centavos:3500,custo_centavos:2000,minimo:2})},'${product}')`);
 let lista=await scalar(`select public.listar_estoque('${w}')`);ok(lista.itens[0].saldo===0&&lista.resumo.baixos===1,'cadastro inicia zerado e alerta mínimo');
 const key='97000000-0000-4000-8002-000000000001';
 const mov=await scalar(`select public.movimentar_estoque('${w}','${product}','entrada',10,'Compra inicial','${key}',1)`);
 ok(await scalar(`select public.movimentar_estoque('${w}','${product}','entrada',10,'Compra inicial','${key}',1)` )===mov,'entrada idempotente');
 await fail(`select public.movimentar_estoque('${w}','${product}','saida',20,'Perda teste',gen_random_uuid(),2)`,'22023','não permite saldo negativo');
 await fail(`select public.movimentar_estoque('${w}','${product}','entrada',1,'Compra teste',gen_random_uuid(),1)`,'PT409','saldo concorrente protegido');
 await login(other);await fail(`select public.listar_estoque('${w}')`,'42501','RPC isolada por oficina');ok(await scalar(`select count(*) from public.estoque_produtos`)===0,'RLS esconde estoque de outra oficina');await login(uid);
 await fail(`update public.estoque_produtos set saldo=100`,'42501','escrita direta bloqueada');
 await fail(`delete from public.movimentacoes_estoque`,'42501','histórico não pode ser apagado');
 const c=(await scalar(`select public.salvar_cliente('${w}','{"nome":"Cliente teste"}')`)).id,v=await scalar(`select public.cadastrar_veiculo_orcamento('${w}','${c}','Gol','ABC1D23')`);
 let os=await scalar(`select public.salvar_ordem_servico('${w}',${js({cliente_id:c,veiculo_id:v})},gen_random_uuid())`);
 await db.exec(`select public.adicionar_peca_estoque_os('${w}','${os.id}','${product}',3,${os.revisao})`);
 os=await scalar(`select public.consultar_ordem_servico('${w}','${os.id}')`);ok(os.itens[0].produto_estoque_id===product&&os.total_centavos===10500,'OS inclui produto e preço do catálogo');
 await db.exec(`select public.salvar_item_os('${w}','${os.id}',${os.revisao},'{"situacao":"done"}','${os.itens[0].id}')`);
 for(const status of ['in_progress','quality_check','ready']){os=await scalar(`select public.consultar_ordem_servico('${w}','${os.id}')`);await db.exec(`select public.atualizar_mapa_ordem_servico('${w}','${os.id}',${os.revisao},'${status}',null,null,null,'${os.recebido_em}')`);}
 ok((await scalar(`select public.listar_estoque('${w}')`)).itens[0].saldo===10,'antes da entrega não há baixa');
 os=await scalar(`select public.consultar_ordem_servico('${w}','${os.id}')`);
 await db.exec(`select public.atualizar_mapa_ordem_servico('${w}','${os.id}',${os.revisao},'delivered',null,null,null,'${os.recebido_em}')`);
 ok((await scalar(`select public.listar_estoque('${w}')`)).itens[0].saldo===7,'entrega baixa a quantidade correta');
 const hist=await scalar(`select public.consultar_movimentacoes_estoque('${w}','${product}')`),consumo=hist.find(x=>x.tipo==='consumo_os');ok(consumo.ordem_servico_id===os.id&&consumo.quantidade===-3,'movimento aponta OS de origem');
 await db.exec(`reset role;update public.ordens_servico set situacao='delivered' where id='${os.id}'`);await login(uid);ok((await scalar(`select public.listar_estoque('${w}')`)).itens[0].saldo===7,'repetição não duplica baixa');
 const estorno=await scalar(`select public.estornar_movimentacao_estoque('${w}','${consumo.id}','Peças devolvidas')`);ok((await scalar(`select public.listar_estoque('${w}')`)).itens[0].saldo===10,'devolução restaura saldo');
 ok(await scalar(`select public.estornar_movimentacao_estoque('${w}','${consumo.id}','Peças devolvidas')`)===estorno,'estorno idempotente');
 let os2=await scalar(`select public.salvar_ordem_servico('${w}',${js({cliente_id:c,veiculo_id:v})},gen_random_uuid())`);
 for(const qty of [6,6]){await db.exec(`select public.adicionar_peca_estoque_os('${w}','${os2.id}','${product}',${qty},${os2.revisao})`);os2=await scalar(`select public.consultar_ordem_servico('${w}','${os2.id}')`);const i=os2.itens.at(-1);await db.exec(`select public.salvar_item_os('${w}','${os2.id}',${os2.revisao},'{"situacao":"done"}','${i.id}')`);os2=await scalar(`select public.consultar_ordem_servico('${w}','${os2.id}')`);}
 for(const status of ['in_progress','quality_check','ready']){os2=await scalar(`select public.consultar_ordem_servico('${w}','${os2.id}')`);await db.exec(`select public.atualizar_mapa_ordem_servico('${w}','${os2.id}',${os2.revisao},'${status}',null,null,null,'${os2.recebido_em}')`);}
 os2=await scalar(`select public.consultar_ordem_servico('${w}','${os2.id}')`);await fail(`select public.atualizar_mapa_ordem_servico('${w}','${os2.id}',${os2.revisao},'delivered',null,null,null,'${os2.recebido_em}')`,'22023','soma dos itens respeita saldo');
 ok((await scalar(`select public.listar_estoque('${w}')`)).itens[0].saldo===10&&(await scalar(`select public.consultar_ordem_servico('${w}','${os2.id}')`)).situacao==='ready','falha reverte saldo e entrega integralmente');
 for(const i of os2.itens){await db.exec(`select public.vincular_estoque_item_os('${w}','${os2.id}','${i.id}',null,'cliente',${os2.revisao})`);os2=await scalar(`select public.consultar_ordem_servico('${w}','${os2.id}')`);}
 await db.exec(`select public.atualizar_mapa_ordem_servico('${w}','${os2.id}',${os2.revisao},'delivered',null,null,null,'${os2.recebido_em}')`);ok((await scalar(`select public.listar_estoque('${w}')`)).itens[0].saldo===10,'peça do cliente não baixa estoque');
 const p=(await scalar(`select public.listar_estoque('${w}')`)).itens[0];await db.exec(`select public.movimentar_estoque('${w}','${product}','ajuste',8,'Contagem mensal',gen_random_uuid(),${p.revisao})`);ok((await scalar(`select public.listar_estoque('${w}')`)).itens[0].saldo===8,'contagem informa saldo absoluto');
 await fail(`select public.arquivar_produto_estoque('${w}','${product}',true)`,'22023','produto com saldo não pode ser arquivado');
 const saldoAntes=(await scalar(`select public.listar_estoque('${w}')`)).itens[0];
 await fail(`select public.movimentar_estoque('${w}','${product}','entrada',0.0001,'Precisão inválida',gen_random_uuid(),${saldoAntes.revisao})`,'22023','precisão acima de três casas bloqueada');
 await db.exec(`select public.movimentar_estoque('${w}','${product}','ajuste',0,'Inventário zerado',gen_random_uuid(),${saldoAntes.revisao})`);
 await db.exec(`select public.arquivar_produto_estoque('${w}','${product}',true)`);
 ok((await scalar(`select public.listar_estoque('${w}','','arquivados')`)).total===1,'arquivamento reversível com saldo zero');
 await db.exec(`select public.arquivar_produto_estoque('${w}','${product}',false)`);
 ok((await scalar(`select public.listar_estoque('${w}')`)).total===1,'restauração mantém cadastro');
 await db.exec(`reset role;update public.assinaturas_oficina set situacao='suspended' where oficina_id='${w}'`);await login(uid);
 await fail(`select public.listar_estoque('${w}')`,'42501','assinatura suspensa bloqueia estoque');
 ok(await scalar(`select count(*) from public.movimentacoes_estoque`)===0,'RLS de movimentos respeita assinatura');
 await login(uid,'anon');await fail(`select public.listar_estoque('${w}')`,'42501','acesso anônimo bloqueado');
 console.log(n+' verificações aprovadas.');
}catch(e){console.error(e.message,e.code,e.where??'');process.exitCode=1;}finally{await db.close()}
