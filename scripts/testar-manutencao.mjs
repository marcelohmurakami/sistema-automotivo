import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { novaFichaEspecialidade, perfilAtendimento, validarFichaEspecialidade } from '../src/lib/perfisAtendimento.ts';
import { validarAceiteManutencao, aceiteManutencaoPendente, reabrirFichaManutencao } from '../src/lib/manutencao.ts';
import { gerarPdfAtendimento } from '../src/services/pdfAtendimento.ts';
import { menuAssistencia } from '../src/lib/navegacaoAssistencia.ts';
import { situacaoOperacional, destaquesAtendimento } from '../src/lib/operacaoServicos.ts';
const anteriores=[...readFileSync('supabase/migrations/20261014000200_subsetores_servicos.sql','utf8').matchAll(/\$dados\$(.*?)\$dados\$/gs)].map(m=>JSON.parse(m[1])).find(p=>p.manutencao_climatizacao?.campos);
const server=await createServer({configFile:false,envDir:false,cacheDir:'output/.vite-manutencao-tests',server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try {
 const {RecepcaoEspecializada}=await server.ssrLoadModule('/src/components/RecepcaoEspecializada.tsx');
 const {ResumoManutencao}=await server.ssrLoadModule('/src/components/ResumoManutencao.tsx');
 const {AceiteManutencao}=await server.ssrLoadModule('/src/components/AceiteManutencao.tsx');
 for(const nome of ['climatizacao','eletrica','hidraulica','equipamentos','geral']) {
  const id='manutencao_'+nome,p=perfilAtendimento(id),campos=p.grupos.flatMap(g=>g.campos);
  assert.equal(new Set(campos.map(c=>c.id)).size,campos.length);
  if(anteriores[id]) {for(const [key,c] of Object.entries(anteriores[id].campos)){const atual=campos.find(x=>x.id===key);assert.ok(atual,key);assert.equal(atual.tipo||'texto',c.tipo);for(const op of c.opcoes||[])assert.ok(atual.opcoes.includes(op));}assert.deepEqual(p.etapas,anteriores[id].etapas);assert.deepEqual(p.checklist,anteriores[id].checklist);}
  const ficha=novaFichaEspecialidade(id);ficha.campos={natureza:'Corretiva',ambiente:'Residencial',ativo:'ATIVO-QA-01',endereco_visita:'Rua Fictícia, 123 · unidade 4',solicitacao:'Falha relatada pelo cliente',medicoes_entrada:'REGISTRO_INTERNO',medicoes_saida:'Condição final registrada',resultado_teste:'Teste parcial',limitacoes_teste:'Sem ensaio com carga',condicao_uso:'Não liberado',restricoes_uso:'Aguardar avaliação complementar',proxima_data:'2026-11-19',deslocamento:'35',...(nome==='equipamentos'?{horimetro:'1250.5',proximo_horimetro:'1500'}:{})};validarFichaEspecialidade(ficha);
  assert.throws(()=>validarFichaEspecialidade({...ficha,campos:{...ficha.campos,proxima_data:'2026-02-30'}}),/data válida/);
  const a={id:'qa',numero:12,cliente_id:'cliente',objeto_id:'objeto',titulo:'Manutenção '+nome,data_servico:'2026-10-19',vencimento:'2026-11-19',valor_centavos:32250,situacao:'em_execucao',revisao:1,dados:{observacoes_cliente:'Serviço conforme escopo aprovado'},ficha_especialidade:ficha};
  const pronto={...a,situacao:'concluido'};assert.ok(aceiteManutencaoPendente(pronto));assert.ok(situacaoOperacional(pronto,'2026-10-19').aceite);assert.ok(!situacaoOperacional(pronto,'2026-10-19').retirada);
  assert.ok(!aceiteManutencaoPendente(a));assert.ok(!aceiteManutencaoPendente({...pronto,situacao:'cancelado'}));
  const aceito={...pronto,ficha_especialidade:{...ficha,campos:{...ficha.campos,situacao_aceite:'Aceito com ressalvas',aceite:'Ana QA',data_aceite:'2026-10-19',ressalvas_aceite:'Aguardar ensaio complementar'}}};
  validarAceiteManutencao(aceito);assert.ok(!aceiteManutencaoPendente(aceito));assert.throws(()=>validarAceiteManutencao({...aceito,situacao:'em_execucao'}),/Conclua/);
  const reaberta=reabrirFichaManutencao(aceito);assert.equal(reaberta.campos.situacao_aceite,'Pendente');assert.equal(reaberta.campos.condicao_uso,'Não avaliado');assert.equal(reaberta.campos.medicoes_entrada,'REGISTRO_INTERNO');
  const objeto={nome:'Instalação residencial QA',dados:{endereco:'Endereço do cadastro',acesso:'ACESSO_INTERNO'}};
  const html=renderToStaticMarkup(h(ResumoManutencao,{atendimento:pronto,objeto}));assert.match(html,/Rua Fictícia|Teste parcial|Não liberado/);assert.doesNotMatch(html,/reparo-validado/);
  assert.match(renderToStaticMarkup(h(RecepcaoEspecializada,{valor:ficha,alterar:()=>{}})),/Planejamento da visita/);
  assert.equal(renderToStaticMarkup(h(AceiteManutencao,{atendimento:a,ocupado:false,salvar:async()=>{}})),'');
  assert.match(renderToStaticMarkup(h(AceiteManutencao,{atendimento:pronto,ocupado:false,salvar:async()=>{}})),/Pendente/);
  assert.equal(new Set(destaquesAtendimento(pronto).map(c=>c.id)).size,destaquesAtendimento(pronto).length);
  const dados={atendimento:aceito,cliente:{nome:'Cliente de teste',telefone:'(11) 99999-9999'},objeto,itens:[{descricao:'Mão de obra',quantidade:1,unidade:'un',preco_centavos:18000},{descricao:'Material fracionado',quantidade:1.5,unidade:'m',preco_centavos:9500}],comercial:{desconto_centavos:0}};
  for(const modo of ['atendimento','tecnica']) {
   const pdf=gerarPdfAtendimento(dados,{nome:'Manutenção QA · '+nome,cor:'#245b69',especialidade:id},modo),conteudo=pdf.output();
   assert.match(conteudo,/Rua Fict/);assert.match(conteudo,/Teste parcial/);
   if(modo==='atendimento')assert.doesNotMatch(conteudo,/REGISTRO_INTERNO|ACESSO_INTERNO/);else {assert.match(conteudo,/REGISTRO_INTERNO/);assert.match(conteudo,/35 min/);}
   if(process.env.PDF_QA_OUTPUT){mkdirSync(process.env.PDF_QA_OUTPUT,{recursive:true});writeFileSync(`${process.env.PDF_QA_OUTPUT}/${nome}-${modo}.pdf`,Buffer.from(pdf.output('arraybuffer')));}
  }
  console.log(`PASS ${nome}: contrato legado, recepção, resumo, pendências, aceite, reabertura, datas, documentos e privacidade`);
 }
 const menu=menuAssistencia(()=>true,'owner','',true);assert.equal(menu.find(x=>x.rota==='/atendimentos').nome,'Ordens de serviço');assert.equal(menu.find(x=>x.rota==='/objetos').nome,'Locais e equipamentos');
 const memoria=new Map();globalThis.localStorage={getItem:k=>memoria.get(k)||null,setItem:(k,v)=>memoria.set(k,v),removeItem:k=>memoria.delete(k)};
 const demo={id:'demo-manutencao',cliente_id:'exemplo-0',objeto_id:'local',titulo:'Reabertura sem mudança de etapa',situacao:'concluido',revisao:1,valor_centavos:10000,data_servico:'2026-10-19',vencimento:'2026-10-19',dados:{},ficha_especialidade:{...novaFichaEspecialidade('manutencao_geral'),etapa:'Execução',campos:{situacao_aceite:'Aceito',aceite:'Ana QA',data_aceite:'2026-10-19',condicao_uso:'Liberado para uso'}}};
 localStorage.setItem('patio_servicos:qa-manutencao',JSON.stringify({atendimentos:[demo],objetos:[],recursos:[],agenda:[],cobrancas:[]}));
 const {operarAtendimento}=await server.ssrLoadModule('/src/services/servicosCompletos.ts');
 await operarAtendimento(true,'qa-manutencao','reabrir_atendimento_servico',{p_atendimento:demo.id,p_revisao:1,p_motivo:'Conferência adicional'});
 const reaberto=JSON.parse(localStorage.getItem('patio_servicos:qa-manutencao')).atendimentos[0];
 assert.equal(reaberto.ficha_especialidade.campos.situacao_aceite,'Pendente');assert.equal(reaberto.ficha_especialidade.etapa,'Execução');
 assert.ok(JSON.parse(localStorage.getItem('patio_detalhes_servicos:qa-manutencao'))[demo.id].eventos.some(e=>e.tipo==='aceite' && e.antes.includes('Ana QA')));
 assert.ok(!menuAssistencia(()=>true,'staff','',true).some(x=>x.rota==='/financeiro'));assert.equal(menuAssistencia(()=>false,'owner','',true).length,0);assert.equal(menuAssistencia(()=>true,'owner','materiais',true).length,2);
} finally {await server.close();}
