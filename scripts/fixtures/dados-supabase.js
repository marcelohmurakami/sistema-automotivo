import{rpc}from'./dados-rpc.js';let fatores=[];
const clientes=[{id:'c1',nome:'Cliente QA',telefone_e164:null,email:null}],veiculos=[{id:'v1',modelo:'Veículo QA',marca:null,placa:null,ano_modelo:null}],vinculos=[{cliente_id:'c1',veiculo_id:'v1'}];
export const erroPublico=e=>e.message||'Falha simulada';
export const supabase={rpc:async(n,a)=>{try{return{data:await rpc(n,a)}}catch(error){return{error}}},auth:{refreshSession:async()=>({}),mfa:{
 listFactors:async()=>({data:{totp:fatores}}),getAuthenticatorAssuranceLevel:async()=>({data:{nextLevel:fatores.length?'aal2':'aal1',currentLevel:'aal1'}}),
 enroll:async()=>({data:{id:'factor',totp:{uri:'otpauth://totp/QA-FICTICIO?secret=JBSWY3DPEHPK3PXP&issuer=QA',secret:'FICTICIO',qr:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100"/%3E%3C/svg%3E'}}}),
 challengeAndVerify:async({code})=>code==='123456'?(fatores=[{id:'factor',friendly_name:'Autenticador QA'}],{}):{error:Error('Código inválido')},unenroll:async()=>{fatores=[];return{};}
 }},from:t=>{const c={then:f=>Promise.resolve({data:({clientes,veiculos,clientes_veiculos:vinculos})[t]||[]}).then(f)};for(const k of ['select','eq','is','order','range','limit'])c[k]=()=>c;return c;},storage:{from:()=>({upload:async()=>({}),download:async()=>({data:new Blob(['arquivo fictício'])})})}};
