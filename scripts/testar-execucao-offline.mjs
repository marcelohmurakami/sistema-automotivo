import assert from'node:assert/strict';import'fake-indexeddb/auto';import{tratarFalhaExecucao,novaExecucao,guardarExecucao,execucoesLocais,excluirExecucao,compararExecucao,limparExecucoesUsuario}from'../src/lib/execucaoOffline.ts';
const base={id:'visita',agenda_id:'visita',documento_id:'os',automotivo:false,agenda_revisao:1,documento_revisao:1,cliente:'Cliente QA',objeto:'Equipamento',titulo:'Preventiva',numero:'1',inicio:null,fim:null,endereco:'',situacao:'em_execucao',agenda_situacao:'agendado',ficha:{versao:1,especialidade:'manutencao_geral',campos:{escopo:'Inicial',acesso:'Livre'},checklist:{Conferido:false},etapa:'Execução'},especialidade:'manutencao_geral',itens:[]};
const r=novaExecucao('usuario','empresa','Empresa QA',base);await guardarExecucao(r);assert.equal((await execucoesLocais('usuario')).length,1);assert.equal((await execucoesLocais('outro')).length,0);
const copia=structuredClone(r);r.dados.anotacoes='Executado sem rede';r.pendente=true;await guardarExecucao(r);await assert.rejects(()=>guardarExecucao(copia),/outra aba/);assert.equal((await execucoesLocais('usuario'))[0].dados.anotacoes,'Executado sem rede');
await assert.rejects(()=>guardarExecucao({...r,usuario:'outro'}),/outra aba/);await assert.rejects(()=>excluirExecucao('outro',r.id),/indisponível/);
const remoto=structuredClone(base);r.dados.ficha.campos.escopo='Executado';remoto.ficha.campos.acesso='Portão B';let merge=compararExecucao(r,remoto);assert.equal(merge.conflitos.length,0);assert.equal(merge.dados.ficha.campos.escopo,'Executado');assert.equal(merge.dados.ficha.campos.acesso,'Portão B');
remoto.ficha.campos.escopo='Alterado na empresa';merge=compararExecucao(r,remoto);assert.equal(merge.conflitos.length,1);merge=compararExecucao(r,remoto,{'campos.escopo':'remoto'});assert.equal(merge.conflitos.length,0);assert.equal(merge.dados.ficha.campos.escopo,'Alterado na empresa');
await assert.rejects(()=>guardarExecucao({...r,fotos:[{imagem:'https://externo/foto'}]}),/fotos/);await limparExecucoesUsuario('usuario');assert.equal((await execucoesLocais('usuario')).length,0);
console.log('PASS: persistência offline, concorrência de abas, isolamento, conflito de campos, fotos e logout');

const tentativa=novaExecucao('usuario','empresa','Empresa QA',base);tentativa.dados.anotacoes='Não perder';tentativa.pendente=true;tentativa.pedido={base:structuredClone(base),dados:structuredClone(tentativa.dados)};const pedido=tentativa.pedido;
tratarFalhaExecucao(tentativa,null);assert.equal(tentativa.pedido,pedido);assert.equal(tentativa.conflito,false);
tratarFalhaExecucao(tentativa,'PT409');assert.equal(tentativa.pedido,pedido);assert.equal(tentativa.conflito,true);
tratarFalhaExecucao(tentativa,'22023');assert.equal(tentativa.pedido,undefined);assert.equal(tentativa.dados.anotacoes,'Não perder');assert(tentativa.pendente);
tentativa.pedido=pedido;tentativa.resposta=structuredClone(base);tratarFalhaExecucao(tentativa,'22023');assert.equal(tentativa.pedido,pedido);assert(tentativa.resposta);
console.log('PASS: erro de validação permite corrigir; timeout e envio parcial preservam pedido idempotente');
