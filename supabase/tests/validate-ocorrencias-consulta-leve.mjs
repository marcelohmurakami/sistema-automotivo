import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const {criarCenarioSubsistemas}=await import('./subsistemas-fixture.mjs');
const {db,registros,ids,login}=await criarCenarioSubsistemas();
const out=process.env.QA_OUTPUT||'output/picos-51-20261119/banco';await mkdir(out,{recursive:true});
const resultados=[],tempos=[];
const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const chamada=(w,de='2026-11-01',ate='2026-11-30')=>one('select public.consultar_ocorrencias_servicos($1,$2,$3)',[w,de,ate]);
try{for(const [perfil,r] of Object.entries(registros)){
 const checks=[];const ok=(nome)=>checks.push(nome);await login(ids[perfil]);
 const negar=async(fn,nome,codigo='42501')=>{await assert.rejects(fn,e=>e.code===codigo);ok(nome)};
 if(!r.atendimento){await negar(()=>chamada(r.w),'Não aplica consulta de atendimento ao ramo automotivo');await one('select public.consultar_qualidade($1,$2,$3)',[r.w,'2026-11-01','2026-11-30']);ok('Consulta automotiva permanece disponível');}
 else{
  await db.exec('reset role');
  for(const [i,data] of ['2026-10-31','2026-11-01','2026-11-30','2026-12-01'].entries())await db.query('insert into public.qualidade_atendimento(id,oficina_id,atendimento_id,funcionario_id,tipo,motivo,aberto_em,custo_centavos,minutos,resolvido_em) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),r.w,r.atendimento,r.funcionario,i%2?'garantia':'retrabalho','Ocorrência de teste '+i,data,1001+i*100,30+i,i===2?data:null]);
  await login(ids[perfil]);
  const antigo=await one("select public.consultar_relatorios_servicos($1,$2,$3)->'qualidade'",[r.w,'2026-11-01','2026-11-30']),novo=await chamada(r.w);
  assert.deepEqual(novo,antigo);assert.equal(novo.length,2);ok('Mesmas ocorrências, custos, funcionários, datas e revisão do relatório');
  assert.equal(novo.reduce((s,x)=>s+x.custo_centavos,0),2302);ok('Custos preservados em centavos');
  assert.equal((await chamada(r.w,'2026-09-01','2026-09-30')).length,0);ok('Período vazio retorna array vazio');
  await negar(()=>chamada(r.w,null),'Início obrigatório','22023');await negar(()=>chamada(r.w,'2026-12-01','2026-11-01'),'Rejeita período invertido','22023');await negar(()=>chamada(r.w,'2025-01-01','2026-11-01'),'Rejeita período acima de 367 dias','22023');
  const outra=Object.values(registros).find(x=>x.w!==r.w);await negar(()=>chamada(outra.w),'Outra empresa bloqueada');
  await login(ids[perfil],'anon');await negar(()=>chamada(r.w),'Anônimo sem EXECUTE');await login(ids[perfil]);
  await db.exec('reset role');await db.query("update public.assinaturas_oficina set valido_ate=now()-interval '1 minute' where oficina_id=$1",[r.w]);await login(ids[perfil]);await negar(()=>chamada(r.w),'Assinatura expirada bloqueada');await db.exec('reset role');await db.query('update public.assinaturas_oficina set valido_ate=null where oficina_id=$1',[r.w]);
  await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')",[ids[perfil]]);await login(ids[perfil]);await negar(()=>chamada(r.w),'MFA pendente bloqueado','PT403');await one("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({aal:'aal2'})]);assert.deepEqual(await chamada(r.w),novo);ok('MFA confirmado permite a mesma leitura');await db.exec('reset role');await db.query('delete from auth.mfa_factors where user_id=$1',[ids[perfil]]);await one("select set_config('request.jwt.claims','',false)");
  await db.query("update public.membros_oficina set perfil='manager' where oficina_id=$1 and usuario_id=$2",[r.w,ids[perfil]]);await db.query("insert into public.restricoes_acesso(oficina_id,usuario_id,regras,autor) values($1,$2,'{\"financeiro\":\"nenhum\"}',$2)",[r.w,ids[perfil]]);await login(ids[perfil]);await negar(()=>chamada(r.w),'Restrição financeira preservada do relatório original');await db.exec('reset role');await db.query('delete from public.restricoes_acesso where oficina_id=$1 and usuario_id=$2',[r.w,ids[perfil]]);await db.query("update public.membros_oficina set perfil='owner' where oficina_id=$1 and usuario_id=$2",[r.w,ids[perfil]]);await login(ids[perfil]);
  for(let rodada=0;rodada<3;rodada++)for(const fase of rodada%2?['depois','antes']:['antes','depois']){const t=performance.now();const res=fase==='depois'?await chamada(r.w):await one('select public.consultar_relatorios_servicos($1,$2,$3)',[r.w,'2026-11-01','2026-11-30']);tempos.push({perfil,fase,rodada,ms:performance.now()-t,bytes:JSON.stringify(res).length});}
 }
 resultados.push({perfil,checks,ok:true});console.log('PASS',perfil,checks.length);
} }catch(e){console.error(e.message,e.code,e.where);process.exitCode=1;}finally{await db.close();await writeFile(out+'/resultado.json',JSON.stringify({ok:!process.exitCode,ambiente:'PostgreSQL local isolado via PGlite; tempos não representam produção',resultados,tempos},null,2));}
