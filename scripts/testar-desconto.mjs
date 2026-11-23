import assert from 'node:assert/strict';
import {test} from 'node:test';
import {descontoInicial,calcularDesconto,alternarTipoDesconto,estadoDescontoValido} from '../src/lib/desconto.ts';

test('novos registros usam porcentagem; desconto antigo mantém o valor exato',()=>{
 assert.deepEqual(descontoInicial(),{tipo:'percentual',valor:0});
 assert.equal(descontoInicial(1001).tipo,'valor');
 assert.equal(calcularDesconto(descontoInicial(1001),30000),1001);
});
test('porcentagem acompanha o subtotal; desconto em reais continua fixo',()=>{
 const percentual={tipo:'percentual',valor:10};
 assert.equal(calcularDesconto(percentual,30000),3000);
 assert.equal(calcularDesconto(percentual,60000),6000);
 assert.equal(calcularDesconto({tipo:'valor',valor:30},60000),3000);
});
test('percentuais fracionados arredondam uma vez para centavos',()=>{
 assert.equal(calcularDesconto({tipo:'percentual',valor:12.5},19999),2500);
 assert.equal(calcularDesconto({tipo:'percentual',valor:0.5},1),0);
 assert.equal(calcularDesconto({tipo:'percentual',valor:50},1),1);
 assert.equal(calcularDesconto({tipo:'percentual',valor:1.15},1000),12);
 assert.equal(calcularDesconto({tipo:'percentual',valor:99.99},1000000000000000),999900000000000);
});
test('zero, campo vazio, subtotal zero e desconto integral',()=>{
 assert.equal(calcularDesconto({tipo:'percentual',valor:''},40000),0);
 assert.equal(calcularDesconto({tipo:'valor',valor:''},40000),0);
 assert.equal(calcularDesconto({tipo:'percentual',valor:10},0),0);
 assert.equal(calcularDesconto({tipo:'percentual',valor:100},19999),19999);
});
test('alternar unidades não muda centavos por arredondamento',()=>{
 for(const [subtotal,centavos] of [[30000,1001],[99999999,1234567],[1,1],[19999,17]]){
  const convertido=alternarTipoDesconto(descontoInicial(centavos),'percentual',subtotal);
  assert.equal(calcularDesconto(convertido,subtotal),centavos);
  assert.equal(calcularDesconto(alternarTipoDesconto(convertido,'valor',subtotal),subtotal),centavos);
 }
});
test('após mudar o subtotal usa o percentual escolhido',()=>{
 const convertido=alternarTipoDesconto(descontoInicial(1001),'percentual',30000);
 assert.equal(convertido.valor,3.34);
 assert.equal(calcularDesconto(convertido,60000),2004);
});
test('rascunho preserva a unidade e o valor convertido',()=>{
 const estado=alternarTipoDesconto(descontoInicial(1001),'percentual',30000);
 const recuperado=JSON.parse(JSON.stringify(estado));
 assert(estadoDescontoValido(recuperado));
 assert.equal(calcularDesconto(recuperado,30000),1001);
 for(const invalido of [null,{}, {tipo:'x',valor:10},{tipo:'percentual',valor:101},{tipo:'valor',valor:-1},{tipo:'valor',valor:NaN},{tipo:'percentual',valor:10,convertido:{subtotal:100,centavos:101}}])assert(!estadoDescontoValido(invalido));
});
