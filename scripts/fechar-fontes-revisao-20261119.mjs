import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import prettier from 'prettier';
const root='output/revisao-integral-20261119',antes=root+'/antes',hash=b=>createHash('sha256').update(b).digest('hex');
const files=(await readdir('src',{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>resolve(e.parentPath,e.name));
const registros=[];
for(const full of files){const path=full.slice(process.cwd().length+1).replaceAll('\\','/');let atual=await readFile(full),original=await readFile(antes+'/'+path).catch(()=>null);
 if(original?.equals(atual))continue;
 if(/\.(tsx?|css)$/.test(path)){const options=await prettier.resolveConfig(full);await writeFile(full,await prettier.format(atual.toString(),{...options,filepath:full}));atual=await readFile(full);}
 registros.push({arquivo:path,antes:original?hash(original):null,depois:hash(atual)});
}
const originais=JSON.parse(await readFile(root+'/arquivos.json'));for(const {path} of originais)if(!(await readFile(path).catch(()=>null)))registros.push({arquivo:path,antes:hash(await readFile(antes+'/'+path)),depois:null});
await writeFile(root+'/alteracoes-finais.json',JSON.stringify(registros,null,2));
await mkdir(root+'/validacao-final',{recursive:true});
console.log('Arquivos alterados/adicionados/removidos:',registros.length);
