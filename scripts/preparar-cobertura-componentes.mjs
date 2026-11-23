import {build} from 'vite';
import {coberturaComponentes} from './lib/cobertura-componentes.mjs';
await build({logLevel:'error',plugins:[coberturaComponentes()],build:{outDir:'tmp/conferencia-componentes',emptyOutDir:true}});
