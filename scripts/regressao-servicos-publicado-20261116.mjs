// UI real publicada: apenas empresas ZZ fictícias. Nenhum envio de mensagens.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const root='output/regressao-assistencia-manutencao-limpeza-20261116';
const out=process.env.QA_OUTPUT||root+'/interface';await mkdir(out,{recursive:true});
const base=process.env.QA_URL||'https://patio-gestao-peach.vercel.app',banco='https://hzihxtjirttetnfdujcx.supabase.co';
const build=await fetch(base+'/health.json?qa='+Date.now()).then(r=>r.json());
const contas=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.filter(c=>c.ramo!=='automotivo'&&(!process.env.QA_PERFIS||process.env.QA_PERFIS.split(',').includes(c.especialidade)));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const resultados=[],checks=[],documentos=[],falhas=[],errosConsole=[];
const gravar=()=>writeFile(out+'/resultados.json',JSON.stringify({build:build.build,geradoEm:new Date().toISOString(),ok:!falhas.length,resultados,checks,documentos,falhas,errosConsole},null,2));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100).replace(/\s/g,' ');
const nomes={assistencia_tecnica:['Ordem de reparo','Equipamento'],manutencao_campo:['Visita técnica','Local / equipamento'],limpeza:['Serviço de limpeza','Local']};
for(const c of contas)for(const width of process.env.QA_TELAS?.split(',').map(Number)||[1920,390]){
 assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
 const s=JSON.parse(await readFile(`${root}/sementes/${c.especialidade}.json`,'utf8'));assert.equal(s.empresa,c.empresa_id);
 const ctx=await browser.newContext({viewport:{width,height:width<600?844:1080},isMobile:width<600,hasTouch:width<600,deviceScaleFactor:width<600?2:1,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await ctx.addInitScript(()=>{window.print=()=>{window.__qaImpresso=true}});
 const p=await ctx.newPage();p.setDefaultTimeout(25000);p.setDefaultNavigationTimeout(45000);
 let headers,atual,contagem={cliques:0,campos:0},requests=[],medindo=false,etapa='login';
 p.on('pageerror',e=>errosConsole.push({perfil:c.especialidade,width,erro:e.message}));
 p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'};if(medindo)requests.push({r,nome:new URL(r.url()).pathname.split('/').pop(),inicio:performance.now()})}});
 p.on('requestfinished',r=>{const q=requests.find(x=>x.r===r);if(q)q.segundos=(performance.now()-q.inicio)/1000});
 await ctx.route(banco+'/rest/v1/rpc/**',r=>{const a=r.request().postDataJSON();if(a?.p_oficina&&a.p_oficina!==c.empresa_id)throw new Error('Empresa fora da lista de teste');return r.continue()});
 const rpc=async(n,a={})=>{const r=await p.request.post(banco+'/rest/v1/rpc/'+n,{headers,data:{p_oficina:c.empresa_id,...a}});const data=await r.json();assert(r.ok(),n+': '+JSON.stringify(data));return data};
 const check=(cond,nome,evidencia)=>{assert(cond,nome);checks.push({perfil:c.especialidade,width,caso:atual?.caso,nome,evidencia})};
 const medir=async(nome,fn)=>{etapa=nome;const ini=performance.now();contagem={cliques:0,campos:0};requests=[];medindo=true;try{await fn();resultados.push({perfil:c.especialidade,ramo:c.ramo,width,caso:atual?.caso,nome,ok:true,segundos:+((performance.now()-ini)/1000).toFixed(3),...contagem,requisicoes:requests.map(({nome,segundos})=>({nome,segundos}))});await gravar()}finally{medindo=false}};
 const click=async l=>{if(medindo)contagem.cliques++;await l.click()};
 const fill=async(l,v)=>{if(medindo)contagem.campos++;await l.fill(v)};
 const select=async(l,v)=>{if(medindo)contagem.campos++;await l.selectOption(v)};
 const btn=(scope,name)=>scope.getByRole('button',{name,exact:true});
 const dd=()=>p.locator('dialog[open].detalhes-servico');
 const form=()=>p.locator('dialog[open].dialogo-orcamento');
 const detalhe=()=>rpc('consultar_detalhes_atendimento',{p_atendimento:atual.id});
 const pronto=async()=>{await btn(dd(),'Resumo').waitFor();await p.waitForFunction(()=>{const b=[...document.querySelectorAll('dialog[open].detalhes-servico button')].find(b=>b.textContent==='Resumo');return b&&!b.disabled})};
 const resposta=async(n,fn)=>{const espera=p.waitForResponse(r=>r.url().endsWith('/rpc/'+n));await fn();const r=await espera;const texto=await r.text();const data=texto?JSON.parse(texto):null;assert(r.ok(),n+': '+JSON.stringify(data));return data};
 const layout=async(nome)=>{const m=await p.evaluate(()=>({largura:innerWidth,documento:document.documentElement.scrollWidth,dialogos:[...document.querySelectorAll('dialog[open]')].map(e=>({largura:e.clientWidth,conteudo:e.scrollWidth}))}));check(m.documento<=m.largura+2&&m.dialogos.every(d=>d.conteudo<=d.largura+2),'Layout: '+nome,m);await p.screenshot({path:`${out}/${c.especialidade}-${width}-${atual.caso}-${nome}.png`,fullPage:false})};
 const avulso=async(nome,valor)=>{await click(btn(form(),/Serviço ou (peça avulsa|material avulso|produto avulso)/));const g=form().getByRole('group',{name:'Novo item avulso'});await fill(g.getByLabel(/^Nome do serviço ou /),nome);await fill(g.getByLabel('Preço unitário (R$)',{exact:true}),String(valor));await click(g.locator('summary').filter({hasText:'Custos e margem'}));await fill(g.getByLabel('Custo direto por unidade (R$)',{exact:true}),'5');await click(btn(g,'Adicionar serviço'));};
 try{
  await medir('Entrar no sistema',async()=>{await p.goto(base+'/entrar',{waitUntil:'domcontentloaded'});await fill(p.getByLabel('E-mail',{exact:true}),c.email);await fill(p.getByLabel('Senha',{exact:true}),c.senha);await click(btn(p,'Entrar no sistema'));await p.waitForURL(u=>!u.pathname.startsWith('/entrar'),{waitUntil:'domcontentloaded'});await p.locator('main').waitFor()});
  for(const tipo of ['orcamento','ordem'])for(const completo of [false,true]){
   atual={perfil:c.especialidade,ramo:c.ramo,empresa:c.empresa_id,width,tipo,completo,caso:tipo+'-'+(completo?'completo':'simples'),build:build.build};
   const caminho=tipo==='orcamento'?'/orcamentos':'/atendimentos';let subtotal=20000;
   await medir('Abrir listagem',async()=>{await p.goto(base+caminho,{waitUntil:'domcontentloaded'});await btn(p.locator('main'),tipo==='orcamento'?'Novo orçamento':nomes[c.ramo][0]).waitFor()});
   await medir('Criar documento',async()=>{
    await click(btn(p.locator('main'),tipo==='orcamento'?'Novo orçamento':nomes[c.ramo][0]));
    await fill(form().getByRole('combobox',{name:'Cliente',exact:true}),s.clienteNome);await click(form().getByRole('option',{name:s.clienteNome,exact:true}));
    const obj=form().getByRole('combobox',{name:nomes[c.ramo][1],exact:true});
    await obj.waitFor();if(!(await obj.inputValue()).includes(s.objetoNome)){await fill(obj,s.objetoNome);await click(form().getByRole('option').filter({hasText:s.objetoNome}).first())}
    const busca=form().getByRole('textbox',{name:/^Buscar serviço ou/});
    await fill(busca,s.servicoNome);await click(form().getByRole('button',{name:'Adicionar '+s.servicoNome+' por',exact:false}));
    if(completo){
     await click(btn(form(),'Aumentar quantidade de '+s.servicoNome));subtotal=40000;
     await fill(busca,s.produtoNome);await click(form().getByRole('button',{name:'Adicionar '+s.produtoNome+' por',exact:false}));
     await fill(form().getByLabel('Quantidade de '+s.produtoNome,{exact:true}),'2');subtotal+=20000;
     for(let i=0;i<10;i++){await avulso('QA R16 · Complemento '+(i+1),10+i*5);subtotal+=(10+i*5)*100}
     await fill(form().getByLabel('Desconto (%)',{exact:true}),'10');
     if(tipo==='ordem')await click(form().getByRole('group',{name:'Mostrar o desconto na nota final para o cliente?'}).getByRole('button',{name:'Sim',exact:true}));
     await fill(form().getByLabel('Descrição do serviço (opcional)',{exact:true}),`QA R16 ${c.especialidade} ${width} ${tipo} completo`);
     await fill(form().getByLabel('Observações (opcional)',{exact:true}),'Serviço fictício com escopo, insumos e valores conferidos. Não contatar.');
     await fill(form().getByLabel('Data do serviço',{exact:true}),'2026-11-15');
     if(c.ramo==='limpeza')await fill(form().getByLabel('Escopo combinado com o cliente',{exact:true}),'Área de teste: 60 m². Serviço e material compatíveis. Acesso autorizado.');
     await click(form().locator('summary').filter({hasText:'Informações adicionais do atendimento'}));
     if(c.ramo==='assistencia_tecnica'){await click(form().locator('summary').filter({hasText:'Recepção e defeito relatado'}));await fill(form().getByLabel('Defeito relatado pelo cliente',{exact:true}),'Falha intermitente informada pelo cliente de teste.');}
     await click(form().locator('summary').filter({hasText:'Ficha técnica ·'}));
     const ck=form().locator('.ficha-especialidade input[type=checkbox]').first();await click(ck);
     await click(form().locator('summary').filter({hasText:'Anotações complementares'}));
     await fill(form().getByLabel('Checklist de execução (um item por linha)',{exact:true}),'Conferir escopo\nExecutar serviço\nTestar resultado');
    }
    atual.id=await resposta('criar_atendimento_com_itens',()=>click(btn(form(),tipo==='orcamento'?'Salvar orçamento':'Abrir ordem de serviço')));documentos.push(atual);await gravar();await pronto();
   });
   let d=await detalhe();atual.numero=d.atendimento.numero;atual.valorInicial=completo?subtotal*0.9:subtotal;
   check(d.atendimento.valor_centavos===atual.valorInicial,'Total inicial confere',{esperado:atual.valorInicial,recebido:d.atendimento.valor_centavos});
   check(d.itens.length===(completo?12:1),'Quantidade de itens salva');
   check(d.atendimento.dados.documento===tipo,'OS e orçamento mantêm o tipo solicitado');
   check(d.atendimento.ficha_especialidade.especialidade===c.especialidade,'Ficha do subsetor correto');
   check(d.atendimento.mostrar_desconto_nota===(completo&&tipo==='ordem'),'Preferência de impressão salva');
   if(completo){check(d.atendimento.data_servico==='2026-11-15','Data informada preservada');check(d.atendimento.dados.checklist.includes('Executar serviço'),'Checklist salvo');check(d.itens.find(i=>i.produto_id===s.produto)?.quantidade===2,'Material vinculado ao estoque');check(d.itens.every(i=>i.custo_informado||i.origem==='estoque'),'Custos presentes nos itens');}
   await layout('resumo');
   // Consulta pela tela de listagem, sem depender de URL com ID.
   await medir('Consultar pelo número',async()=>{await click(btn(dd(),'Fechar janela'));const busca=p.getByRole('searchbox').filter({visible:true}).first();await fill(busca,String(atual.numero));const linha=p.locator('.servico-linha-abrir').filter({hasText:'#'+atual.numero});await linha.waitFor();await click(linha);await pronto()});
   for(const [nome,termo] of [['Consultar pelo cliente',s.clienteNome],['Consultar pelo equipamento ou local',s.objetoNome]])await medir(nome,async()=>{await click(btn(dd(),'Fechar janela'));await fill(p.getByRole('searchbox').filter({visible:true}).first(),termo);await click(p.locator('.servico-linha-abrir').filter({hasText:'#'+atual.numero}));await pronto()});
   await medir('Editar itens e valores',async()=>{
    await click(btn(dd(),c.ramo==='assistencia_tecnica'?'Serviços e peças':'Serviços e materiais'));
    const first=dd().locator('.atendimento-item').filter({has:p.getByRole('button',{name:'Aumentar quantidade de '+s.servicoNome,exact:true})});await fill(first.getByLabel('Preço unitário (R$)',{exact:true}),'225');await click(btn(first,'Aumentar quantidade de '+s.servicoNome));
    await click(btn(dd(),'Desconto em reais'));await fill(dd().getByLabel('Desconto (R$)',{exact:true}),'20');
    await click(dd().getByRole('group',{name:'Mostrar o desconto na nota final para o cliente?'}).getByRole('button',{name:completo?'Não':'Sim',exact:true}));
    await resposta('salvar_itens_atendimento_nota',()=>click(btn(dd(),'Salvar itens e valores')));await pronto();
   });
   d=await detalhe();const expected=subtotal-(completo?40000:20000)+(completo?67500:45000)-2000;
   check(d.atendimento.valor_centavos===expected,'Edição recalcula quantidade, preço e desconto',{esperado:expected,recebido:d.atendimento.valor_centavos});atual.valorEditado=expected;
   check(d.comercial.desconto_centavos===2000,'Desconto fixo de R$ 20 salvo');check(d.atendimento.mostrar_desconto_nota===!completo,'Preferência de impressão alterada');
   await layout('itens');
   await medir('Editar ficha e data',async()=>{
    await click(btn(dd(),'Resumo'));await click(btn(dd(),'Editar ficha e dados'));
    await fill(form().locator('textarea[name=titulo]'),`QA R16 ${c.especialidade} ${width} ${atual.caso} editado`);
    await fill(form().getByLabel('Data do serviço',{exact:true}),'2026-11-16');
    await fill(form().locator('textarea[name=observacoes_cliente]'),'Observação atualizada pela interface. Cliente fictício.');
    await resposta('salvar_atendimento_servico',()=>click(btn(form(),'Salvar')));await pronto();
   });
   d=await detalhe();check(d.atendimento.data_servico==='2026-11-16','Data editada salva');check(d.atendimento.dados.observacoes_cliente.startsWith('Observação atualizada'),'Observação editada salva');check(d.atendimento.valor_centavos===expected,'Editar ficha preserva itens e valor');
   await medir('Reabrir após recarregar',async()=>{await p.goto(base+'/atendimentos?atendimento='+atual.id,{waitUntil:'domcontentloaded'});await pronto()});
   check((await detalhe()).atendimento.valor_centavos===expected,'Persistência após recarga completa');
   await medir('Consultar histórico',async()=>{await select(dd().getByLabel('Mais opções do atendimento',{exact:true}),'historico');await dd().locator('.atendimento-historico li').first().waitFor()});
   await layout('historico');
   await medir('Baixar PDF',async()=>{const espera=p.waitForEvent('download');await click(btn(dd(),'Baixar PDF'));const download=await espera;atual.pdf=`${c.especialidade}-${width}-${atual.caso}.pdf`;await download.saveAs(out+'/'+atual.pdf);assert.equal(await download.failure(),null)});
   await gravar();console.log('PASS',c.especialidade,width,atual.caso,atual.numero);
  }
 }catch(e){falhas.push({perfil:c.especialidade,width,caso:atual?.caso,etapa,erro:e.message});console.error('FAIL',c.especialidade,width,atual?.caso,etapa,e.message);await p.screenshot({path:`${out}/falha-${c.especialidade}-${width}.png`,fullPage:false}).catch(()=>{});await writeFile(`${out}/falha-${c.especialidade}-${width}.txt`,await p.locator('body').innerText().catch(()=>''));await gravar();}
 finally{await ctx.close()}
}
await browser.close();await gravar();if(falhas.length)process.exitCode=1;
