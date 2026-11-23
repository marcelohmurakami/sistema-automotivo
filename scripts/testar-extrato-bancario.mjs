import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({configFile:false,envDir:false,cacheDir:'output/.vite-extrato',server:{middlewareMode:true,hmr:false,ws:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try{
 const {lerExtrato,lerCsvExtrato,detectarColunasExtrato}=await server.ssrLoadModule('/src/lib/extratoBancario.ts');
 assert.deepEqual(detectarColunasExtrato(['Identificador','Valor (R$)','Histórico','Data']),{id:0,valor:1,descricao:2,data:3});
 assert.equal(detectarColunasExtrato(['Desconhecida']).valor,-1);
 const col={data:0,descricao:1,valor:2,id:3};
 const csv='Data;Descrição;Valor;ID\r\n01/10/2026;"Recebimento; João";1.234,56;abc\r\n02/10/2026;"Peças ""especiais""";-25,10;def';
 const r=await lerExtrato(csv,col);assert.deepEqual(r.linhas.map(x=>x.valor),[123456,-2510]);assert.equal(r.linhas[1].descricao,'Peças "especiais"');assert.equal(r.linhas[0].data,'2026-10-01');
 const ofx=(rows,currency='BRL')=>`OFXHEADER:100\n<OFX><STMTRS><CURDEF>${currency}<BANKACCTFROM><BANKID>123<ACCTID>456</BANKACCTFROM><BANKTRANLIST>${rows}</BANKTRANLIST></STMTRS></OFX>`;
 const row=(id='abc',amount='1234.56',dt='20261001120000[-3:BRT]')=>`<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${dt}<TRNAMT>${amount}<FITID>${id}<MEMO>Recebimento &amp; nota</STMTTRN>`;
 const ox=await lerExtrato(ofx(row()));assert.equal(ox.linhas[0].valor,123456);assert.equal(ox.conta,'456');assert.equal(ox.linhas[0].descricao,'Recebimento & nota');assert.equal(ox.linhas[0].identificador,r.linhas[0].identificador);
 for(const [text,c] of [[ofx(row(),'USD')],[ofx(row()+row())],[ofx(row('x','0'))],[ofx(row('x','1.001'))],[ofx(row('x','1','20260230'))],['<!DOCTYPE OFX [<!ENTITY x SYSTEM "file:///x">]>'+ofx(row())],['Data;Desc;Valor;ID\n29/02/2025;Erro;10,00;abc',col],['Data;Desc;Valor;ID\n01/01/2026;Erro;=1+2;abc',col]])await assert.rejects(()=>lerExtrato(text,c));
 assert.throws(()=>lerCsvExtrato('a;b\n"sem fechar;b'));
 assert.throws(()=>lerCsvExtrato('a;b\n1;2;3'));
 assert.deepEqual(lerCsvExtrato('a,b,c\n"uma\nlinha",2,3'),[['a','b','c'],['uma\nlinha','2','3']]);
 const sem='Data;Descrição;Valor\n01/10/2026;PIX;100,00\n01/10/2026;PIX;100,00';
 const duplicados=await lerExtrato(sem,{...col,id:-1});assert.equal(duplicados.semIdentificador,true);assert.notEqual(duplicados.linhas[0].identificador,duplicados.linhas[1].identificador);assert.deepEqual(await lerExtrato(sem,{...col,id:-1}),duplicados);
 await assert.rejects(()=>lerExtrato('a'.repeat(2*1024*1024+1)));
 await assert.rejects(()=>lerExtrato(ofx(row().replace('<MEMO>','<CORRECTFITID>antigo<CORRECTACTION>REPLACE<MEMO>'))));
 await assert.rejects(()=>lerExtrato(ofx(row()).replaceAll('BANKACCTFROM','CCACCTFROM')));
 console.log('PASS extratos: CSV/OFX, reais, decimais, data, aspas, identificadores, limites e conteúdo inválido.');
}finally{await server.close();}
