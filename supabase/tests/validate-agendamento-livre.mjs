import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {criarBancoLocal} from './banco-local.mjs';
const db=await criarBancoLocal('20261009001600');
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
try {
 const u=randomUUID();
 await db.exec(`insert into auth.users values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
 const w=await one("select public.criar_oficina('Agenda teste',null)");
 await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${w}';set role authenticated;`);
 const c=(await one('select public.salvar_cliente($1,$2)',[w,{nome:'Cliente agenda'}])).id;
 const v=await one('select public.cadastrar_veiculo_orcamento($1,$2,$3,$4)',[w,c,'Polo','QAQ1A23']);

 const livre=randomUUID(), inicio=new Date(Date.now()+3600000).toISOString();
 const op=(acao,dados)=>one('select public.operar_produtividade($1,$2,$3)',[w,acao,dados]);
 const dados={id:livre,cliente_id:c,identificacao:'Cabeçote Gol 1.6',inicio,fim:null,recurso:'Bancada livre',servico:'Conferir cabeçote'};
 await op('salvar_agenda',dados);
 let agenda=(await one('select public.consultar_produtividade($1)',[w])).agenda.find(x=>x.id===livre);
 assert.equal(agenda.fim,null);assert.equal(agenda.veiculo_id,null);assert.equal(agenda.veiculo,'Cabeçote Gol 1.6');
 await assert.rejects(op('salvar_agenda',{...dados,id:randomUUID()}));
 await assert.rejects(op('salvar_agenda',{...dados,id:randomUUID(),recurso:'Outra',fim:new Date(Date.now()).toISOString()}));
 await op('salvar_agenda',{...dados,revisao:1,identificacao:'Bloco motor',fim:new Date(Date.now()+7200000).toISOString()});
 await op('salvar_agenda',{...dados,revisao:2,identificacao:'Bloco motor'});
 const convertido=await op('converter_agenda',{id:livre,revisao:3});
 const novamente=await op('converter_agenda',{id:livre,revisao:3});
 assert.equal(convertido.os,novamente.os);
 agenda=(await one('select public.consultar_produtividade($1)',[w])).agenda.find(x=>x.id===livre);
 assert.equal(agenda.situacao,'convertido');assert.equal(agenda.veiculo,'Bloco motor');assert.ok(agenda.veiculo_id);
 console.log('PASS agendamento manual, fim opcional, edição, conflito, intervalo inválido e conversão idempotente para OS');
 const ids=[];
 for(const [dias,situacao] of [[1,'agendado'],[-1,'agendado'],[8,'agendado'],[0,'cancelado'],[0,'convertido'],[-91,'agendado']]){
  const id=randomUUID();ids.push(id);
  await db.exec('reset role');
  await db.query("insert into public.agenda_atendimentos(id,oficina_id,cliente_id,veiculo_id,recurso,inicio,fim,servico,situacao) values($1,$2,$3,$4,'Box 1',now()+$5*interval '1 day',now()+$5*interval '1 day'+interval '1 hour','Revisão',$6)",[id,w,c,v,dias,situacao]);
  await db.exec('set role authenticated');
 }
 const read=async()=> (await one('select public.consultar_alertas($1)',[w])).filter(x=>x.tipo==='agenda');
 let r=await read();assert.equal(r.length,2);
 assert.equal(r.find(x=>x.id===ids[1]).horario_passou,true);
 assert.equal(r.find(x=>x.id===ids[0]).horario_passou,false);
 assert.equal(r[0].destino,'/produtividade?agendamento='+ids[1]);
 const key=r.find(x=>x.id===ids[0]).chave;
 await one('select public.marcar_alertas_lidos($1,$2)',[w,[key]]);
 assert.equal((await read()).find(x=>x.id===ids[0]).lido,true);
 await one('select public.excluir_alerta($1,$2)',[w,key]);
 assert.equal((await read()).length,1);
 await db.exec('reset role');
 await db.query("update public.agenda_atendimentos set inicio=inicio+interval '1 hour',fim=fim+interval '1 hour' where id=$1",[ids[0]]);
 await db.exec('set role authenticated');
 r=await read();assert.equal(r.length,2);assert.equal(r.find(x=>x.id===ids[0]).lido,false);
 await one('select public.operar_produtividade($1,$2,$3)',[w,'cancelar_agenda',{id:ids[0],revisao:1}]);
 assert.equal((await read()).length,1);
 await one('select public.operar_produtividade($1,$2,$3)',[w,'converter_agenda',{id:ids[1],revisao:1}]);
 assert.equal((await read()).length,0);
 const other=randomUUID();
 await db.exec(`reset role;insert into auth.users values('${other}');select set_config('request.jwt.claim.sub','${other}',false);set role authenticated;`);
 await assert.rejects(read);
 console.log('PASS agenda: janela de avisos, atraso, leitura, exclusão, reagendamento, cancelamento, recebimento e isolamento');
} finally {await db.close();}
