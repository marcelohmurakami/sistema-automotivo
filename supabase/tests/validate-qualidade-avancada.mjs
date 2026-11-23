import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
import {especialidades} from '../../src/lib/especialidades.ts';
import {perfilAtendimento} from '../../src/lib/perfisAtendimento.ts';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261030000200';
const pasta=resolve('output/qualidade-garantia-20261030');
await mkdir(pasta,{recursive:true});
let db;const resultados=[];
try {
 const c=await criarCenarioSubsistemas();db=c.db;const {registros,ids,login}=c;
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const call=(f,args)=>one(`select public.${f}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(a=>a&&typeof a==='object'?JSON.stringify(a):a));
 for(const [perfil,r] of Object.entries(registros)) {
  const checks=[];const eq=(a,b,msg)=>{assert.deepEqual(a,b,perfil+': '+msg);checks.push(msg);};
  const no=async(fn,msg,code='22023')=>{await assert.rejects(fn,e=>e.code===code,perfil+': '+msg);checks.push(msg);};
  await login(ids[perfil]);let id=r.atendimento,origem=id?'atendimento':'os';
  if(!id)id=(await call('salvar_ordem_servico',[r.w,{cliente_id:r.cliente,veiculo_id:r.objeto},uuid()])).id;
  const documentos=await call('buscar_documentos_qualidade',[r.w,'',false]);eq(documentos.some(d=>d.id===id),true,'busca o atendimento correto');
  await no(()=>call('salvar_acompanhamento_qualidade',[r.w,uuid(),origem,uuid(),'analise','aberta',{descricao:'Falha em teste'},null]),'bloqueia documento inexistente','42501');
  const save=(tipo,estado,dados,antes=null)=>call('salvar_acompanhamento_qualidade',[r.w,antes?.id||uuid(),origem,id,tipo,estado,dados,antes?.revisao??null]);
  const dados={descricao:'Falha intermitente após o serviço',hipotese:'Conexão instável',teste:'Medição com carga aplicada',evidencias:'Oscilação de tensão confirmada na medição',conclusao:'Conexão identificada no teste com carga',acao:'Corrigir a conexão e repetir o teste'};
  await no(()=>save('analise','confirmada',{descricao:'Falha sem evidências'}),'não confirma causa sem evidências');
  let analise=await save('analise','aberta',dados);eq(analise.revisao,1,'abre análise');
  const igual=await save('analise','aberta',dados,analise);eq(igual.revisao,1,'repetição idempotente');
  analise=await save('analise','confirmada',dados,analise);eq(analise.revisao,2,'confirma conclusão humana com evidências');
  await no(()=>save('analise','em_analise',dados,{...analise,revisao:1}),'conflito de edição','PT409');
  await no(()=>save('analise','encerrada',dados,analise),'exige verificação da solução');
  analise=await save('analise','encerrada',{...dados,validacao:'Teste repetido sem falha'},analise);eq(analise.situacao,'encerrada','encerra após verificar');
  eq((await call('historico_acompanhamento_qualidade',[r.w,analise.id])).length,3,'preserva revisões e evidências');
  eq((await call('listar_acompanhamentos_qualidade',[r.w,'analise',r.hoje,r.hoje,'Falha',0])).length,1,'lista filtrada com paginação');
  const f={descricao:'Peça defeituosa em teste',fabricante:'Fabricante fictício',pecas:'1 unidade · série QA-001',solicitado_centavos:10000,autorizado_centavos:8000,recebido_centavos:0};
  let fab=await save('fabricante','aberta',f);await no(()=>save('fabricante','solicitada',f,fab),'exige protocolo');
  const ff={...f,protocolo:'PROTOCOLO-QA',autorizacao:'Autorização escrita do fabricante',rastreio:'Envio QA-123',comprovante:'Comprovante fictício QA'};
  for(const estado of ['solicitada','autorizada','enviada','recebida']) {fab=await save('fabricante',estado,ff,fab);eq(fab.situacao,estado,'fabricante: '+estado);}
  await no(()=>save('fabricante','ressarcida',{...ff,recebido_centavos:9000},fab),'não recebe mais que autorizado');
  if(process.env.DB_VALIDATION_MIGRATION_LIMIT>='20261104112413'){
   await no(()=>save('fabricante','ressarcida',{...ff,recebido_centavos:8000},fab),'ressarcimento não pode simular recebimento por edição');
   const cobranca=await call('consultar_financeiro_garantia',[r.w,fab.id]);
   eq(Number(cobranca.aberto_centavos),8000,'aprovação gera saldo a receber sem movimento fictício');
  }else {fab=await save('fabricante','ressarcida',{...ff,recebido_centavos:8000},fab);eq(fab.dados.recebido_centavos,8000,'ressarcimento comprovado');}
  const assinatura=await save('assinatura','preparada',{descricao:'Autorização complementar',signatario:'Cliente fictício',email:'cliente@example.com',conteudo:'Autorizo exclusivamente os serviços descritos nesta versão de teste.'});
  eq(createHash('sha256').update(assinatura.documento_canonico).digest('hex'),assinatura.hash_documento,'hash confere com versão imutável');
  await no(()=>save('assinatura','assinada',assinatura.dados,assinatura),'não simula assinatura sem provedor');
  await no(()=>save('assinatura','preparada',{...assinatura.dados,conteudo:'Documento alterado sem nova versão, não permitido.'},assinatura),'conteúdo preparado imutável');
  const outra=Object.values(registros).find(x=>x.w!==r.w);
  await no(()=>call('consultar_acompanhamento_qualidade',[outra.w,assinatura.id]),'isolamento entre empresas','42501');
  await no(()=>db.query('select * from public.acompanhamentos_qualidade'),'sem acesso direto às tabelas','42501');
  await call('configurar_pesquisa_qualidade',[r.w,true,0,30,'https://qa.example.com']);
  await no(()=>call('configurar_pesquisa_qualidade',[r.w,true,0,30,'http://inseguro.example.com']),'rejeita endereço inseguro');
  await no(()=>call('gerar_pesquisa_qualidade',[r.w,origem,id]),'não pesquisa serviço ainda aberto');
  const assist=especialidades[perfil].ramo==='assistencia_tecnica';
  await db.exec('reset role');
  if(origem==='os')await db.query("update public.ordens_servico set situacao='ready',concluido_em=now()-interval '10 days' where id=$1",[id]);
  else if(assist)await db.query("update public.atendimentos_servicos set situacao='concluido',concluido_em=now()-interval '10 days',ficha_especialidade=jsonb_set(ficha_especialidade,'{etapa}',$2::jsonb) where id=$1",[id,JSON.stringify(perfilAtendimento(perfil).etapas.find(e=>/Pronto|Disponível/.test(e)))]);
  await login(ids[perfil]);
  let cust;
  if(origem==='os'||assist) {
   eq((await call('consultar_retiradas_qualidade',[r.w,7,0])).some(x=>x.id===id),true,'bem pronto há 10 dias na fila');
   cust=await save('custodia','aberta',{descricao:'Bem e acessórios conferidos',local:'Prateleira QA'});
   await no(()=>save('custodia','retirada',{...cust.dados,recebedor:'Cliente fictício'},cust),'não contorna entrega e pagamento');
   const h={...cust.dados,contato:'Ligação: cliente confirmou a retirada',contato_em:new Date().toISOString(),retirada_prevista:r.hoje};
   cust=await save('custodia','notificada',h,cust);cust=await save('custodia','combinada',h,cust);eq(cust.revisao,3,'histórico dos contatos e data combinada');
   eq((await call('consultar_alertas',[r.w])).some(x=>x.chave.startsWith('custodia-qualidade:')),true,'avisa retirada no header');
  }
  await db.exec('reset role');
  if(origem==='os')await db.query("update public.ordens_servico set situacao='delivered',entregue_em=now() where id=$1",[id]);
  else if(assist) await db.query("update public.atendimentos_servicos set situacao='concluido',concluido_em=now(),ficha_especialidade=jsonb_set(jsonb_set(ficha_especialidade,'{etapa}','\"Entregue\"'),'{campos,recebedor}','\"Cliente QA\"') where id=$1",[id]);
  else await db.query("update public.atendimentos_servicos set situacao='concluido',concluido_em=now() where id=$1",[id]);
  await login(ids[perfil]);
  if(cust){cust=await save('custodia','retirada',{...cust.dados,recebedor:'Cliente fictício'},cust);eq((await call('consultar_retiradas_qualidade',[r.w,0,0])).length,0,'entrega remove da fila de custódia');}
  let s=await call('consultar_satisfacao_qualidade',[r.w,r.hoje,r.hoje,0]);eq(s.totais.concluidos,1,'população definida por conclusão e entrega');eq(s.totais.convidados,1,'cria pesquisa automaticamente');
  let p=await call('gerar_pesquisa_qualidade',[r.w,origem,id]);eq(p.id,s.itens[0].pesquisa.id,'sem convites duplicados');
  await db.exec('reset role;set role service_role');await call('processar_lembretes_automaticos',[]);await login(ids[perfil]);
  eq((await call('consultar_satisfacao_qualidade',[r.w,r.hoje,r.hoje,0])).itens[0].pesquisa.aviso_id,null,'não envia sem autorização de contato');
  await call('registrar_contato_pesquisa',[r.w,r.cliente,true,'Autorização fictícia para teste local']);
  await db.exec('reset role;set role service_role');await call('processar_lembretes_automaticos',[]);await call('processar_lembretes_automaticos',[]);await login(ids[perfil]);
  s=await call('consultar_satisfacao_qualidade',[r.w,r.hoje,r.hoje,0]);eq(!!s.itens[0].pesquisa.aviso_id,true,'enfileira apenas após autorização');
  await db.exec('reset role');eq(Number(await one("select count(*) from public.avisos_automaticos where oficina_id=$1 and chave like $2",[r.w,'pesquisa:'+p.id+':%'])),1,'processamento repetido não duplica envio');
  const tokenAnterior=p.token;await db.query("update public.pesquisas_qualidade set expira_em=now()-interval '1 day' where id=$1",[p.id]);await login(ids[perfil]);
  p=await call('renovar_pesquisa_qualidade',[r.w,p.id,p.revisao]);eq(p.token!==tokenAnterior,true,'renova link com novo token');
  await no(()=>call('renovar_pesquisa_qualidade',[r.w,p.id,p.revisao]),'não renova link ainda válido');
  await db.exec('reset role;set role anon');eq(await call('consultar_pesquisa_publica',[tokenAnterior]),null,'renovação invalida link anterior');
  let publica=await call('consultar_pesquisa_publica',[p.token]);eq(Object.keys(publica).sort(),['empresa','expira_em','respondida'],'link não revela dados pessoais ou OS');
  await no(()=>call('responder_pesquisa_qualidade',[p.token,6,'',false]),'limita nota de 1 a 5');
  await call('responder_pesquisa_qualidade',[p.token,2,'Atendimento demorou, por favor melhorar.',true]);await call('responder_pesquisa_qualidade',[p.token,2,'Atendimento demorou, por favor melhorar.',true]);
  await no(()=>call('responder_pesquisa_qualidade',[p.token,5,'Outra nota',false]),'uma resposta imutável por pesquisa','PT409');
  await no(()=>call('consultar_satisfacao_qualidade',[r.w,r.hoje,r.hoje,0]),'anônimo não acessa relatório','42501');
  await login(ids[perfil]);s=await call('consultar_satisfacao_qualidade',[r.w,r.hoje,r.hoje,0]);eq([s.totais.respostas,Number(s.totais.nota_media),s.totais.insatisfeitos],[1,2,1],'nota e cobertura calculadas');
  eq(s.itens[0].contato_permitido,false,'recusa revoga autorização de contato');
  eq((await call('consultar_alertas',[r.w])).some(x=>x.chave==='pesquisa-qualidade:'+p.id),true,'insatisfação no sininho');
  p=s.itens[0].pesquisa;await call('acompanhar_pesquisa_qualidade',[r.w,p.id,p.revisao,'resolver','Cliente contatado e solução combinada']);
  eq((await call('consultar_satisfacao_qualidade',[r.w,r.hoje,r.hoje,0])).totais.insatisfeitos,0,'solução encerra pendência');
  eq((await call('consultar_alertas',[r.w])).some(x=>x.chave==='pesquisa-qualidade:'+p.id),false,'alerta deixa de aparecer após solução');
  p=(await call('consultar_satisfacao_qualidade',[r.w,r.hoje,r.hoje,0])).itens[0].pesquisa;await call('acompanhar_pesquisa_qualidade',[r.w,p.id,p.revisao,'revogar','Revogação de teste do link']);
  await db.exec('reset role;set role anon');eq(await call('consultar_pesquisa_publica',[p.token]),null,'link revogado indisponível');
  await db.exec('reset role');await db.query("update public.pesquisas_qualidade set revogado_em=null,expira_em=now()-interval '1 day' where id=$1",[p.id]);
  await db.exec('set role anon');eq(await call('consultar_pesquisa_publica',[p.token]),null,'link expirado indisponível');
  await login(ids[perfil]);resultados.push({perfil,checks});console.log(perfil+': '+checks.length+' verificações');
 }
 await db.exec('reset role');const tabelas=await db.query("select relname,relrowsecurity from pg_class where relname in ('acompanhamentos_qualidade','historico_acompanhamento_qualidade','pesquisas_qualidade','configuracao_pesquisa_qualidade','contato_pesquisa_qualidade','historico_pesquisa_qualidade')");assert.equal(tabelas.rows.length,6);assert(tabelas.rows.every(x=>x.relrowsecurity));
 await writeFile(resolve(pasta,'banco.json'),JSON.stringify({ok:true,total:resultados.reduce((n,x)=>n+x.checks.length,0),resultados,rls:tabelas.rows},null,2));
} catch(e) {console.error(JSON.stringify({message:e.message,code:e.code,where:e.where,query:e.internalQuery},null,2));await writeFile(resolve(pasta,'banco-falha.json'),JSON.stringify({message:e.message,code:e.code,where:e.where,resultados},null,2));process.exitCode=1;}finally{await db?.close();}
