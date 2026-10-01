import assert from 'node:assert/strict';
import {criarBancoLocal} from './banco-local.mjs';
let db;let n=0;
const uid='99000000-0000-4000-8000-000000000001',other='99000000-0000-4000-8000-000000000002',staff='99000000-0000-4000-8000-000000000003';
const scalar=async s=>Object.values((await db.query(s)).rows[0])[0];
const ok=(a,m)=>{assert.ok(a,m);n++;console.log('PASS',m)};
const fail=async(s,c,m)=>{await assert.rejects(()=>db.exec(s),e=>e.code===c);n++;console.log('PASS',m)};
const login=async(id,role='authenticated')=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`);
try{db=await criarBancoLocal('20261001000600');await db.exec(`insert into auth.users values('${uid}'),('${other}'),('${staff}')`);await login(uid);const w=await scalar("select public.criar_oficina('Oficina teste gestão',null)");
 const data=await scalar("select (now() at time zone 'America/Sao_Paulo')::date::text");
 const config=await scalar(`select public.consultar_configuracoes_oficina('${w}')`);ok(config.nome==='Oficina teste gestão','consulta configurações no Básico');
 await db.exec(`select public.salvar_configuracoes_oficina('${w}',1,'Oficina atualizada','+5516999999999','{"cidade":"Franca"}')`);ok((await scalar(`select public.consultar_configuracoes_oficina('${w}')`)).revisao===2,'configurações persistidas com revisão');
 await fail(`select public.salvar_configuracoes_oficina('${w}',1,'Nome antigo',null,'{}')`,'PT409','edição concorrente bloqueada');
 await fail(`select public.salvar_configuracoes_oficina('${w}',2,'Oficina','123','{}')`,'22023','telefone inválido rejeitado');
 await fail(`select public.consultar_relatorios('${w}','${data}','${data}')`,'42501','Básico não acessa relatórios');
 await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';insert into public.membros_oficina(oficina_id,usuario_id,perfil) values('${w}','${staff}','staff')`);await login(uid);
 let r=await scalar(`select public.consultar_relatorios('${w}','${data}','${data}')`);ok(r.atual.entregues===0&&r.atual.prazo_medio===null&&r.operacao.ativas===0,'sem dados não inventa produção ou prazo');ok(r.inicio_anterior===r.fim_anterior,'comparação usa mesmo número de dias');
 const h=await scalar(`select public.consultar_historico_gestao('${w}','${data}','${data}','oficina')`);ok(h.itens.some(x=>x.descricao==='Configurações da oficina atualizadas'),'alteração gera histórico');
 ok((await scalar(`select public.consultar_historico_gestao('${w}','${data}','${data}','','configuracoes')`)).total===1,'busca em português aceita texto sem acento');
 const c=(await scalar(`select public.salvar_cliente('${w}','{"nome":"Cliente relatório"}')`)).id,v=await scalar(`select public.cadastrar_veiculo_orcamento('${w}','${c}','Gol','REL1D23')`);const os=await scalar(`select public.salvar_ordem_servico('${w}','{"cliente_id":"${c}","veiculo_id":"${v}"}',gen_random_uuid())`);
 r=await scalar(`select public.consultar_relatorios('${w}','${data}','${data}')`);ok(r.operacao.ativas===1&&r.operacao.sem_previsao===1,'atendimento sem previsão aparece como ação');
 await db.exec(`reset role;update public.ordens_servico set entrega_prevista_em=now()-interval '1 day' where id='${os.id}'`);await login(uid);r=await scalar(`select public.consultar_relatorios('${w}','${data}','${data}')`);ok(r.operacao.atrasadas===1&&r.atencao[0].id===os.id,'atraso aponta atendimento real');
 ok((await scalar(`select public.consultar_historico_gestao('${w}','${data}','${data}','ordem_servico')`)).itens.length>0,'histórico de OS integrado');

 await db.exec(`reset role;update public.ordens_servico set recebido_em=now()-interval '2 days',situacao='delivered',entregue_em=now(),subtotal_centavos=10000 where id='${os.id}'`);await login(uid);
 r=await scalar(`select public.consultar_relatorios('${w}','${data}','${data}')`);ok(r.atual.entregues===1&&r.atual.vendido===10000&&r.atual.ticket===10000,'entregas e valor médio calculados do período');ok(r.atual.com_previsao===1&&r.atual.no_prazo===0&&r.atual.prazo_medio===2,'pontualidade e tempo médio corretos');ok(r.clientes[0].total===10000&&r.anterior.entregues===0,'ranking e período anterior isolados');
 await fail(`select public.consultar_relatorios('${w}','2020-01-01','2026-01-01')`,'22023','período limitado');
 await login(staff);ok((await scalar(`select public.consultar_configuracoes_oficina('${w}')`)).nome==='Oficina atualizada','funcionário lê dados da própria oficina');await fail(`select public.salvar_configuracoes_oficina('${w}',2,'Mudança indevida',null,'{}')`,'42501','funcionário não edita configurações');await fail(`select public.consultar_relatorios('${w}','${data}','${data}')`,'42501','funcionário não vê relatórios');
 await login(other);await fail(`select public.consultar_historico_gestao('${w}','${data}','${data}')`,'42501','outra oficina não acessa histórico');await fail(`select public.consultar_configuracoes_oficina('${w}')`,'42501','outra oficina não lê configurações');
 await login(uid,'anon');await fail(`select public.consultar_relatorios('${w}','${data}','${data}')`,'42501','relatórios sem acesso anônimo');
 console.log(n+' verificações aprovadas.');
}catch(e){console.error(e.message,e.code,e.where||'');process.exitCode=1;}finally{if(db)await db.close();}

