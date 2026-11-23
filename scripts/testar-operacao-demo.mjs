import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';import {build} from 'vite';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const dados=new Map();globalThis.localStorage={getItem:k=>dados.get(k)??null,setItem:(k,v)=>dados.set(k,String(v)),removeItem:k=>dados.delete(k)};
const put=(k,v)=>localStorage.setItem(k,JSON.stringify(v));put('patio_os_v1',[]);
await build({configFile:false,envDir:false,logLevel:'error',build:{ssr:'scripts/fixtures/demo-operacao.ts',outDir:'output/operacao-simplificada-20261104/demo-build'}});
try{
 const {q,f,c}=await import(pathToFileURL(resolve('output/operacao-simplificada-20261104/demo-build/demo-operacao.js')));const w='qa',id=uuid();
 const call=(n,x)=>q.operacaoQualidade(true,n,{p_oficina:w,...x});
 let a=await call('salvar_acompanhamento_qualidade',{p_id:id,p_tipo:'fabricante',p_situacao:'autorizada',p_documento:uuid(),p_origem:'os',p_dados:{descricao:'Peça com defeito de teste',fabricante:'QA',solicitado_centavos:10000,autorizado_centavos:8000},p_revisao:null});
 let t=await call('consultar_financeiro_garantia',{p_id:id});assert.equal(t.valor_centavos,8000);assert.equal(t.baixado_centavos,0);
 await f.baixarTitulo(true,w,t,{chave:uuid(),valor_centavos:8000,taxa_centavos:0,data:f.hoje(),conta:'banco',forma:'pix',observacao:'Teste'});
 a=await call('consultar_acompanhamento_qualidade',{p_id:id});assert.equal(a.situacao,'ressarcida');assert.equal(a.dados.recebido_centavos,8000);
 const analise=await call('salvar_acompanhamento_qualidade',{p_id:uuid(),p_tipo:'analise',p_situacao:'aberta',p_documento:uuid(),p_origem:'os',p_dados:{descricao:'Falha intermitente no teste'},p_revisao:null});
 let o=await call('ocorrencia_da_analise',{p_id:analise.id,p_criar:true});assert.equal((await call('ocorrencia_da_analise',{p_id:analise.id,p_criar:true})).id,o.id);
 o=await call('ocorrencia_da_analise',{p_id:analise.id,p_revisao:o.revisao,p_dados:{custo_centavos:4500,minutos:90}});assert.equal(o.custo_centavos,4500);
 const fornecedor=uuid(),produto=uuid();put('patio_fornecedores_v1',[{id:fornecedor,nome:'Fornecedor QA'}]);put('patio_estoque_v1',{produtos:[{id:produto,descricao:'Produto QA',saldo:0,custo_centavos:0,revisao:1}],movimentos:[]});
 const compra={id:uuid(),fornecedor_id:fornecedor,data:f.hoje(),vencimento:f.hoje(),documento:'',observacoes:'',itens:[{produto_id:produto,quantidade:1,custo_centavos:10001}],pago:0,conta:'banco',forma:'pix',pagamento:{modo:'prazo',forma:'boleto',conta:'banco',data:'',parcelas:[3334,3334,3333].map(v=>({valor_centavos:v,vencimento:f.hoje()}))}};
 await c.registrarCompra(true,w,compra);let cp=await c.consultarCompra(true,w,compra.id);assert.equal(cp.titulos.length,3);assert.equal(cp.aberto_centavos,10001);await c.cancelarCompra(true,w,compra.id,'Cancelamento QA');cp=await c.consultarCompra(true,w,compra.id);assert(cp.titulos.every(t=>t.cancelado_em));assert.equal(cp.aberto_centavos,0);
 console.log('PASS demonstração: garantia, recebimento, ocorrência e parcelas');
}finally{dados.clear();}
