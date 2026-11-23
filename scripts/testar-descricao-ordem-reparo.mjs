import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tituloAtendimento } from '../src/lib/tituloAtendimento.ts';
import { documentoAtendimento } from '../src/lib/documentoAtendimento.ts';
import { novaFichaEspecialidade } from '../src/lib/perfisAtendimento.ts';
import { especialidades } from '../src/lib/especialidades.ts';

test('descrição vazia identifica a OS pelos itens sem pedir outro preenchimento', () => {
  assert.equal(tituloAtendimento('  ', [{ descricao: 'Troca da tela' }, { descricao: 'Teste de toque' }], 'Celular', 'Ordem de reparo'), 'Troca da tela · Teste de toque');
  assert.equal(tituloAtendimento('', [], 'Celular', 'Ordem de reparo'), 'Ordem de reparo · Celular');
  assert.equal(tituloAtendimento('  Troca do conector  ', [{ descricao: 'Reparo' }], 'Celular', 'Ordem de reparo'), 'Troca do conector');
  assert.equal(tituloAtendimento('A', [], 'Celular', 'Ordem de reparo'), 'Ordem de reparo · A');
  assert.equal(tituloAtendimento('', [{ descricao: 'x'.repeat(220) }], 'Celular', 'Ordem de reparo').length, 180);
});

for (const [especialidade, perfil] of Object.entries(especialidades).filter(([, p]) => p.ramo !== 'automotivo')) {
  test(`${perfil.nome}: descrição e prazo na nota, sem expor informações internas`, () => {
    const d = {
      atendimento: { id: 'qa', numero: 1, data_servico: '2026-11-10', titulo: 'Serviço registrado', valor_centavos: 9000, situacao: 'aberto', mostrar_desconto_nota: true, ficha_especialidade: novaFichaEspecialidade(especialidade), dados: { descricao_servico: '', observacoes_cliente: 'Conferir junto ao cliente', diagnostico: 'DIAGNOSTICO_INTERNO', entrega_prevista_em: '2026-12-15T17:30:00.000Z' } },
      cliente: { nome: 'Cliente QA' }, objeto: { nome: 'Equipamento / local QA', dados: {} },
      itens: [{ descricao: 'Serviço registrado', tipo: 'servico', quantidade: 1, unidade: 'serv', preco_centavos: 10000 }], comercial: { desconto_centavos: 1000 },
    };
    const empresa = { nome: 'Empresa QA', especialidade };
    for (const modo of ['atendimento', 'orcamento']) {
      const doc = documentoAtendimento(d, empresa, modo);
      assert(!doc.secoes.some(s => s.titulo === 'Descrição do serviço'));
      assert(doc.secoes.some(s => s.titulo === 'Observações' && s.texto === 'Conferir junto ao cliente'));
      assert.equal(doc.informacoes.find(i => i.rotulo === 'Entrega prometida').valor, '15/12/2026, 14:30');
      assert.equal(doc.total, 9000);
      assert.equal(doc.desconto, 1000);
      assert(!JSON.stringify(doc).includes('DIAGNOSTICO_INTERNO'));
      const descrito = documentoAtendimento({ ...d, atendimento: { ...d.atendimento, dados: { ...d.atendimento.dados, descricao_servico: 'Solicitação detalhada do cliente' } } }, empresa, modo);
      assert.deepEqual(descrito.secoes.find(s => s.titulo === 'Descrição do serviço'), { titulo: 'Descrição do serviço', texto: 'Solicitação detalhada do cliente' });
    }
  });
}
