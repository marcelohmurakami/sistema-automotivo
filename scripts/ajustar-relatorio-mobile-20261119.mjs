import {readFile,writeFile} from 'node:fs/promises';
const path='scripts/relatorio-revisao-integral-20261119.mjs';let s=await readFile(path,'utf8');
const css='@media screen and (max-width:700px){.tabela{overflow:visible}.tabela table{min-width:0;width:100%;display:block}.tabela thead{display:none}.tabela tbody{display:grid;gap:14px}.tabela tr{display:grid;grid-template-columns:1fr 1fr;border:1px solid #c9d8df;border-radius:8px;padding:12px;gap:10px;background:white}.tabela td{display:block;white-space:normal;border:0;padding:0;overflow-wrap:anywhere}.tabela td::before{content:attr(data-rotulo);display:block;font-size:11px;color:#536b77;font-weight:600}.tabela td:first-child,.tabela td:nth-child(2){font-weight:700}.tabela td:nth-child(7),.tabela td:nth-child(8){grid-column:1/-1}}';
if(!s.includes('content:attr(data-rotulo)'))s=s.replace('</style></head>',css+'</style></head>');
const js="for(const tabela of document.querySelectorAll('.tabela table')){const rotulos=[...tabela.querySelectorAll('thead th')].map(e=>e.textContent);for(const linha of tabela.querySelectorAll('tbody tr'))[...linha.children].forEach((celula,i)=>celula.dataset.rotulo=rotulos[i]);}";
if(!s.includes('celula.dataset.rotulo'))s=s.replace('const entradas=[...document.querySelectorAll',js+'\nconst entradas=[...document.querySelectorAll');
await writeFile(path,s);
