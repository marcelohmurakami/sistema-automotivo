import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const out=resolve('output/lembretes-financeiros-20261117'),resultados=[];let db,checks=0;
const ok=(cond,msg)=>{assert(cond,msg);checks++};
try {
 const c=await criarCenarioSubsistemas();db=c.db;
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const call=(fn,args)=>one(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 for(const [perfil,r] of Object.entries(c.registros)) {
  const antes=checks,start=performance.now();await c.login(c.ids[perfil]);
  const get=(pagina=0)=>call('consultar_lembretes_financeiros',[r.w,pagina]);
  const set=(acao,dados={})=>call('atualizar_lembretes_financeiros',[r.w,acao,dados]);
  const ids={};const futura='2030-01-31';
  for(const [nome,natureza,vencimento] of [['receber','receber',r.hoje],['pagar','pagar',r.hoje],['futura','pagar',futura],['cancelada','pagar',r.hoje],['provisoria','receber',r.hoje]]) {
   ids[nome]=randomUUID();await call('salvar_titulo_financeiro',[r.w,ids[nome],{natureza,vencimento,competencia:r.hoje,descricao:'QA Lembrete '+nome,categoria:natureza==='pagar'?'outras_despesas':'outras_receitas',valor_centavos:10000}]);
  }
  await db.exec('reset role');await db.query('update public.titulos_financeiros set cancelado_em=now() where id=$1',[ids.cancelada]);
  await db.query('update public.titulos_financeiros set provisorio=true,pagamento_combinado=false where id=$1',[ids.provisoria]);await c.login(c.ids[perfil]);
  let res=await get();const tem=id=>res.itens.find(x=>x.id===id);
  ok(tem(ids.receber)&&tem(ids.pagar),'Contas vencendo hoje aparecem');
  ok(!tem(ids.futura)&&!tem(ids.cancelada)&&!tem(ids.provisoria),'Futura, cancelada e provisória não cobram');
  ok(res.preferencias.mostrar_entrada&&res.preferencias.horario.startsWith('17:00'),'Padrões claros');
  await call('baixar_titulo_financeiro',[r.w,ids.receber,randomUUID(),4000,0,r.hoje,'banco','pix']);res=await get();ok(tem(ids.receber).valor_centavos===6000,'Parcial mostra só saldo');
  await set('configurar',{mostrar_entrada:false,frequencia:'todos',horario:'08:30'});await set('conferir');
  res=await get();ok(!res.preferencias.mostrar_entrada&&res.preferencias.horario.startsWith('08:30')&&res.preferencias.conferido_em===r.hoje,'Preferências e conferência persistem');
  const aviso=(await call('consultar_alertas',[r.w])).find(x=>x.id===ids.pagar);ok(aviso,'Aviso financeiro presente');
  await call('marcar_alertas_lidos',[r.w,[aviso.chave]]);
  const ate=new Date(Date.now()+3600000).toISOString();await set('adiar_item',{id:ids.pagar,tipo:'financeiro',ate});res=await get();ok(!tem(ids.pagar)&&res.adiamentos.some(x=>x.id===ids.pagar),'Adiar remove aviso, não dívida');
  await c.login(c.ids.stranger);await assert.rejects(get,e=>e.code==='42501');checks++;
  await db.exec('reset role');await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil) values($1,$2,'manager')",[r.w,c.ids.stranger]);await c.login(c.ids.stranger);
  const outro=await get();ok(outro.preferencias.mostrar_entrada&&outro.adiamentos.length===0&&outro.itens.some(x=>x.id===ids.pagar),'Adiar e configurar não afeta colega');
  await c.login(c.ids[perfil]);
  await db.exec('reset role');await db.query("update public.adiamentos_lembretes_financeiros set ate=now()-interval '1 second' where oficina_id=$1",[r.w]);await c.login(c.ids[perfil]);
  res=await get();ok(tem(ids.pagar),'Aviso volta após expirar');
  ok(!(await call('consultar_alertas',[r.w])).find(x=>x.id===ids.pagar).lido,'Aviso adiado volta como não lido');
  await call('excluir_alerta',[r.w,aviso.chave]);await set('adiar_item',{id:ids.pagar,tipo:'financeiro',ate});
  ok(!(await call('consultar_alertas',[r.w])).some(x=>x.chave===aviso.chave),'Adiamento preserva exclusão explícita');
  await set('adiar_item',{id:ids.pagar,tipo:'financeiro',ate});
  await db.exec('reset role');await db.query("update public.titulos_financeiros set vencimento=vencimento-1 where id=$1",[ids.pagar]);await c.login(c.ids[perfil]);
  res=await get();ok(tem(ids.pagar),'Mudança de vencimento invalida adiamento antigo');
  await set('adiar',{ate});res=await get();ok(Date.parse(res.preferencias.adiado_ate)===Date.parse(ate),'Resumo pode ser adiado');
  await set('reativar');res=await get();ok(!res.preferencias.adiado_ate&&res.adiamentos.length===0,'Reativação limpa apenas preferências pessoais');
  await call('baixar_titulo_financeiro',[r.w,ids.receber,randomUUID(),6000,0,r.hoje,'banco','pix']);res=await get();ok(!tem(ids.receber),'Quitação retira lembrete');
  await assert.rejects(()=>set('adiar_item',{id:ids.receber,tipo:'financeiro',ate}),e=>e.code==='22023');checks++;
  await assert.rejects(()=>set('adiar',{ate:'2020-01-01'}),e=>e.code==='22023');checks++;
  await assert.rejects(()=>set('configurar',{mostrar_entrada:true,frequencia:'todos',horario:'25:00'}),e=>e.code==='22023');checks++;
  await assert.rejects(()=>get(-1),e=>e.code==='22023');checks++;
  const recorrencia=randomUUID();await call('salvar_conta_recorrente',[r.w,recorrencia,{descricao:'QA Lembrete mensal sem valor',natureza:'pagar',categoria:'agua_luz',valor_centavos:0,valor_variavel:true,dia:Number(r.hoje.slice(-2)),inicio:r.hoje,ativa:true},0]);
  res=await get();const mensal=res.itens.find(x=>x.descricao==='QA Lembrete mensal sem valor');ok(mensal?.valor_pendente&&mensal.valor_centavos===null,'Valor variável não é inventado');
  await set('adiar_item',{id:mensal.id,tipo:'conta_mensal',ate});res=await get();ok(!tem(mensal.id),'Conta mensal também permite adiar');
  await set('reativar');await call('informar_valor_conta_mensal',[r.w,mensal.id,5990]);res=await get();ok(!tem(mensal.id)&&res.itens.some(x=>x.descricao===mensal.descricao&&x.valor_centavos===5990),'Informar valor troca pendência por título, sem duplicação');
  await db.exec('reset role');const saldoAntes=await one('select sum(valor_centavos) from public.baixas_financeiras where oficina_id=$1',[r.w]);await c.login(c.ids[perfil]);
  await set('conferir');await set('adiar',{ate});await set('reativar');await db.exec('reset role');
  ok(saldoAntes===await one('select sum(valor_centavos) from public.baixas_financeiras where oficina_id=$1',[r.w]),'Conferir e adiar não movimenta dinheiro');
  await db.query("update public.membros_oficina set perfil='staff' where oficina_id=$1 and usuario_id=$2",[r.w,c.ids.stranger]);await c.login(c.ids.stranger);
  await assert.rejects(get,e=>e.code==='42501');await assert.rejects(()=>set('conferir'),e=>e.code==='42501');checks+=2;
  await c.login(c.ids[perfil],'anon');await assert.rejects(get,e=>e.code==='42501');checks++;
  await db.exec('reset role');await db.query('delete from public.membros_oficina where oficina_id=$1 and usuario_id=$2',[r.w,c.ids.stranger]);
  resultados.push({perfil,checks:checks-antes,segundos:(performance.now()-start)/1000,ok:true});console.log('PASS',perfil,checks-antes);
 }
 const r=Object.values(c.registros)[0], usuario=Object.values(c.ids)[0];
 await c.login(usuario);
 const get=()=>call('consultar_lembretes_financeiros',[r.w,0]);
 const set=(acao,dados={})=>call('atualizar_lembretes_financeiros',[r.w,acao,dados]);
 const outroId=randomUUID();
 await db.exec('reset role');
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[outroId,'gerente@lembretes.test']);
 await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil) values($1,$2,'manager')",[r.w,outroId]);
 await db.query("insert into public.restricoes_acesso(oficina_id,usuario_id,regras,autor) values($1,$2,'{\"financeiro\":\"nenhum\"}',$3)",[r.w,outroId,usuario]);
 await c.login(outroId);await assert.rejects(get,e=>e.code==='42501');await assert.rejects(()=>set('conferir'),e=>e.code==='42501');checks+=2;
 await db.exec('reset role');
 await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')",[usuario]);await c.login(usuario);
 await assert.rejects(get,e=>e.code==='PT403');await assert.rejects(()=>set('conferir'),e=>e.code==='PT403');checks+=2;
 await db.exec('reset role');await db.query('delete from auth.mfa_factors where user_id=$1',[usuario]);
 await db.query("update public.assinaturas_oficina set codigo_plano='basic' where oficina_id=$1",[r.w]);await c.login(usuario);
 await assert.rejects(get,e=>e.code==='42501');checks++;
 await db.exec('reset role');await db.query("update public.assinaturas_oficina set codigo_plano='complete' where oficina_id=$1",[r.w]);await c.login(usuario);
 const idsPagina=[];
 for(let i=0;i<25;i++){const id=randomUUID();idsPagina.push(id);await call('salvar_titulo_financeiro',[r.w,id,{natureza:'receber',categoria:'outras_receitas',valor_centavos:12345,descricao:'QA pagina '+i,competencia:r.hoje,vencimento:r.hoje}]);}
 let encontrados=[];const first=await get();
 for(let p=0;p<Math.ceil(first.total/20);p++)encontrados.push(...(await call('consultar_lembretes_financeiros',[r.w,p])).itens.map(x=>x.id));
 ok(encontrados.length===first.total&&new Set(encontrados).size===encontrados.length&&idsPagina.every(id=>encontrados.includes(id)),'Paginação completa, estável e sem duplicações');
 const outra=Object.values(c.registros)[1];await assert.rejects(()=>call('atualizar_lembretes_financeiros',[outra.w,'conferir',{}]),e=>e.code==='42501');checks++;
 await assert.rejects(()=>set('adiar_item',{tipo:'financeiro',id:randomUUID(),ate:new Date(Date.now()+3600000).toISOString()}),e=>e.code==='22023');checks++;
 await db.exec('reset role');
 for(const tabela of ['preferencias_lembretes_financeiros','adiamentos_lembretes_financeiros']) {
  ok(await one('select relrowsecurity from pg_class where oid=$1::regclass',['public.'+tabela]),'RLS habilitada');
  ok(!await one("select has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE')",['public.'+tabela]),'Sem acesso direto');
 }
} catch(e) {console.error(e.stack,e.code,e.where);process.exitCode=1;}
finally {await db?.close();await mkdir(out,{recursive:true});await writeFile(resolve(out,'banco.json'),JSON.stringify({ok:!process.exitCode,checks,resultados},null,2));}
