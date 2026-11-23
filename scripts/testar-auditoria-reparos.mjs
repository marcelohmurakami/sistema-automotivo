import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fichaDoAtendimento, subsetoresDoRamo, resumoOperacao } from '../src/lib/operacaoServicos.ts';
import { fichaReaberta } from '../src/lib/assistenciaTecnica.ts';
import { novaFichaEspecialidade } from '../src/lib/perfisAtendimento.ts';
import { ajustarQuantidade, quantidadeMinima } from '../src/lib/calculosAtendimento.ts';
import { gerarPdfAtendimento } from '../src/services/pdfAtendimento.ts';

test('Recepção recupera o defeito legado sem sobrescrever o preenchido ou apagado',()=>{
  const t={revisao:2,vencimento:'2026-10-15',dados:{solicitacao:'Defeito legado'}};
  assert.equal(fichaDoAtendimento(t,'assistencia_eletrodomesticos').campos.defeito,'Defeito legado');
  for(const id of ['assistencia_eletrodomesticos','assistencia_eletronica']){
    const f=novaFichaEspecialidade(id);
    assert.equal(fichaDoAtendimento({...t,ficha_especialidade:f},id).campos.defeito,'Defeito legado');
    assert.equal(f.campos.defeito,undefined);
    for(const texto of ['', 'Defeito atualizado']) assert.equal(fichaDoAtendimento({...t,ficha_especialidade:{...f,campos:{defeito:texto}}},id).campos.defeito,texto);
  }
});
test('Reabertura dos cinco perfis sai da retirada sem perder medições ou recebedor',()=>{
  for(const [id] of subsetoresDoRamo('assistencia_tecnica')){
    const f=novaFichaEspecialidade(id); f.etapa='Entregue'; f.campos={diagnostico:'Preservar',recebedor:'Cliente',medicoes_saida:'5 V'};
    const a={situacao:'em_execucao',dados:{},ficha_especialidade:f};
    const reaberta=fichaReaberta(a);
    assert.match(reaberta.etapa,/Reparo/); assert.equal(f.etapa,'Entregue'); assert.deepEqual(reaberta.campos,f.campos);
    assert.equal(resumoOperacao({...a,ficha_especialidade:reaberta},'2026-10-15',[]).retirada,false);
  }
});
test('Botões de quantidade respeitam inteiros, frações e limites sem inverter a operação',()=>{
  assert.equal(quantidadeMinima(' UN '),1); assert.equal(quantidadeMinima('h'),0.001);
  assert.equal(ajustarQuantidade(1,'un',-1),1); assert.equal(ajustarQuantidade(1,'un',1),2);
  assert.equal(ajustarQuantidade(0.5,'h',-1),0.001); assert.equal(ajustarQuantidade(1.5,'h',-1),0.5);
  assert.equal(ajustarQuantidade(0.001,'h',-1),0.001); assert.equal(ajustarQuantidade(1000000,'un',1),1000000);
});
test('Comprovante preserva orientações e identidade; dados internos só na ficha técnica',()=>{
  for(const id of ['assistencia_eletrodomesticos','assistencia_eletronica']){
    const f=novaFichaEspecialidade(id); f.campos={defeito:'Falha QA',diagnostico:'DIAGNOSTICO_PRIVADO',orientacoes:'Manter ventilacao livre',garantia_data:'2027-01-15',placa:'PCB-TESTE',revisao_placa:'REV B',resultado_teste:'Teste parcial',limitacoes_teste:'Sem equipamento original'};
    const d={atendimento:{id:'ordem-qa',numero:21,data_servico:'2026-10-15',titulo:'Reparo documentado',valor_centavos:27500,dados:{execucao:'Bomba substituida',observacoes_cliente:'Obs cliente preservada',diagnostico:'ANOTACAO_INTERNA_LEGADA',orientacoes:'Manter ventilacao livre'},ficha_especialidade:f},cliente:{nome:'Cliente ficticio QA'},objeto:{nome:'Equipamento QA',dados:{serie:'SERIE-QA',acessorios:'Cabo original'}},itens:[{descricao:'Peca QA',quantidade:1,unidade:'un',preco_centavos:9500},{descricao:'Mao de obra QA',quantidade:1,unidade:'un',preco_centavos:18000}],comercial:{desconto_centavos:0}};
    const empresa={nome:'Assistencia de testes',cor:'#226677',endereco:{logradouro:'Rua de testes, 123'},rodape:'Apresente este comprovante na retirada.',logo:'imagem-invalida',pix_qr:'imagem-invalida'};
    const cliente=gerarPdfAtendimento(d,empresa), texto=cliente.output();
    for(const trecho of ['Bomba substituida','Obs cliente preservada','Manter ventilacao livre','15/01/2027','Rua de testes','Apresente este comprovante','Teste parcial','Sem equipamento original']) assert.ok(texto.includes(trecho),trecho);
    assert.equal(texto.split('Manter ventilacao livre').length,2,'orientação idêntica não se duplica');
    assert.doesNotMatch(texto,/DIAGNOSTICO_PRIVADO|ANOTACAO_INTERNA_LEGADA/);
    const tecnica=gerarPdfAtendimento(d,empresa,'tecnica');
    assert.match(tecnica.output(),/DIAGNOSTICO_PRIVADO/);assert.match(tecnica.output(),/ANOTACAO_INTERNA_LEGADA/);
    const longo=gerarPdfAtendimento({...d,atendimento:{...d.atendimento,dados:{...d.atendimento.dados,observacoes_cliente:'Orientacao extensa de teste. '.repeat(200)}}},empresa);
    assert.ok(longo.getNumberOfPages()>1);
    if(process.env.PDF_QA_OUTPUT){mkdirSync(process.env.PDF_QA_OUTPUT,{recursive:true});for(const [nome,pdf] of [['cliente',cliente],['tecnica',tecnica],['longo',longo]]) writeFileSync(join(process.env.PDF_QA_OUTPUT,`${id}-${nome}.pdf`),Buffer.from(pdf.output('arraybuffer')));}
  }
});
