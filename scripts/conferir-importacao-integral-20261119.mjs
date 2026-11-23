import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import * as antes from '../output/revisao-integral-20261119/antes/src/lib/importacao.ts';
import * as depois from '../src/lib/importacao.ts';
let verificacoes=0;
const casos=[['1.234',123400],['12.345',1234500],['1.234.567',123456700],['1.234,56',123456],['1234.56',123456],['12,5',1250],['0',0],['0.01',1],['R$ 1.234',123400],['1.000.000',100000000]];
// O limite comercial permanece o mesmo: um milhão de reais por preço.
for(const [entrada,esperado] of casos){if(esperado>100000000)assert.throws(()=>depois.centavosBR(entrada));else assert.equal(depois.centavosBR(entrada),esperado);verificacoes++}
for(const entrada of ['-1','abc','1,234','12.34.56','1.000.000,01','1e3']){assert.throws(()=>depois.centavosBR(entrada));verificacoes++}
for(let i=0;i<1500;i++){const centavos=i*63731%100000000;for(const texto of [(centavos/100).toFixed(2),(centavos/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})]){assert.equal(depois.centavosBR(texto),centavos);verificacoes++}}
const csv='nome;observacoes\r\n"Cliente; teste";"linha 1\nlinha 2 e ""aspas"""\r\nOutro;""';
assert.deepEqual(depois.lerCSV(csv),antes.lerCSV(csv));verificacoes++;
for(const csv of ['nome\n"abc"def','nome\n"""','nome\n"abc','nome;nome\na;b','nome;email\na']){assert.throws(()=>depois.lerCSV(csv));verificacoes++}
const xml=data=>`<NFe><infNFe Id="NFe${'1'.repeat(44)}"><ide><mod>55</mod><dEmi>${data}</dEmi></ide><emit><xNome>Fornecedor de teste</xNome></emit><det><prod><qCom>1</qCom><vUnCom>10.00</vUnCom><vProd>10.00</vProd><xProd>Peça</xProd><uCom>un</uCom></prod></det><total><ICMSTot><vNF>10.00</vNF></ICMSTot></total></infNFe></NFe>`;
for(const data of ['2024-02-29','2026-11-19']){assert.deepEqual(depois.lerNFe(xml(data)),antes.lerNFe(xml(data)));verificacoes++}
for(const data of ['2026-02-29','2026-02-30','2026-13-01','2026-00-01']){assert.throws(()=>depois.lerNFe(xml(data)),/Data de emissão inválida/);verificacoes++}
assert.deepEqual(depois.prepararCadastros(depois.lerCSV('descricao;preco\nServiço;1.234'),'catalogo')[0].preco_padrao_centavos,123400);verificacoes++;
const resultado={verificacoes,regressoesReproduzidas:{precoMilharAntes:antes.centavosBR('1.234'),precoMilharDepois:depois.centavosBR('1.234'),csvInvalidoAntes:antes.lerCSV('nome\n"abc"def'),dataInvalidaAntes:antes.lerNFe(xml('2026-02-30')).data},escopo:'Parser local, sem gravar cadastros nem compras; preços em centavos, CSV e NF-e sintética.'};
await mkdir('output/revisao-integral-20261119/importacao',{recursive:true});
await writeFile('output/revisao-integral-20261119/importacao/resultado.json',JSON.stringify(resultado,null,2));console.log(resultado);
