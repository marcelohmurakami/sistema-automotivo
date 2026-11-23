import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import * as antes from '../output/revisao-integral-20261119/antes/src/lib/produtividadeEquipe.ts';
import * as depois from '../src/lib/produtividadeEquipe.ts';
let verificacoes=0;
const datas=['','invalida','2000-02-29','2024-02-29','2018-11-04T02:59:00Z','2018-11-04T03:01:00Z',...Array.from({length:160},(_,i)=>new Date(Date.UTC(2026,0,1)+i*9876543).toISOString())];
for(const fuso of ['America/Sao_Paulo','UTC','America/Manaus','Asia/Tokyo','America/New_York']){
 process.env.TZ=fuso;
 for(const data of datas)for(const fn of ['dataEquipe','horarioEquipe']){assert.equal(depois[fn](data),antes[fn](data),fn+' '+fuso+' '+data);verificacoes++}
 assert.deepEqual(depois.mesEquipe(),antes.mesEquipe());verificacoes++;
}
const resultado={verificacoes,datas:datas.length,fusos:5,escopo:'Equivalência de data e hora da equipe, incluindo data inválida, ano bissexto e histórico de horário de verão; não mede tempo de tela.'};
await mkdir('output/revisao-integral-20261119/formatacao-equipe',{recursive:true});await writeFile('output/revisao-integral-20261119/formatacao-equipe/resultado.json',JSON.stringify(resultado,null,2));console.log(resultado);
