import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,preview} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {chromium} from 'playwright';
const out=resolve('output/revisao-integral-20261119/garantia-causa'),resultados=[],erros=[],servers={};await mkdir(out,{recursive:true});
const anterior=await readFile(resolve(out,'QualidadeAvancada-antes.tsx'),'utf8'),alvo=resolve('src/pages/QualidadeAvancada.tsx').replaceAll('\\','/');
for(const fase of ['antes','depois']){
 const config={configFile:false,envDir:false,logLevel:'error',plugins:[...(fase==='antes'?[{name:'garantia-antes',enforce:'pre',load(id){if(id.replaceAll('\\','/').split('?')[0]===alvo)return anterior}}]:[]),react(),tailwindcss()],define:{'import.meta.env.VITE_SUPABASE_URL':'window.location.origin','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('qa-ficticio')},build:{outDir:resolve(out,'build-'+fase),rollupOptions:{input:'scripts/fixtures/garantia-abertura.html'}}};
 await build(config);servers[fase]=await preview({...config,preview:{host:'127.0.0.1',port:0}});
}
const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{for(const width of [1920,390])for(const ramo of ['automotivo','assistencia_tecnica','manutencao_campo','limpeza'])for(let rodada=0;rodada<3;rodada++)for(const fase of rodada%2?['depois','antes']:['antes','depois']){
 const ctx=await b.newContext({viewport:{width,height:900},locale:'pt-BR'}),p=await ctx.newPage(),base=servers[fase].resolvedUrls.local[0];let consultas=0;
 p.on('pageerror',e=>erros.push(e.message));if(width===390)await(await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate',{rate:4});
 await p.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==new URL(base).origin)return r.abort();if(u.pathname.startsWith('/rest/')){consultas++;await new Promise(x=>setTimeout(x,80));if(u.pathname.endsWith('consultar_qualidade'))return r.fulfill({json:{ocorrencias:[]}});if(u.pathname.endsWith('consultar_relatorios_servicos'))return r.fulfill({json:{qualidade:[],detalhes:[],abertos:[],agenda:[],titulos:[],baixas:[],estoque:[],devedores:[],agora:'2026-11-19T12:00:00Z'}});throw Error('RPC inesperada '+u.pathname)}return r.continue()});
 await p.goto(base+'scripts/fixtures/garantia-abertura.html?ramo='+ramo);await p.getByText('Aguardando liberação').waitFor();assert.equal(consultas,0);
 const resposta=p.waitForResponse(r=>r.url().includes('/rest/v1/rpc/'));await p.evaluate(()=>window.qa.liberar());await(await resposta).finished();await p.locator('.qserv').waitFor();await p.evaluate(()=>new Promise(requestAnimationFrame));
 const medidas=await p.evaluate(()=>{const rpc=performance.getEntriesByType('resource').find(x=>x.name.includes('/rest/v1/rpc/'));return {inicioConsulta:rpc.startTime-window.qa.inicio,tempoCompleto:performance.now()-window.qa.inicio,rpcMs:rpc.duration,excessoHorizontal:document.documentElement.scrollWidth-innerWidth}});
 assert.equal(consultas,1);assert(medidas.excessoHorizontal<=2);resultados.push({fase,width,ramo,rodada,...medidas});assert.deepEqual(erros,[]);await ctx.close();
}console.log(JSON.stringify({casos:resultados.length,erros}));}finally{await b.close();for(const s of Object.values(servers)){s.httpServer.closeAllConnections();await new Promise(r=>s.httpServer.close(r))}await writeFile(resolve(out,'resultados.json'),JSON.stringify({metodo:'Componente real QualidadeAvancada e aba inicial, dois limites CarregamentoPagina; API local fixa em 80ms. Antes e depois alternados em quatro ramos, três rodadas, 1920 e 390 CPU4x. Isola a etapa de carregamento adicional; não mede banco remoto.',resultados,erros},null,2));}
