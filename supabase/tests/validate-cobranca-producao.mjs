import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarBancoLocal } from './banco-local.mjs';
import { lerConfiguracaoCobranca,conferirPreco } from '../functions/_shared/cobranca.mjs';
const env={COBRANCA_AMBIENTE:'producao',COBRANCA_HABILITADA:'true',COBRANCA_PRODUCAO_HABILITADA:'true',STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',APP_URL:'https://example.com',STRIPE_PRICE_BASIC:'price_basic',STRIPE_PRICE_INTERMEDIATE:'price_intermediate',STRIPE_PRICE_COMPLETE:'price_complete',STRIPE_AMOUNT_BASIC:'5900',STRIPE_AMOUNT_INTERMEDIATE:'12900',STRIPE_AMOUNT_COMPLETE:'24900'};
const config=(overrides={})=>lerConfiguracaoCobranca(k=>({...env,...overrides})[k]);
assert.equal(config().habilitado,true);
for(const overrides of [{COBRANCA_PRODUCAO_HABILITADA:''},{STRIPE_SECRET_KEY:'sk_test_fixture'},{STRIPE_AMOUNT_BASIC:''},{STRIPE_AMOUNT_COMPLETE:'NaN'},{STRIPE_AMOUNT_BASIC:'-1'},{APP_URL:'http://example.com'},{COBRANCA_AMBIENTE:'outro'}])assert.equal(config(overrides).habilitado,false);
const preco={id:'price_basic',livemode:true,active:true,currency:'brl',unit_amount:5900,type:'recurring',recurring:{interval:'month',interval_count:1}};
assert.doesNotThrow(()=>conferirPreco(preco,'basic',config()));assert.throws(()=>conferirPreco({...preco,livemode:false},'basic',config()));assert.throws(()=>conferirPreco({...preco,unit_amount:4900},'basic',config()));
let db;try{
 db=await criarBancoLocal('20261015000400');const dono=randomUUID();
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 await db.exec(`insert into auth.users values('${dono}');select set_config('request.jwt.claim.sub','${dono}',false);set role authenticated;`);
 const w=await one("select public.criar_oficina('Empresa de teste',null)");
 await db.exec('reset role;set role service_role');
 const reserve=ambiente=>one('select public.reservar_operacao_cobranca($1,$2,$3,$4)',[w,dono,'complete',ambiente]);
 const teste=await reserve('teste'),live=await reserve('producao');assert.notEqual(teste.checkout_chave,live.checkout_chave);
 for(const [r,ambiente] of [[teste,'teste'],[live,'producao']])await one('select public.vincular_cliente_cobranca($1,$2,$3,$4)',[w,r.reserva,`cus_${ambiente}`,ambiente]);
 const apply=(r,ambiente,evt)=>one("select public.aplicar_assinatura_provedor($1,$2,$3,'customer.subscription.updated',$4,$5,'complete','active',now()+interval '30 days',false,$6)",[w,r.reserva,evt,`cus_${ambiente}`,`sub_${ambiente}`,ambiente]);
 assert.equal(await apply(live,'producao','evt_livefixture'),true);assert.equal(await apply(live,'producao','evt_livefixture'),false);
 await assert.rejects(()=>apply(teste,'teste','evt_testfixture'),e=>e.code==='42501');
 await one('select public.liberar_operacao_cobranca($1,$2,$3)',[w,teste.reserva,'teste']);
 await assert.rejects(()=>reserve('teste'),e=>e.code==='42501');
 await db.exec('reset role;set role authenticated');
 const consulta=await one("select public.consultar_cobranca($1,'producao')",[w]);assert.equal(consulta.ambiente,'producao');assert.equal(consulta.eventos.length,1);
 await assert.rejects(()=>one("select public.consultar_cobranca($1,'invalido')",[w]),e=>e.code==='22023');
 console.log('PASS cobrança comercial: ativação explícita, preço, ambiente, idempotência e proteção contra eventos de teste');
}catch(e){console.error(e.message,e.code,e.where);process.exitCode=1;}finally{await db?.close();}
