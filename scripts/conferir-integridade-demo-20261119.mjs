import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
const antes=process.argv.includes('--antes'),prefix=antes?'/output/revisao-integral-20261119/antes':'',memoria=new Map(),resultados=[];let falha='';
globalThis.localStorage={getItem:k=>memoria.get(k)??null,setItem:(k,v)=>{if(k===falha)throw Error('Falha simulada na gravação');memoria.set(k,String(v))},removeItem:k=>memoria.delete(k)};
const put=(k,v)=>localStorage.setItem(k,JSON.stringify(v)),get=k=>JSON.parse(localStorage.getItem(k));
const server=await createServer({configFile:false,envDir:false,cacheDir:'output/.vite-integridade-demo',server:{middlewareMode:true,hmr:false,ws:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
async function caso(nome,fn){try{await fn();resultados.push({nome,passou:true});}catch(e){resultados.push({nome,passou:false,erro:e.message});}finally{falha='';}}
try{
 const os=await server.ssrLoadModule(prefix+'/src/services/ordensServico.ts'),s=await server.ssrLoadModule(prefix+'/src/services/servicos.ts'),d=await server.ssrLoadModule(prefix+'/src/services/servicosCompletos.ts');
 const catalogo=await server.ssrLoadModule(prefix+'/src/lib/catalogo.ts');
 const inicial=()=>{memoria.clear();const o={id:'os-qa',numero:1,revisao:1,situacao:'open',itens:[{id:'item-qa',descricao:'Serviço QA',tipo:'service',unidade:'un',quantidade:1,preco_unitario_centavos:10000,situacao:'pending'}],historico:[],paradas:[],subtotal_centavos:10000,desconto_centavos:1000,total_centavos:9000,dados_cliente:{nome:'Teste'},dados_veiculo:{modelo:'Teste'}};put('patio_os_v1',[o]);put('patio_financeiro_v1',{titulos:[{id:'titulo-qa',automatico:true,ordem_servico_id:o.id,valor_centavos:9000,revisao:1}],baixas:[]});return o;};
 for(const acao of ['salvar_item_os','corrigir_item_os','adicionar_peca_estoque_os','adicionar_servico_catalogo_os'])await caso('Desconto preservado: '+acao,async()=>{
  const o=inicial(),c=catalogo.lerCatalogoDemo().find(x=>x.tipo==='service');put('patio_estoque_v1',{produtos:[{id:'p',descricao:'Peça QA',unidade:'un',preco_padrao_centavos:2500,saldo:5}],movimentos:[]});
  await os.operarOS(true,'qa',o,acao,{p_revisao:1,p_servico:c.id,p_produto:'p',p_quantidade:1,p_item:acao==='corrigir_item_os'?'item-qa':null,p_dados:{tipo:'service',descricao:'Novo',unidade:'un',quantidade:1,preco_unitario_centavos:2500}});
  const a=get('patio_os_v1')[0],sub=a.itens.reduce((s,i)=>s+Math.round(i.quantidade*i.preco_unitario_centavos),0);assert.equal(a.total_centavos,sub-1000);assert.equal(a.subtotal_centavos,sub);assert.equal(a.desconto_centavos,1000);assert.equal(get('patio_financeiro_v1').titulos[0].valor_centavos,a.total_centavos);
 });
 await caso('Redução abaixo do desconto rejeitada sem gravar',async()=>{const o=inicial(),copia=new Map(memoria);await assert.rejects(os.operarOS(true,'qa',o,'corrigir_item_os',{p_item:'item-qa',p_dados:{preco_unitario_centavos:500}}),/desconto/);assert.deepEqual(memoria,copia);});
 for(const ramo of ['assistencia_tecnica','manutencao_campo','limpeza']){
  const w='demo-'+ramo,k='patio_servicos:'+w,ex='patio_detalhes_servicos:'+w;
  function preparar(){memoria.clear();const p=s.lerServicosDemo(w),a=p.atendimentos[0];a.situacao='em_execucao';a.valor_centavos=10000;a.ficha_especialidade=undefined;put(k,p);put(ex,{[a.id]:{itens:[{id:'i',descricao:'Material QA',unidade:'un',tipo:'material',origem:'estoque',produto_id:'p',quantidade:1,preco_centavos:10000}],comercial:{},equipe:[],horas:[],qualidade:[],eventos:[]}});put('patio_estoque_v1',{produtos:[{id:'p',saldo:10,revisao:1,custo_centavos:4000}],movimentos:[]});return a;}
  const concluir=a=>s.gravarServico('salvar_atendimento_servico',w,{p_id:a.id,p_revisao:a.revisao,p_dados:{...a,situacao:'concluido'}},true);
  for(const key of [k,ex,'patio_estoque_v1'])await caso(ramo+' concluir com falha em '+key,async()=>{const a=preparar(),copia=new Map(memoria);falha=key;await assert.rejects(concluir(a),/Falha simulada/);falha='';assert.deepEqual(memoria,copia);});
  for(const key of [k,ex,'patio_estoque_v1'])await caso(ramo+' reabrir com falha em '+key,async()=>{const a=preparar();await concluir(a);const copia=new Map(memoria);falha=key;await assert.rejects(d.operarAtendimento(true,w,'reabrir_atendimento_servico',{p_atendimento:a.id,p_motivo:'Correção de teste'}),/Falha simulada/);falha='';assert.deepEqual(memoria,copia);});
  await caso(ramo+' concluir/reabrir/devolver sem duplicar',async()=>{const a=preparar();await concluir(a);assert.equal(get('patio_estoque_v1').produtos[0].saldo,9);assert.equal(get(k).atendimentos[0].situacao,'concluido');await d.operarAtendimento(true,w,'reabrir_atendimento_servico',{p_atendimento:a.id,p_motivo:'Correção de teste'});assert.equal(get('patio_estoque_v1').produtos[0].saldo,10);assert.equal(get(k).atendimentos[0].situacao,'em_execucao');await assert.rejects(d.operarAtendimento(true,w,'reabrir_atendimento_servico',{p_atendimento:a.id,p_motivo:'Repetição'}));assert.equal(get('patio_estoque_v1').produtos[0].saldo,10);});
 }
}finally{await server.close();const out='output/revisao-integral-20261119/integridade-demo';await mkdir(out,{recursive:true});await writeFile(out+'/'+(antes?'antes':'depois')+'.json',JSON.stringify({metodo:'Serviços reais em SSR; armazenamento fictício em memória; falhas injetadas em cada chave. Sem banco remoto.',resultados},null,2));}
console.log(JSON.stringify({fase:antes?'antes':'depois',casos:resultados.length,falhas:resultados.filter(r=>!r.passou)}));
if(!antes)assert(resultados.every(r=>r.passou));
