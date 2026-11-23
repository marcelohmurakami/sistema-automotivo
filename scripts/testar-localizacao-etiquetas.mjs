import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarEtiqueta, enderecoEtiqueta, retornoInterno } from '../src/lib/localizacaoFisica.ts';
import { gerarPdfEtiquetas } from '../src/services/pdfEtiquetas.ts';
const origem = 'https://patio-gestao-peach.vercel.app';
const codigo = 'PTI-0123456789ABCDEF';
test('QR do item e do local; códigos do fabricante não são confundidos com etiquetas internas', () => {
  assert.deepEqual(interpretarEtiqueta(codigo.toLowerCase(), origem), { tipo: 'item', codigo });
  assert.equal(interpretarEtiqueta('PTL-0123456789ABCDEF', origem).tipo, 'local');
  assert.equal(interpretarEtiqueta(enderecoEtiqueta(codigo, origem), origem).codigo, codigo);
  assert.deepEqual(interpretarEtiqueta('7890123456789', origem), { tipo: 'busca', codigo: '7890123456789' });
  assert.equal(interpretarEtiqueta('SN-2049', origem).tipo, 'busca');
});
test('leitura nunca navega para endereços arbitrários ou executa códigos', () => {
  for (const s of ['javascript:alert(1)', 'https://outro.test/localizacao?codigo=' + codigo, 'data:text/html,oi', 'PTI-12', '\u0000texto', '', 'a'.repeat(101), origem + '/entrar?codigo=' + codigo]) assert.throws(() => interpretarEtiqueta(s, origem));
  assert.throws(() => enderecoEtiqueta('texto', origem));
});
test('login retorna à etiqueta somente por caminho interno seguro', () => {
  const caminho = '/localizacao?codigo=' + codigo;
  assert.equal(retornoInterno(caminho), caminho);
  for (const s of ['//outro.test', 'https://outro.test', '/\\outro.test', '/entrar', '/definir-senha', '/\n/outro', null, {}, 42]) assert.equal(retornoInterno(s), '/');
});
test('PDF mantém dimensões, paginação e identidade legível, sem dados do cliente no QR', () => {
  const itens = Array.from({ length: 21 }, (_, n) => ({ codigo: 'PTI-' + n.toString(16).toUpperCase().padStart(16, '0'), descricao: 'Equipamento e acessórios com descrição longa '.repeat(4), complemento: 'OS #12' }));
  const a4 = gerarPdfEtiquetas(itens, 'Empresa QA', origem); assert.equal(a4.getNumberOfPages(), 3); assert.equal(Math.round(a4.internal.pageSize.getWidth()), 210);
  const termica = gerarPdfEtiquetas(itens.slice(0, 2), 'Empresa QA', origem, 'termica'); assert.equal(termica.getNumberOfPages(), 2); assert.equal(Math.round(termica.internal.pageSize.getWidth()), 80); assert.equal(Math.round(termica.internal.pageSize.getHeight()), 50);
  assert.throws(() => gerarPdfEtiquetas([], 'Empresa', origem));
  assert.throws(() => gerarPdfEtiquetas(Array(51).fill(itens[0]), 'Empresa', origem));
});
