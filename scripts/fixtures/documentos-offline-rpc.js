// Somente a fixture usa este transporte; a aplicação continua com Supabase.
export async function rpc(nome,dados){
 const r=await fetch('/qa/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome,dados,perfil:new URLSearchParams(location.search).get('perfil')||'mecanica'})});
 const j=await r.json();if(!r.ok)throw j;return j;
}
