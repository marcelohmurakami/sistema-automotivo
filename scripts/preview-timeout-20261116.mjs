import {preview} from 'vite';
import {resolve} from 'node:path';
const server=await preview({build:{outDir:resolve('output/timeouts-concorrencia-26-20261116/build-timeout')},preview:{host:'127.0.0.1',port:5186,strictPort:true}});
console.log(server.resolvedUrls.local[0]);
