import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {cenarioOrcamento,perfisOrcamento} from './fixtures/orcamentos-impressao-dados.mjs';
import {gerarPdfCliente} from '../src/services/pdfCliente.ts';
import {gerarPdfAtendimento} from '../src/services/pdfAtendimento.ts';
import {apresentacaoOrcamento} from '../src/lib/apresentacaoOrcamento.ts';
const texto=pdf=>pdf.internal.pages.flat().join('\n');
test('Identificação separa equipamento, marca e série sem perder informação',()=>{
 const d=cenarioOrcamento('assistencia_celulares').documento;
 d.bem={rotulo:'Equipamento / marca',valor:'Equipamento: Galaxy A54\nMarca: Samsung\nIMEI / série: 12345'};
 const a=apresentacaoOrcamento(d);assert.equal(a.bem.valor,'Galaxy A54');assert.deepEqual(a.detalhesBem,['Marca: Samsung','IMEI / série: 12345']);
});
for(const perfil of perfisOrcamento) test(`Proposta de ${perfil}: documento e download preservam valores e identificação`,()=>{
  const {documento:d,atendimento,empresa,total,subtotal,desconto}=cenarioOrcamento(perfil);
  const original=JSON.stringify(d),pdf=gerarPdfCliente(d),a=apresentacaoOrcamento(d),t=texto(pdf);
  assert.equal(d.total,total);assert.equal(d.subtotal,subtotal);assert.equal(d.desconto,desconto);
  assert.equal(JSON.stringify(d),original);assert.equal(pdf.getNumberOfPages(),1);
  assert.match(t,/Total do orçamento/);assert.match(t,/CNPJ\/CPF/);assert.match(t,/Subtotal/);assert.match(t,/Desconto/);
  if(atendimento){assert.notEqual(a.bem.rotulo,'Veículo');assert.doesNotMatch(t,/VEÍCULO|Placa:/);assert.match(texto(gerarPdfAtendimento(atendimento,empresa,'orcamento')),/Total do orçamento/);}
});
test('70 itens: todas as linhas, preços e cabeçalhos continuam nas páginas seguintes',()=>{
 const {documento:d}=cenarioOrcamento('mecanica','longo'),pdf=gerarPdfCliente(d),t=texto(pdf),pages=pdf.internal.pages.slice(1);
 assert(pdf.getNumberOfPages()>3);
 for(let i=1;i<=70;i++)assert.equal(t.split('ITEM_'+String(i).padStart(3,'0')).length-1,1);
 assert.equal(t.split('Subtotal').length-1,1);
 for(const [i,p] of pages.entries()){assert(p.join('').includes(`${i+1}/${pages.length}`));if(p.join('').includes('ITEM_'))assert(p.join('').includes('UNITÁRIO'));}
});
test('Uma descrição maior que uma página preserva fim e total uma única vez',()=>{
 const pdf=gerarPdfCliente(cenarioOrcamento('mecanica','descricao-extensa').documento),t=texto(pdf);
 assert(pdf.getNumberOfPages()>3);assert.equal(t.split('INICIO_EXTENSO').length-1,1);assert.equal(t.split('FIM_EXTENSO').length-1,1);assert.equal(t.split('Subtotal').length-1,1);
});
test('Desconto oculto e links inválidos não reaparecem no PDF',()=>{
 const d=cenarioOrcamento().documento;d.mostrarDesconto=false;d.desconto=0;d.total=d.subtotal;
 assert.doesNotMatch(texto(gerarPdfCliente(d)),/Desconto/);
 assert(!gerarPdfCliente(d,'javascript:alert(1)').output().includes('javascript:'));
 assert(gerarPdfCliente(d,'https://example.com/orcamento').output().includes('https://example.com/orcamento'));
});
if(process.argv.includes('--amostras')) {
 const dir='output/orcamentos-impressao-20261111';mkdirSync(dir,{recursive:true});
 for(const [nome,perfil,caso] of [['automotivo','mecanica','normal'],['assistencia','assistencia_celulares','normal'],['manutencao','manutencao_climatizacao','normal'],['limpeza','limpeza_geral','normal'],['longo','mecanica','longo'],['descricao-extensa','mecanica','descricao-extensa'],['identidade-longa','mecanica','identidade-longa']]) {
  const {documento}=cenarioOrcamento(perfil,caso);writeFileSync(`${dir}/${nome}.pdf`,Buffer.from(gerarPdfCliente(documento).output('arraybuffer')));
 }
}
