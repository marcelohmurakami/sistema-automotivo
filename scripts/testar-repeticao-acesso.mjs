import assert from 'node:assert/strict';
import {test} from 'node:test';
import {repetirConsultaAcesso} from '../src/auth/repeticaoConsultaAcesso.ts';
import {PostgrestClient} from '@supabase/postgrest-js';
test('consulta repete no máximo duas vezes apenas falhas temporárias',()=>{
 for(const erro of [{status:500},{status:503},{status:429},{code:'PGRST003'},{code:'57014'},new TypeError('Failed to fetch'),{name:'TimeoutError'},{name:'AuthRetryableFetchError'}]){
  assert(repetirConsultaAcesso(0,erro));assert(repetirConsultaAcesso(1,erro));assert(!repetirConsultaAcesso(2,erro));
 }
});
test('negação, token inválido e erros desconhecidos nunca usam permissão antiga',()=>{
 for(const erro of [{status:401},{status:403},{code:'42501',status:500},{code:'PT403'},{code:'PGRST301'},{code:'PGRST302'},{code:'PGRST303'},null,undefined,'erro',{},new Error('Invalid JWT')])assert(!repetirConsultaAcesso(0,erro));
});
test('timeout transformado pelo cliente PostgREST continua sendo falha temporária de leitura',async()=>{
 for(const nome of ['TimeoutError','AbortError']){
  const cliente=new PostgrestClient('https://qa.invalid',{fetch:async()=>{throw new DOMException('Tempo de resposta esgotado',nome)}});
  const {error,status}=await cliente.rpc('consultar_meu_acesso').retry(false);
  assert.equal(status,0);assert.equal(error.name,undefined);
  const erro=Object.assign(error,{status});
  assert(repetirConsultaAcesso(0,erro));assert(repetirConsultaAcesso(1,erro));assert(!repetirConsultaAcesso(2,erro));
  assert(!repetirConsultaAcesso(0,{...erro,code:'42501',status:403}));
 }
});
