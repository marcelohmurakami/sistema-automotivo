// Grava somente nas 26 empresas fictícias; nunca usa chave administrativa.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';

const root = resolve('output/auditoria-garantias-20261110');
await mkdir(root, { recursive: true });
const base = process.env.QA_BASE || 'https://patio-gestao-peach.vercel.app';
const hoje = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date());
const inicio = hoje.slice(0,7)+'-01';
const contas = JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas;
const fontes = JSON.parse(await readFile('output/links-todos-subsetores-20261026/cenarios.local.json','utf8')).casos;
const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados = [], falhas = [];
const moeda = v => (v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace(/\s/g,'');
const json = async (nome, valor) => writeFile(resolve(root,nome+'.json'),JSON.stringify(valor,null,2));
const subsetores = process.env.QA_PERFIS?.split(',');

try { for (const c of contas.filter(c=>!subsetores || subsetores.includes(c.especialidade))) {
  assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
  const perfil=c.especialidade, auto=c.ramo==='automotivo';
  const ctx=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',viewport:{width:390,height:844}});
  const page=await ctx.newPage(); page.setDefaultTimeout(25000);page.setDefaultNavigationTimeout(45000);
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  let acesso;
  page.on('request',r=>{if(r.url().includes('/rest/v1/rpc/') && r.headers().authorization) acesso={url:r.url().split('/rpc/')[0],headers:r.headers()};});
  const rpc=async(nome,args)=>{
    assert(acesso,'Sessão autenticada não capturada');
    const r=await ctx.request.post(acesso.url+'/rpc/'+nome,{headers:{apikey:acesso.headers.apikey,authorization:acesso.headers.authorization},data:{p_oficina:c.empresa_id,...args}});
    const d=await r.json();assert(r.ok(),nome+': '+JSON.stringify(d));return d;
  };
  const layout=async(nome)=>{
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Página excede largura: '+nome);
    for(const d of await page.locator('dialog[open]').all())assert(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Janela excede largura: '+nome);
    await page.screenshot({path:resolve(root,perfil+'-'+nome+'.png'),fullPage:true});
  };
  const guardar=async(d,nome='Salvar ocorrência')=>{
    const res=page.waitForResponse(r=>r.url().endsWith('/rpc/'+(auto?'salvar_ocorrencia_qualidade':'salvar_qualidade_atendimento')));
    await d.getByRole('button',{name:nome,exact:true}).click();const r=await res;assert(r.ok(),await r.text());await d.waitFor({state:'hidden'});
  };
  const abrirSecao=async(d,rotulo)=>{const det=d.locator('details').filter({hasText:rotulo});if(await det.getAttribute('open')===null)await det.locator('summary').click();};
  try {
    await page.goto(base+'/garantias');await page.getByLabel('E-mail',{exact:true}).fill(c.email);await page.getByLabel('Senha',{exact:true}).fill(c.senha);await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await page.locator('.qserv-resumo').waitFor();
    const relatorioNome=auto?'consultar_relatorios_gestao':'consultar_relatorios_servicos';
    const periodo={p_inicio:inicio,p_fim:hoje};
    if(auto && !process.argv.includes('--probe')) {
      let s;try{s=JSON.parse(await readFile(resolve(root,perfil+'-os.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;s={chave:randomUUID(),empresa:c.empresa_id};await json(perfil+'-os',s);}
      assert.equal(s.empresa,c.empresa_id);
      const fonte=fontes.find(f=>f.especialidade===perfil && f.tipo==='total');assert.equal(fonte.empresa_id,c.empresa_id);
      if(!s.veiculo){s.veiculo=await rpc('cadastrar_veiculo_orcamento',{p_cliente:fonte.cliente_id,p_modelo:'QA garantia E2E '+perfil,p_placa:''});await json(perfil+'-os',s);}
      let o=await rpc('criar_os_pronta',{p_chave:s.chave,p_dados:{cliente_id:fonte.cliente_id,veiculo_id:s.veiculo,data_servico:hoje,recebido_em:new Date(Date.now()-3600000).toISOString(),observacoes_internas:'QA garantia E2E 10/11. Somente teste fictício, não cobrar nem contatar.',itens:[{id:s.chave,tipo:'service',unidade:'un',descricao:'QA serviço para conferência de garantia',quantidade:1,preco_unitario_centavos:50000,situacao:'done'}],desconto_centavos:0}});
      if(o.situacao!=='delivered') {await rpc('atualizar_mapa_ordem_servico',{p_ordem_servico:o.id,p_revisao_esperada:o.revisao,p_situacao:'delivered',p_etapa:o.etapa_id,p_local:o.local_id,p_entrega_prevista_em:o.entrega_prevista_em,p_recebido_em:o.recebido_em});o=await rpc('consultar_ordem_servico',{p_os:o.id});}
      assert.equal(o.situacao,'delivered');s.id=o.id;s.numero=o.numero;await json(perfil+'-os',s);
    }
    const r=await rpc(relatorioNome,periodo);
    const docs=auto?r.ordens:r.detalhes.map(d=>({...d.atendimento,cliente:d.cliente.nome}));
    const seed=auto && !process.argv.includes('--probe')?JSON.parse(await readFile(resolve(root,perfil+'-os.json'),'utf8')):null;
    const doc=docs.find(d=>r.custeios?.[d.id] && /QA|Teste|fictício/i.test(d.cliente) && (auto?d.situacao==='delivered'&&(!seed||d.id===seed.id):d.situacao==='concluido'));
    if(process.argv.includes('--probe')){console.log(JSON.stringify({perfil,documentos:docs.length,custeios:Object.keys(r.custeios||{}).length,selecionado:doc&&{id:doc.id,numero:doc.numero,cliente:doc.cliente}}));await json(perfil+'-sonda',r);continue;}
    assert(doc,'Nenhuma OS fictícia concluída no período: '+perfil);
    const snap=async()=>{
      const [lucro,fin,rel,apuracao]=await Promise.all([
        rpc('consultar_lucro_documento',{p_documento:doc.id}),
        rpc('consultar_financeiro',{...periodo,p_filtro:'todos'}),
        rpc(relatorioNome,periodo),rpc('consultar_apuracao_completa',periodo)]);
      return {lucro,financeiro:{resumo:fin.resumo,contas:fin.contas},relatorio:rel,apuracao};
    };
    let estado;try{estado=JSON.parse(await readFile(resolve(root,perfil+'-estado.json'),'utf8'));assert.equal(estado.empresa,c.empresa_id);assert.equal(estado.documento,doc.id);}catch(e){if(e.code!=='ENOENT')throw e;estado={empresa:c.empresa_id,documento:doc.id,numero:doc.numero,antes:await snap(),ocorrencias:[]};await json(perfil+'-estado',estado);}
    for(const [idx,tipo] of ['garantia','retrabalho'].entries()){
      const motivo=`QA garantia E2E 10/11 • ${perfil} • ${tipo}`;
      const valor=tipo==='garantia'?11345:2467;
      await page.getByLabel('Buscar ocorrência').fill(motivo);
      let linha=page.locator('.qserv-linha').filter({hasText:motivo});
      if(!await linha.count()){
        await page.getByRole('button',{name:'Registrar ocorrência',exact:true}).click();
        const d=page.getByRole('dialog',{name:'Registrar ocorrência',exact:true});
        const rotulo=auto?'OS original':'Ordem de serviço';
        await d.getByRole('combobox',{name:rotulo,exact:true}).fill(String(doc.numero));
        await d.getByRole('listbox',{name:rotulo,exact:true}).getByRole('option',{name:new RegExp('^OS #'+doc.numero+' ·')}).click();
        await d.getByLabel('Problema / motivo').fill(motivo);await d.getByRole('combobox',{name:/^Tipo/}).selectOption(tipo);
        if(auto){
          await abrirSecao(d,'Horas e custos');
          for(const [label,v] of (idx===0?[['Horas de retrabalho','1.5'],['Custo por hora (R$)','42.50'],['Peças (R$)','38.90'],['Outros custos (R$)','12.30'],['Reembolso ao cliente (R$)','5.65'],['Recuperado do fornecedor/cliente (R$)','7.15']]:[['Horas de retrabalho','0.75'],['Outros custos (R$)','24.67']]))await d.getByLabel(label,{exact:true}).fill(v);
          await d.getByLabel('Conferi todos os custos',{exact:false}).check();
        }else{
          await abrirSecao(d,'Custos, tempo');await d.getByLabel('Custo do retorno (R$)',{exact:true}).fill((valor/100).toFixed(2));await d.getByLabel('Tempo de retrabalho (minutos)').fill(idx===0?'90':'45');
        }
        await layout(tipo+'-cadastro-mobile');await guardar(d);
      }
      await linha.waitFor();assert((await linha.innerText()).replace(/\s/g,'').includes(moeda(valor)),'Custo na lista');
      await linha.click();const d=page.getByRole('dialog',{name:'Atualizar ocorrência',exact:true});await d.getByLabel('Problema / motivo').waitFor();
      await abrirSecao(d,'Solução e encerramento');
      if(auto){await d.getByRole('combobox',{name:/^Situação/}).selectOption('resolvida');await d.getByLabel(/^Solução/).fill('Serviço refeito e testado. Custo conferido no teste fictício ponta a ponta.');}
      else{await d.getByLabel('Solução e providências').fill('Serviço refeito e testado. Custo conferido no teste fictício ponta a ponta.');await d.getByLabel(/^Resolvido em/).fill(hoje);}
      await guardar(d);assert.match(await linha.innerText(),/Resolvida/);
      const leitura=auto?(await rpc('consultar_qualidade',periodo)).ocorrencias:(await rpc(relatorioNome,periodo)).qualidade;
      const ocorr=leitura.filter(q=>(auto?q.descricao:q.motivo)===motivo);assert.equal(ocorr.length,1,'Uma ocorrência, sem duplicação');
      assert.equal(auto?ocorr[0].custo_total_centavos:ocorr[0].custo_centavos,valor);
      assert(ocorr[0].resolvido_em);estado.ocorrencias[idx]={id:ocorr[0].id,tipo,valor};await json(perfil+'-estado',estado);
    }
    estado.depois=await snap();const delta=11345+2467;
    assert.equal(estado.depois.lucro.custo-estado.antes.lucro.custo,delta,'Custo completo da OS');
    assert.equal(estado.antes.lucro.margem-estado.depois.lucro.margem,delta,'Margem da OS');
    assert.equal(estado.depois.relatorio.custeios[doc.id].custo-estado.antes.relatorio.custeios[doc.id].custo,delta,'Custo no relatório');
    if(!estado.vinculos?.length)assert.deepEqual(estado.depois.financeiro,estado.antes.financeiro,'Ocorrência não simula pagamento ou cria contas');
    for(const o of estado.ocorrencias)if(!estado.vinculos?.some(v=>v.ocorrencia===o.id))assert.equal(estado.depois.lucro.fontes.find(f=>f.chave==='garantia:'+o.id)?.valor,o.valor,'Fonte única de custo');
    await json(perfil+'-estado',estado);
    // Persistência após recarregar e apresentação nos relatórios, no financeiro e na OS.
    await page.reload();await page.locator('.qserv-resumo').waitFor();await page.getByLabel('Buscar ocorrência').fill(`QA garantia E2E 10/11 • ${perfil}`);assert.equal(await page.locator('.qserv-linha').count(),2);await layout('resolvidas-mobile');
    for(const width of [320,1920]){await page.setViewportSize({width,height:width===320?740:1080});await layout('resolvidas-'+width);}
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/relatorios?aba=qualidade&inicio='+inicio+'&fim='+hoje);const nomeCusto=auto?'Custo do retrabalho / retornos':'Custo das ocorrências';await page.getByText(nomeCusto,{exact:true}).first().waitFor();
    const rel=estado.depois.relatorio,osIds=new Set((rel.ordens||[]).map(o=>o.id));
    const ocorrenciasPeriodo=auto?rel.qualidade.filter(q=>q.situacao!=='cancelada'&&osIds.has(q.ordem_original_id)&&q.aberto_em.slice(0,10)>=inicio&&q.aberto_em.slice(0,10)<=hoje):rel.qualidade;
    const totalPeriodo=ocorrenciasPeriodo.reduce((n,q)=>n+(auto?Math.round(q.horas_retrabalho*q.custo_hora_centavos)+q.custo_pecas_centavos+q.outros_custos_centavos+q.reembolso_centavos-q.recuperado_centavos:q.custo_centavos),0);
    const indicador=page.locator(auto?'.gestao-cards article':'.rs-indicador').filter({has:page.getByText(nomeCusto,{exact:true})});
    assert.equal((await indicador.locator('strong').innerText()).replace(/\s/g,''),moeda(totalPeriodo),'Indicador visível corresponde à soma das ocorrências');estado.totalRelatorioConferido=totalPeriodo;
    await layout('relatorios-mobile');
    await page.goto(base+'/financeiro?aba=custos&inicio='+inicio+'&fim='+hoje);await page.getByLabel('Buscar serviço ou cliente').fill(doc.cliente);const l=page.locator('.custo-linha').filter({hasText:new RegExp('OS #'+doc.numero+'(?:\\D|$)')});await l.waitFor();await layout('financeiro-mobile');
    await page.goto(base+(auto?'/ordens-servico?os=':'/atendimentos?atendimento=')+doc.id);await page.getByRole('button',{name:'Lucro e custos',exact:true}).click();const panel=page.getByRole('region',{name:'Lucro e custos da OS'});await panel.waitFor();const linhaCusto=panel.locator('dl > div').filter({has:page.getByText('Total dos custos',{exact:true})});assert.equal((await linhaCusto.locator('dd').innerText()).replace(/\s/g,''),moeda(estado.depois.lucro.custo));await layout('lucro-os-mobile');
    await panel.getByRole('button',{name:'Conferir / adicionar outros custos',exact:true}).click();await page.getByText('De onde vieram os custos',{exact:true}).waitFor();
    estado.vinculos ||= [];
    for(const o of estado.ocorrencias){
      if(estado.vinculos.some(v=>v.ocorrencia===o.id))continue;
      const fonte=page.locator('.plano-card').filter({has:page.getByRole('button',{name:'Vincular ao financeiro sem duplicar',exact:true})}).filter({hasText:(o.valor/100).toFixed(2).replace('.',',')});
      await fonte.getByRole('button',{name:'Vincular ao financeiro sem duplicar',exact:true}).click();
      const custo=page.getByRole('dialog',{name:'Adicionar custo do serviço',exact:true});await custo.getByLabel('Descrição',{exact:true}).fill('QA garantia E2E · '+perfil+' · '+o.tipo);await custo.getByLabel('Data do gasto',{exact:true}).fill(hoje);await custo.getByLabel('Vencimento',{exact:true}).fill(hoje);
      const res=page.waitForResponse(r=>r.url().endsWith('/rpc/registrar_custo_servico'));await custo.getByRole('button',{name:'Salvar custo',exact:true}).click();const resposta=await res;assert(resposta.ok(),await resposta.text());const titulo=await resposta.json();await custo.waitFor({state:'hidden'});
      estado.vinculos.push({ocorrencia:o.id,titulo,valor:o.valor,args:resposta.request().postDataJSON()});await json(perfil+'-estado',estado);
      // Reenvio com a mesma chave não cria uma segunda despesa.
      assert.equal(await rpc('registrar_custo_servico',estado.vinculos.at(-1).args),titulo);
    }
    await layout('financeiro-vinculos-mobile');
    estado.final=await snap();
    assert.equal(estado.final.lucro.custo-estado.antes.lucro.custo,delta,'Vínculo não duplica o custo da OS');
    assert.equal(estado.final.relatorio.custeios[doc.id].custo-estado.antes.relatorio.custeios[doc.id].custo,delta,'Vínculo não duplica custo dos relatórios');
    assert.equal(estado.final.financeiro.resumo.despesas-estado.antes.financeiro.resumo.despesas,delta,'Despesas reconhecidas no financeiro');
    assert.equal(estado.final.financeiro.resumo.pagar-estado.antes.financeiro.resumo.pagar,delta,'Contas a pagar sem pagamento automático');
    assert.deepEqual(estado.final.financeiro.contas,estado.antes.financeiro.contas,'Caixa preservado até pagamento confirmado');
    assert.equal(estado.antes.apuracao.resultado_liquido-estado.final.apuracao.resultado_liquido,delta,'Resultado completo desconta os custos uma vez');
    for(const v of estado.vinculos){const t=await rpc('consultar_titulo_alerta',{p_titulo:v.titulo});assert.equal(t.valor_centavos,v.valor);assert.equal(t.baixado_centavos,0);}
    await json(perfil+'-estado',estado);
    assert.deepEqual(erros,[]);resultados.push({perfil,empresa:c.empresa_id,documento:doc.id,custos:delta,ocorrencias:estado.ocorrencias,ok:true});console.log('PASS ponta a ponta',perfil);
  }catch(e){falhas.push({perfil,erro:e.stack});console.error('FAIL',perfil,e.message);await page.screenshot({path:resolve(root,perfil+'-falha.png')}).catch(()=>{});await writeFile(resolve(root,perfil+'-falha.txt'),await page.locator('body').innerText().catch(()=>''));}
  finally{await ctx.close();await json('resultado',{ok:falhas.length===0,resultados,falhas});}
} } finally {await browser.close();}
if(falhas.length)process.exitCode=1;
