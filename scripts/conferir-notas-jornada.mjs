import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const out='output/jornada-assistencia-campo-20261110',base='https://patio-gestao-peach.vercel.app',banco='https://hzihxtjirttetnfdujcx.supabase.co';
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>['assistencia_tecnica','manutencao_campo'].includes(c.ramo));
const build=await fetch(base+'/health.json').then(r=>r.json());
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[];
for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const estado=JSON.parse(await readFile(`${out}/ui-estado-${c.especialidade}.json`,'utf8'));
 const ctx=await browser.newContext({viewport:{width:900,height:1100},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 let impressao=0;await ctx.exposeBinding('__qaPrint',()=>impressao++);await ctx.addInitScript(()=>window.print=()=>window.__qaPrint());
 const p=await ctx.newPage();p.setDefaultTimeout(25000);let headers;
 p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey};}});
 const rpc=async(n,a)=>{const r=await p.request.post(banco+'/rest/v1/rpc/'+n,{headers,data:{p_oficina:c.empresa_id,...a}});const d=await r.json();assert(r.ok(),n+JSON.stringify(d));return d;};
 try{
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));
  await p.goto(base+'/atendimentos?atendimento='+estado.id);const d=p.locator('dialog[open].detalhes-servico');await d.getByRole('button',{name:'Imprimir nota do serviço',exact:true}).waitFor();
  const popup=p.waitForEvent('popup');await d.getByRole('button',{name:'Imprimir nota do serviço',exact:true}).click();const nota=await popup;
  await nota.getByText(/Ana Costa/).first().waitFor();await p.waitForTimeout(1500);assert(impressao>0);
  const texto=await nota.locator('body').innerText(),compacto=texto.replace(/\s/g,'');assert(compacto.includes('400,00'));assert(!compacto.includes('360,00'));assert(!/Placa:|Veículo:|Motor:/i.test(texto));
  await nota.screenshot({path:`${out}/${c.especialidade}-nota-cliente.png`,fullPage:true});
  const lucro=await rpc('consultar_lucro_documento',{p_documento:estado.id});assert.equal(lucro.receita,36000);assert.equal(lucro.pago,36000);assert.equal(lucro.custo,10000);assert.equal(lucro.margem,26000);
  const rel=await rpc('consultar_relatorios_servicos',{p_inicio:'2026-11-10',p_fim:'2026-11-30'});assert.equal(rel.custeios[estado.id].custo,10000);assert.equal(rel.detalhes.find(d=>d.atendimento.id===estado.id).atendimento.valor_centavos,36000);
  await nota.close();await d.getByRole('button',{name:'Fechar janela',exact:true}).click();await p.getByRole('button',{name:'Alternar tema claro e escuro',exact:true}).click();await p.goto(base+'/atendimentos?atendimento='+estado.id);await d.getByRole('button',{name:'Lucro e custos',exact:true}).click();await d.locator('.lucro-destaque').waitFor();
  await d.getByText(`Serviços e ${c.ramo==='assistencia_tecnica'?'peças':'materiais'}, antes do desconto`,{exact:true}).waitFor();
  for(const width of [390,1920]){await p.setViewportSize({width,height:width===390?844:1080});assert(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+2));await p.screenshot({path:`${out}/${c.especialidade}-escuro-${width}.png`});}
  resultados.push({perfil:c.especialidade,ok:true,documento:estado.id,receita:lucro.receita,pago:lucro.pago,custo:lucro.custo,margem:lucro.margem,checks:['Nota abriu para impressão','Cliente e total bruto visíveis, desconto oculto','Sem campos de veículo na nota','Recebimento, custo e margem conferidos','Relatório confere com a OS','Tema escuro em 390 e 1920 px']});console.log('PASS',c.especialidade,6);
 }catch(e){resultados.push({perfil:c.especialidade,ok:false,erro:e.message});console.log('FAIL',c.especialidade,e.message.slice(0,300));}
 await ctx.close();await writeFile(`${out}/notas.json`,JSON.stringify({ok:resultados.every(r=>r.ok),build:build.build,resultados},null,2));
}
await browser.close();if(resultados.some(r=>!r.ok))process.exitCode=1;
