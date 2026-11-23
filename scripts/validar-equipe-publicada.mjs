// Homologação conectada restrita às 26 empresas fictícias autorizadas.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {conferirAcesso} from './lib/contas-teste.mjs';
const pasta='output/funcionarios-produtividade-20261030';
const arquivo=pasta+'/publicado-cenarios.local.json';
const manifesto=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const fontes=JSON.parse(await readFile('output/links-todos-subsetores-20261026/cenarios.local.json','utf8'));
const env=parseEnv(await readFile('.env.local','utf8'));
assert.equal(manifesto.projeto,'hzihxtjirttetnfdujcx');assert.equal(manifesto.contas.length,26);
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
let estado={data:new Date().toISOString(),casos:[]};try{estado=JSON.parse(await readFile(arquivo,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
const salvar=()=>writeFile(arquivo,JSON.stringify(estado,null,2));
const filtro=process.argv.includes('--perfil')?process.argv[process.argv.indexOf('--perfil')+1]:null;
const selecionadas=manifesto.contas.filter(c=>!filtro||c.especialidade===filtro);assert(selecionadas.length);
for(const conta of selecionadas){
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));assert.equal(conta.email,`qa.20261019.${conta.especialidade}@example.com`);
 let caso=estado.casos.find(x=>x.perfil===conta.especialidade);
 if(caso?.ok){console.log('JÁ CONFERIDO',caso.perfil,caso.checks.length);continue}
 if(!caso){caso={perfil:conta.especialidade,empresa_id:conta.empresa_id,funcionario:uuid(),hora:uuid(),qualificacao:uuid(),perfil_id:uuid(),recurso_id:uuid(),agenda_id:uuid(),plano:uuid(),lancamento:uuid(),exportacao:uuid(),documento_id:uuid(),chave_os:uuid(),etapas:{},checks:[]};estado.casos.push(caso);await salvar()}
 assert.equal(caso.empresa_id,conta.empresa_id);
 const c=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(u,i)=>fetch(u,{...i,signal:AbortSignal.timeout(30000)})}});
 const rpc=async(n,a={})=>{const {data,error}=await c.rpc(n,{p_oficina:conta.empresa_id,...a});if(error)throw Object.assign(new Error(n+': '+error.message),{code:error.code});return data};
 const etapa=async(k,fn)=>{if(!caso.etapas[k]){await fn();caso.etapas[k]=true;await salvar()}};
 const check=(v,n)=>{assert(v,n);if(!caso.checks.includes(n))caso.checks.push(n)};
 try{
  const login=await c.auth.signInWithPassword({email:conta.email,password:conta.senha});if(login.error)throw Error('Login: '+login.error.code);
  const acesso=await c.rpc('consultar_meu_acesso');if(acesso.error)throw Error(acesso.error.message);conferirAcesso(acesso.data,conta,true);check(true,'Empresa fictícia e plano conferidos');
  const auto=conta.ramo==='automotivo',fonte=fontes.casos.find(x=>x.especialidade===conta.especialidade&&x.tipo==='total');
  assert(fonte&&fonte.empresa_id===conta.empresa_id&&fonte.cliente_id);
  await etapa('funcionario',()=>rpc('salvar_funcionario',{p_id:caso.funcionario,p_dados:{nome:'QA Equipe 30/10 · Profissional',funcao:'Profissional de homologação',ativo:true,observacoes:'Registro fictício para homologação. Sem pagamento ou vínculo real.'}}));
  await etapa('documento',async()=>{
   if(auto){assert(fonte.veiculo_id);const d=await rpc('salvar_ordem_servico',{p_dados:{cliente_id:fonte.cliente_id,veiculo_id:fonte.veiculo_id,data_servico:'2026-10-30',queixa_cliente:'QA Equipe 30/10 · Validação de horas e atribuição',observacoes_internas:'Teste fictício. Não cobrar nem contatar.'},p_chave:caso.chave_os});caso.documento_id=d.id}
   else {assert(fonte.objeto_id);await rpc('criar_atendimento_com_itens',{p_id:caso.documento_id,p_dados:{cliente_id:fonte.cliente_id,objeto_id:fonte.objeto_id,titulo:'QA Equipe 30/10 · '+conta.nome,situacao:'orcamento',data_servico:'2026-10-30',vencimento:'2026-10-30',dados:{documento:'orcamento',observacoes_cliente:'Homologação fictícia. Não cobrar nem contatar.'}},p_itens:[{id:uuid(),tipo:'servico',descricao:'Serviço fictício de homologação da equipe',quantidade:1,unidade:'un',preco_centavos:10000,custo_centavos:2000,origem:'externa'}],p_desconto:0});const d=(await rpc('consultar_detalhes_atendimento',{p_atendimento:caso.documento_id})).atendimento;await rpc('salvar_atendimento_servico',{p_id:d.id,p_dados:{...d,situacao:'aprovado'},p_revisao:d.revisao})}
  });
  await etapa('hora',()=>rpc('registrar_horas_equipe',{p_id:caso.hora,p_documento:caso.documento_id,p_funcionario:caso.funcionario,p_inicio:'2026-10-29T08:00:00-03:00',p_fim:'2026-10-29T09:00:00-03:00',p_custo_hora:6000,p_descricao:'Execução fictícia QA Equipe 30/10'}));
  let d=await rpc('consultar_contribuicao_equipe',{p_documento:caso.documento_id});check(d.horas.some(h=>h.id===caso.hora),'Hora produtiva persistida');check(d.fontes.some(f=>f.chave==='producao:'+caso.hora&&f.valor===6000),'Custo da hora incorporado');
  await etapa('atribuicao',()=>rpc('salvar_atribuicao_equipe',{p_documento:caso.documento_id,p_dados:{criterio:'horas',participantes:[{funcionario_id:caso.funcionario,execucao_bp:10000,venda_bp:10000}],fontes:{}},p_assinatura:d.documento.assinatura,p_revisao:d.atribuicao?.revisao??null}));
  d=await rpc('consultar_contribuicao_equipe',{p_documento:caso.documento_id});check(!d.revisar,'Atribuição conferida');check(d.participantes.reduce((s,x)=>s+x.receita,0)===d.documento.receita,'Receita preservada');check(d.participantes.reduce((s,x)=>s+x.custo,0)===d.documento.custo,'Custo preservado');check(d.participantes[0].minutos===60,'Horas atribuídas ao profissional');
  check((await rpc('historico_contribuicao_equipe',{p_documento:caso.documento_id})).length>0,'Histórico de atribuição');
  const nomeHabilidade='Homologação de equipe 30/10';
  await etapa('habilidade',async()=>{caso.habilidade=await rpc('salvar_habilidade_equipe',{p_dados:{nome:nomeHabilidade,nivel_minimo:2,exige_comprovacao:true,ativo:true}})});
  await etapa('qualificacao',()=>rpc('salvar_qualificacao_equipe',{p_id:caso.qualificacao,p_dados:{funcionario_id:caso.funcionario,habilidade:caso.habilidade,nivel:2,realizada_em:'2026-10-29',valida_ate:'2027-10-29',comprovante:'Comprovante fictício QA Equipe 30/10',situacao:'concluida',observacoes:'Sem validade profissional. Uso exclusivo em teste.'}}));
  const matriz=await rpc('matriz_qualificacoes_equipe',{p_funcionario:caso.funcionario});check(matriz[0].aptidoes.some(a=>a.habilidade===caso.habilidade&&a.estado==='Válida'),'Qualificação na matriz de aptidões');
  if(!auto)await etapa('recurso',()=>rpc('salvar_recurso_agenda',{p_id:caso.recurso_id,p_nome:'QA Equipe 30/10 · Recurso',p_ativo:true}));
  await etapa('perfil',()=>rpc('salvar_perfil_distribuicao',{p_id:caso.perfil_id,p_dados:{nome:'QA Equipe 30/10 · Profissional',recurso_id:auto?null:caso.recurso_id,funcionario_id:caso.funcionario,ativo:true,habilidades:[nomeHabilidade],ferramentas:[],regioes:[],base_endereco:'',base_ponto:null,jornada:[{dia:2,inicio:'08:00',fim:'18:00'}],bloqueios:[]}}));
  const agenda={id:caso.agenda_id,cliente_id:fonte.cliente_id,identificacao:'Homologação da equipe',recurso:'QA Equipe 30/10 · Profissional',recurso_id:auto?null:caso.recurso_id,servico:'QA Equipe 30/10',atendimento_id:auto?null:caso.documento_id,inicio:'2026-11-10T10:00:00-03:00',fim:'2026-11-10T11:00:00-03:00',situacao:'agendado',visita:false,logistica:{},deslocamento_minutos:0,distribuicao:{}};
  await etapa('agenda',()=>auto?rpc('operar_produtividade',{p_acao:'salvar_agenda',p_dados:agenda}):rpc('salvar_agenda_servico',{p_id:caso.agenda_id,p_dados:agenda}));
  await etapa('escala',async()=>{const p=await rpc('prever_escala_equipe',{p_ids:[caso.agenda_id],p_habilidades:[nomeHabilidade]});check(p[0].escolha?.id===caso.perfil_id,'Sugestão respeita a habilidade e qualificação');caso.propostas=p.map(x=>({id:x.id,revisao:x.revisao,perfil_id:x.escolha.id,habilidades:x.habilidades}));await rpc('aplicar_escala_equipe',{p_id:caso.plano,p_propostas:caso.propostas})});
  check((await rpc('aplicar_escala_equipe',{p_id:caso.plano,p_propostas:caso.propostas})).length===1,'Confirmação da escala idempotente');
  check((await rpc('consultar_demanda_equipe',{p_inicio:'2026-11-10',p_fim:'2026-11-10'})).some(a=>a.id===caso.agenda_id),'Escala disponível na agenda');
  await etapa('dp',()=>rpc('lancar_departamento_pessoal',{p_id:caso.lancamento,p_dados:{funcionario_id:caso.funcionario,competencia:'2026-10-30',natureza:'informativo',rubrica:'QA Equipe 30/10 · Conferência fictícia',valor_centavos:12345,referencia:'Teste fictício. Não pagar.'}}));
  const ex=await rpc('exportar_departamento_pessoal',{p_id:caso.exportacao,p_inicio:'2026-10-01',p_fim:'2026-10-31'});check(ex.dados.versao==='patio.dp.v1','Exportação versionada');check(ex.dados.lancamentos.some(l=>l.id===caso.lancamento&&l.valor_centavos===12345),'Lançamento na exportação');check(createHash('sha256').update(ex.dados_canonicos).digest('hex')===ex.hash,'Hash reproduzível do arquivo');
  check((await rpc('obter_exportacao_dp',{p_id:caso.exportacao})).hash===ex.hash,'Exportação histórica preservada');
  const outra=manifesto.contas.find(a=>a.empresa_id!==conta.empresa_id);await assert.rejects(()=>rpc('consultar_departamento_pessoal',{p_oficina:outra.empresa_id,p_inicio:'2026-10-01',p_fim:'2026-10-31'}),e=>e.code==='42501');check(true,'Isolamento de empresa na exportação');
  caso.ok=true;delete caso.erro;caso.verificado_em=new Date().toISOString();await salvar();console.log('PASS',caso.perfil,caso.checks.length);
 }catch(e){caso.erro={message:e.message,code:e.code};await salvar();console.error('FALHA',conta.especialidade,e.message);process.exitCode=1;break}finally{await c.auth.signOut({scope:'local'})}
}
await writeFile(pasta+'/publicado-verificacoes.json',JSON.stringify({data:new Date().toISOString(),ok:estado.casos.length===26&&estado.casos.every(c=>c.ok),subsetores:estado.casos.filter(c=>c.ok).length,verificacoes:estado.casos.reduce((s,c)=>s+c.checks.length,0),escopo:'RPCs reais autenticadas em empresas fictícias. Não registra pagamentos nem transmite ao eSocial.',casos:estado.casos.map(c=>({perfil:c.perfil,ok:!!c.ok,checks:c.checks,erro:c.erro}))},null,2));
