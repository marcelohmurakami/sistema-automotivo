import assert from 'node:assert/strict';
import {test} from 'node:test';
import {erroEntrada} from '../src/auth/erroEntrada.ts';
test('falha temporária não acusa senha incorreta nem expõe detalhes internos',()=>{
 for(const e of [{status:500,message:'secret database detail'},{status:503},{status:504},{name:'AuthRetryableFetchError'},new TypeError('Failed to fetch'),null,{}]){
  const m=erroEntrada(e);assert(!/senha|secret|database/.test(m));assert(/conexão|temporariamente/.test(m));
 }
});
test('credencial inválida continua com mensagem genérica sem revelar a existência da conta',()=>{
 assert.equal(erroEntrada({code:'invalid_credentials',status:400}),'Não foi possível entrar. Confira seu e-mail e senha.');
});
test('limite de tentativas orienta aguardar; confirmação de e-mail é explícita',()=>{
 for(const e of [{status:429},{code:'over_request_rate_limit'}])assert.match(erroEntrada(e),/Muitas tentativas/);
 assert.match(erroEntrada({code:'email_not_confirmed'}),/Confirme seu e-mail/);
});
