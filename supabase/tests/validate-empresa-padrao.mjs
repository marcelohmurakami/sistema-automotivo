import assert from 'node:assert/strict';
import {criarBancoLocal} from './banco-local.mjs';
const db=await criarBancoLocal('20261008000600');
const u='ef17b401-a899-4a48-9452-99b34f53bf6b';
try {
 await db.exec(`insert into auth.users(id) values('${u}');select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`);
 const primeira=(await db.query("select public.criar_oficina('AAA Testes',null) id")).rows[0].id;
 const segunda=(await db.query("select public.criar_oficina('Retífica real',null) id")).rows[0].id;
 await db.exec(`reset role;update public.membros_oficina set empresa_padrao=true where oficina_id='${segunda}' and usuario_id='${u}';set role authenticated;`);
 const acesso=(await db.query('select public.consultar_meu_acesso() dados')).rows[0].dados;
 assert.equal(acesso[0].id,segunda);assert.equal(acesso[0].padrao,true);
 assert.equal(acesso[1].id,primeira);
 await db.exec('reset role');
 await assert.rejects(()=>db.exec(`update public.membros_oficina set empresa_padrao=true where oficina_id='${primeira}' and usuario_id='${u}'`));
 console.log('PASS: empresa padrão vem antes da ordem alfabética; vínculo anterior preservado; apenas uma empresa padrão por usuário.');
}finally{await db.close();}
