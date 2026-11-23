import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,preview} from './lib/vite-conferencia.mjs';
import {chromium} from './lib/chrome-conferencia.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const out=resolve(process.env.QA_OUTPUT||'output/revisao-integral-20261119/retornos-assincronos');
await mkdir(out,{recursive:true});
const config={configFile:false,envDir:false,plugins:[react(),tailwindcss()],logLevel:'error',define:{'import.meta.env.VITE_SUPABASE_URL':'window.location.origin','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('qa-local-sem-acesso-externo')},build:{outDir:resolve(out,'build'),rollupOptions:{input:'scripts/fixtures/retornos-assincronos.html'}}};
await build(config);const server=await preview({...config,preview:{host:'127.0.0.1',port:0}});
const base=server.resolvedUrls.local[0],browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),resultados=[],erros=[];
const antes=!!process.env.QA_SOURCE_DIR;
try {
 for(const width of [1920,390]){
  const context=await browser.newContext({viewport:{width,height:900},locale:'pt-BR'});let analises=0,usuarioSalvo,consultasConta=0,falharConta=false;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
   if(url.pathname==='/rest/v1/rpc/consultar_cobrancas_pix')return route.fulfill({json:[{id:'pix-a',situacao:'pendente',valor_centavos:1000,codigo_pix:'PIX-TESTE-A'},{id:'pix-b',situacao:'pendente',valor_centavos:2000,codigo_pix:'PIX-TESTE-B'}]});
   if(url.pathname==='/functions/v1/pix-os')return route.fulfill({json:{disponivel:true,ambiente:'teste'}});
   if(url.pathname==='/rest/v1/rpc/buscar_opcoes_analiticas')return route.fulfill({json:[{id:'problema-a',nome:'Problema A'}]});
   if(url.pathname==='/rest/v1/rpc/consultar_contas_financeiras')return route.fulfill({json:[]});
   if(url.pathname==='/rest/v1/rpc/consultar_relatorios_servicos'){
    consultasConta++;
    if(falharConta)return route.fulfill({status:503,json:{message:'Indisponibilidade simulada',code:'PGRST000'}});
    return route.fulfill({json:{agora:'2026-11-19T12:00:00Z',detalhes:[],abertos:[],agenda:[],qualidade:[],titulos:[],baixas:[],estoque:[],devedores:[{atendimento_id:'os-a',numero:17,titulo:'Reparo fictício',data_servico:'2026-11-19',cliente_id:'cliente-a',cliente:'Cliente de teste',telefone:null,titulo_id:'titulo-a',total:10000,pago:consultasConta>1?4000:0,saldo:consultasConta>1?6000:10000,vencimento:'2026-11-19'}]}});
   }
   if(url.pathname==='/rest/v1/rpc/consultar_comissoes')return route.fulfill({json:{profissionais:[{id:'prof-a',nome:'Profissional A',usuario_id:'usuario-a',ativo:true,tipo:'percentual',valor:10,liberacao:'recebimento',revisao:1}],itens:[],total:0,resumo:{prevista:0,aguardando:0,disponivel:0,pago:0}}});
   if(url.pathname==='/rest/v1/rpc/consultar_equipe'){await new Promise(r=>setTimeout(r,350));return route.fulfill({json:{membros:[{usuario_id:'usuario-a',email:'ficticio@example.test',ativo:true}],convites:[]}});}
   if(url.pathname==='/rest/v1/rpc/salvar_profissional_comissao'){usuarioSalvo=route.request().postDataJSON().p_dados.usuario_id;return route.fulfill({json:'prof-a'});}
   if(url.pathname==='/rest/v1/rpc/consultar_vinculo_analitico'){
    await new Promise(r=>setTimeout(r,120));return route.fulfill({json:{dados:{descricao:'Descrição original',documento_id:'os-a'},revisao:1,ativo:true}});
   }
   if(url.pathname==='/functions/v1/capturar-atendimento'){analises++;await new Promise(r=>setTimeout(r,150));return route.fulfill({json:{captura:{placa:null,quilometragem:null,relato:'Relato simulado para teste',itens:[]}}});}
   if(url.pathname==='/rest/v1/rpc/consultar_depositos_estoque'){
    const args=route.request().postDataJSON(),todos=Array.from({length:35},(_,i)=>({id:i?'local-'+i:'central',nome:i?'Depósito '+i:'Central',ativo:true})),filtrados=todos.filter(d=>d.nome.toLowerCase().includes((args.p_busca||'').toLowerCase()));
    return route.fulfill({json:{padrao:'central',total:filtrados.length,itens:filtrados.slice(0,30)}});
   }
   if(url.pathname.startsWith('/rest/')||url.pathname.startsWith('/functions/')||url.pathname.startsWith('/auth/'))throw Error('API não prevista: '+url.pathname);
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>erros.push(e.message));
  await page.goto(base+'scripts/fixtures/retornos-assincronos.html');
  await page.getByRole('button',{name:'Cobranças Pix',exact:true}).click();
  const ver=page.getByRole('button',{name:'Ver cobrança',exact:true});await ver.first().click();await page.getByAltText('QR code Pix desta cobrança').waitFor();
  await page.evaluate(()=>window.qa.falharQr=true);await ver.nth(1).click();await page.getByText('Use o código copia e cola abaixo.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').locator('textarea[readonly]').inputValue(),'PIX-TESTE-B');
  const imagensAntigas=await page.getByAltText('QR code Pix desta cobrança').count();
  if(!antes)assert.equal(imagensAntigas,0,'Não pode manter QR da cobrança anterior após falha de geração');
  resultados.push({width,caso:'trocar cobrança e falhar QR da nova',imagensAntigas});
  await page.screenshot({path:resolve(out,`pix-${width}.png`),fullPage:true});
  await page.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=foto');await page.getByText('Preencher por voz ou foto',{exact:true}).click();
  const arquivos=await page.evaluate(()=>['#ff0000','#0000ff'].map(cor=>{const c=document.createElement('canvas');c.width=c.height=8;c.getContext('2d').fillStyle=cor;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1]}));
  const input=page.locator('input[type=file]');await input.setInputFiles({name:'foto-antiga.png',mimeType:'image/png',buffer:Buffer.from(arquivos[0],'base64')});
  await input.setInputFiles({name:'foto-atual.png',mimeType:'image/png',buffer:Buffer.from(arquivos[1],'base64')});
  const foto=page.getByAltText('Foto selecionada para conferência');await foto.waitFor();const esperada=await foto.getAttribute('src');
  await page.waitForFunction(()=>window.qa.fotosPendentes===0);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const preservouUltima=await foto.getAttribute('src')===esperada;
  if(!antes)assert(preservouUltima,'Resposta da foto antiga não deve sobrescrever a seleção recente');
  resultados.push({width,caso:'duas fotos com retorno fora de ordem',preservouUltima});
  await page.getByLabel('Relato rápido').fill('Veículo apresenta ruído ao frear');
  await page.getByRole('button',{name:'Organizar e ler com IA',exact:true}).evaluate(b=>{b.click();b.click()});
  await page.getByRole('heading',{name:'Confira antes de usar'}).waitFor();
  if(!antes)assert.equal(analises,1,'A mesma análise não deve ser enviada duas vezes');
  resultados.push({width,caso:'duplo acionamento da análise',requisicoes:analises});
  await page.screenshot({path:resolve(out,`foto-${width}.png`),fullPage:true});
  await page.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=deposito');
  const busca=page.getByLabel('Encontrar local de estoque');await busca.waitFor();
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/rpc/consultar_depositos_estoque')&&r.request().postDataJSON().p_busca==='nada'),busca.fill('nada')]);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const podeLimpar=await busca.isVisible(),padrao=await page.getByRole('combobox').inputValue();
  if(!antes){assert(podeLimpar,'Busca sem resultados deve continuar disponível para limpar');assert.equal(padrao,'central');await busca.fill('');await page.waitForFunction(()=>document.querySelector('select')?.options.length>=30);}
  resultados.push({width,caso:'filtrar depósitos sem resultados',podeLimpar,padrao});
  await page.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=cliente');
  await page.getByRole('option',{name:'Cliente A',exact:true}).waitFor();
  await page.evaluate(()=>{const opcao=[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.trim()==='Cliente A'),avulso=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Cliente sem cadastro');opcao.click();avulso.click();});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const selecao=JSON.parse(await page.getByTestId('selecao').textContent());
  assert.equal(selecao.cliente,'avulso');if(!antes)assert.equal(selecao.veiculo,'','Seleção avulsa deve descartar retorno já em cache do cliente anterior');
  resultados.push({width,caso:'cliente avulso durante resposta em cache',...selecao});
  await page.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=analise');
  const descricao=page.getByLabel('Qual problema será acompanhado?');await descricao.fill('Texto ainda não salvo');
  await page.evaluate(()=>window.qa.cache.refetchQueries({queryKey:['vinculo-analitico']}));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const textoPreservado=await descricao.inputValue();if(!antes)assert.equal(textoPreservado,'Texto ainda não salvo','Consulta em segundo plano não deve desmontar formulário e perder rascunho');
  resultados.push({width,caso:'atualizar vínculo durante edição',textoPreservado});
  await page.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=comissao');
  await page.getByRole('button',{name:'Configurar porcentagens'}).click();await page.getByRole('button',{name:'Editar regra',exact:true}).click();
  await page.getByText('Avançado',{exact:true}).click();
  const usuario=page.getByLabel('Usuário da equipe (opcional)');await page.waitForFunction(()=>!!document.querySelector('select[name=usuario_id]')&&!document.querySelector('select[name=usuario_id]').disabled);
  const usuarioSelecionado=await usuario.inputValue();
  await page.getByRole('button',{name:'Salvar profissional',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  if(!antes){assert.equal(usuarioSelecionado,'usuario-a');assert.equal(usuarioSalvo,'usuario-a','Salvar uma regra sem mexer no usuário deve preservar o vínculo');}
  resultados.push({width,caso:'editar comissão antes da equipe carregar',usuarioSelecionado,usuarioSalvo});
  await page.goto(base+'scripts/fixtures/retornos-assincronos.html?tela=conta');
  await page.getByRole('button',{name:'Cliente de teste',exact:true}).click();
  let downloads=0;page.on('download',()=>downloads++);
  const pdf=page.getByRole('button',{name:'Gerar PDF da conta',exact:true});
  if(antes){await Promise.all([page.waitForEvent('download'),pdf.click()]);}
  else {
   await pdf.click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'Os saldos mudaram'}).waitFor();assert.equal(downloads,0);
   assert.match(await page.getByRole('dialog').innerText(),/60,00/);
   await Promise.all([page.waitForEvent('download'),pdf.click()]);assert.equal(downloads,1);
   falharConta=true;await pdf.click();
   await page.getByRole('dialog').getByRole('alert').waitFor();
   assert.equal(await page.getByRole('dialog').getByRole('checkbox').isChecked(),true,'Falha de consulta não pode desmontar seleção');
   assert.equal(downloads,1,'Falha de leitura deve bloquear PDF');
   falharConta=false;await Promise.all([page.waitForEvent('download'),pdf.click()]);assert.equal(downloads,2);
  }
  resultados.push({width,caso:'pagamento em outra tela antes do PDF e indisponibilidade temporária',consultasConta,downloads,reconferiuSaldo:consultasConta>1});
  assert.deepEqual(erros,[]);await context.close();
 }
 console.log(JSON.stringify({antes,resultados,erros}));
} finally {
 await writeFile(resolve(out,'resultados.json'),JSON.stringify({antes,resultados,erros,escopo:'UI real com API e falha de canvas simuladas. Nenhuma cobrança ou IA externa.'},null,2));
 await browser.close();await new Promise(r=>server.httpServer.close(r));
}
