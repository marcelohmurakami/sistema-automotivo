// Bancada opt-in: PostgreSQL local (PGlite), dados artificiais, nenhum acesso à produção.
import { mkdir, writeFile } from 'node:fs/promises';
import { criarCenarioSubsistemas } from '../supabase/tests/subsistemas-fixture.mjs';
const limite=Number(process.argv.find(x=>x.startsWith('--registros='))?.split('=')[1] || 100000);
if(![1000,10000,100000,1000000].includes(limite))throw Error('Use 1000, 10000, 100000 ou 1000000 registros.');
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= '20261019001000';
const c=await criarCenarioSubsistemas(), r=c.registros.assistencia_celulares;
const medicoes=[];
const pasta='output/refatoracao-escala-2026-10-19';
await mkdir(pasta,{recursive:true});
const one=async(sql,args=[])=>Object.values((await c.db.query(sql,args)).rows[0])[0];
const medir=async(nome,fn)=>{
 const tempos=[];let resultado;
 for(let i=0;i<4;i++){const inicio=performance.now();resultado=await fn();if(i)tempos.push(performance.now()-inicio)}
 return {nome,mediana_ms:Math.round(tempos.sort((a,b)=>a-b)[1]*100)/100,bytes_resposta:Buffer.byteLength(JSON.stringify(resultado)),itens:Array.isArray(resultado)?resultado.length:resultado.atendimentos?.length};
};
try{
 let gravados=0;
 for(const n of [1000,10000,100000,1000000].filter(n=>n<=limite)){
  await c.db.exec('reset role');
  while(gravados<n){
   const fim=Math.min(n,gravados+10000);
   await c.db.query("insert into public.clientes(oficina_id,nome) select $1,'Pessoa Escala '||lpad(i::text,7,'0') from generate_series($2::integer,$3::integer) i",[r.w,gravados+1,fim]);
   gravados=fim;if(gravados%100000===0)console.log(`Base: ${gravados.toLocaleString('pt-BR')} clientes fictícios`);
  }
  await c.db.exec('analyze public.clientes');
  await c.login(c.ids.assistencia_celulares);
  const primeira=await medir('Seletor: primeiras 30 opções',()=>one("select public.buscar_cadastros_operacao($1,'clientes')",[r.w]));
  const busca=await medir('Busca por cliente no fim da base',()=>one("select public.buscar_cadastros_operacao($1,'clientes',$2)",[r.w,'Pessoa Escala '+String(n).padStart(7,'0')]));
  await c.db.exec('reset role');
  const bytesAntigos=await one("select octet_length(coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'telefone_e164',telefone_e164,'email',email)),'[]')::text) from public.clientes where oficina_id=$1",[r.w]);
  medicoes.push({clientes:n,transferencia_cadastro_inteiro_bytes:bytesAntigos,consultas:[primeira,busca]});
  console.log(JSON.stringify(medicoes.at(-1)));
  await writeFile(pasta+'/escala.json',JSON.stringify({ambiente:'PGlite local; sem rede ou concorrência de produção',medicoes},null,2));
 }
 await c.db.exec('reset role');
 const nServicos=Math.min(limite,100000);
 for(let inicio=1;inicio<=nServicos;inicio+=10000){
  await c.db.query("insert into public.atendimentos_servicos(id,oficina_id,cliente_id,objeto_id,titulo,situacao,vencimento) select gen_random_uuid(),$1,$2,$3,'Atendimento escala '||i,'orcamento',current_date from generate_series($4::integer,$5::integer) i",[r.w,r.cliente,r.objeto,inicio,Math.min(nServicos,inicio+9999)]);
 }
 await c.db.exec('analyze public.atendimentos_servicos');
 await c.login(c.ids.assistencia_celulares);
 const lista=await medir('Histórico: primeira página de 30',()=>one("select public.pagina_servicos($1,'{}')",[r.w]));
 const pagina=await one("select public.pagina_servicos($1,'{}')",[r.w]);
 const segunda=await medir('Histórico: página seguinte por cursor',()=>one("select public.pagina_servicos($1,'{}',$2)",[r.w,pagina.proximo]));
 const resumo=await medir('Indicadores completos',()=>one("select public.resumo_operacao_servicos($1)",[r.w]));
 medicoes.push({atendimentos:nServicos,consultas:[lista,segunda,resumo]});
 await writeFile(pasta+'/escala.json',JSON.stringify({ambiente:'PGlite local; sem rede ou concorrência de produção',medicoes},null,2));
 console.log(JSON.stringify(medicoes.at(-1)));
}finally{await c.db.close()}
