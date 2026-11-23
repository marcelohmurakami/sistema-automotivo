import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {criarBancoLocal} from './banco-local.mjs';
const db=await criarBancoLocal('20261009000300');
const scalar=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
try {
const u=randomUUID();await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated`);
const w=await scalar("select public.criar_oficina('Retífica técnica',null)");
await db.exec(`reset role;update public.oficinas set especialidade='retifica' where id='${w}';update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';set role authenticated`);

const d={cliente_id:null,cliente_nome_livre:'Cliente avulso',veiculo_id:'',carro_livre:'Gol',motor_livre:'AP',pecas_a_trocar:'1 jogo de juntas — cliente vai providenciar',tipo_servico:'cabecote',detalhes_especialidade:'Teste de pressão',queixa_cliente:'Motor aquecendo',diagnostico:'Trinca identificada',codigos_falha:'P0300 – falha de combustão',observacoes:'Conferir após montagem',condicoes:'30 dias',itens:[{tipo:'service',descricao:'Retífica de cabeçote',unidade:'serv',quantidade:1,preco_unitario_centavos:50000,grupo_servico:'Motor'}],desconto_centavos:0};
const chave=randomUUID();let q=await scalar('select public.salvar_orcamento($1,$2,$3)',[w,d,chave]);assert.equal(q.versao.dados_veiculo.motor,'AP');assert.equal(q.versao.pecas_a_trocar,d.pecas_a_trocar);const count=await scalar('select count(*) from public.veiculos');await scalar('select public.salvar_orcamento($1,$2,$3)',[w,d,chave]);assert.equal(await scalar('select count(*) from public.veiculos'),count);
for(const f of ['tipo_servico','detalhes_especialidade','queixa_cliente','diagnostico','codigos_falha']) assert.equal(q.versao[f],d[f]);
await assert.rejects(()=>scalar('select public.salvar_orcamento($1,$2,$3)',[w,{...d,tipo_servico:'celular'},randomUUID()]));
const photo=await scalar("select public.reservar_foto_orcamento($1,$2,'teste.png','image/png',100,'Trinca no cabeçote')",[w,q.versao.id]);
await db.exec(`reset role`);await db.query("insert into storage.objects(bucket_id,name) values('workshop-files',$1)",[photo.caminho]);await db.exec('set role authenticated');
await scalar('select public.confirmar_foto_orcamento($1,$2)',[w,photo.id]);
const token='b'.repeat(64);await scalar('select public.emitir_orcamento($1,$2,$3,7,$4)',[w,q.id,q.revisao,createHash('sha256').update(token).digest('hex')]);
const pub=await scalar('select public.consultar_orcamento_publico($1)',[token]);assert.equal(pub.versao.codigos_falha,d.codigos_falha);assert.equal(pub.versao.pecas_a_trocar,d.pecas_a_trocar);assert.equal(pub.versao.dados_veiculo.motor,'AP');
q=await scalar('select public.consultar_orcamento($1,$2)',[w,q.id]);q=await scalar('select public.revisar_orcamento($1,$2,$3)',[w,q.id,q.revisao]);assert.equal(q.versao.diagnostico,d.diagnostico);assert.equal((await scalar('select public.listar_fotos_orcamento($1,$2)',[w,q.versao.id])).length,1);
q=await scalar('select public.editar_orcamento($1,$2,$3,$4,$5)',[w,{...d,diagnostico:'Trinca confirmada'},randomUUID(),q.id,q.revisao]);
await scalar('select public.emitir_orcamento($1,$2,$3,7,$4)',[w,q.id,q.revisao,createHash('sha256').update('c'.repeat(64)).digest('hex')]);q=await scalar('select public.consultar_orcamento($1,$2)',[w,q.id]);
await scalar('select public.aprovar_orcamento_interno($1,$2,$3,$4)',[w,q.id,q.revisao,q.versao.id]);
const oid=await scalar('select public.converter_orcamento_em_os($1,$2)',[w,q.id]);
const o=await scalar('select public.consultar_ordem_servico($1,$2)',[w,oid]);assert.equal(o.tipo_servico,'cabecote');assert.equal(o.dados_veiculo.motor,'AP');assert.equal(o.pecas_a_trocar,d.pecas_a_trocar);assert.equal(o.total_centavos,50000);assert.equal(o.diagnostico,'Trinca confirmada');assert.equal(o.codigos_falha,d.codigos_falha);assert.equal(o.fotos.length,1);assert.equal(o.fotos[0].legenda,'Trinca no cabeçote');
assert.equal(await scalar('select public.converter_orcamento_em_os($1,$2)',[w,q.id]),oid);assert.equal((await scalar('select public.consultar_ordem_servico($1,$2)',[w,oid])).fotos.length,1);
const v2=await scalar("select public.cadastrar_veiculo_orcamento($1,null,'Corsa',null)",[w]);let pending=await scalar('select public.salvar_orcamento($1,$2,$3)',[w,{...d,veiculo_id:v2},randomUUID()]);const po=await scalar('select public.criar_os_aguardando_orcamento($1,$2)',[w,pending.id]);
await scalar('select public.emitir_orcamento($1,$2,$3,7,$4)',[w,pending.id,pending.revisao,createHash('sha256').update('d'.repeat(64)).digest('hex')]);pending=await scalar('select public.consultar_orcamento($1,$2)',[w,pending.id]);await scalar('select public.aprovar_orcamento_interno($1,$2,$3,$4)',[w,pending.id,pending.revisao,pending.versao.id]);assert.equal((await scalar('select public.consultar_ordem_servico($1,$2)',[w,po])).codigos_falha,d.codigos_falha);
await scalar('select public.salvar_os_com_itens($1,$2,$3,$4,$5)',[w,{...o,pecas_a_trocar:'2 pistões — fornecidos pelo cliente'},randomUUID(),o.id,o.revisao]);assert.equal((await scalar('select public.consultar_ordem_servico($1,$2)',[w,o.id])).pecas_a_trocar,'2 pistões — fornecidos pelo cliente');console.log('PASS carro/motor livre, idempotência, edição/revisão, lista de peças, documento público, conversão e totais preservados');
} catch(e) {console.error(e.message,e.code,e.where);process.exitCode=1;}finally{await db.close();}
