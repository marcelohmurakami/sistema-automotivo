import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {especialidades} from '../src/lib/especialidades.ts';
import {novaFichaEspecialidade} from '../src/lib/perfisAtendimento.ts';
import {documentoAtendimento} from '../src/lib/documentoAtendimento.ts';
import {documentoDaOS} from '../src/lib/documentoCliente.ts';
import {gerarPdfCliente} from '../src/services/pdfCliente.ts';
const resultados=[];
for(const [id,perfil] of Object.entries(especialidades)){
 const auto=perfil.ramo==='automotivo';
 const a={id:'qa',numero:9,titulo:'Serviço QA',valor_centavos:33300,total_centavos:33300,subtotal_centavos:37500,desconto_centavos:4200,situacao:'ready',data_servico:'2026-11-09',ficha_especialidade:novaFichaEspecialidade(id),dados:{},dados_cliente:{nome:'Cliente QA'},dados_veiculo:{modelo:'Bem QA'},itens:[{descricao:'Serviço QA',tipo:'service',quantidade:1,preco_unitario_centavos:37500,total_item_centavos:37500,situacao:'done',unidade:'serv'}]};
 const d={atendimento:a,cliente:{nome:'Cliente QA'},objeto:{nome:'Bem QA',dados:{}},itens:[{descricao:'Serviço QA',tipo:'service',quantidade:1,preco_centavos:37500,unidade:'serv'}],comercial:{desconto_centavos:4200}};
 const empresa={nome:'Empresa QA',especialidade:id};
 for(const opcao of [undefined,false,true]){
  a.mostrar_desconto_nota=opcao;
  const doc=auto?documentoDaOS(a,empresa):documentoAtendimento(d,empresa);
  assert.equal(doc.total,opcao?33300:37500);assert.equal(doc.desconto,opcao?4200:0);
  const pdf=gerarPdfCliente(doc),texto=pdf.internal.pages.flat().join('\n');
  assert.equal(texto.includes('Desconto'),opcao===true);
  assert.equal(texto.includes('333,00'),opcao===true);assert(texto.includes('375,00'));
  if(id==='retifica'&&opcao!==undefined)writeFileSync('output/desconto-nota-20261109/nota-'+opcao+'.pdf',Buffer.from(pdf.output('arraybuffer')));
  assert.equal(a.total_centavos,33300);assert.equal(a.valor_centavos,33300);
  resultados.push({perfil:id,cenario:'Documento e PDF: preferência '+opcao,ok:true});
  if(!auto){const q=documentoAtendimento(d,empresa,'orcamento');assert.equal(q.total,33300);assert.equal(q.desconto,4200);}
 }
 if(!auto){
  d.itens=[];a.mostrar_desconto_nota=false;
  const legado=documentoAtendimento(d,empresa);assert.equal(legado.total,37500);assert.equal(legado.itens[0].preco_unitario_centavos,37500);
  d.taxa_diagnostico={valor_centavos:5000};d.comercial.abatimento_diagnostico_centavos=1000;
  const diagnostico=documentoAtendimento(d,empresa);assert(!diagnostico.secoes.some(s=>s.texto.includes('Abatimento incluído')));
  resultados.push({perfil:id,cenario:'Legado sem itens e abatimento de diagnóstico oculto',ok:true});
 }
}
writeFileSync('output/desconto-nota-20261109/documentos-subsetores.json',JSON.stringify({ok:true,resultados},null,2));console.log(JSON.stringify({ok:true,verificacoes:resultados.length}));
