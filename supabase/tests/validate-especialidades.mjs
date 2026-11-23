import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {criarBancoLocal} from './banco-local.mjs';
import {especialidades} from '../../src/lib/especialidades.ts';
const db=await criarBancoLocal('20261014000200');
const user=randomUUID(),other=randomUUID();
const valor=async(s,p=[])=>Object.values((await db.query(s,p)).rows[0])[0];
const login=id=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`);
try {
 await db.exec(`alter table auth.users add column email_confirmed_at timestamptz;insert into auth.users values('${user}',now()),('${other}',now());`);
 await login(user);
 const criar=(key,ramo,e)=>valor('select public.configurar_nova_empresa($1,$2,$3,$4,$5,$6)',[key,'Teste especialidade '+e,'',{},ramo,e]);
 await assert.rejects(()=>criar(randomUUID(),'automotivo','limpeza_geral'));
 await assert.rejects(()=>criar(randomUUID(),'automotivo',null));
 for(const [id,e] of Object.entries(especialidades)){
   const key=randomUUID(),w=await criar(key,e.ramo,id);
   assert.equal(await criar(key,e.ramo,id),w);
   assert.equal((await valor('select public.consultar_meu_acesso()')).find(x=>x.id===w).especialidade,id);
   await db.exec(`reset role; update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}';`);
   await login(user);
   const c=await valor('select public.salvar_cliente($1,$2)',[w,{nome:'Cliente de teste'}]);
   if(e.ramo==='automotivo'){
     const v=await valor('select public.cadastrar_veiculo_orcamento($1,$2,$3,$4)',[w,c.id,'Motor teste',null]);
     const dados={cliente_id:c.id,veiculo_id:typeof v==='string'?v:v.id,tipo_servico:e.tipos[0],detalhes_especialidade:'Conferir medições e testes'};
     const os=await valor('select public.salvar_os_com_itens($1,$2,$3)',[w,{...dados,itens:[],desconto_centavos:0},randomUUID()]);
     assert.equal(os.tipo_servico,e.tipos[0]);assert.equal(os.detalhes_especialidade,dados.detalhes_especialidade);
     await assert.rejects(()=>valor('select public.salvar_ordem_servico($1,$2,$3)',[w,{...dados,tipo_servico:'residencial'},randomUUID()]));
   }else{
     const objeto=randomUUID(),t=randomUUID();
     await valor('select public.salvar_objeto_atendimento($1,$2,$3)',[w,objeto,{cliente_id:c.id,nome:'Objeto teste',dados:{}}]);
     const dados={objeto_id:objeto,cliente_id:c.id,titulo:'Atendimento de teste',situacao:'orcamento',valor_centavos:0,vencimento:'2026-10-10',dados:{tipo_servico:e.tipos[0]}};
     await valor('select public.salvar_atendimento_servico($1,$2,$3)',[w,t,dados]);
     assert.equal((await valor('select public.consultar_servicos($1)',[w])).atendimentos[0].dados.tipo_servico,e.tipos[0]);
     await assert.rejects(()=>valor('select public.salvar_atendimento_servico($1,$2,$3)',[w,randomUUID(),{...dados,dados:{tipo_servico:'motor'}}]));
   }
   await login(other);await assert.rejects(()=>valor('select public.salvar_especialidade_empresa($1,$2)',[w,id]));await login(user);
 }
 console.log('PASS: 26 especialidades, ramo incompatível, cadastro idempotente, OS com itens, atendimentos, tipos inválidos e isolamento entre empresas.');
}finally{await db.close();}
