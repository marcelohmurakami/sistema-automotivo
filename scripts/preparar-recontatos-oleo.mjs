import { readFile, writeFile } from 'node:fs/promises';
const w=JSON.parse(await readFile('n8n/workflows/01-avisos-automotivo.json','utf8'));
w.name='Troca de óleo - Sugestões de recontato';w.active=false;
const antigo='Gerar lembretes e processar avisos autorizados',novo='Preparar uma sugestão para revisão';
for(const n of w.nodes){
 if(n.name===antigo){n.name=novo;n.parameters.url='https://hzihxtjirttetnfdujcx.supabase.co/functions/v1/recontatos-oleo';}
}
w.connections=JSON.parse(JSON.stringify(w.connections).replaceAll(antigo,novo));
await writeFile('n8n/workflows/02-recontatos-troca-oleo.json',JSON.stringify(w,null,2)+'\n');
