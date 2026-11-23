import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
import {especialidades} from '../../src/lib/especialidades.ts';
process.env.DB_VALIDATION_RUNTIME ||= resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const out=resolve('output/laudos-20261106');await mkdir(out,{recursive:true});const resultados=[];let db;
try {
 const f=await criarCenarioSubsistemas();db=f.db;
 const scalar=async(s,a=[])=>Object.values((await db.query(s,a)).rows[0])[0];
 const call=(fn,a)=>scalar(`select public.${fn}(${a.map((_,i)=>'$'+(i+1)).join(',')})`,a);
 const check=(perfil,cenario)=>resultados.push({perfil,cenario,ok:true});
 const rejeita=async(fn,codigo)=>{try{await fn();assert.fail('Deveria recusar');}catch(e){assert.equal(e.code,codigo,e.message);}};
 for(const [perfil,r] of Object.entries(f.registros)) {
  await f.login(f.ids[perfil]);let origem=r.atendimento,tipo='atendimento';
  if(especialidades[perfil].ramo==='automotivo') {
   const q=await call('emitir_orcamento',[r.w,r.proposta.id,r.proposta.revisao,7,randomBytes(32).toString('hex')]);await call('aprovar_orcamento_interno',[r.w,q.id,q.revisao,q.versao.id]);origem=await call('converter_orcamento_em_os',[r.w,q.id]);tipo='os';
  }
  const fontes=await call('buscar_origens_laudo',[r.w,'QA']);assert(fontes.some(o=>o.id===origem));
  const o=await call('consultar_origem_laudo',[r.w,tipo,origem]);assert(o.dados.cliente.includes('QA'));assert(o.dados.bem.includes('QA'));assert.equal(o.dados.servicos,'');check(perfil,'Vínculo da OS/atendimento e serviços pendentes não apresentados como realizados');
  const original=await call(tipo==='os'?'consultar_ordem_servico':'consultar_detalhes_atendimento',[r.w,origem]);
  let id=randomUUID(),l;const operar=(acao,d=null,motivo='',chave=randomUUID(),rev=l?.revisao??null,alvo=id)=>call('operar_laudo',[r.w,alvo,rev,acao,d,tipo,origem,motivo,chave]);
  const chave=randomUUID();l=await operar('salvar',{titulo:'Laudo QA'},'',chave);
  assert.equal(l.situacao,'rascunho');assert.equal((await operar('salvar',{titulo:'Laudo QA'},'',chave,null)).revisao,l.revisao);
  await rejeita(()=>operar('salvar',{titulo:'Outro conteúdo'},'',chave,null),'PT409');
  await rejeita(()=>operar('emitir'),'22023');check(perfil,'Rascunho incompleto, repetição idempotente e emissão incompleta bloqueada');
  const dados={...o.dados,titulo:'Laudo técnico QA '+perfil,data_avaliacao:r.hoje,constatacoes:'Falha constatada em teste controlado.',servicos:'Ajuste e teste final.',conclusao:'Funcionamento verificado.',responsavel:'Responsável QA',referencias:'Foto 1 da OS; medição 12 V.'};
  await rejeita(()=>operar('salvar',{...dados,injetado:true}),'22023');
  await rejeita(()=>operar('salvar',{...dados,conclusao:'a'.repeat(12001)}),'22023');
  await assert.rejects(()=>operar('salvar',{...dados,data_avaliacao:'2026-02-30'}));
  l=await operar('salvar',dados);const rev=l.revisao;
  const emitir=randomUUID();l=await operar('emitir',null,'',emitir);assert.equal(l.versao,1);assert.equal(l.situacao,'emitido');
  assert.equal((await operar('emitir',null,'',emitir,rev)).versao,1);
  const v1=await call('consultar_versao_laudo',[r.w,id,1]);assert.deepEqual(v1.conteudo.dados,dados);assert.match(v1.hash,/^[a-f0-9]{64}$/);
  const serialized=await scalar("select (private.versao_laudo($1,$2,1)->'conteudo')::text",[r.w,id]);
  assert.equal(createHash('sha256').update(serialized).digest('hex'),v1.hash);
  await rejeita(()=>operar('salvar',dados),'22023');await rejeita(()=>operar('salvar',dados,'',randomUUID(),rev),'PT409');check(perfil,'Emissão, versão arquivada e rejeição de alterações diretas e edições concorrentes');
  await rejeita(()=>operar('revisar',null,''),'22023');l=await operar('revisar',null,'Complemento solicitado');assert.equal(l.situacao,'rascunho');
  l=await operar('salvar',{...dados,conclusao:'Conclusão revisada após novo teste.'});l=await operar('emitir');assert.equal(l.versao,2);
  assert.deepEqual(await call('consultar_versao_laudo',[r.w,id,1]),v1);const v2=await call('consultar_versao_laudo',[r.w,id,2]);assert.notEqual(v2.hash,v1.hash);check(perfil,'Revisão cria versão 2 sem modificar conteúdo ou hash da versão 1');
  assert.equal((await call('listar_laudos',[r.w,perfil,'emitido',0,origem])).total,1);
  assert.equal((await call('listar_laudos',[r.w,'inexistente','',0,null])).total,0);
  await rejeita(()=>call('listar_laudos',[r.w,'','',-1,null]),'22023');
  await rejeita(()=>db.query('update public.laudos_tecnicos set dados=$1 where id=$2',[{},id]),'42501');
  await f.login(f.ids.stranger);await rejeita(()=>call('consultar_laudo',[r.w,id]),'42501');await rejeita(()=>operar('emitir'),'42501');
  await f.login('','anon');await rejeita(()=>call('consultar_laudo',[r.w,id]),'42501');
  await f.login(f.ids[perfil]);const outra=Object.values(f.registros).find(x=>x.w!==r.w);
  await rejeita(()=>call('consultar_laudo',[outra.w,id]),'42501');
  await assert.rejects(()=>call('consultar_origem_laudo',[r.w,tipo,randomUUID()]));check(perfil,'Isolamento entre empresas, anônimo bloqueado e sem gravação direta');
  l=await operar('cancelar',null,'Laudo substituído por nova avaliação');assert.equal(l.situacao,'cancelado');assert.equal(l.versoes.length,2);assert.deepEqual(await call('consultar_versao_laudo',[r.w,id,1]),v1);await rejeita(()=>operar('salvar',dados),'22023');
  assert.deepEqual(await call(tipo==='os'?'consultar_ordem_servico':'consultar_detalhes_atendimento',[r.w,origem]),original);check(perfil,'Cancelamento preserva versões e não altera OS, valores ou itens');
  await db.exec('reset role');await rejeita(()=>db.query('update public.laudos_versoes set conteudo=$1 where laudo_id=$2',[{},id]),'22023');await rejeita(()=>db.query('delete from public.laudos_eventos where laudo_id=$1',[id]),'22023');
  await f.login(f.ids[perfil]);
  if(perfil==='mecanica') {
   for(let n=0;n<28;n++)await call('operar_laudo',[r.w,randomUUID(),null,'salvar',{titulo:'Pagina QA '+n},null,null,'',randomUUID()]);
   const p1=await call('listar_laudos',[r.w,'Pagina QA','',0,null]),p2=await call('listar_laudos',[r.w,'Pagina QA','',1,null]);assert.equal(p1.total,28);assert.equal(p1.itens.length,24);assert.equal(p2.itens.length,4);assert.equal(new Set([...p1.itens,...p2.itens].map(x=>x.id)).size,28);check(perfil,'Paginação limitada e estável sem duplicar registros');
  }
  const membro=randomUUID();await db.exec('reset role');await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[membro,membro+'@qa.test']);await db.query("insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values($1,$2,'staff',true)",[r.w,membro]);
  await f.login(f.ids[perfil]);await call('salvar_restricoes_acesso',[r.w,membro,{atendimentos:'leitura'},0]);await f.login(membro);
  assert.equal((await call('consultar_laudo',[r.w,id])).id,id);await rejeita(()=>call('operar_laudo',[r.w,randomUUID(),null,'salvar',{titulo:'Sem permissão'},null,null,'',randomUUID()]),'42501');
  await f.login(f.ids[perfil]);await call('salvar_restricoes_acesso',[r.w,membro,{atendimentos:'nenhum'},1]);await f.login(membro);await rejeita(()=>call('consultar_laudo',[r.w,id]),'42501');check(perfil,'Restrição de leitura e bloqueio do módulo respeitados');
  await db.exec('reset role');await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')",[f.ids[perfil]]);await f.login(f.ids[perfil]);await scalar("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:f.ids[perfil],aal:'aal1'})]);await rejeita(()=>call('consultar_laudo',[r.w,id]),'PT403');await scalar("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:f.ids[perfil],aal:'aal2'})]);assert.equal((await call('consultar_laudo',[r.w,id])).id,id);await db.exec('reset role');await db.query('delete from auth.mfa_factors where user_id=$1',[f.ids[perfil]]);await scalar("select set_config('request.jwt.claims','',false)");check(perfil,'MFA: exige segundo fator e libera somente após confirmação');
  console.log('PASS',perfil);
 }
 await db.exec('reset role');assert.equal(Number(await scalar("select count(*) from private.tabelas_portabilidade where nome in ('laudos_tecnicos','laudos_versoes','laudos_eventos')")),3);check('todos','Exportação completa inclui documentos, versões e histórico');
}catch(e){console.error(e);process.exitCode=1;}finally{await db?.close();await writeFile(resolve(out,'banco.json'),JSON.stringify({ok:!process.exitCode,resultados},null,2));console.log(JSON.stringify({ok:!process.exitCode,cenarios:resultados.length}));}
