import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { cssRenderizacaoTeste } from './css-renderizacao-teste.mjs';
import { novaFichaEspecialidade,perfilAtendimento,validarFichaEspecialidade } from '../src/lib/perfisAtendimento.ts';
import { validarLimpeza,fichaProximaLimpeza } from '../src/lib/limpeza.ts';
import { aceiteServicoPendente,validarAceiteServico,reabrirFichaServico } from '../src/lib/aceiteServico.ts';
import { indicadoresLimpeza } from '../src/lib/indicadoresLimpeza.ts';
import { gerarPdfAtendimento } from '../src/services/pdfAtendimento.ts';
const server=await createServer({configFile:false,plugins:[cssRenderizacaoTeste()],envDir:false,cacheDir:'output/.vite-limpeza-tests',server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try {
 const {ResumoLimpeza}=await server.ssrLoadModule('/src/components/ResumoLimpeza.tsx');
 const {AceiteServico}=await server.ssrLoadModule('/src/components/AceiteServico.tsx');
 const {RecepcaoEspecializada}=await server.ssrLoadModule('/src/components/RecepcaoEspecializada.tsx');
 for(const nome of ['residencial','comercial','pos_obra','estofados','vidros','geral']){
  const perfil='limpeza_'+nome,p=perfilAtendimento(perfil),campos=p.grupos.flatMap(g=>g.campos);
  assert.equal(new Set(campos.map(c=>c.id)).size,campos.length);assert.ok(p.recepcaoRapida.every(id=>campos.some(c=>c.id===id)));
  const ficha=novaFichaEspecialidade(perfil);ficha.campos={area:'120.5',frequencia:'Semanal',fornecimento:'Prestador',endereco_visita:'Rua da visita, 14',exclusoes:'Fora do escopo QA',produtos:'PRODUTO_INTERNO',danos_anteriores:'DANO_INTERNO',restricoes_uso:'Cuidado de uso QA',liberacao_uso:'Aguardando secagem',resultado_vistoria:'Com pendências',pendencias_finais:'Canto do corredor',situacao_aceite:'Aceito com ressalvas',aceite:'Cliente QA',data_aceite:'2026-10-19',ressalvas_aceite:'Pendência QA',...(nome==='estofados'?{secagem_horas:'12',condicoes_secagem:'Conforme ventilação',resultado_manchas:'Marca anterior permanece'}:{})};
  validarFichaEspecialidade(ficha);
  const a={id:'qa',numero:12,cliente_id:'exemplo-0',objeto_id:'objeto',titulo:'Limpeza '+nome,data_servico:'2026-10-19',vencimento:'2026-10-19',valor_centavos:15000,situacao:'concluido',revisao:1,dados:{solicitacao:'Escopo QA',observacoes_cliente:'Observação QA'},ficha_especialidade:ficha};
  validarLimpeza(a);validarAceiteServico(a);assert.ok(!aceiteServicoPendente(a));
  assert.throws(()=>validarAceiteServico({...a,situacao:'em_execucao'}),/Conclua/);
  assert.throws(()=>validarLimpeza({...a,ficha_especialidade:{...ficha,campos:{...ficha.campos,pessoas_previstas:'1.5'}}}),/inteira/);
  const reaberta=reabrirFichaServico(a);validarFichaEspecialidade(reaberta);assert.equal(reaberta.campos.situacao_aceite,'Pendente');assert.equal(reaberta.campos.liberacao_uso,'Não liberado');assert.equal(reaberta.campos.resultado_vistoria,'');
  const nova=fichaProximaLimpeza(a);validarFichaEspecialidade(nova);assert.equal(nova.campos.endereco_visita,ficha.campos.endereco_visita);assert.equal(nova.campos.produtos,undefined);assert.equal(nova.campos.aceite,undefined);assert.equal(nova.campos.danos_anteriores,undefined);assert.deepEqual(nova.checklist,{});
  const objeto={id:'objeto',nome:'Local QA',dados:{endereco:'ENDERECO_DESATUALIZADO',acesso:'ACESSO_INTERNO'}};
  const html=renderToStaticMarkup(h(ResumoLimpeza,{atendimento:a,objeto}));assert.match(html,/Rua da visita/);assert.doesNotMatch(html,/ENDERECO_DESATUALIZADO|PRODUTO_INTERNO|reparo-validado/);
  const recepcao=renderToStaticMarkup(h(RecepcaoEspecializada,{valor:ficha,alterar:()=>{}}));assert.match(recepcao,/Planejamento da visita/);if(nome==='estofados')assert.match(recepcao,/step="1"/);
  assert.match(renderToStaticMarkup(h(AceiteServico,{atendimento:a,ocupado:false,salvar:async()=>{}})),/Cliente QA/);
  const dados={atendimento:a,cliente:{nome:'Cliente fictício',telefone:'(11) 99999-9999'},objeto,itens:[{id:'item',tipo:'servico',origem:'externa',descricao:'Limpeza contratada',quantidade:1,unidade:'un',preco_centavos:15000}],comercial:{},equipe:[],horas:[{inicio:'2026-10-19T12:00:00Z',fim:'2026-10-19T14:00:00Z'}],qualidade:[],eventos:[]};
  assert.equal(indicadoresLimpeza([dados]).produtividade,60.25);assert.equal(indicadoresLimpeza([dados,{...dados,horas:[]}]).produtividade,60.25);assert.equal(indicadoresLimpeza([{...dados,horas:[]}]).produtividade,null);
  for(const modo of ['atendimento','orcamento','tecnica']){
   const pdf=gerarPdfAtendimento(dados,{nome:'Limpeza QA · '+nome,cor:'#245b69',especialidade:perfil},modo),txt=pdf.internal.pages.flat().join('\n');
   assert.match(txt,/Rua da visita/);if(modo!=='tecnica')assert.doesNotMatch(txt,/ENDERECO_DESATUALIZADO|ACESSO_INTERNO|DANO_INTERNO|PRODUTO_INTERNO/);
   if(modo==='orcamento')assert.doesNotMatch(txt,/Conferido por|Pendência QA/);if(modo==='atendimento')assert.match(txt,/Cliente QA/);
   if(process.env.PDF_QA_OUTPUT){mkdirSync(process.env.PDF_QA_OUTPUT,{recursive:true});writeFileSync(`${process.env.PDF_QA_OUTPUT}/${nome}-${modo}.pdf`,Buffer.from(pdf.output('arraybuffer')));}
  }
  console.log(`PASS ${nome}: campos, recepção, vistoria, aceite, recorrência, indicadores e privacidade dos três documentos`);
 }
 const memoria=new Map();globalThis.localStorage={getItem:k=>memoria.get(k)||null,setItem:(k,v)=>memoria.set(k,v),removeItem:k=>memoria.delete(k)};
 const {programarVisitasLimpezaDemo}=await server.ssrLoadModule('/src/services/visitasLimpeza.ts');
 const a={id:'modelo',numero:1,cliente_id:'exemplo-0',objeto_id:'objeto',titulo:'Limpeza',situacao:'concluido',valor_centavos:10000,revisao:2,data_servico:'2026-10-19',vencimento:'2026-10-19',dados:{execucao:'NAO_COPIAR'},ficha_especialidade:{...novaFichaEspecialidade('limpeza_geral'),campos:{area:'100',situacao_aceite:'Aceito',aceite:'Cliente',data_aceite:'2026-10-19'}}};
 const painel={atendimentos:[a],objetos:[{id:'objeto',cliente_id:'exemplo-0',nome:'Local QA',dados:{}}],recursos:[{id:'equipe',nome:'Equipe QA',ativo:true}],agenda:[],cobrancas:[]};
 localStorage.setItem('patio_servicos:qa-limpeza',JSON.stringify(painel));
 const args={p_chave:'serie',p_revisao:2,p_quantidade:3,p_intervalo:7,p_dados:{atendimento_id:'modelo',recurso_id:'equipe',inicio:'2026-11-01T09:00:00-03:00',fim:'2026-11-01T11:00:00-03:00',situacao:'agendado',nova_situacao:'orcamento'}};
 const ids=await programarVisitasLimpezaDemo('qa-limpeza',args);assert.equal(ids.length,3);assert.deepEqual(await programarVisitasLimpezaDemo('qa-limpeza',args),ids);
 const antes=localStorage.getItem('patio_servicos:qa-limpeza');await assert.rejects(()=>programarVisitasLimpezaDemo('qa-limpeza',{...args,p_chave:'conflito',p_quantidade:2,p_dados:{...args.p_dados,inicio:'2026-10-25T09:00:00-03:00',fim:'2026-10-25T11:00:00-03:00'}}),/horário/);assert.equal(localStorage.getItem('patio_servicos:qa-limpeza'),antes);
 const p=JSON.parse(antes);assert.equal(p.atendimentos.length,4);assert.equal(p.atendimentos[1].dados.execucao,undefined);assert.equal(p.atendimentos[1].ficha_especialidade.campos.aceite,undefined);assert.equal(p.atendimentos[0].situacao,'concluido');
 console.log('PASS demonstração: visitas independentes, repetição idempotente e reversão atômica de conflito');
} finally {await server.close();}
