import assert from 'node:assert/strict';
import {createServer} from 'vite';
const memoria=new Map();let falha='';
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>memoria.get(k)??null,setItem:(k,v)=>{if(k===falha)throw Error('Falha simulada');memoria.set(k,v)},removeItem:k=>memoria.delete(k)}});
const server=await createServer({configFile:false,envDir:false,cacheDir:'output/.vite-desconto-recebimento',server:{middlewareMode:true,hmr:false,ws:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try{
 const {prepararPagamentoAtendimento}=await server.ssrLoadModule('/src/services/pagamentoAtendimento.ts');
 const {lerServicosDemo}=await server.ssrLoadModule('/src/services/servicos.ts');
 const {baixarTitulo,historicoFinanceiro,consultarTituloFinanceiro,hoje}=await server.ssrLoadModule('/src/services/financeiro.ts');
 const {consultarDetalhesAtendimento}=await server.ssrLoadModule('/src/services/servicosCompletos.ts');
 for(const ramo of ['assistencia_tecnica','manutencao_campo','limpeza']){
  const w='demo-'+ramo,p=lerServicosDemo(w),a=p.atendimentos[0];a.situacao='concluido';a.valor_centavos=30000;
  localStorage.setItem('patio_servicos:'+w,JSON.stringify(p));
  const d=await prepararPagamentoAtendimento(true,w,a.id),t=d.titulo;
  const b={chave:crypto.randomUUID(),valor_centavos:5000,taxa_centavos:0,data:hoje(),conta:'banco',forma:'pix',observacao:'Desconto teste',desconto_centavos:3000,saldo_antes_desconto_centavos:30000,vencimento_restante:'2026-12-15'};
  const antes=new Map(memoria);falha='patio_servicos:'+w;
  await assert.rejects(()=>baixarTitulo(true,w,t,b));assert.deepEqual(memoria,antes);falha='';
  await baixarTitulo(true,w,t,b);await baixarTitulo(true,w,t,b);
  const depois=await consultarTituloFinanceiro(true,w,t.id);assert.equal(depois.valor_centavos,27000);assert.equal(depois.baixado_centavos,5000);assert.equal(depois.aberto_centavos,22000);
  assert.equal((await historicoFinanceiro(true,w,t.id)).length,1);
  const os=await consultarDetalhesAtendimento(true,w,a.id);assert.equal(os.atendimento.valor_centavos,27000);assert.equal(os.comercial.desconto_centavos,3000);
  console.log('PASS',ramo,'OS concluída, desconto, saldo, idempotência e rollback de falha no documento');
 }
}finally{await server.close();}
