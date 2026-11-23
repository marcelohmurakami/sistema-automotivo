import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const pasta='backups/retifica-estacao-20261008';
const original=await readFile(`${pasta}/importar.sql`,'utf8');
const corpo=original.slice('begin;\n'.length).split('\ncommit;\n')[0];
const resumo=original.split('\ncommit;\n')[1];
const hash=createHash('md5').update(corpo).digest('hex');
const inicio=`create table if not exists private.migracao_retifica_lotes (parte integer primary key,conteudo text not null); alter table private.migracao_retifica_lotes enable row level security; revoke all on private.migracao_retifica_lotes from public,anon,authenticated;`;
const lotes=[];
for(let i=0;i<corpo.length;i+=180000){const parte=lotes.length;const trecho=corpo.slice(i,i+180000);lotes.push(`insert into private.migracao_retifica_lotes(parte,conteudo) values(${parte},convert_from(decode('${Buffer.from(trecho).toString('base64')}','base64'),'UTF8')) on conflict(parte) do update set conteudo=excluded.conteudo; select ${parte} lote_recebido;`);}
const final=`begin; do $migrar$ declare comando text; begin select string_agg(conteudo,'' order by parte) into comando from private.migracao_retifica_lotes; if (select count(*) from private.migracao_retifica_lotes)<>${lotes.length} or md5(comando)<>'${hash}' then raise exception 'Lotes incompletos ou divergentes'; end if; execute comando; end $migrar$; commit; ${resumo}`;
await writeFile(`${pasta}/lotes.json`,JSON.stringify({inicio,lotes,final,hash}));
console.log({lotes:lotes.length,hash});

