import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const fases=[
 {QA_FASE:'depois-repeticao-26'},
 {QA_FASE:'depois-rede-limitada',QA_PERFIS:'retifica,assistencia_celulares,manutencao_climatizacao,limpeza_residencial',QA_REDE_LENTA:'1'},
 {QA_FASE:'depois-pwa',QA_PERFIS:'retifica,assistencia_celulares,manutencao_climatizacao,limpeza_residencial',QA_SW:'1',QA_CAPTURA_LONGA:'1'},
];
for(const fase of fases){
 console.log('INICIANDO',fase.QA_FASE);
 const codigo=await new Promise((r,reject)=>{const p=spawn(process.execPath,['scripts/investigar-abertura-20261117.mjs'],{windowsHide:true,stdio:'inherit',env:{...process.env,QA_BUILD:'output/picos-abertura-20261117/build-depois',QA_ROTAS:'/',...fase}});p.on('error',reject);p.on('exit',r)});
 assert.equal(codigo,0,fase.QA_FASE);
}
