import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';

process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT = '20261110213457';
const saida = resolve('output/auditoria-garantias-20261110');
await mkdir(saida,{recursive:true});
const {db,registros,ids,login} = await criarCenarioSubsistemas();
const scalar = async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const call = (fn,args)=>scalar(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args.map(a=>a&&typeof a==='object'?JSON.stringify(a):a));
const checks=[];
try {
  // Primeiro reproduz o defeito com o mesmo código que estava publicado.
  const r=registros.mecanica;
  await login(ids.mecanica);
  const os=(await call('salvar_ordem_servico',[r.w,{cliente_id:r.cliente,veiculo_id:r.objeto},randomUUID()])).id;
  const aberto=await scalar("select (now()+interval '2 minutes')::text");
  const id=randomUUID();
  await call('salvar_ocorrencia_qualidade',[r.w,id,{ordem_original_id:os,motivo:'execucao',descricao:'Relógio do aparelho adiantado',aberto_em:aberto},null]);
  await assert.rejects(()=>call('salvar_ocorrencia_qualidade',[r.w,id,{situacao:'resolvida',solucao:'Refeito e testado',resolvido_em:null},1]),e=>e.code==='22023');
  checks.push('Defeito anterior reproduzido: resolução automática rejeitada com relógio adiantado');
  await db.exec('reset role');
  const before=await db.query("select proacl,prosecdef,proconfig from pg_proc where oid='public.salvar_ocorrencia_qualidade(uuid,uuid,jsonb,integer)'::regprocedure");
  const migration=await readFile('supabase/migrations/20261110232232_garantia_resolucao_relogio.sql','utf8');
  await db.exec(migration);
  await db.exec(migration);
  const after=await db.query("select proacl,prosecdef,proconfig from pg_proc where oid='public.salvar_ocorrencia_qualidade(uuid,uuid,jsonb,integer)'::regprocedure");
  assert.deepEqual(after.rows,before.rows);checks.push('Migração repetível e permissões preservadas');
  for(const [perfil,r] of Object.entries(registros).filter(([,r])=>!r.atendimento)){
    await login(ids[perfil]);
    const doc=perfil==='mecanica'?os:(await call('salvar_ordem_servico',[r.w,{cliente_id:r.cliente,veiculo_id:r.objeto},randomUUID()])).id;
    const q=perfil==='mecanica'?id:randomUUID();
    const abertura=await scalar("select (now()+interval '2 minutes')::text");
    if(perfil!=='mecanica')await call('salvar_ocorrencia_qualidade',[r.w,q,{ordem_original_id:doc,motivo:'execucao',descricao:'Relógio do aparelho adiantado',aberto_em:abertura,outros_custos_centavos:2467},null]);
    const save=(dados,rev=1)=>call('salvar_ocorrencia_qualidade',[r.w,q,dados,rev]);
    const antes=await call('consultar_lucro_documento',[r.w,doc]);
    await save({situacao:'resolvida',solucao:'Refeito e testado',resolvido_em:null});
    const ocorr=(await call('consultar_qualidade',[r.w,r.hoje,r.hoje])).ocorrencias.find(o=>o.id===q);
    assert.equal(ocorr.situacao,'resolvida');assert(Date.parse(ocorr.resolvido_em)>=Date.parse(ocorr.aberto_em));
    checks.push(perfil+': resolução automática funciona sem data anterior à abertura');
    assert.equal((await call('consultar_lucro_documento',[r.w,doc])).custo,antes.custo);checks.push(perfil+': resolver preserva os custos');
    await assert.rejects(()=>save({resolvido_em:'2020-01-01T00:00:00Z'},2),e=>e.code==='22023');checks.push(perfil+': data explícita anterior continua bloqueada');
    const futuro=await scalar("select (now()+interval '6 minutes')::text");
    await assert.rejects(()=>save({aberto_em:futuro,resolvido_em:null},2),e=>e.code==='22023');checks.push(perfil+': abertura no futuro continua bloqueada');
    await assert.rejects(()=>save({resolvido_em:futuro},2),e=>e.code==='22023');checks.push(perfil+': resolução no futuro continua bloqueada');
    await assert.rejects(()=>save({descricao:'Edição antiga'},1),e=>e.code==='PT409');checks.push(perfil+': edição concorrente permanece protegida');
    const historico=await call('consultar_historico_qualidade',[r.w,q]);assert.equal(historico.length,2);checks.push(perfil+': histórico registra somente criação e resolução válidas');
    await login(ids.stranger);await assert.rejects(()=>save({descricao:'Acesso indevido'},2),e=>e.code==='42501');checks.push(perfil+': outra empresa não pode editar');
  }
  await writeFile(resolve(saida,'relogio-banco.json'),JSON.stringify({ok:true,total:checks.length,checks},null,2));
  console.log('PASS:',checks.length,'verificações, 10 subsistemas automotivos');
} finally {await db.close();}
