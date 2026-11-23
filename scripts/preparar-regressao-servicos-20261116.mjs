// Dados exclusivamente fictícios; nunca altera empresas reais.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export const root='output/regressao-assistencia-manutencao-limpeza-20261116';
const exemplos={
assistencia_geral:['Impressora Epson L3250','Reparo da alimentação','Fonte de alimentação'],
assistencia_celulares:['Samsung Galaxy A54','Troca da tela','Tela A54'],
assistencia_informatica:['Notebook Dell Inspiron','Substituição do SSD','SSD 480 GB'],
assistencia_eletrodomesticos:['Lavadora Electrolux 12 kg','Reparo da drenagem','Bomba de drenagem'],
assistencia_eletronica:['Placa fonte 24 V','Reparo da fonte chaveada','Capacitor de reposição'],
manutencao_climatizacao:['Split da sala comercial','Manutenção do split','Filtro de reposição'],
manutencao_eletrica:['Quadro elétrico do condomínio','Reparo da iluminação','Conector elétrico'],
manutencao_hidraulica:['Rede da lavanderia','Reparo de vazamento','Conexão hidráulica'],
manutencao_equipamentos:['Bomba do setor de utilidades','Manutenção da bomba','Kit de vedação'],
manutencao_geral:['Imóvel residencial','Reparo residencial','Material de acabamento'],
limpeza_geral:['Sala de atendimento','Limpeza programada','Detergente neutro'],
limpeza_residencial:['Apartamento 101','Limpeza de cozinha e banheiros','Produto multiuso'],
limpeza_comercial:['Escritório do térreo','Limpeza do escritório','Saco para descarte'],
limpeza_pos_obra:['Apartamento recém-reformado','Limpeza pós-obra','Removedor compatível'],
limpeza_estofados:['Sofá de três lugares','Higienização do sofá','Produto para tecido'],
limpeza_vidros:['Fachada envidraçada térrea','Limpeza dos vidros','Detergente para vidros'],
};
await mkdir(root+'/sementes',{recursive:true});
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo!=='automotivo');
assert.equal(contas.length,16);
const env=Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(l=>/^VITE_SUPABASE_/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
assert.equal(env.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');
for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const path=`${root}/sementes/${c.especialidade}.json`;let s;try{s=JSON.parse(await readFile(path,'utf8'));if(s.ok){console.log('EXISTENTE',c.especialidade);continue}}catch(e){if(e.code!=='ENOENT')throw e}
 const api=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(45000)})}});
 const {error}=await api.auth.signInWithPassword({email:c.email,password:c.senha});if(error)throw error;
 const rpc=async(n,a)=>{const {data,error}=await api.rpc(n,{p_oficina:c.empresa_id,...a});if(error)throw new Error(n+': '+error.message);return data};
 const [objeto,servico,material]=exemplos[c.especialidade];
 s||={perfil:c.especialidade,ramo:c.ramo,empresa:c.empresa_id,cliente:uuid(),objeto:uuid(),servico:uuid(),produto:uuid(),entrada:uuid(),feitos:{},clienteNome:`QA R16 · Ana ${c.especialidade}`,objetoNome:objeto+' · QA R16',servicoNome:'QA R16 · '+servico,produtoNome:'QA R16 · '+material};
 const save=()=>writeFile(path,JSON.stringify(s,null,2));await save();
 const step=async(k,fn)=>{if(!s.feitos[k]){await fn();s.feitos[k]=true;await save()}};
 await step('cliente',async()=>{const existentes=await rpc('buscar_cadastros_operacao',{p_tipo:'clientes',p_busca:s.clienteNome});const cli=existentes.find(x=>x.nome===s.clienteNome)||await rpc('salvar_cliente',{p_dados:{nome:s.clienteNome,observacoes:'Teste fictício. Não contatar.'}});s.cliente=cli.id;});
 await step('objeto',()=>rpc('salvar_objeto_atendimento',{p_id:s.objeto,p_dados:{cliente_id:s.cliente,nome:s.objetoNome,dados:{marca:'Fabricante de teste',serie:'QA-R16-'+c.especialidade,endereco:'Rua de Teste, 101',area:'60',acesso:'Acesso autorizado para simulação'}}}));
 await step('servico',()=>rpc('salvar_item_catalogo',{p_id:s.servico,p_dados:{descricao:s.servicoNome,tipo:'service',unidade:'un',preco_padrao_centavos:20000,custo_centavos:4000,ficha:{notas:'QA. Valores fictícios.',duracao_minutos:90,custos:[{descricao:'Insumos',valor_centavos:4000}]}}}));
 await step('produto',()=>rpc('salvar_produto_estoque',{p_id:s.produto,p_dados:{descricao:s.produtoNome,unidade:'un',codigo:'QA-R16-'+c.especialidade,custo_centavos:3000,preco_padrao_centavos:10000,minimo:5}}));
 await step('saldo',async()=>{const p=await rpc('consultar_produto_estoque',{p_produto:s.produto});await rpc('movimentar_estoque',{p_produto:s.produto,p_tipo:'entrada',p_quantidade:100,p_motivo:'Saldo fictício da regressão R16',p_chave:s.entrada,p_revisao:p.revisao})});
 s.ok=true;await save();await api.auth.signOut();console.log('PREPARADO',c.especialidade);
}
