// Encerra apenas a conta fictícia criada antes do ajuste do verificador de HTTP 204.
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
const base='https://patio-gestao-peach.vercel.app',banco='https://hzihxtjirttetnfdujcx.supabase.co';
const c=JSON.parse(await readFile('output/contas-teste/20261019/credenciais.local.json','utf8')).contas.find(x=>x.especialidade==='mecanica');assert(c.empresa.startsWith('ZZ [TESTE 20261019] '));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {const p=await browser.newPage();let headers;p.on('request',r=>{if(r.url().startsWith(banco+'/rest/v1/')){const h=r.headers();if(h.authorization)headers={authorization:h.authorization,apikey:h.apikey,'content-type':'application/json'};}});
const rpc=async(n,args)=>{assert.equal(args.p_oficina,c.empresa_id);const r=await p.request.post(banco+'/rest/v1/rpc/'+n,{headers,data:args});assert(r.ok(),n+' '+r.status());return r.status()===204?null:r.json()};
await p.goto(base+'/entrar');await p.getByLabel('E-mail',{exact:true}).fill(c.email);await p.getByLabel('Senha',{exact:true}).fill(c.senha);await p.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith('/entrar'));await p.goto(base+'/financeiro?aba=recorrencias');await p.getByRole('button',{name:'Nova conta mensal',exact:true}).waitFor();
const nome='QA Mensal mecanica 1793991915594 aluguel';const r=(await rpc('consultar_contas_recorrentes',{p_oficina:c.empresa_id})).find(x=>x.descricao===nome);assert(r);
if(r.ativa)await rpc('salvar_conta_recorrente',{p_oficina:c.empresa_id,p_id:r.id,p_dados:{...r,ativa:false},p_revisao:r.revisao});
const alerts=await rpc('consultar_alertas',{p_oficina:c.empresa_id});const resultados=[];for(const a of alerts.filter(x=>x.tipo==='financeiro'&&x.titulo===nome)){const t=await rpc('consultar_titulo_alerta',{p_oficina:c.empresa_id,p_titulo:a.id});assert.equal(t.recorrencia_id,r.id);assert.equal(t.baixado_centavos,0);await rpc('cancelar_titulo_financeiro',{p_oficina:c.empresa_id,p_titulo:t.id,p_revisao:t.revisao,p_motivo:'Teste de conta mensal concluído; sem pagamento.'});resultados.push(t.id);}
await writeFile('output/contas-mensais-servicos-20261106/publicado/encerramento-conta-inicial.json',JSON.stringify({ok:true,regra:r.id,titulosCancelados:resultados}));console.log('PASS conta fictícia inicial pausada e cancelada');
}finally{await browser.close();}
