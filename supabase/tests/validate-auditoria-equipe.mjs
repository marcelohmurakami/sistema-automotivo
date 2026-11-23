import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261030000600';
let db;const resultados=[];
try{
 const ctx=await criarCenarioSubsistemas();db=ctx.db;const {login,ids,registros}=ctx;
 const call=async(n,a)=>Object.values((await db.query(`select public.${n}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a.map(x=>x&&typeof x==='object'?JSON.stringify(x):x))).rows[0])[0];
 const schema=JSON.parse(await readFile('docs/departamento-pessoal-v1.schema.json','utf8'));
 for(const [perfil,r] of Object.entries(registros)){
  await login(ids[perfil]);const checks=[];const ok=(v,n)=>{assert(v,n);checks.push(n)};
  const auto=!!r.proposta,doc=auto?(await call('salvar_ordem_servico',[r.w,{cliente_id:r.cliente,veiculo_id:r.objeto},uuid()])).id:r.atendimento;
  if(!auto){const d=(await call('consultar_detalhes_atendimento',[r.w,doc])).atendimento;await call('salvar_atendimento_servico',[r.w,doc,{...d,situacao:'aprovado'},d.revisao]);}
  const h=uuid();await call('registrar_horas_equipe',[r.w,h,doc,r.funcionario,'2026-01-31T23:30:00-03:00','2026-02-01T00:30:00-03:00',6000,'Virada do mês QA']);
  let ex=await call('exportar_departamento_pessoal',[r.w,uuid(),'2026-01-01','2026-01-31']);
  for(const k of schema.properties.dados.required)ok(k in ex.dados,'Exportação cumpre campo obrigatório '+k);
  let hora=ex.dados.horas_produtivas.find(x=>x.id===h);ok(hora.minutos===30,'Recorte correto na virada do mês');
  for(const k of schema.properties.dados.properties.horas_produtivas.items.required)ok(k in hora,'Hora cumpre campo obrigatório '+k);
  ok(hora.origem==='producao'&&!hora.em_aberto,'Origem e fechamento da produção');
  const inicial=ex.hash;await call('cancelar_horas_equipe',[r.w,h,'Correção fictícia de apontamento']);
  ok((await call('obter_exportacao_dp',[r.w,ex.id])).hash===inicial,'Arquivo anterior não muda após cancelamento');
  const novo=await call('exportar_departamento_pessoal',[r.w,uuid(),'2026-01-01','2026-01-31']);ok(novo.dados.horas_produtivas.find(x=>x.id===h).cancelado_em,'Novo arquivo identifica hora cancelada');
  ok(createHash('sha256').update(novo.dados_canonicos).digest('hex')===novo.hash,'Hash da versão corrigida');
  const nativa=uuid();
  if(auto){await db.exec('reset role');await db.query('insert into public.apontamentos_tempo(id,oficina_id,ordem_servico_id,usuario_id,iniciado_em,encerrado_em,custo_hora_centavos) values($1,$2,$3,$4,$5,$6,6000)',[nativa,r.w,doc,ids[perfil],'2026-01-11T11:00:00Z','2026-01-11T12:00:00Z']);await login(ids[perfil]);}
  else{const a=(await call('consultar_detalhes_atendimento',[r.w,doc])).atendimento;await call('salvar_equipe_atendimento',[r.w,doc,a.revisao,[{funcionario_id:r.funcionario,percentual:10,custo_hora_centavos:6000}]]);await call('registrar_horas_atendimento',[r.w,doc,nativa,r.funcionario,'2026-01-11T11:00:00Z','2026-01-11T12:00:00Z','Produção pelo atendimento']);}
  const dp=await call('consultar_departamento_pessoal',[r.w,'2026-01-01','2026-01-31']);hora=dp.horas_produtivas.find(x=>x.id===nativa);ok(hora&&hora.minutos===60,'Exporta horas do fluxo nativo');ok(hora.origem===(auto?'os':'atendimento'),'Identifica a origem da hora nativa');
  let d=await call('consultar_contribuicao_equipe',[r.w,doc]);const atrib={criterio:'manual',participantes:[{funcionario_id:r.funcionario,execucao_bp:10000,venda_bp:10000}],fontes:{['hora:'+nativa]:r.funcionario}};await call('salvar_atribuicao_equipe',[r.w,doc,atrib,d.documento.assinatura,null]);
  const depois=await call('consultar_departamento_pessoal',[r.w,'2026-01-01','2026-01-31']);ok(depois.horas_produtivas.find(x=>x.id===nativa).funcionario_id===r.funcionario,'Exporta identificação da pessoa');
  const vazio=await call('consultar_departamento_pessoal',[r.w,'2025-01-01','2025-01-31']);ok(vazio.horas_produtivas.length===0&&vazio.comissoes.length===0,'Período vazio não mistura lançamentos');
  // Fixture de comissões já apuradas; a geração financeira é coberta por validate-comissoes/operacao-servicos.
  // Aqui a conferência é do transporte dos valores ao arquivo do contador, sem gerar pagamentos.
  await db.exec('reset role');
  if(auto){
   const p=uuid(),i=uuid();
   await db.query("insert into public.profissionais_comissao(id,oficina_id,nome,tipo,valor,liberacao) values($1,$2,'Profissional QA exportação','percentual',10,'entrega')",[p,r.w]);
   await db.query("insert into public.itens_ordem_servico(id,oficina_id,ordem_servico_id,tipo,descricao,quantidade,preco_unitario_centavos,posicao) values($1,$2,$3,'service','Serviço QA exportação',1,12345,0)",[i,r.w,doc]);
   await db.query("insert into public.comissoes_servico(oficina_id,ordem_servico_id,item_id,profissional_id,nome_profissional,tipo,valor,liberacao,regra_revisao,descricao_servico,total_centavos) values($1,$2,$3,$4,'Profissional QA exportação','percentual',10,'entrega',1,'Serviço QA exportação',1235)",[r.w,doc,i,p]);
  }else await db.query('update public.equipe_atendimento set comissao_centavos=1235 where oficina_id=$1 and atendimento_id=$2 and funcionario_id=$3',[r.w,doc,r.funcionario]);
  const dia=String((await db.query('select data::text from private.documentos_custeio where oficina_id=$1 and id=$2',[r.w,doc])).rows[0].data);
  await login(ids[perfil]);
  const com=await call('exportar_departamento_pessoal',[r.w,uuid(),dia,dia]),c=com.dados.comissoes.find(x=>x.documento_id===doc);
  ok(c?.valor_centavos===1235,'Exporta comissão positiva sem arredondar centavos');
  ok(c?.funcionario_id===(auto?null:r.funcionario),'Preserva vínculo da comissão sem inventar funcionário');
  ok(com.dados.comissoes.every(x=>x.oficina_id===r.w),'Comissões não misturam empresas');
  const aberta=uuid();await db.exec('reset role');
  if(auto) await db.query('insert into public.apontamentos_tempo(id,oficina_id,ordem_servico_id,usuario_id,iniciado_em,custo_hora_centavos) values($1,$2,$3,$4,$5,6000)',[aberta,r.w,doc,ids[perfil],'2026-01-31T23:59:00-03:00']);
  else await db.query('insert into public.horas_atendimento(id,oficina_id,atendimento_id,funcionario_id,inicio) values($1,$2,$3,$4,$5)',[aberta,r.w,doc,r.funcionario,'2026-01-31T23:59:00-03:00']);
  await login(ids[perfil]);
  const ha=(await call('consultar_departamento_pessoal',[r.w,'2026-02-01','2026-02-28'])).horas_produtivas.find(x=>x.id===aberta);
  ok(ha?.em_aberto===true&&ha.minutos===null&&ha.fim===null,'Tempo aberto não inventa duração ou encerramento');
  ok(new Date(ha.inicio).toISOString()==='2026-02-01T03:00:00.000Z','Hora aberta cruza o mês com recorte no período');
  // Falha de resposta após gravação: repetir a mesma qualificação não duplica.
  const hab=await call('salvar_habilidade_equipe',[r.w,{nome:'Auditoria de equipe',nivel_minimo:2,exige_comprovacao:true},null]);
  const q=uuid(),dados={funcionario_id:r.funcionario,habilidade:hab,nivel:2,realizada_em:'2026-01-01',valida_ate:'2027-12-31',comprovante:'Certificado QA',situacao:'concluida',observacoes:''};
  await call('salvar_qualificacao_equipe',[r.w,q,dados,null]);await call('salvar_qualificacao_equipe',[r.w,q,dados,null]);
  ok((await call('consultar_qualificacoes_equipe',[r.w,r.funcionario,0])).qualificacoes.filter(x=>x.id===q).length===1,'Repetição após falha de conexão não duplica qualificação');
  await assert.rejects(()=>call('salvar_qualificacao_equipe',[r.w,q,{...dados,nivel:3},null]),e=>e.code==='PT409');checks.push('Chave repetida não permite sobrescrever qualificação');
  await call('salvar_qualificacao_equipe',[r.w,q,{...dados,nivel:3},1]);await assert.rejects(()=>call('salvar_qualificacao_equipe',[r.w,q,dados,1]),e=>e.code==='PT409');checks.push('Duas edições concorrentes não se sobrepõem');
  // Qualificação revogada não habilita a escala e o histórico fica preservado.
  await call('salvar_qualificacao_equipe',[r.w,q,{...dados,situacao:'revogada'},2]);ok((await call('matriz_qualificacoes_equipe',[r.w,r.funcionario,0]))[0].aptidoes.find(x=>x.habilidade===hab).estado==='Revogada','Matriz mostra revogação');
  const outra=Object.values(registros).find(x=>x.w!==r.w);await assert.rejects(()=>call('obter_exportacao_dp',[outra.w,ex.id]),e=>e.code==='42501');checks.push('Histórico exportado permanece isolado por empresa');
  resultados.push({perfil,checks});console.log('PASS',perfil,checks.length);
 }
}catch(e){console.error(JSON.stringify({message:e.message,code:e.code,where:e.where,stack:e.stack?.split('\n').slice(0,5)}));process.exitCode=1}finally{await mkdir('output/auditoria-equipe-20261030',{recursive:true});await writeFile('output/auditoria-equipe-20261030/banco.json',JSON.stringify({data:new Date().toISOString(),ok:!process.exitCode,resultados,verificacoes:resultados.reduce((s,r)=>s+r.checks.length,0)},null,2));await db?.close()}
