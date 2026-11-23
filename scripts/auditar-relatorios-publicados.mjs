// Reconciliação somente de leitura, restrita às 26 empresas fictícias autorizadas.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {conferirAcesso} from './lib/contas-teste.mjs';
import {calcularGestao} from '../src/lib/relatoriosGestao.ts';
import {resumirServicos} from '../src/lib/relatoriosServicos.ts';
import {especialidades} from '../src/lib/especialidades.ts';
const pasta='output/auditoria-numeros-20261102';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const env=parseEnv(await readFile('.env.local','utf8'));
assert.equal(contas.projeto,'hzihxtjirttetnfdujcx');assert.equal(contas.contas.length,26);
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
const inicio='2026-10-01',fim='2026-11-02',resultados=[];
for(const conta of contas.contas){
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));assert.equal(conta.email,`qa.20261019.${conta.especialidade}@example.com`);
 const c=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,i)=>fetch(u,{...i,signal:AbortSignal.timeout(90000)})}});
 const checks=[],erros=[];const eq=(a,b,regra)=>{checks.push({regra,correto:JSON.stringify(a)===JSON.stringify(b)});if(JSON.stringify(a)!==JSON.stringify(b))erros.push({regra,obtido:a,esperado:b});};
 const rpc=async(n,a)=>{const r=await c.rpc(n,a);if(r.error)throw Error(n+': '+r.error.message);return r.data};
 try{
  const l=await c.auth.signInWithPassword({email:conta.email,password:conta.senha});assert(!l.error,'Falha de login fictício');
  conferirAcesso(await rpc('consultar_meu_acesso',{}),conta,true);
  const w=conta.empresa_id,auto=especialidades[conta.especialidade].ramo==='automotivo';
  const t=performance.now();const bruto=await rpc(auto?'consultar_relatorios_gestao':'consultar_relatorios_servicos',{p_oficina:w,p_inicio:inicio,p_fim:fim});
  const ms=Math.round(performance.now()-t);
  const rel=auto?calcularGestao(bruto,inicio,fim):resumirServicos(bruto,inicio,fim);
  if(!process.argv.includes('--antes'))assert(bruto.custeios,'A correção ainda não foi aplicada');
  const docs=auto?rel.osFinanceiro.map(x=>x.id):rel.encerrados.map(x=>x.atendimento.id);
  let esperadoCusto=0,esperadoReceita=0;
  // Lotes pequenos para não sobrecarregar o banco em uso.
  for(let i=0;i<docs.length;i+=4){
    const lote=await Promise.all(docs.slice(i,i+4).map(id=>rpc('consultar_custeio_servico',{p_oficina:w,p_documento:id}).then(x=>({id,x}))));
    for(const {id,x} of lote){esperadoCusto+=x.custo;esperadoReceita+=x.receita;
      if(bruto.custeios)eq(bruto.custeios[id].custo,x.custo,'Custeio da OS '+id);
    }
  }
  eq(auto?rel.osFinanceiro.reduce((s,x)=>s+x.custo,0):rel.custo,esperadoCusto,'Total de custos corresponde às OS selecionadas');
  eq(auto?rel.resumoFinanceiro.receita:rel.receita,esperadoReceita,'Faturamento corresponde às OS selecionadas');
  eq(auto?rel.resumoFinanceiro.margem:rel.margem,esperadoReceita-esperadoCusto,'Margem corresponde às OS selecionadas');
  if(bruto.custeios){const participantes=Object.values(bruto.custeios).flatMap(x=>x.participantes);
    eq(auto?rel.equipe.reduce((s,x)=>s+x.receita,0):rel.funcionarios.reduce((s,x)=>s+x.valor,0),participantes.reduce((s,x)=>s+x.receita,0),'Equipe conserva a atribuição das OS do relatório');}
  const ps=auto?bruto.produtos:bruto.estoque;
  for(let i=0;i<ps.length;i+=4){for(const {p,x} of await Promise.all(ps.slice(i,i+4).map(p=>rpc('consultar_produto_estoque',{p_oficina:w,p_produto:p.id}).then(x=>({p,x}))))){
    eq(Number(p.saldo),Number(x.saldo),'Saldo do produto '+p.id);eq(Number(p.reservado),Number(x.reservado),'Reserva do produto '+p.id);
  }}
  const [fin,bancos]=await Promise.all([rpc('consultar_relatorio_financeiro',{p_oficina:w,p_inicio:inicio,p_fim:fim}),rpc('consultar_contas_financeiras',{p_oficina:w,p_data:fim})]);
  eq(fin.saldo_final,bancos.reduce((s,x)=>s+x.saldo,0),'Saldo financeiro consolidado corresponde às contas');
  resultados.push({perfil:conta.especialidade,documentos:docs.length,produtos:ps.length,tempoRelatorioMs:ms,checks,erros,ok:!erros.length});
  console.log(conta.especialidade,docs.length,'OS',ps.length,'produtos',erros.length,'divergências');
 }catch(e){resultados.push({perfil:conta.especialidade,checks,erros:[...erros,{erro:e.message}],ok:false});console.error(conta.especialidade,e.message);}
 finally{await c.auth.signOut({scope:'local'});}
}
const saida={data:new Date().toISOString(),ok:resultados.length===26&&resultados.every(r=>r.ok),modo:'Leitura autenticada das empresas fictícias; todas as OS concluídas/entregues do período e todos os produtos retornados',inicio,fim,verificacoes:resultados.reduce((s,x)=>s+x.checks.length,0),resultados};
await writeFile(pasta+(process.argv.includes('--antes')?'/publicado-antes.json':'/publicado-numeros.json'),JSON.stringify(saida,null,2));console.log(JSON.stringify({ok:saida.ok,verificacoes:saida.verificacoes}));if(!saida.ok)process.exitCode=1;

