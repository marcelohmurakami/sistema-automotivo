import assert from'node:assert/strict';import{resolve}from'node:path';import{mkdir,writeFile}from'node:fs/promises';import{randomUUID as uuid}from'node:crypto';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const{criarCenarioSubsistemas}=await import('./subsistemas-fixture.mjs');const{db,registros,ids,login}=await criarCenarioSubsistemas();
const one=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0],resultados=[];
try{for(const[perfil,r]of Object.entries(registros)){
 await login(ids[perfil]);let checks=0;const ok=(v,m)=>{assert(v,m);checks++;},call=(n,a=[])=>one(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a);
 const consulta=(extra=[])=>call('consultar_conta_financeira_cliente',[r.w,r.cliente,...extra]);
 const auto=perfil in {mecanica:1,retifica:1,autoeletrica:1,autocenter:1,borracharia:1,estetica:1,lava_rapido:1,troca_oleo:1,acessorios:1,funilaria:1};
 async function criar(cliente=r.cliente){
  if(auto){const veiculo=await call('cadastrar_veiculo_orcamento',[r.w,cliente,'Veículo QA '+uuid(),null]);return(await call('salvar_ordem_servico',[r.w,{cliente_id:cliente,veiculo_id:veiculo,data_servico:'2026-10-15'},uuid()])).id;}
  const id=uuid();let objeto=r.objeto;if(cliente!==r.cliente){objeto=uuid();await call('salvar_objeto_atendimento',[r.w,objeto,{cliente_id:cliente,nome:'Bem de outro cliente',dados:{}},null]);}
  await call('salvar_atendimento_servico',[r.w,id,{cliente_id:cliente,objeto_id:objeto,titulo:'Serviço QA conta',situacao:'orcamento',valor_centavos:100000,data_servico:'2026-10-15',vencimento:'2026-10-20',dados:{documento:'ordem'}},null]);return id;
 }
 async function titulo(doc,valor=100000,extra={}){await db.exec('reset role');const t=await one("insert into public.titulos_financeiros(oficina_id,ordem_servico_id,natureza,categoria,descricao,valor_centavos,competencia,vencimento,provisorio,cancelado_em) values($1,$2,'receber','servicos','Conta QA',$3,'2026-10-15','2026-10-20',$4,$5) returning id",[r.w,auto?doc:null,valor,extra.provisorio||false,extra.cancelado?'2026-10-21':null]);if(!auto)await db.query('insert into public.cobrancas_atendimento(oficina_id,atendimento_id,titulo_id) values($1,$2,$3)',[r.w,doc,t]);await login(ids[perfil]);return t;}
 ok((await consulta()).ordens.length===0,'Sem cobrança não inventa saldo');
 const doc=await criar(),t=await titulo(doc);await call('baixar_titulo_financeiro',[r.w,t,uuid(),40000,500,r.hoje,'caixa','pix']);
 await db.exec('reset role');await db.query('insert into private.saldos_importados(oficina_id,titulo_id,valor_centavos) values($1,$2,10000)',[r.w,t]);await login(ids[perfil]);
 const doc2=await criar();await titulo(doc2,12345);const quitada=await criar(),tq=await titulo(quitada,7000);await call('baixar_titulo_financeiro',[r.w,tq,uuid(),7000,0,r.hoje,'caixa','pix']);
 await titulo(await criar(),1000,{provisorio:true});await titulo(await criar(),1000,{cancelado:true});
 const cliente2=(await call('salvar_cliente',[r.w,{nome:'Mesmo nome QA'},null,null])).id;await titulo(await criar(cliente2),7777);
 const resultado=await consulta();ok(resultado.total===2&&resultado.ordens.length===2,'Só OS abertas e confirmadas do cliente');const principal=resultado.ordens.find(o=>o.id===doc);
 ok(principal.pago_centavos===50000&&principal.aberto_centavos===50000,'Pagamento parcial, importado e taxa sem cobrar taxa duas vezes');
 ok(principal.data==='2026-10-15','Data do serviço preservada');ok(!!resultado.identidade.nome,'Identidade para PDF');
 const selecao=await consulta([0,[doc2]]);ok(selecao.ordens.length===1&&selecao.ordens[0].aberto_centavos===12345,'Seleção de OS no banco');
 ok((await consulta([0,[quitada]])).ordens.length===0,'Quitação após seleção desaparece na reconferência');
 await assert.rejects(()=>consulta([-1]),e=>e.code==='22023');checks++;await assert.rejects(()=>consulta([0,Array.from({length:501},()=>uuid())]),e=>e.code==='22023');checks++;
 await login(ids.stranger);await assert.rejects(consulta,e=>e.code==='42501');checks++;
 await login(ids[perfil]);const outra=Object.values(registros).find(x=>x.w!==r.w);await assert.rejects(()=>call('consultar_conta_financeira_cliente',[r.w,outra.cliente]),e=>e.code==='42501');checks++;
 const membro=uuid();await db.exec('reset role');await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[membro,membro+'@qa.test']);await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values($1,$2,'manager',true)",[r.w,membro]);await login(ids[perfil]);
 await call('salvar_restricoes_acesso',[r.w,membro,{relatorios:'nenhum',administracao:'nenhum',financeiro:'leitura'},0]);await login(membro);ok((await consulta()).total===2,'Consulta não depende de relatórios nem configuração administrativa');
 await login(ids[perfil]);await call('salvar_restricoes_acesso',[r.w,membro,{financeiro:'nenhum'},1]);await login(membro);await assert.rejects(consulta,e=>e.code==='42501');checks++;
 await db.exec('reset role');await db.query("update public.membros_oficina set perfil='staff' where oficina_id=$1 and usuario_id=$2",[r.w,membro]);await login(membro);await assert.rejects(consulta,e=>e.code==='42501');checks++;
 await db.exec('reset role');await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')",[ids[perfil]]);await login(ids[perfil]);await one("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids[perfil],aal:'aal1'})]);await assert.rejects(consulta,e=>e.code==='PT403');checks++;await one("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids[perfil],aal:'aal2'})]);ok((await consulta()).total===2,'MFA confirmado libera a conta');
 if(perfil==='mecanica'){for(let i=0;i<50;i++)await titulo(await criar(),100);ok((await consulta()).ordens.length===50,'Página limitada a 50');ok((await consulta([1])).ordens.length===2,'Continuação sem truncar silenciosamente');}
 resultados.push({perfil,ok:true,checks});console.log('PASS',perfil,checks);
 }}catch(e){console.error(e);process.exitCode=1;}finally{await mkdir('output/conta-cliente-ficha-20261105',{recursive:true});await writeFile('output/conta-cliente-ficha-20261105/banco.json',JSON.stringify({ok:!process.exitCode,resultados,total:resultados.reduce((n,r)=>n+r.checks,0)},null,2));await db.close();}
