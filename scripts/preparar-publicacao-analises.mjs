import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

const pasta = 'output/relatorios-avancados-20261102';
const destino = resolve(pasta, 'deploy/patio-gestao');
const ler = async (p) => JSON.parse(await readFile(p, 'utf8'));
const hash = (b) => createHash('sha256').update(b).digest('hex');
const analises = await ler(pasta + '/artefato.json');
const equipe = await ler('output/auditoria-equipe-20261030/alteracoes.json');
for (const f of [...analises.arquivos, ...equipe.arquivos]) {
  assert.equal(hash(await readFile(f.arquivo)), f.sha256, 'Arquivo mudou após validação: ' + f.arquivo);
}
const health = await ler('dist/health.json');
assert.equal(health.build, analises.build);
const projeto = await ler('output/revisao-os-layout-20261030/deploy/patio-gestao/.vercel/project.json');
assert.equal(projeto.projectId, 'prj_AXSmqeI5GqSk4xt8P67S4BqSK35v');
assert.equal(projeto.orgId, 'team_oN63S4DIgIX5oqq4avVbfx1R');
await mkdir(destino, { recursive: true });
await cp('dist', destino, { recursive: true });
await mkdir(resolve(destino, '.vercel'), { recursive: true });
await writeFile(resolve(destino, '.vercel/project.json'), JSON.stringify(projeto, null, 2));
const config = await ler('vercel.json');
await writeFile(resolve(destino, 'vercel.json'), JSON.stringify({ framework: null, buildCommand: '', installCommand: '', outputDirectory: '.', rewrites: config.rewrites, headers: config.headers }, null, 2));
const arquivos = [];
async function percorrer(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    assert(!e.isSymbolicLink(), 'Link inesperado no artefato');
    if (e.isDirectory()) await percorrer(p);
    else {
      const arquivo = relative(destino, p).replaceAll('\\', '/');
      assert(!/(^|\/)(\.env|credenciais|admin\.env|node_modules|supabase|src)([./]|$)/.test(arquivo), 'Arquivo privado no pacote');
      arquivos.push({ arquivo, sha256: hash(await readFile(p)) });
    }
  }
}
await percorrer(destino);
await writeFile(pasta + '/pacote-publicacao.json', JSON.stringify({ preparado_em: new Date().toISOString(), publicado: false, build: health.build, projeto: projeto.projectId, destino, arquivos }, null, 2));
console.log(JSON.stringify({ preparado: true, publicado: false, build: health.build, arquivos: arquivos.length }));
