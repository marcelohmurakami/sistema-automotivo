import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {especialidades} from '../src/lib/especialidades.ts';
import {novoDocumentoOffline,validarDocumentoOffline,documentoParaImprimirOffline,totaisDocumentoOffline} from '../src/lib/documentoOffline.ts';
import {novoRascunhoOffline,guardarRascunhoOffline,rascunhosDoUsuario,excluirRascunhoOffline} from '../src/lib/atendimentoOffline.ts';
import {alternarTipoDesconto} from '../src/lib/desconto.ts';
for(const [perfil,e] of Object.entries(especialidades)){
 const base={id:perfil,usuario:'qa',oficina:perfil,nome:'Empresa QA',especialidade:perfil,ramo:e.ramo,atualizado:Date.now(),aux:{clientes:[],veiculos:[],vinculos:[],catalogo:[]}};
 for(const tipo of ['os','orcamento']){
  const d=novoDocumentoOffline(base,tipo);d.cliente.nome='Cliente QA';d.bem.nome='Identificação QA';d.itens=[{id:crypto.randomUUID(),tipo:'service',descricao:'Serviço QA',quantidade:3,unidade:'serv',preco_unitario_centavos:3333,situacao:'pending'}];d.desconto={tipo:'percentual',valor:12.5};
  assert.deepEqual(validarDocumentoOffline(d),{subtotal:9999,desconto:1250,total:8749});
  const r={...novoRascunhoOffline('qa',perfil),documento:d};await guardarRascunhoOffline(r);
  assert.equal(documentoParaImprimirOffline(r,base).total,tipo==='os'?9999:8749);
  r.documento.mostrar_desconto_nota=true;assert.equal(documentoParaImprimirOffline(r,base).total,8749);
  const moeda={tipo:'valor',valor:3.33};d.desconto=alternarTipoDesconto(moeda,'percentual',9999);assert.equal(totaisDocumentoOffline(d).desconto,333);
  for(const invalido of [{...d,data:'2026-02-30'},{...d,desconto:{tipo:'percentual',valor:101}},{...d,itens:[{...d.itens[0],quantidade:1.001}]},{...d,itens:[{...d.itens[0],preco_unitario_centavos:-1}]}])assert.throws(()=>validarDocumentoOffline(invalido));
  await guardarRascunhoOffline(r);const velha=structuredClone(r);r.documento.observacoes='Alteração preservada';await guardarRascunhoOffline(r);await assert.rejects(()=>guardarRascunhoOffline(velha),/outra aba/);
  r.pedido_documento=structuredClone(r.documento);r.pronto_envio=true;await guardarRascunhoOffline(r);
  const editar=structuredClone(r);editar.documento.observacoes='Não pode sobrescrever envio incerto';await assert.rejects(()=>guardarRascunhoOffline(editar),/outra aba/);await assert.rejects(()=>excluirRascunhoOffline('qa',perfil,r.id),/Confirme o envio/);
  assert.equal((await rascunhosDoUsuario('qa',perfil)).find(v=>v.id===r.id).documento.observacoes,'Alteração preservada');
  r.recibo={id:crypto.randomUUID(),numero:1,tipo,ramo:e.ramo,cliente_id:crypto.randomUUID(),objeto_id:crypto.randomUUID(),total_centavos:9666};r.situacao='sincronizado';await guardarRascunhoOffline(r);
  await assert.rejects(()=>guardarRascunhoOffline({...r,recibo:undefined}),/outra aba/);await excluirRascunhoOffline('qa',perfil,r.id);
 }
 console.log('PASS documentos offline',perfil);
}
