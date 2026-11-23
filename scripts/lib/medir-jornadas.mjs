// Instrumentação somente da bancada. Não é importada pelo aplicativo nem registra valores digitados.
import {writeFile,mkdir} from 'node:fs/promises';import {dirname} from 'node:path';
const resultados=[];let atual=null,gravacao=Promise.resolve();
const arquivo=process.env.QA_JORNADAS_FILE;
const metodos={click:'cliques',dblclick:'duplosCliques',check:'marcacoes',uncheck:'marcacoes',selectOption:'selecoes',fill:'camposPreenchidos',press:'teclas',pressSequentially:'sequenciasDigitadas',setInputFiles:'arquivosSelecionados'};
const simbolo=Symbol.for('qa.medicao.jornadas');
function persistir(){if(!arquivo)return;gravacao=gravacao.then(async()=>{await mkdir(dirname(arquivo),{recursive:true});await writeFile(arquivo,JSON.stringify({geradoEm:new Date().toISOString(),metodo:'Execução automatizada. Tempo do início declarado até a condição final verificada; contém espera de interface e validações do teste. Digitação via fill não representa digitação humana. Contagens são chamadas às operações públicas do Playwright, não pixels ou conteúdo digitado.',resultados},null,2))});}
export function instrumentarJornadas(page){
 const p=Object.getPrototypeOf(page.locator('body'));if(p[simbolo])return;
 Object.defineProperty(p,simbolo,{value:true});
 for(const [metodo,campo]of Object.entries(metodos)){const original=p[metodo];if(typeof original!=='function')continue;p[metodo]=async function(...args){const a=atual,inicio=performance.now();if(a){a.acoes++;a[campo]=(a[campo]||0)+1;}try{return await original.apply(this,args)}finally{if(a){const ms=performance.now()-inicio;a.tempoAcoesMs+=ms;a.passos.push({operacao:metodo,localizador:this.toString(),segundos:Number((ms/1000).toFixed(3))});}}}}
}
export function iniciarJornada(nome,perfil='',detalhes={}){
 if(!arquivo)return;
 if(atual){resultados.push({...atual,ok:false,erro:'Jornada anterior não encerrada',inicio:undefined});persistir()}
 atual={nome,perfil,...detalhes,inicio:performance.now(),acoes:0,cliques:0,camposPreenchidos:0,marcacoes:0,selecoes:0,teclas:0,arquivosSelecionados:0,tempoAcoesMs:0,passos:[]};
}
export function concluirJornada(detalhes={}){
 if(!atual)return;const r={...atual,...detalhes,segundos:Number(((performance.now()-atual.inicio)/1000).toFixed(3)),tempoAcoesSegundos:Number((atual.tempoAcoesMs/1000).toFixed(3)),ok:detalhes.ok!==false};delete r.inicio;delete r.tempoAcoesMs;atual=null;resultados.push(r);persistir();return r;
}
export async function finalizarJornadas(){if(atual){resultados.push({...atual,ok:false,erro:'Teste encerrou antes da condição final',inicio:undefined});atual=null;persistir()}await gravacao;return resultados}
