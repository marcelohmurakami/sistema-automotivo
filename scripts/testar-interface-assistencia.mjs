import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interfaceRamo } from '../src/lib/interfaceRamo.ts';
import { menuAssistencia, gruposAssistencia } from '../src/lib/navegacaoAssistencia.ts';
import { concluirReparo, registrarRetirada } from '../src/lib/assistenciaTecnica.ts';
import { novaFichaEspecialidade, validarFichaEspecialidade } from '../src/lib/perfisAtendimento.ts';
import { resumoOperacao, subsetoresDoRamo } from '../src/lib/operacaoServicos.ts';
import { gerarPdfAtendimento } from '../src/services/pdfAtendimento.ts';

const perfis = subsetoresDoRamo('assistencia_tecnica').map(([id])=>id);
test('Os cinco perfis usam exemplos de assistência e preservam o automotivo',()=>{
  assert.equal(perfis.length,5);
  for(const id of perfis){const ui=interfaceRamo('assistencia_tecnica',id);assert.doesNotMatch(JSON.stringify(ui),/alinhamento|veículo|pneu|oficina/i);assert.equal(ui.ordem,'Ordem de reparo');}
  assert.match(interfaceRamo('assistencia_tecnica','assistencia_celulares').identificacao,/IMEI/);
  assert.doesNotMatch(interfaceRamo('assistencia_tecnica','assistencia_eletrodomesticos').identificacao,/IMEI/);
  assert.equal(interfaceRamo('automotivo').exemploServico,'Alinhamento da direção');
  assert.equal(interfaceRamo(undefined).empresa,'oficina');
});
test('Menu separa operação, cadastros, gestão e administração; busca ignora acentos',()=>{
  const completo=menuAssistencia(()=>true,'owner');
  assert.equal(new Set(completo.map(i=>i.rota)).size,completo.length);
  assert.ok(gruposAssistencia.every((_,i)=>completo.some(n=>n.grupo===i)));
  assert.equal(menuAssistencia(()=>true,'owner','pecas').length,2);
  const colaborador=menuAssistencia(()=>true,'staff');
  for(const rota of ['/financeiro','/compras','/suprimentos','/funcionarios','/relatorios','/garantias','/equipe','/meu-site']) assert.ok(!colaborador.some(n=>n.rota===rota));
  const basico=menuAssistencia(r=>['customers','catalog'].includes(r),'owner');
  assert.ok(!basico.some(n=>['/atendimentos','/agenda','/estoque','/compras'].includes(n.rota)));
  assert.ok(!menuAssistencia(r=>r!=='inventory','owner').some(n=>['/compras','/suprimentos'].includes(n.rota)));
  for(const [manutencao,limpeza] of [[false,false],[true,false],[false,true]]) {
    assert.equal(menuAssistencia(()=>true,'owner','reposicao',manutencao,limpeza)[0]?.rota,'/compras');
    assert.ok(!menuAssistencia(r=>r!=='finance','owner','',manutencao,limpeza).some(n=>n.rota==='/compras'));
  }
});
for(const especialidade of perfis) test(`${especialidade}: conclusão, retirada, histórico e garantia preservados`,()=>{
  const ficha=novaFichaEspecialidade(especialidade);
  ficha.campos.defeito='Não liga';ficha.campos.diagnostico='Fonte defeituosa';ficha.campos.garantia_data='2027-01-15';ficha.campos.motivo_espera='Peça / material';
  const original={id:'teste',revisao:1,situacao:'em_execucao',dados:{},valor_centavos:15000,vencimento:'2026-11-15',ficha_especialidade:ficha};
  const pronto=concluirReparo(original,especialidade);
  validarFichaEspecialidade(pronto.ficha_especialidade);
  assert.equal(original.situacao,'em_execucao');assert.equal(original.ficha_especialidade.etapa,'');
  assert.equal(pronto.situacao,'concluido');assert.equal(pronto.valor_centavos,original.valor_centavos);
  assert.equal(resumoOperacao(pronto,'2026-10-15',[]).retirada,true);
  assert.equal(resumoOperacao({...pronto,situacao:'cancelado'},'2026-10-15',[]).retirada,false);
  assert.throws(()=>registrarRetirada(original,'Cliente',especialidade),/Conclua/);
  assert.throws(()=>registrarRetirada(pronto,' ',especialidade),/quem recebeu/);
  const entregue=registrarRetirada({...pronto,concluido_em:'2026-10-15T12:00:00Z'},'  Cliente teste  ',especialidade);
  validarFichaEspecialidade(entregue.ficha_especialidade);
  assert.equal(entregue.situacao,'concluido');assert.equal(entregue.concluido_em,'2026-10-15T12:00:00Z');
  assert.equal(entregue.ficha_especialidade.campos.recebedor,'Cliente teste');
  assert.equal(entregue.ficha_especialidade.campos.diagnostico,'Fonte defeituosa');
  assert.equal(entregue.ficha_especialidade.campos.garantia_data,'2027-01-15');
  assert.equal(resumoOperacao(entregue,'2026-10-15',[]).retirada,false);
});
test('Retirada não aparece para conclusão de limpeza ou manutenção',()=>{
  for(const especialidade of ['manutencao_eletrica','limpeza_estofados']){
    const a={situacao:'concluido',ficha_especialidade:novaFichaEspecialidade(especialidade)};
    assert.equal(resumoOperacao(a,'2026-10-15',[]).retirada,false);
    assert.throws(()=>registrarRetirada(a,'Cliente',especialidade),/assistência/);
  }
});
test('Comprovante identifica equipamento sem expor diagnóstico interno',()=>{
  const ficha=novaFichaEspecialidade('assistencia_celulares');ficha.campos.diagnostico='DIAGNOSTICO_INTERNO';
  const d={atendimento:{id:'a',numero:7,data_servico:'2026-10-15',titulo:'Reparo de tela',valor_centavos:10000,dados:{},ficha_especialidade:ficha},cliente:{nome:'Cliente teste'},objeto:{nome:'Celular de teste',dados:{serie:'TESTE-IMEI-001',condicao:'Tela trincada'}},itens:[],comercial:{desconto_centavos:0}};
  const pdf=gerarPdfAtendimento(d,{nome:'Assistência teste'}).output();
  assert.match(pdf,/Equipamento: Celular de teste/);assert.match(pdf,/TESTE-IMEI-001/);assert.doesNotMatch(pdf,/DIAGNOSTICO_INTERNO|Equipamento \/ local/);
  assert.match(gerarPdfAtendimento(d,{nome:'Assistência teste'},'tecnica').output(),/DIAGNOSTICO_INTERNO/);
});
