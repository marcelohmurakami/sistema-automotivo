import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, cp, readdir} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {createHash} from 'node:crypto';

const out = resolve('output/desempenho-20261111');
const ler = async path => JSON.parse(await readFile(path, 'utf8'));
const ui = await ler(resolve(out, 'interface-final/resultados.json'));
assert(ui.ok && new Set(ui.resultados.map(x => x.perfil)).size === 26);
for (const file of ['atualizacao-cache.json', 'banco-recorrencias.json', 'pecas/resultados.json', 'formatadores.json']) {
  assert((await ler(resolve(out, file))).ok, file);
}
const regressao = await ler('output/validacao-refatoracao-atual/resultado.json');
assert(regressao.resultados.length >= 223 && regressao.resultados.every(x => x.sucesso));
assert((await readFile(resolve(out, 'build-final.log'), 'utf8')).includes('built in'));
assert(!(await readFile(resolve(out, 'tipos-final.log'), 'utf8')).trim());
const health = await ler('dist/health.json');
assert.equal((await ler(resolve(out, 'atualizacao-cache.json'))).cache, 'patio-static-' + health.build);
const destino = resolve(out, 'deploy', 'patio-gestao-' + health.build);
const projeto = await ler('output/sites-demonstracao-20261110/deploy/patio-gestao-1275801211/.vercel/project.json');
assert.equal(projeto.projectId, 'prj_AXSmqeI5GqSk4xt8P67S4BqSK35v');
assert.equal(projeto.orgId, 'team_oN63S4DIgIX5oqq4avVbfx1R');
await mkdir(destino, {recursive: true});
await cp('dist', destino, {recursive: true});
await mkdir(resolve(destino, '.vercel'), {recursive: true});
await writeFile(resolve(destino, '.vercel/project.json'), JSON.stringify(projeto, null, 2));
const config = await ler('vercel.json');
await writeFile(resolve(destino, 'vercel.json'), JSON.stringify({framework: null, buildCommand: '', installCommand: '', outputDirectory: '.', rewrites: config.rewrites, headers: config.headers}, null, 2));
const arquivos = [];
async function conferir(dir) {
  for (const item of await readdir(dir, {withFileTypes: true})) {
    assert(!item.isSymbolicLink());
    const path = resolve(dir, item.name);
    if (item.isDirectory()) await conferir(path);
    else {
      const arquivo = relative(destino, path).replaceAll('\\', '/');
      assert(!/(^|\/)(\.env|credenciais|admin\.env|node_modules|supabase|src|acessos)([./]|$)/.test(arquivo));
      arquivos.push({arquivo, sha256: createHash('sha256').update(await readFile(path)).digest('hex')});
    }
  }
}
await conferir(destino);
await writeFile(resolve(out, 'pacote-publicacao.json'), JSON.stringify({destino, build: health.build, arquivos}, null, 2));
console.log(JSON.stringify({destino, build: health.build, arquivos: arquivos.length}));
