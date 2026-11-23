import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export async function layoutCompleto({p,d,ir,teste,perfil,out}) {
 const conferir=async()=>{
  await p.evaluate(()=>document.fonts.ready);
  await p.evaluate(()=>new Promise(requestAnimationFrame));
  const v=await d().evaluate(e=>({pagina:document.documentElement.scrollWidth-innerWidth,dialogo:e.scrollWidth-e.clientWidth,fora:[...e.querySelectorAll('input,button,select,textarea,summary')].filter(n=>n.checkVisibility()).filter(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).map(n=>n.tagName)}));
  assert(v.pagina<=1&&v.dialogo<=1,JSON.stringify(v));assert.deepEqual(v.fora,[]);return v;
 };
 for(const width of [320,390,768,1920])for(const[tela,novo]of[['funcionarios','Novo funcionário'],['fornecedores','Novo fornecedor'],['catalogo','Novo serviço']]){
  await teste(perfil,`Layout carregado ${tela} ${width} recolhido`,async()=>{
   await p.setViewportSize({width,height:844});await ir(perfil,tela);await p.getByRole('button',{name:novo,exact:true}).click();await d().locator('input[name]').first().waitFor();
   if(tela==='catalogo')await d().locator('summary').filter({hasText:'Custos e margem (opcional)'}).waitFor();
   const v=await conferir();if(['retifica','assistencia_celulares','manutencao_climatizacao','limpeza_geral'].includes(perfil)&&[390,1920].includes(width))await p.screenshot({path:resolve(out,`${perfil}-${tela}-${width}.png`)});return v;
  });
  await teste(perfil,`Layout carregado ${tela} ${width} expandido`,async()=>{
   const summaries=d().locator('summary');for(let i=0;i<await summaries.count();i++){const s=summaries.nth(i);if(await s.locator('..').getAttribute('open')===null)await s.click()}
   if(tela==='catalogo'){await d().getByLabel('Como informar os custos',{exact:true}).selectOption('detalhado');for(let i=0;i<2;i++)await d().getByRole('button',{name:'Adicionar custo',exact:true}).click();await d().getByLabel('Descrição do custo 1',{exact:true}).fill('Material e insumos para executar o atendimento completo');}
   const v=await conferir();if(['assistencia_celulares','limpeza_geral'].includes(perfil)&&width===390)await p.screenshot({path:resolve(out,`${perfil}-${tela}-${width}-expandido.png`)});return v;
  });
  await d().getByRole('button',{name:'Fechar janela',exact:true}).click();await p.locator('dialog[open]').waitFor({state:'hidden'});
 }
}
