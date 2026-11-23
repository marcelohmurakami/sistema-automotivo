// Jornada no site publicado; somente empresas fictícias autorizadas.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const out='output/jornada-assistencia-campo-20261110';
await mkdir(out,{recursive:true});
const base=process.env.QA_URL||'https://patio-gestao-peach.vercel.app';
const banco='https://hzihxtjirttetnfdujcx.supabase.co';
const cred=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8'));
const filtro=process.env.QA_PERFIS?.split(',');
const contas=cred.contas.filter(c=>['assistencia_tecnica','manutencao_campo'].includes(c.ramo)&&(!filtro||filtro.includes(c.especialidade)));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[];
const build=await fetch(base+'/health.json').then(r=>r.json()).catch(()=>({build:'local'}));
for(const c of contas){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const perfil=c.especialidade,assist=c.ramo==='assistencia_tecnica';
 const s=JSON.parse(await readFile(`${out}/${perfil}.json`,'utf8'));
 let registro={};try{registro=JSON.parse(await readFile(`${out}/ui-estado-${perfil}.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const r={perfil,empresa:c.empresa_id,build:build.build,checks:[],erros:[],ok:false};resultados.push(r);
 const salvar=async()=>{await writeFile(`${out}/ui-estado-${perfil}.json`,JSON.stringify(registro,null,2));await writeFile(`${out}/ui-${perfil}.json`,JSON.stringify(r,null,2));};
 const ctx=await browser.newContext({viewport:{width:1920,height:1080},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 let impresso=0;await ctx.exposeBinding('__qaPrint',()=>{impresso++;});
 await ctx.addInitScript(()=>{window.print=()=>window.__qaPrint();});
 const p=await ctx.newPage();p.setDefaultTimeout(25000);
 p.on('pageerror',e=>r.erros.push(e.message));
 let headers,passo='login';
 p.on('request',req=>{if(req.url().startsWith(banco+'/rest/v1/')){const h=req.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'};}});
 await ctx.route(banco+'/rest/v1/rpc/**',route=>{const args=route.request().postDataJSON();if(args?.p_oficina&&args.p_oficina!==c.empresa_id)return route.abort();return route.continue();});
 const rpc=async(n,a={})=>{const resp=await p.request.post(banco+'/rest/v1/rpc/'+n,{headers,data:{p_oficina:c.empresa_id,...a}});const data=await resp.json();assert(resp.ok(),n+': '+JSON.stringify(data));return data;};
 const detalhe=()=>rpc('consultar_detalhes_atendimento',{p_atendimento:registro.id});
 const dialog=()=>p.locator('dialog[open].detalhes-servico');
 const abrir=async()=>{await p.goto(base+'/atendimentos?atendimento='+registro.id);await dialog().getByRole('button',{name:'Resumo',exact:true}).waitFor();};
 const verificarLayout=async(nome,width)=>{
  await p.setViewportSize({width,height:width<600?844:1080});await p.waitForTimeout(250);
  const medidas=await p.evaluate(()=>({janela:innerWidth,documento:document.documentElement.scrollWidth,dialogos:[...document.querySelectorAll('dialog[open],[role=dialog]')].filter(e=>e.getBoundingClientRect().width).map(e=>({largura:e.clientWidth,conteudo:e.scrollWidth}))}));
  assert(medidas.documento<=width+2,`Overflow ${nome}: ${JSON.stringify(medidas)}`);
  assert(medidas.dialogos.every(d=>d.conteudo<=d.largura+2),`Overflow do diálogo ${nome}: ${JSON.stringify(medidas)}`);
  await p.screenshot({path:`${out}/${perfil}-${nome}-${width}.png`,fullPage:false});r.checks.push(`${nome} sem overflow em ${width}px`);
 };
 try{
  await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));
  if(!registro.id){
   passo='criar orçamento pela interface';await p.goto(base+'/orcamentos');await p.getByRole('button',{name:'Novo orçamento',exact:true}).click();
   const d=p.getByRole('dialog',{name:'Orçamento',exact:true});
   await d.getByRole('combobox',{name:'Cliente',exact:true}).fill('QA Dia a dia');await d.getByRole('option',{name:'QA Dia a dia · Ana Costa',exact:true}).click();
   await d.getByRole('combobox',{name:assist?'Equipamento':'Local / equipamento',exact:true}).fill('QA 1');await d.locator('[role=option]').first().click();
   const cat=await rpc('buscar_cadastros_operacao',{p_tipo:'catalogo',p_busca:'QA Dia a dia'});
   // Consultar os nomes não altera preço ou estoque; os itens são adicionados pelos botões.
   const serv=cat.find(x=>x.id===s.servicos[0]);assert(serv,'Serviço de teste não localizado');
   const prod=await rpc('consultar_produto_estoque',{p_produto:s.produto});registro.estoqueAntes=Number(prod.saldo);
   const busca=d.getByRole('textbox',{name:/^Buscar serviço ou/});
   for(const nome of [serv.descricao,prod.descricao]){await busca.fill(nome);await d.getByRole('button',{name:'Adicionar '+nome+' por',exact:false}).click();}
   await d.getByRole('button',{name:'Aumentar quantidade de '+prod.descricao,exact:true}).click();
   await d.getByRole('button',{name:'Diminuir quantidade de '+prod.descricao,exact:true}).click();
   await d.getByLabel('Quantidade de '+prod.descricao,{exact:true}).fill('2');
   await d.getByLabel('Desconto (%)',{exact:true}).fill('10');
   await verificarLayout('novo-orcamento',390);await verificarLayout('novo-orcamento',1920);
   const resposta=p.waitForResponse(x=>x.url().endsWith('/rpc/criar_atendimento_com_itens'));
   await d.getByRole('button',{name:'Salvar orçamento',exact:true}).click();const resp=await resposta;const data=await resp.json();assert(resp.ok(),JSON.stringify(data));registro.id=data;await salvar();
   await dialog().getByRole('button',{name:'Aprovar orçamento',exact:true}).waitFor();
  }else await abrir();
  let doc=await detalhe();assert.equal(doc.atendimento.valor_centavos,36000);assert.equal(doc.itens.length,2);assert.equal(doc.itens.find(i=>i.produto_id===s.produto).quantidade,2);r.checks.push('Orçamento criado pela tela com catálogo, quantidade editada e desconto de 10%');
  if(doc.atendimento.situacao==='orcamento'){
   passo='aprovação pelo link';await dialog().getByRole('button',{name:'Aprovar orçamento',exact:true}).click();await dialog().getByRole('button',{name:'Gerar link de aprovação',exact:true}).click();
   const link=dialog().getByLabel('Link para o cliente',{exact:true});await link.waitFor();const url=await link.inputValue();assert(url.startsWith(base+'/aprovar-servico#'));
   const cliente=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});const cp=await cliente.newPage();
   await cp.goto(url);await cp.getByLabel('Seu nome completo',{exact:true}).fill('Ana Costa — cliente fictício');await cp.getByRole('checkbox',{name:'Conferi os itens e os valores e confirmo minha decisão.',exact:true}).check();await cp.getByRole('button',{name:'Autorizar serviços selecionados',exact:true}).click();await cp.getByRole('heading',{name:/autoriza|aprovad/i}).waitFor();
   assert(await cp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await cp.screenshot({path:`${out}/${perfil}-aprovacao-cliente-390.png`,fullPage:true});await cliente.close();await abrir();
  }
  doc=await detalhe();assert.notEqual(doc.atendimento.situacao,'orcamento');r.checks.push('Cliente autoriza pelo link no celular, sem login; orçamento vira OS');
  if(doc.atendimento.situacao==='aprovado'){
   passo='iniciar serviço';await dialog().getByRole('button',{name:assist?'Iniciar reparo':'Iniciar serviço',exact:true}).click();await dialog().getByRole('button',{name:assist?'Concluir reparo':'Concluir serviço',exact:true}).waitFor();
  }
  doc=await detalhe();if(doc.atendimento.situacao==='em_execucao'){
   passo='concluir serviço';await dialog().getByRole('button',{name:assist?'Concluir reparo':'Concluir serviço',exact:true}).click();await dialog().getByRole('button',{name:'Reabrir atendimento',exact:true}).waitFor();
   const aviso=p.getByRole('dialog',{name:'Avisar o cliente que o serviço foi concluído?',exact:true});await aviso.getByRole('button',{name:'Agora não',exact:true}).click();r.checks.push('Aviso de conclusão disponível; nenhum contato real enviado');
  }
  doc=await detalhe();assert.equal(doc.atendimento.situacao,'concluido');assert.equal(Number((await rpc('consultar_produto_estoque',{p_produto:s.produto})).saldo),registro.estoqueAntes-2);r.checks.push('Execução e conclusão pela tela, com baixa exata de duas unidades');
  if(!registro.recebido){
   passo='entrega e pagamento';await verificarLayout('resumo-pronto',390);
   const entregue=assist?['Entregue','Aceite registrado'].includes(doc.atendimento.ficha_especialidade.etapa):doc.atendimento.ficha_especialidade.campos.situacao_aceite==='Aceito';
   if(entregue){await dialog().getByRole('button',{name:'Cobrança / recebimento',exact:true}).click();await p.locator('.fin-baixa-direta').first().click();}
   else if(assist){
    const retirada=dialog().getByRole('button',{name:/^Registrar (retirada|aceite no local)$/});
    if(await retirada.count()){await retirada.click();await dialog().locator('input[name=recebedor]').fill('Ana Costa QA');await dialog().getByRole('button',{name:/^Confirmar (retirada|aceite)$/}).click();}
   }else{
    await dialog().getByRole('button',{name:'Registrar conferência / aceite',exact:true}).click();await dialog().getByLabel('Quem conferiu o serviço?',{exact:true}).fill('Ana Costa QA');await dialog().getByRole('button',{name:'Salvar conferência',exact:true}).click();
   }
   if(!entregue){const pagamento=p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true});await pagamento.getByRole('button',{name:/Já recebi/}).click();}
   const forma=p.getByRole('dialog',{name:'Registrar recebimento',exact:true}).locator('select[name=forma]');await forma.selectOption('pix');assert.equal(await p.getByLabel('Taxa da maquininha (R$)',{exact:true}).count(),0);
   await verificarLayout('pagamento',390);const pagamentoResp=p.waitForResponse(x=>x.url().endsWith('/rpc/baixar_titulo_financeiro'));await p.getByRole('button',{name:entregue?'Confirmar registro':'Confirmar pagamento',exact:true}).click();const pr=await pagamentoResp;assert(pr.ok(),await pr.text());
   registro.recebido=true;await salvar();await abrir();
  }
  doc=await detalhe();r.checks.push('Retirada/aceite abre pagamento; Pix sem taxa de cartão; pagamento registrado');
  passo='lucro e custos';await dialog().getByRole('button',{name:'Lucro e custos',exact:true}).click();await dialog().getByText(/Resultado|Lucro/).first().waitFor();
  const lucro=await rpc('consultar_lucro_documento',{p_documento:registro.id});registro.lucro=lucro;
  assert.equal(lucro.receita,36000);assert.equal(lucro.custo,10000);assert.equal(lucro.margem,26000);
  const titulo=await rpc('faturar_atendimento_servico',{p_atendimento:registro.id});const quitacao=await rpc('consultar_titulo_alerta',{p_titulo:titulo});assert.equal(quitacao.baixado_centavos,36000);assert.equal(quitacao.aberto_centavos,0);r.checks.push('Financeiro quitado em R$ 360,00; custos R$ 100,00; margem R$ 260,00');
  await verificarLayout('lucro',390);await verificarLayout('lucro',1920);
  passo='fotos antes e depois';await dialog().getByRole('button',{name:'Fotos antes e depois',exact:true}).click();
  const fotos=await rpc('listar_fotos_atendimento',{p_atendimento:registro.id});
  for(const fase of ['antes','depois']){
   const legenda='QA Jornada · imagem fictícia · '+fase;
   if(!fotos.some(f=>f.legenda===legenda&&f.situacao==='ready')){
    const buffer=Buffer.from(await p.evaluate(f=>{const el=document.createElement('canvas');el.width=240;el.height=100;const x=el.getContext('2d');x.fillStyle='#e5f2e8';x.fillRect(0,0,240,100);x.fillStyle='#234a30';x.font='18px sans-serif';x.fillText('TESTE FICTÍCIO',20,40);x.fillText(f,20,72);return el.toDataURL('image/png').split(',')[1];},fase),'base64');
    await dialog().locator('select[name=fase]').selectOption(fase);await dialog().getByLabel('Legenda (opcional)',{exact:true}).fill(legenda);await dialog().getByLabel('Foto',{exact:true}).setInputFiles({name:`qa-${fase}.png`,mimeType:'image/png',buffer});
    const enviada=p.waitForResponse(x=>x.url().endsWith('/rpc/confirmar_foto_atendimento'));await dialog().getByRole('button',{name:'Adicionar foto',exact:true}).click();const er=await enviada;assert(er.ok(),await er.text());await dialog().locator('figure').filter({hasText:legenda}).waitFor();
   }
  }
  assert.equal((await rpc('listar_fotos_atendimento',{p_atendimento:registro.id})).filter(f=>f.situacao==='ready').length,2);await verificarLayout('fotos',390);r.checks.push('Upload de duas imagens fictícias, antes e depois, e leitura da galeria');
  passo='impressão';await dialog().getByRole('button',{name:'Imprimir nota do serviço',exact:true}).click();await p.waitForTimeout(2500);assert(impresso>0,'Impressão não foi acionada');r.checks.push('Impressão da nota acionada depois do pagamento');
  const nota=ctx.pages().find(x=>x!==p&&!x.isClosed());assert(nota,'Nota não abriu');const textoNota=await nota.locator('body').innerText();assert(textoNota.includes('Ana Costa'));assert(textoNota.replace(/\s/g,'').includes('400,00'));assert(!textoNota.replace(/\s/g,'').includes('360,00'),'Nota com desconto oculto não deve divulgar o total líquido');await nota.pdf({path:`${out}/${perfil}-nota.pdf`,format:'A4',printBackground:true});await nota.close();r.checks.push('Nota identifica cliente e itens; desconto oculto não altera o financeiro');
  passo='reabrir e conferir';await abrir();assert.equal(await p.getByRole('dialog',{name:'Como ficou o pagamento da OS?',exact:true}).count(),0);r.checks.push('Reabrir a OS mantém a quitação, sem pedir pagamento outra vez');
  for(const rota of ['','clientes','catalogo','estoque','financeiro','relatorios','funcionarios','garantias','compras','fornecedores']){
   passo='consulta '+(rota||'painel');await p.goto(base+'/'+rota);await p.getByRole('main').waitFor();await p.waitForTimeout(1200);assert.equal(await p.getByText('Não conseguimos abrir esta tela.',{exact:true}).count(),0);await verificarLayout(rota||'painel',390);await verificarLayout(rota||'painel',1920);
  }
  assert.equal(r.erros.length,0,r.erros.join('; '));r.ok=true;delete r.falha;await salvar();console.log('PASS',perfil,r.checks.length);
 }catch(e){r.falha={passo,mensagem:e.message};await p.screenshot({path:`${out}/${perfil}-falha-ui.png`,fullPage:false}).catch(()=>{});await writeFile(`${out}/${perfil}-falha-ui.txt`,await p.locator('body').innerText().catch(()=>''));await salvar();console.log('FAIL',perfil,passo,e.message.slice(0,500));}
 await ctx.close();
}
await browser.close();await writeFile(`${out}/interface.json`,JSON.stringify({build:build.build,url:base,resultados},null,2));if(resultados.some(r=>!r.ok))process.exitCode=1;
