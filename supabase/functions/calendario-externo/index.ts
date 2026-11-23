import {createClient} from 'npm:@supabase/supabase-js@2';
import {gerarIcal} from './ical.mjs';
const headers={'Content-Type':'text/calendar; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="agenda.ics"','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'*'};
Deno.serve(async(req:Request)=>{
 if(!['GET','HEAD'].includes(req.method))return new Response('Método não permitido',{status:405,headers:{...headers,'Allow':'GET, HEAD'}});
 const token=new URL(req.url).searchParams.get('token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return new Response('Agenda indisponível',{status:404,headers});
 try{
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data,error}=await db.rpc('exportar_calendario',{p_token:token}).abortSignal(AbortSignal.timeout(12000));
 if(error)return new Response(error.code==='54000'?'Divida a agenda por equipe.':'Agenda indisponível',{status:error.code==='P0002'?404:503,headers});
 return new Response(req.method==='HEAD'?null:gerarIcal(data),{headers});
 }catch{return new Response('Agenda temporariamente indisponível',{status:503,headers});}
});
