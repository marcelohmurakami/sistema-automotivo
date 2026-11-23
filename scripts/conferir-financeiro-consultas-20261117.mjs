import assert from 'node:assert/strict';
export async function conferirConsultas({p,medir,layout,base,automotivo,verificar}){
 await p.goto(base+'/financeiro',{waitUntil:'commit'});await p.locator('.fin-cartoes-caixa').waitFor();
 const tab=async(label,id)=>{
  const nav=p.getByRole('navigation',{name:'Visões do financeiro'}),b=nav.getByRole('button',{name:label,exact:true});
  if(await b.isVisible())return b.click();
  const mobile=p.getByRole('combobox',{name:'O que você quer consultar?',exact:true});
  return (await mobile.isVisible()?mobile:p.getByRole('combobox',{name:'Outras consultas do financeiro',exact:true})).selectOption(id);
 };
 for(const [label,id,ready] of (process.env.QA_TOTAIS?[]:[
  ['Resultado completo','resultado','.apuracao-demonstrativo'],
  ['Conciliação','conciliacao','.conciliacao .plano-lista'],
  ['Custos e margens','custos','.fin-ampliado .plano-lista'],
  ['Preço e hora','precos','.custo-config'],
  ...(automotivo?[['Por serviço','os','.fin-por-servico'],['Comissões','comissoes','.comissoes-totais']]:[['Cobranças de contratos','contratos','.cobrancas-contratos .plano-lista']]),
 ])){
  await medir('Consultar '+label,async()=>{await tab(label,id);await p.locator(ready).first().waitFor()});await layout(label);
  verificar('Sem erro na consulta '+label,await p.locator('main [role=alert]').count()===0);
 }
 for(const indicador of ['resultado','receitas','custos','saldo','entradas','saidas']){
  await tab('Resumo','visao');await p.locator('.fin-cartoes-caixa').waitFor();
  const indice=['resultado','receitas','custos','saldo','entradas','saidas'].indexOf(indicador);
  const totalResumo=await p.locator('.fin-cartoes article > strong').nth(indice).innerText();
  await medir('Detalhar '+indicador,async()=>{await p.getByRole('link',{name:'Ver histórico: '+indicador,exact:true}).click();await p.locator('.fin-hist-resumo').waitFor()});
  verificar('Total do histórico confere com resumo: '+indicador,(await p.locator('.fin-hist-total > strong').innerText())===totalResumo);
  await layout('Detalhe '+indicador);assert(await p.locator('.fin-hist-total').innerText());await p.locator('.fin-hist-voltar').click();await p.locator('.fin-cartoes-caixa').waitFor();
 }
}
