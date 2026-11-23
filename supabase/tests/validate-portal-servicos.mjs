import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarBancoLocal } from './banco-local.mjs';
import { especialidadePadrao } from '../../src/lib/especialidades.ts';
let db;try{
 db=await criarBancoLocal('20261015000500');
 const owner=randomUUID(),user=randomUUID(),stranger=randomUUID();
 await db.exec(`alter table auth.users add column email text,add column email_confirmed_at timestamptz;insert into auth.users values('${owner}','owner@example.test',now()),('${user}','client@example.test',now()),('${stranger}','other@example.test',now());`);
 const login=(u)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${u}',false);set role authenticated`);
 const one=async(s,args=[])=>Object.values((await db.query(s,args)).rows[0])[0];
 for(const ramo of ['assistencia_tecnica','manutencao_campo','limpeza']){
  await login(owner);
  const w=await one("select public.configurar_nova_empresa($1,$2,'','{}',$3,$4)",[randomUUID(),ramo,ramo,especialidadePadrao(ramo)]);
  await db.exec(`reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}';set role authenticated`);
  const config={identificador_url:'site-'+ramo.replaceAll('_','-'),titulo:'Empresa teste',descricao:'Descrição',publicado:true,portal_habilitado:true,pedidos_pecas_habilitados:false};
  await one('select public.configurar_site($1,$2)',[w,config]);
  const c=await one('select public.salvar_cliente($1,$2)',[w,{nome:'Cliente',email:'client@example.test'}]);
  await one('select public.definir_acesso_portal($1,$2,$3)',[w,c.id,'client@example.test']);
  const objeto=randomUUID(),a=randomUUID();
  await one('select public.salvar_objeto_atendimento($1,$2,$3)',[w,objeto,{cliente_id:c.id,nome:'Equipamento',dados:{senha:'SEGREDO_INTERNO'}}]);
  await one('select public.salvar_atendimento_servico($1,$2,$3)',[w,a,{cliente_id:c.id,objeto_id:objeto,titulo:'Reparo',situacao:'orcamento',dados:{diagnostico:'INFORMACAO_INTERNA'},valor_centavos:15000,vencimento:'2026-10-30'}]);
  const portal=()=>one('select public.consultar_meu_portal($1)',[w]);
  await login(user);assert.deepEqual((await portal()).atendimentos,[]);
  await assert.rejects(()=>one('select public.compartilhar_atendimento_cliente($1,$2,1,true,$3)',[w,a,'Resumo público']),e=>e.code==='42501');
  await login(owner);await one('select public.compartilhar_atendimento_cliente($1,$2,1,true,$3)',[w,a,'Resumo público']);
  await login(user);let p=(await portal()).atendimentos;assert.equal(p.length,1);assert.equal(p[0].resumo,'Resumo público');assert.equal(p[0].valor_centavos,15000);
  for(const v of ['SEGREDO_INTERNO','INFORMACAO_INTERNA','custo_centavos','ficha_especialidade'])assert.ok(!JSON.stringify(p).includes(v));
  await assert.rejects(()=>one('select public.aprovar_meu_atendimento($1,$2,1)',[w,a]),e=>e.code===codigoConflitoRevisao);
  await login(stranger);assert.deepEqual((await portal()).atendimentos,[]);await assert.rejects(()=>one('select public.aprovar_meu_atendimento($1,$2,2)',[w,a]),e=>e.code==='42501');
  await login(user);await one('select public.aprovar_meu_atendimento($1,$2,2)',[w,a]);await one('select public.aprovar_meu_atendimento($1,$2,2)',[w,a]);assert.equal((await portal()).atendimentos[0].situacao,'aprovado');
  await login(owner);await one('select public.definir_acesso_portal($1,$2,$3,true)',[w,c.id,'client@example.test']);await login(user);assert.deepEqual((await portal()).atendimentos,[]);
  console.log(`PASS portal ${ramo}: compartilhamento explícito, aprovação, revisão, repetição, revogação e isolamento`);
 }
}catch(e){console.error(e.message,e.code,e.where);process.exitCode=1;}finally{await db?.close();}
