import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { novaFichaEspecialidade, perfilAtendimento, validarFichaEspecialidade } from '../src/lib/perfisAtendimento.ts';
import { concluirReparo, registrarRetirada, aguardaRetirada, validarEtapaReparo, etapasEmAndamento } from '../src/lib/assistenciaTecnica.ts';
import { gerarPdfAtendimento } from '../src/services/pdfAtendimento.ts';

const antigos=[...readFileSync('supabase/migrations/20261014000200_subsetores_servicos.sql','utf8').matchAll(/\$dados\$(.*?)\$dados\$/gs)].map(m=>JSON.parse(m[1])).find(p=>p.assistencia_celulares?.campos);
const server=await createServer({configFile:false,envDir:false,cacheDir:'output/.vite-digitais-tests',server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try {
  const {RecepcaoEspecializada}=await server.ssrLoadModule('/src/components/RecepcaoEspecializada.tsx');
  const {ResumoTecnicoReparo}=await server.ssrLoadModule('/src/components/ResumoTecnicoReparo.tsx');
  for (const id of ['assistencia_celulares','assistencia_informatica']) {
    const perfil=perfilAtendimento(id),campos=perfil.grupos.flatMap(g=>g.campos);
    assert.equal(new Set(campos.map(c=>c.id)).size,campos.length);
    for(const [nome,antigo] of Object.entries(antigos[id].campos)) {
      const atual=campos.find(c=>c.id===nome);assert.ok(atual,`Campo legado: ${nome}`);
      assert.equal(atual.tipo||'texto',antigo.tipo);
      for(const o of antigo.opcoes||[]) assert.ok(atual.opcoes.includes(o),`Opção legada: ${o}`);
    }
    assert.deepEqual(perfil.etapas,antigos[id].etapas);assert.deepEqual(perfil.checklist,antigos[id].checklist);
    const f=novaFichaEspecialidade(id);
    f.campos={identificacao:'IDENTIFICACAO-DA-FICHA',backup:'Não foi possível realizar',backup_escopo:'ESCOPO_INTERNO',autorizacao_dados:'Não autorizada',diagnostico:'DIAGNOSTICO_INTERNO',resultado_teste:'Teste parcial',limitacoes_teste:'Sem acesso acompanhado',testes:'Carga e funcionamento conferidos',orientacoes:'Retornar para conferência acompanhada',...(id==='assistencia_celulares'?{tipo_aparelho:'Tablet',imei_secundario:'SEGUNDO-IMEI-QA'}:{tipo_aparelho:'Notebook',criptografia:'Ativada — acesso indisponível'})};
    validarFichaEspecialidade(f);
    const recepcao=renderToStaticMarkup(h(RecepcaoEspecializada,{valor:f,alterar:()=>{}}));
    assert.match(recepcao,/Condição de funcionamento|Cópia dos dados|Autorização para restaurar/);
    if(id==='assistencia_informatica') assert.ok(!campos.some(c=>/IMEI/.test(c.nome)));
    const resumo=renderToStaticMarkup(h(ResumoTecnicoReparo,{ficha:f}));
    assert.match(resumo,/Teste parcial/);assert.match(resumo,/Não autorizada/);assert.doesNotMatch(resumo,/reparo-validado/);
    const a={id:'ordem-qa',numero:31,cliente_id:'cliente',objeto_id:'equipamento',titulo:'Reparo documentado',data_servico:'2026-10-16',vencimento:'2026-11-16',valor_centavos:27500,situacao:'em_execucao',revisao:1,dados:{execucao:'Serviço fictício concluído',observacoes_cliente:'Conferir junto ao técnico'},ficha_especialidade:f};
    const pronto=concluirReparo(a,id);assert.equal(pronto.ficha_especialidade.campos.autorizacao_dados,'Não autorizada');assert.equal(pronto.ficha_especialidade.campos.resultado_teste,'Teste parcial');assert.ok(aguardaRetirada(pronto));
    assert.ok(!etapasEmAndamento(id).includes('Entregue'));
    assert.ok(!etapasEmAndamento(id).includes('Pronto para retirada'));
    assert.throws(()=>validarEtapaReparo({...a,ficha_especialidade:{...f,etapa:'Entregue'}}),/Conclua/);
    assert.throws(()=>validarEtapaReparo({...pronto,ficha_especialidade:{...f,etapa:'Entregue'}}),/Informe quem/);
    validarEtapaReparo(pronto);validarEtapaReparo(registrarRetirada(pronto,'Cliente QA',id));
    assert.ok(!aguardaRetirada(registrarRetirada(pronto,'Cliente QA',id)));
    const d={atendimento:pronto,cliente:{nome:'Cliente fictício'},objeto:{nome:id==='assistencia_celulares'?'Tablet QA':'Notebook QA',dados:{}},itens:[],comercial:{desconto_centavos:0}};
    const identidade={nome:'Assistência digital QA',cor:'#245b69',rodape:'Documento fictício da bancada local'};
    const pdf=gerarPdfAtendimento(d,identidade),texto=pdf.output();
    assert.match(texto,/IDENTIFICACAO-DA-FICHA/);assert.match(texto,/Teste parcial/);assert.doesNotMatch(texto,/DIAGNOSTICO_INTERNO|ESCOPO_INTERNO/);
    const tecnica=gerarPdfAtendimento(d,identidade,'tecnica');assert.match(tecnica.output(),/DIAGNOSTICO_INTERNO/);
    if(process.env.PDF_QA_OUTPUT){mkdirSync(process.env.PDF_QA_OUTPUT,{recursive:true});for(const [nome,p] of [['cliente',pdf],['tecnica',tecnica]])writeFileSync(`${process.env.PDF_QA_OUTPUT}/${id}-${nome}.pdf`,Buffer.from(p.output('arraybuffer')));}
    console.log(`PASS ${id}: compatibilidade, recepção, dados, testes parciais, retirada e documentos`);
  }
} finally {await server.close();}
