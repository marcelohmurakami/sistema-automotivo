import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abatimentoDiagnostico, taxaDoFormulario } from '../src/lib/diagnosticoOrcamento.ts';
import { documentoDaAutorizacao } from '../src/services/pdfAutorizacao.ts';
import { gerarPdfCliente } from '../src/services/pdfCliente.ts';

test('diagnóstico é limitado ao valor autorizado e respeita a opção de não abater', () => {
  assert.equal(abatimentoDiagnostico({ valor_centavos: 5000, abater_na_aprovacao: true }, 18000), 5000);
  assert.equal(abatimentoDiagnostico({ valor_centavos: 5000, abater_na_aprovacao: true }, 3000), 3000);
  assert.equal(abatimentoDiagnostico({ valor_centavos: 5000, abater_na_aprovacao: false }, 18000), 0);
  assert.equal(abatimentoDiagnostico(undefined, 18000), 0);
});
test('formulário diferencia taxa omitida, removida e valor com centavos', () => {
  const form = new FormData();
  assert.equal(taxaDoFormulario(form), undefined);
  form.set('diagnostico_valor', '49.95'); form.set('diagnostico_abater', 'on');
  assert.equal(taxaDoFormulario(form).valor_centavos, 4995);
  form.set('diagnostico_valor', '');
  assert.equal(taxaDoFormulario(form).valor_centavos, 0);
  form.set('diagnostico_valor', '-1'); assert.throws(() => taxaDoFormulario(form));
});
test('comprovante imprime somente itens autorizados e identifica a proposta original', () => {
  const p = { versao_id: 'versao-qa', nome: 'Cliente QA', decisao: 'aprovado', grupos: ['Principal'], total_centavos: 4000, desconto_centavos: 6000, origem: 'link', confirmado_em: '2026-10-26T12:00:00Z', declaracao: 'Autorizo os serviços selecionados.', hash_sha256: 'a'.repeat(64), taxa_diagnostico: { valor_centavos: 5000, abatimento_centavos: 5000 }, documento: { numero: 1, versao: 2, empresa: 'Assistência QA', cliente: 'Cliente QA', objeto: 'Celular QA', data_servico: '2026-10-26', total_centavos: 18000, itens: [{ descricao: 'Troca de tela', quantidade: 1, preco_centavos: 10000, grupo_servico: 'Principal', unidade: 'un' }, { descricao: 'Película', quantidade: 1, preco_centavos: 10000, grupo_servico: 'Adicional', unidade: 'un' }] } };
  const d = documentoDaAutorizacao(p);
  const textoPdf = gerarPdfCliente(d).internal.pages.flat().join('\n');
  assert.ok(textoPdf.includes('COMPROVANTE DE AUTORIZAÇÃO'));
  assert.ok(!textoPdf.includes('Total do orçamento'));
  assert.equal(d.total, 4000); assert.equal(d.desconto, 6000); assert.equal(d.itens.length, 1);
  assert.ok(d.secoes.some(s => s.texto.includes('Não autorizado: Película')));
  assert.ok(d.aviso.includes('Não comprova pagamento'));
  const recusado = documentoDaAutorizacao({ ...p, decisao: 'recusado', grupos: [], total_centavos: 0 });
  assert.equal(recusado.total, 0); assert.equal(recusado.itens.length, 0);
  assert.ok(gerarPdfCliente(recusado).internal.pages.flat().join('\n').includes('COMPROVANTE DE RECUSA'));
});
