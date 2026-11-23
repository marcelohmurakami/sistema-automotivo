// Teste exclusivo de Auth: cria e remove SOMENTE uma conta fictícia nova.
// Segredos TOTP, senhas, chaves e sessões nunca são gravados nem impressos.
import assert from 'node:assert/strict';import{readFile,writeFile,mkdir}from'node:fs/promises';import{parseEnv}from'node:util';import{randomUUID,randomBytes,createHmac}from'node:crypto';import{createClient}from'@supabase/supabase-js';
if(!process.argv.includes('--executar'))throw Error('Use --executar para testar uma conta fictícia nova no projeto configurado.');
const cfg=parseEnv(await readFile('.env.local','utf8')),adminEnv=parseEnv(await readFile('output/contas-teste/admin.env.local','utf8'));
assert.equal(cfg.VITE_SUPABASE_URL,'https://hzihxtjirttetnfdujcx.supabase.co');const op={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(cfg.VITE_SUPABASE_URL,adminEnv.SUPABASE_SERVICE_ROLE_KEY,op),cliente=createClient(cfg.VITE_SUPABASE_URL,cfg.VITE_SUPABASE_PUBLISHABLE_KEY,op);
const bancoPublicado=process.argv.includes('--banco-publicado');
const email='qa-mfa-'+randomUUID()+'@example.test',password=randomBytes(32).toString('base64url');let usuario;const checks=[];
function dado(r,n){if(r.error)throw Error(n+' falhou ('+(r.error.code||r.error.status||'API')+').');checks.push(n);return r.data;}
function codigo(secret){const alfabeto='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+=alfabeto.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(b).digest(),o=h.at(-1)&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
try{
 usuario=dado(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa:'mfa-20261104'}}),'Conta fictícia criada').user.id;
 dado(await cliente.auth.signInWithPassword({email,password}),'Entrada inicial');
 const f=dado(await cliente.auth.mfa.enroll({factorType:'totp',friendlyName:'QA primário',issuer:'Pátio Gestão QA'}),'Preparação TOTP');
 const invalido=await cliente.auth.mfa.challengeAndVerify({factorId:f.id,code:'invalid'});assert(invalido.error);checks.push('Código inválido recusado');
 dado(await cliente.auth.mfa.challengeAndVerify({factorId:f.id,code:codigo(f.totp.secret)}),'Ativação com TOTP real');
 assert.equal(dado(await cliente.auth.mfa.getAuthenticatorAssuranceLevel(),'Verificação AAL2').currentLevel,'aal2');
 if(bancoPublicado)dado(await cliente.rpc('consultar_meu_acesso',{}),'RPC permitida após segundo fator');
 const reserva=dado(await cliente.auth.mfa.enroll({factorType:'totp',friendlyName:'QA reserva',issuer:'Pátio Gestão QA'}),'Autenticador reserva');dado(await cliente.auth.mfa.challengeAndVerify({factorId:reserva.id,code:codigo(reserva.totp.secret)}),'Confirmação da reserva');
 dado(await cliente.auth.signOut({scope:'local'}),'Saída');dado(await cliente.auth.signInWithPassword({email,password}),'Nova entrada');const aal=dado(await cliente.auth.mfa.getAuthenticatorAssuranceLevel(),'Exigência da segunda etapa');assert.equal(aal.currentLevel,'aal1');assert.equal(aal.nextLevel,'aal2');
 if(bancoPublicado){const bloqueio=await cliente.rpc('consultar_meu_acesso',{});assert.equal(bloqueio.error?.code,'PT403');checks.push('RPC real bloqueada enquanto AAL1');}
 dado(await cliente.auth.mfa.challengeAndVerify({factorId:reserva.id,code:codigo(reserva.totp.secret)}),'Recuperação com autenticador reserva');
 if(bancoPublicado)dado(await cliente.rpc('consultar_meu_acesso',{}),'RPC liberada após recuperar AAL2');
 dado(await cliente.auth.mfa.unenroll({factorId:f.id}),'Remoção autenticada do primeiro fator');dado(await cliente.auth.refreshSession(),'Atualização da sessão');
}catch(e){console.error(e.message);process.exitCode=1;}finally{
 if(usuario){await cliente.auth.signOut({scope:'global'});const r=await admin.auth.admin.deleteUser(usuario);if(r.error){console.error('A conta fictícia precisa de limpeza administrativa; não contém empresa nem dados de clientes.');process.exitCode=1;}else checks.push('Conta fictícia removida');}
 await mkdir('output/dados-seguranca-20261104',{recursive:true});await writeFile('output/dados-seguranca-20261104/'+(bancoPublicado?'mfa-publicado.json':'mfa-provedor.json'),JSON.stringify({ok:!process.exitCode,checks,ambiente:'Supabase Auth real; conta nova e fictícia sem empresa'},null,2));console.log('MFA:',!process.exitCode?'PASS':'FALHOU',checks.length,'verificações');
}
