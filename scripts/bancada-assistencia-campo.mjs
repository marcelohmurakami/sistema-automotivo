// Dados fictícios persistentes para homologação, usando as mesmas RPCs do aplicativo.
import assert from 'node:assert/strict';
import {randomUUID as uuid,randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {novaFichaEspecialidade} from '../src/lib/perfisAtendimento.ts';
import {concluirReparo,registrarRetirada} from '../src/lib/assistenciaTecnica.ts';
import {cenariosEspecialidades} from '../supabase/tests/cenarios-especialidades.mjs';

export const pasta=resolve('output/jornada-assistencia-campo-20261110');
export const exemplos={
 assistencia_geral:['Impressora Epson L3250','Epson','Reparo da alimentação','Fonte de alimentação','Limpeza e testes'],
 assistencia_celulares:['Samsung Galaxy A54','Samsung','Troca do conjunto da tela','Tela compatível A54','Limpeza do conector'],
 assistencia_informatica:['Notebook Dell Inspiron','Dell','Substituição do SSD','SSD SATA 480 GB','Limpeza interna'],
 assistencia_eletrodomesticos:['Lavadora Electrolux 12 kg','Electrolux','Reparo da drenagem','Bomba de drenagem','Limpeza preventiva'],
 assistencia_eletronica:['Placa fonte 24 V','Bancada','Reparo da fonte chaveada','Capacitor de reposição','Ensaio em bancada'],
 manutencao_climatizacao:['Split da sala comercial','LG','Manutenção preventiva do split','Filtro de reposição','Higienização adicional'],
 manutencao_eletrica:['Quadro elétrico do condomínio','Instalação','Reparo do circuito de iluminação','Conector elétrico','Identificação dos circuitos'],
 manutencao_hidraulica:['Rede da lavanderia residencial','Instalação','Reparo de vazamento','Conexão hidráulica','Revisão dos registros'],
 manutencao_equipamentos:['Bomba do setor de utilidades','Industrial','Manutenção preventiva da bomba','Kit de vedação','Teste operacional adicional'],
 manutencao_geral:['Imóvel residencial — ponto de reparo','Instalação','Reparo residencial autorizado','Material de reparo','Acabamento adicional'],
};
await mkdir(pasta,{recursive:true});
const cred=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
assert.equal(cred.projeto,'hzihxtjirttetnfdujcx');
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const n=l.indexOf('=');return [l.slice(0,n),l.slice(n+1).trim().replace(/^['"]|['"]$/g,'')];}));
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
const cliente=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(45000)})}});
const publico=cliente(),res=[];
const gravar=(nome,x)=>writeFile(resolve(pasta,nome+'.json'),JSON.stringify(x,null,2));
const filtros=process.env.QA_PERFIS?.split(',');
const contas=cred.contas.filter(c=>Object.hasOwn(exemplos,c.especialidade)&&(!filtros||filtros.includes(c.especialidade)));
for(const conta of contas){
 const perfil=conta.especialidade,w=conta.empresa_id,assist=conta.ramo==='assistencia_tecnica';
 assert(conta.empresa.startsWith('ZZ [TESTE 20261019] '));
 const client=cliente();let etapa='login',s;
 const rpc=async(n,a={},anon=false)=>{const {data,error}=await (anon?publico:client).rpc(n,{...(!anon&&n!=='consultar_meu_acesso'?{p_oficina:w}:{}),...a});if(error)throw Object.assign(new Error(n+': '+error.message),{code:error.code});return data;};
 const check=(cond,msg)=>{assert(cond,perfil+': '+msg);s.checks.push(msg);};
 const salvar=()=>gravar(perfil,s);
 const fazer=async(k,fn)=>{if(!s.feitos[k]){await fn();s.feitos[k]=true;await salvar();}};
 try{
  const {error}=await client.auth.signInWithPassword({email:conta.email,password:conta.senha});if(error)throw error;
  const acesso=await rpc('consultar_meu_acesso');assert(acesso.some(a=>a.id===w&&a.especialidade===perfil));
  try{s=JSON.parse(await readFile(resolve(pasta,perfil+'.json'),'utf8'));assert.equal(s.empresa,w);}catch(e){if(e.code!=='ENOENT')throw e;s={perfil,empresa:w,empresaNome:conta.empresa,data:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),feitos:{},checks:[],clientes:[],objetos:[],servicos:[uuid(),uuid()],produto:uuid(),entrada:uuid(),funcionarios:[uuid(),uuid()],recurso:uuid(),documentos:Object.fromEntries(['recebido','aguardando','execucao','parado','pronto','orcamento','fluxo','parcial','recusado','interface'].map(k=>[k,{id:uuid(),itens:[uuid(),uuid(),uuid()]}])),visita:uuid(),garantia:uuid(),pagamentos:[uuid(),uuid()]};await salvar();}
  s.checks=[];const hoje=s.data;const [objeto,marca,servico,peca,adicional]=exemplos[perfil];
  etapa='cadastros';
  for(const [i,nome] of ['Ana Costa','Bruno Lima','Carla Santos'].entries())await fazer('cliente'+i,async()=>{
   const nomeCompleto='QA Dia a dia · '+nome;
   const lista=await rpc('buscar_cadastros_operacao',{p_tipo:'clientes',p_busca:nomeCompleto});
   const c=lista.find(c=>c.nome===nomeCompleto)||await rpc('salvar_cliente',{p_dados:{nome:nomeCompleto,observacoes:'Pessoa fictícia de homologação. Não contatar.',endereco:'Rua de Teste, '+(100+i)}});
   s.clientes[i]=c.id;s.objetos[i]=uuid();
   await rpc('salvar_objeto_atendimento',{p_id:s.objetos[i],p_dados:{cliente_id:c.id,nome:objeto+' · QA '+(i+1),dados:assist?{marca,modelo:objeto,serie:'QA-DIA-'+perfil+'-'+(i+1),acessorios:'Acessórios identificados na entrada',condicao:'Condição anterior registrada; dados fictícios'}:{endereco:'Rua de Teste, '+(100+i),equipamento:objeto,serie:'QA-ATIVO-'+(i+1),contato:nome,acesso:'Visita combinada com responsável fictício'}}});
  });
  for(let i=0;i<2;i++)await fazer('servico'+i,()=>rpc('salvar_item_catalogo',{p_id:s.servicos[i],p_dados:{descricao:'QA Dia a dia · '+(i?adicional:servico),tipo:'service',unidade:'un',preco_padrao_centavos:i?5000:20000,custo_centavos:i?1000:4000,favorito:true,ficha:{notas:'Execução e testes documentados. Valores fictícios.',duracao_minutos:i?30:90,custos:[{descricao:'Insumos e execução',valor_centavos:i?1000:4000}]}}}));
  await fazer('produto',()=>rpc('salvar_produto_estoque',{p_id:s.produto,p_dados:{descricao:'QA Dia a dia · '+peca,unidade:'un',codigo:'QA-DIA-'+perfil,custo_centavos:3000,preco_padrao_centavos:10000,minimo:5}}));
  await fazer('estoque',async()=>{const p=await rpc('consultar_produto_estoque',{p_produto:s.produto});await rpc('movimentar_estoque',{p_produto:s.produto,p_tipo:'entrada',p_quantidade:50,p_motivo:'Saldo fictício inicial da bancada de testes',p_chave:s.entrada,p_revisao:p.revisao});});
  for(let i=0;i<2;i++)await fazer('funcionario'+i,()=>rpc('salvar_funcionario',{p_id:s.funcionarios[i],p_dados:{nome:'QA Dia a dia · '+(i?'Marina':'Rafael'),funcao:assist?'Técnico de reparo':'Técnico de campo',ativo:true}}));
  await fazer('recurso',()=>rpc('salvar_recurso_agenda',{p_id:s.recurso,p_nome:'QA Dia a dia · Equipe de atendimento',p_ativo:true}));
  const ficha=()=>({...novaFichaEspecialidade(perfil),campos:{...cenariosEspecialidades[perfil].entrada}});
  const detalhe=id=>rpc('consultar_detalhes_atendimento',{p_atendimento:id});
  const atualizar=async(id,dados)=>{const d=await detalhe(id);await rpc('salvar_atendimento_servico',{p_id:id,p_revisao:d.atendimento.revisao,p_dados:{...d.atendimento,...dados}});return detalhe(id);};
  etapa='popular ordens e orçamentos';
  for(const [i,[tipo,doc]] of Object.entries(s.documentos).entries())await fazer('doc-'+tipo,async()=>{
   const orc=['orcamento','fluxo','parcial','recusado','interface'].includes(tipo);
   await rpc('criar_atendimento_com_itens',{p_id:doc.id,p_dados:{cliente_id:s.clientes[i%3],objeto_id:s.objetos[i%3],titulo:'QA Dia a dia · '+servico+' · '+tipo,data_servico:hoje,vencimento:hoje,situacao:'orcamento',ficha_especialidade:ficha(),mostrar_desconto_nota:false,dados:{documento:orc?'orcamento':'ordem',orcamento_enviado:tipo==='recebido'?'nao':'sim',observacoes_cliente:'Simulação fictícia. '+cenariosEspecialidades[perfil].caso}},p_desconto:4500,p_itens:[
    {id:doc.itens[0],tipo:'servico',descricao:'QA Dia a dia · '+servico,quantidade:1,unidade:'un',preco_centavos:20000,custo_centavos:4000,custo_informado:true,origem:'externa',grupo_servico:'Principal'},
    {id:doc.itens[1],tipo:'material',descricao:'QA Dia a dia · '+peca,quantidade:2,unidade:'un',preco_centavos:10000,origem:'estoque',produto_id:s.produto,grupo_servico:'Principal'},
    {id:doc.itens[2],tipo:'servico',descricao:'QA Dia a dia · '+adicional,quantidade:1,unidade:'un',preco_centavos:5000,custo_centavos:1000,custo_informado:true,origem:'externa',grupo_servico:'Adicional',depende_grupo:'Principal'}]});
   if(['execucao','parado','pronto'].includes(tipo)){
    await atualizar(doc.id,{situacao:'aprovado'});await atualizar(doc.id,{situacao:'em_execucao'});
    if(tipo==='parado')await atualizar(doc.id,{situacao:'aguardando',ficha_especialidade:{...ficha(),campos:{...ficha().campos,pendencia:'Aguardando peças',motivo_espera:'Peça / material'}}});
    if(tipo==='pronto'){const d=await detalhe(doc.id);await atualizar(doc.id,assist?concluirReparo(d.atendimento,perfil):{situacao:'concluido'});}
   }
   const d=await detalhe(doc.id);doc.numero=d.atendimento.numero;
  });
  check(Object.values(s.documentos).every(d=>d.numero),'10 documentos de teste preservados em etapas diferentes');
  if(process.argv.includes('--preparar')){s.ok=true;await salvar();res.push({perfil,ok:true,preparado:true});console.log('PREPARADO',perfil);continue;}
  etapa='aprovações';
  for(const tipo of ['fluxo','parcial','recusado'])await fazer('aprovacao-'+tipo,async()=>{
   const doc=s.documentos[tipo],d=await detalhe(doc.id),token=randomBytes(32).toString('hex');
   await rpc('gerar_link_proposta_atendimento',{p_atendimento:doc.id,p_revisao:d.atendimento.revisao,p_hash_token:createHash('sha256').update(token).digest('hex'),p_validade_dias:7});
   const visivel=await rpc('consultar_proposta_atendimento',{p_token:token},true);assert(!JSON.stringify(visivel).includes('custo_centavos'));
   const args={p_token:token,p_nome:'Cliente fictício QA',p_decisao:tipo==='recusado'?'recusado':'aprovado',p_grupos:tipo==='recusado'?[]:tipo==='parcial'?['Principal']:['Principal','Adicional'],p_confirmo:true};
   await rpc('responder_link_proposta_atendimento',args,true);await rpc('responder_link_proposta_atendimento',args,true);
   const atual=await detalhe(doc.id);assert.equal(atual.atendimento.valor_centavos,tipo==='parcial'?36000:40500);
   if(tipo==='recusado')assert(atual.atendimento.dados.orcamento_recusado_em);else{assert.equal(atual.atendimento.situacao,'aprovado');assert.equal(atual.itens.length,tipo==='parcial'?2:3);assert.equal(atual.atendimento.dados.documento,'ordem');}
  });
  check(true,'Aprovação total, parcial e recusa; proposta preservada; resposta repetida sem duplicar');
  const id=s.documentos.fluxo.id;
  const produto=()=>rpc('consultar_produto_estoque',{p_produto:s.produto});
  await fazer('base',async()=>{s.estoqueAntes=Number((await produto()).saldo);s.financeiroAntes=await rpc('consultar_financeiro',{p_inicio:hoje,p_fim:hoje,p_filtro:'todos'});});
  etapa='execução, parada e retomada';
  await fazer('execucao',async()=>{let d=await detalhe(id);const rev=d.atendimento.revisao;await atualizar(id,{situacao:'em_execucao'});await assert.rejects(()=>rpc('salvar_atendimento_servico',{p_id:id,p_revisao:rev,p_dados:d.atendimento}),e=>e.code==='PT409');
   await atualizar(id,{situacao:'aguardando',ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:{...d.atendimento.ficha_especialidade.campos,pendencia:'Aguardando material para teste'}}});
   d=await detalhe(id);await atualizar(id,{situacao:'em_execucao',ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:{...d.atendimento.ficha_especialidade.campos,...cenariosEspecialidades[perfil].saida,pendencia:'',motivo_espera:'Sem pendência'}}});
  });check(true,'Execução, parada, retomada e conflito de revisão verificados');
  etapa='agenda e deslocamento';
  await fazer('agenda',async()=>{
   const dados={atendimento_id:s.documentos.execucao.id,recurso_id:s.recurso,inicio:hoje+'T14:00:00-03:00',fim:hoje+'T15:45:00-03:00',situacao:'agendado',visita:true,deslocamento_minutos:25,logistica:{origem:'Base fictícia',destino:'Local fictício do cliente',margem_minutos:10,retorno_minutos:20,fonte:'manual'},observacoes:'QA Dia a dia · visita de 1h45'};
   await rpc('salvar_agenda_servico',{p_id:s.visita,p_dados:dados});
   await assert.rejects(()=>rpc('salvar_agenda_servico',{p_id:uuid(),p_dados:{...dados,inicio:hoje+'T13:20:00-03:00',fim:hoje+'T13:40:00-03:00'}}),/conflit|ocupado|reserva|horário/i);
   s.visitaDados=dados;
  });check(true,'Visita de 1h45 com ida e volta; conflito no deslocamento bloqueado');
  etapa='conclusão e reabertura';
  await fazer('conclusao',async()=>{let d=await detalhe(id);await atualizar(id,assist?concluirReparo(d.atendimento,perfil):{situacao:'concluido'});assert.equal(Number((await produto()).saldo),s.estoqueAntes-2);d=await detalhe(id);await rpc('reabrir_atendimento_servico',{p_atendimento:id,p_revisao:d.atendimento.revisao,p_motivo:'Conferência fictícia de retrabalho antes da entrega'});assert.equal(Number((await produto()).saldo),s.estoqueAntes);d=await detalhe(id);await atualizar(id,assist?concluirReparo(d.atendimento,perfil):{situacao:'concluido'});assert.equal(Number((await produto()).saldo),s.estoqueAntes-2);});
  check(Number((await produto()).saldo)===s.estoqueAntes-2,'Consumo, reabertura e nova conclusão não duplicam baixa de estoque');
  etapa='retirada ou aceite';
  await fazer('aceite',async()=>{const d=await detalhe(id);await atualizar(id,assist?registrarRetirada(d.atendimento,'Ana Costa · QA',perfil):{ficha_especialidade:{...d.atendimento.ficha_especialidade,campos:{...d.atendimento.ficha_especialidade.campos,situacao_aceite:'Aceito com ressalvas',aceite:'Ana Costa · QA',data_aceite:hoje,ressalvas_aceite:'Área adicional fora do escopo; cliente fictício ciente.'}}});});
  check(true,'Retirada da assistência ou aceite da manutenção persistido com responsável');
  etapa='pagamento e financeiro';
  await fazer('titulo',async()=>{s.titulo=await rpc('faturar_atendimento_servico',{p_atendimento:id});assert.equal(await rpc('faturar_atendimento_servico',{p_atendimento:id}),s.titulo);});
  for(const [i,valor] of [15000,25500].entries())await fazer('pagamento'+i,async()=>{const a={p_titulo:s.titulo,p_chave:s.pagamentos[i],p_valor:valor,p_taxa:i?500:0,p_data:hoje,p_conta:'banco',p_forma:i?'credito':'pix',p_observacao:'Pagamento fictício QA Dia a dia'};const b=await rpc('baixar_titulo_financeiro',a);assert.equal(await rpc('baixar_titulo_financeiro',a),b);if(i===0){const t=await rpc('consultar_titulo_alerta',{p_titulo:s.titulo});assert.equal(t.aberto_centavos,25500);}});
  const t=await rpc('consultar_titulo_alerta',{p_titulo:s.titulo});check(t.valor_centavos===40500&&t.baixado_centavos===40500&&t.aberto_centavos===0,'Pagamento parcial, quitação e taxa de cartão conferidos; reenvio não duplica');
  await assert.rejects(()=>rpc('baixar_titulo_financeiro',{p_titulo:s.titulo,p_chave:uuid(),p_valor:1,p_taxa:0,p_data:hoje,p_conta:'banco',p_forma:'pix'}),/saldo|valor|quitad/i);check(true,'Recebimento acima do saldo bloqueado');
  etapa='garantia e lucro';
  await fazer('garantia',()=>rpc('salvar_qualidade_atendimento',{p_atendimento:id,p_id:s.garantia,p_dados:{tipo:'retrabalho',motivo:'QA Dia a dia · ajuste e conferência após o serviço',solucao:'Refeito e testado; cliente fictício informado',custo_centavos:1250,minutos:30,aberto_em:hoje,resolvido_em:hoje},p_revisao:null}));
  const lucro=await rpc('consultar_lucro_documento',{p_documento:id});
  check(lucro.receita===40500&&lucro.custo===12750&&lucro.margem===27750,'Receita 405,00 − serviços 50,00 − materiais 60,00 − retrabalho 12,50 − taxa 5,00 = margem 277,50');
  const rel=await rpc('consultar_relatorios_servicos',{p_inicio:hoje,p_fim:hoje});const receitaRel=rel.detalhes.find(d=>d.atendimento.id===id).atendimento.valor_centavos;s.comparacao={lucro,relatorio:rel.custeios[id],receita:receitaRel,margem:receitaRel-rel.custeios[id].custo};await salvar();check(rel.custeios[id].custo===12750&&s.comparacao.margem===27750,'Relatórios batem com os custos e a margem da ordem');
  const fin=await rpc('consultar_financeiro',{p_inicio:hoje,p_fim:hoje,p_filtro:'todos'});
  check(fin.resumo.entradas-s.financeiroAntes.resumo.entradas===40000,'Caixa recebeu 400,00 líquidos: pagamentos menos taxa');
  s.evidencias={titulo:t,lucro,relatorio:rel.custeios[id],financeiroAntes:s.financeiroAntes.resumo,financeiroDepois:fin.resumo,estoqueAntes:s.estoqueAntes,estoqueDepois:Number((await produto()).saldo),detalhe:await detalhe(id)};
  s.ok=true;await salvar();res.push({perfil,ok:true,checks:s.checks});console.log('PASS',perfil,s.checks.length);
 }catch(e){if(s){s.ok=false;s.falha={etapa,mensagem:e.message,code:e.code};await salvar();}res.push({perfil,ok:false,etapa,erro:e.message});console.error('FAIL',perfil,etapa,e.message);}
 finally{await client.auth.signOut();await gravar('banco',{ok:res.every(x=>x.ok),resultados:res});}
}
if(res.some(x=>!x.ok))process.exitCode=1;
