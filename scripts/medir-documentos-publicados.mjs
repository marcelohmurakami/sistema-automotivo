// Grava somente nas 26 empresas ZZ [TESTE 20261019]. Não recebe dinheiro,
// entrega serviços, envia propostas ou contata clientes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from './lib/chrome-conferencia.mjs';
import {iniciarJornada,concluirJornada} from './lib/medir-jornadas.mjs';
const out=resolve('output/jornadas-completas-20261112/publicado-gravacao'),base='https://patio-gestao-peach.vercel.app';
await mkdir(out,{recursive:true});
const health=await fetch(base+'/health.json',{cache:'no-store'}).then(r=>r.json());assert.equal(health.build,'569643293');
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade));
const resultados=await readFile(resolve(out,'resultados.json'),'utf8').then(t=>JSON.parse(t).resultados.filter(x=>x.ok)).catch(()=>[]),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const gravar=()=>writeFile(resolve(out,'resultados.json'),JSON.stringify({build:health.build,ok:resultados.every(x=>x.ok),ambiente:'Site publicado e Supabase real; somente empresas fictícias ZZ. Chrome sem limitação artificial de CPU. Tempo automatizado, não inclui digitação humana.',resultados},null,2));
try{for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const ctx=await browser.newContext({viewport:{width:1366,height:900},locale:'pt-BR',serviceWorkers:'block'}),p=await ctx.newPage();p.setDefaultTimeout(30000);
 const erros=[];p.on('pageerror',e=>erros.push(e.message));
 try{
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));
  await p.goto(base+'/catalogo');await p.locator('.catalogo-abrir-ficha').first().waitFor();const servico=(await p.locator('.catalogo-abrir-ficha').first().innerText()).replace(/\s*Ver detalhes →/,'').trim();assert(servico);
  for(const documento of ['os','orcamento']){
   if(resultados.some(x=>x.perfil===c.especialidade&&x.documento===documento&&x.ok))continue;
   let id=null,confirmado=false;
   try{
    await p.goto(base+'/clientes');await p.locator('.abrir-ficha-cliente').first().click();const ficha=p.locator('.ficha-cliente');await ficha.locator('h3').waitFor();
    iniciarJornada((documento==='os'?'OS':'Orçamento')+' publicado: catálogo, ajuste, desconto, salvar e reabrir',c.especialidade,{ambiente:'Supabase real, somente empresa fictícia',inicioDeclarado:'Ficha do cliente aberta',fimDeclarado:'Documento reaberto pelo ID, total R$ 95,00 conferido'});
    const inicio=performance.now();
    await ficha.locator('.ficha-cliente-acoes a').filter({hasText:documento==='orcamento'?'Novo orçamento':/Nova OS|Ordem de reparo|Visita técnica|Serviço de limpeza/}).click();
    const d=p.locator('dialog[open]').last();await d.getByRole('combobox',{name:'Cliente',exact:true}).waitFor();
    if(c.especialidade==='retifica'){await d.getByLabel('Carro',{exact:true}).fill('Volkswagen Gol QA');await d.getByLabel('Motor',{exact:true}).fill('AP 1.6');}
    else if(c.ramo==='automotivo'){
     // Os veículos antigos da empresa fictícia podem ter OS aberta; cadastrar
     // um veículo de teste preserva a proteção contra duas OS simultâneas.
     await d.getByRole('button',{name:'Novo veículo',exact:true}).click();await d.getByLabel('Nome / modelo do veículo',{exact:true}).fill('QA produtividade '+documento+' '+Date.now());await d.getByRole('button',{name:'Cadastrar e selecionar',exact:true}).click();await d.getByText('Veículo cadastrado e selecionado.',{exact:true}).waitFor();
    }else{const bem=d.getByRole('combobox',{name:/^(Equipamento|Local|Local \/ equipamento)$/});if(await bem.count()&&!(await bem.inputValue())){await bem.click();await d.getByRole('listbox').getByRole('option').first().click();}}
    await d.locator('.os-editor-busca input').fill(servico);
    const adicionar=d.locator('.os-editor-catalogo button').filter({hasText:'Serviço'}).first();await adicionar.click();
    const novo=d.getByRole('group',{name:'Novo item avulso'});
    if(await novo.isVisible()){await novo.getByLabel('Preço unitário (R$)',{exact:true}).fill('100');await novo.getByRole('button',{name:'Adicionar serviço',exact:true}).click();}
    await d.locator('.os-editor-editar').first().click();await d.getByLabel('Preço unitário (R$)',{exact:true}).fill('100');await d.getByRole('button',{name:'Salvar item',exact:true}).click();
    const desconto=d.locator('.campo-desconto');await desconto.getByRole('button',{name:'Desconto em porcentagem',exact:true}).click();await desconto.locator('input').fill('5');
    const obs=d.getByLabel('Observações (opcional)',{exact:true});if(await obs.count()){
     for(const detalhe of await obs.locator('xpath=ancestor::details').all())if(!await detalhe.evaluate(e=>e.open))await detalhe.locator(':scope > summary').click();
     await obs.fill('QA produtividade 12/11/2026 — dados fictícios; não executar nem cobrar.');
    }
    const rpc=c.ramo==='automotivo'?(documento==='os'?'salvar_os_com_itens':'salvar_orcamento'):'criar_atendimento_com_itens';
    const retorno=p.waitForResponse(r=>r.url().endsWith('/rpc/'+rpc)&&r.request().method()==='POST');
    const salvar=performance.now();await d.getByRole('button',{name:documento==='os'?'Abrir ordem de serviço':'Salvar orçamento',exact:true}).click();
    const resposta=await retorno;const corpo=await resposta.json();assert(resposta.ok(),'Falha HTTP ao salvar: '+resposta.status()+' '+JSON.stringify(corpo));id=typeof corpo==='string'?corpo:corpo.id;assert.match(id,/^[a-f\d-]{36}$/i);confirmado=true;
    const gravacaoSegundos=(performance.now()-salvar)/1000;
    await p.locator('dialog[open] .atendimento-cabecalho, dialog[open] .os-resumo-limpo, dialog[open] .documento-orcamento').first().waitFor();
    const salvoSegundos=(performance.now()-inicio)/1000;
    const caminho=c.ramo==='automotivo'?(documento==='os'?'/ordens-servico?os=':'/orcamentos?orcamento='):'/atendimentos?atendimento=';
    await p.goto(base+caminho+id);await p.locator('dialog[open]').getByText(/R\$\s*95,00/).first().waitFor();assert.deepEqual(erros,[]);
    const segundos=(performance.now()-inicio)/1000;concluirJornada();
    resultados.push({perfil:c.especialidade,documento,id,totalCentavos:9500,descontoCentavos:500,salvoSegundos:Number(salvoSegundos.toFixed(3)),gravacaoSegundos:Number(gravacaoSegundos.toFixed(3)),segundos:Number(segundos.toFixed(3)),ok:true});
    console.log(JSON.stringify(resultados.at(-1)));await gravar();
   }catch(e){concluirJornada({ok:false,erro:e.message});resultados.push({perfil:c.especialidade,documento,id,confirmado,ok:false,erro:e.message});await p.screenshot({path:resolve(out,c.especialidade+'-'+documento+'-falha.png')}).catch(()=>{});await gravar();throw e;}
  }
 }catch(e){console.log('FAIL',c.especialidade,e.message.slice(0,250));throw e;}finally{await ctx.close();}
}}finally{await browser.close();await gravar();}
assert(resultados.every(x=>x.ok));assert.equal(resultados.filter(x=>contas.some(c=>c.especialidade===x.perfil)).length,contas.length*2);
