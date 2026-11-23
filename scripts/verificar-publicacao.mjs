// Sonda somente leitura. Executar após a configuração externa e a publicação.
const alvo=process.argv[2];let url;
try{url=new URL(alvo);}catch{throw Error('Informe a origem HTTPS publicada.');}
if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Use somente a origem HTTPS, sem credenciais ou parâmetros.');
for(const caminho of ['/health.json','/entrar','/recuperar-senha','/ajuda']){
 const resposta=await fetch(new URL(caminho,url),{signal:AbortSignal.timeout(15000),redirect:'error',headers:{'Cache-Control':'no-cache'}});
 if(!resposta.ok)throw Error(`Falha HTTP ${resposta.status} em ${caminho}`);
 if(caminho==='/health.json'){const h=await resposta.json();if(h.status!=='ok'||!h.build)throw Error('Build não identificado.');console.log('Build disponível:',h.build);}
 else if(!(await resposta.text()).includes('id="root"'))throw Error(`Fallback da aplicação ausente em ${caminho}`);
 console.log('OK',caminho);
}
console.log('Rotas públicas disponíveis. Login, e-mail e cobrança ainda exigem os ensaios do ambiente configurado.');
