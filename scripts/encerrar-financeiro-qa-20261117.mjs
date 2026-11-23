import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {createClient} from '@supabase/supabase-js';import {sessaoQa} from './sessoes-qa-concorrencia-20261116.mjs';
const arquivo=process.argv[2];assert(arquivo?.startsWith('output/financeiro-velocidade-20261117/'));const entrada=JSON.parse(await readFile(arquivo,'utf8'));
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas,registros=[];
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
for(const tag of [...new Set(entrada.manifesto.map(m=>m.tag))].filter(t=>!process.argv[3]||t===process.argv[3])){
 assert(tag.startsWith('QA FIN '));const m=entrada.manifesto.find(m=>m.tag===tag),c=contas.find(c=>c.empresa_id===m.empresa);assert(c?.empresa.startsWith('ZZ [TESTE 20261019] '));
 const cli=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false}});await sessaoQa(cli,c);
 const rpc=async(n,args={})=>{const r=await cli.rpc(n,{p_oficina:c.empresa_id,...args});assert.ifError(r.error);return r.data};
 const saldos=async()=>Object.fromEntries((await rpc('consultar_contas_financeiras',{p_data:hoje})).map(c=>[c.codigo,c.saldo]));const antes=await saldos(),delta={};
 for(const r of (await rpc('consultar_contas_recorrentes')).filter(r=>r.descricao.startsWith(tag)))if(r.ativa)await rpc('salvar_conta_recorrente',{p_id:r.id,p_dados:{...r,ativa:false},p_revisao:r.revisao});
 const lista=await rpc('consultar_painel_financeiro',{p_inicio:hoje.slice(0,7)+'-01',p_fim:hoje,p_busca:tag,p_filtro:'periodo',p_natureza:'',p_pagina:0,p_os:null,p_titulo:null});const ids=new Set([...lista.itens.map(t=>t.id),...entrada.manifesto.filter(m=>m.tag===tag).flatMap(m=>m.ids)]);
 for(const id of ids){let t=await rpc('consultar_titulo_alerta',{p_titulo:id});if(!t||t.cancelado_em)continue;assert(t.descricao.startsWith(tag));assert(!t.transferencia_id,'Transferências exigem encerramento pelo ID pareado');const h=await rpc('historico_financeiro',{p_titulo:id});
  for(const b of h.filter(b=>!b.estorno_de&&!h.some(x=>x.estorno_de===b.id))){delta[b.conta]=(delta[b.conta]||0)+(t.natureza==='receber'?b.valor_centavos-b.taxa_centavos:-b.valor_centavos);await rpc('estornar_baixa_financeira',{p_baixa:b.id,p_data:hoje,p_motivo:'Encerramento auditado do teste '+tag})}
  t=await rpc('consultar_titulo_alerta',{p_titulo:id});assert.equal(t.baixado_centavos,0);await rpc('cancelar_titulo_financeiro',{p_titulo:id,p_revisao:t.revisao,p_motivo:'Encerramento auditado do teste '+tag});
 }
 const depois=await saldos();for(const [conta,valor] of Object.entries(antes))assert.equal(depois[conta],valor-(delta[conta]||0));registros.push({tag,perfil:c.especialidade,titulos:ids.size,saldosConferidos:true,ok:true});
}
await writeFile(arquivo.replace('resultados.json','encerramento-recuperado.json'),JSON.stringify(registros,null,2));console.log('PASS',registros.length,'execuções de QA encerradas com saldos conferidos');
