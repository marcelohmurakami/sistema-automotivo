// Exclusivo da bancada local: nenhuma URL/chave de produção é aceita.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export async function conectarPostgresLocal(banco=process.env.DB_VALIDATION_PG_DATABASE||'patio_qa'){
 if(!/^patio_qa[a-z0-9_]*$/.test(banco))throw Error('Use somente um banco de teste isolado.');
 const porta=Number(process.env.DB_VALIDATION_PG_PORT||55434);
 if(porta!==55434)throw Error('Porta exclusiva da bancada: 55434.');
 const child=spawn('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-q','-t','-A','-h','127.0.0.1','-p',String(porta),'-U','patio_qa','-d',banco],{windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'}});
 let buffer='',err='',espera=null,fila=Promise.resolve();
 child.stderr.on('data',c=>{err+=c.toString();});
 child.stdout.on('data',c=>{buffer+=c.toString();if(espera){const p=buffer.indexOf(espera.marca);if(p>=0&&buffer.indexOf('\n',p)>=0){const linha=buffer.slice(p).split('\n')[0],texto=buffer.slice(0,p);buffer=buffer.slice(p+linha.length+1);const e=espera;espera=null;const code=linha.split(' ')[1]?.trim();if(code!=='00000'){const erro=Error(err.trim()||`SQL ${code}`);erro.code=code;e.reject(erro);}else e.resolve(texto);err='';}}});
 child.on('error',e=>espera?.reject(e));child.on('exit',()=>{if(espera){espera.reject(Error('PostgreSQL local encerrou.'));espera=null;}});
 function literal(v){if(v===null||v===undefined)return 'null';if(typeof v==='number')return String(v);if(typeof v==='boolean')return String(v);const t='qa'+randomUUID().replaceAll('-','');return '$'+t+'$'+(typeof v==='object'?JSON.stringify(v):String(v))+'$'+t+'$';}
 function executar(sql,args=[],json=false){const tarefa=fila.then(()=>new Promise((resolve,reject)=>{const marca='QA_END_'+randomUUID();const texto=(args.length?sql.replace(/\$(\d+)\b/g,(_,n)=>literal(args[Number(n)-1])):sql).replace(/;\s*$/,'');espera={marca,resolve,reject};child.stdin.write((json?'select row_to_json(qa_resultado) from ('+texto+') qa_resultado':texto)+';\n\\echo '+marca+' :SQLSTATE\n');}));fila=tarefa.catch(()=>{});return tarefa;}
 await executar("set client_min_messages='warning'");
 return {exec:sql=>executar(sql),query:async(sql,args=[])=>({rows:(await executar(sql,args,/^\s*(select|with)\b/i.test(sql))).trim().split('\n').filter(x=>x.trim().startsWith('{')).map(x=>JSON.parse(x))}),close:async()=>{await fila;child.stdin.end('\\q\n');}};
}
