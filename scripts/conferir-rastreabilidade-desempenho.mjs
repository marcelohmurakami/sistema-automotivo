import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const out=resolve(process.env.QA_OUTPUT || 'output/desempenho-20261111');
const ler = async path => JSON.parse(await readFile(path, 'utf8'));
const resultado = [];
for (const [fase, pasta] of [['antes', resolve(out, 'baseline')], ['depois', resolve('.')]]) {
  const inventario = await ler(resolve(out, fase + '.json'));
  for (const file of inventario.arquivos) {
    const sha256 = createHash('sha256').update(await readFile(resolve(pasta, file.arquivo))).digest('hex');
    assert.equal(sha256, file.sha256, `${fase}: ${file.arquivo}`);
  }
  resultado.push({fase, arquivos: inventario.arquivos.length, hashesConferidos: true});
}
const pacote = await ler(resolve(out, 'pacote-publicacao.json'));
for (const file of pacote.arquivos) {
  const sha256 = createHash('sha256').update(await readFile(resolve(pacote.destino, file.arquivo))).digest('hex');
  assert.equal(sha256, file.sha256, file.arquivo);
}
assert.equal((await ler('dist/health.json')).build, pacote.build);
await writeFile(resolve(out, 'rastreabilidade.json'), JSON.stringify({ok: true, inventarios: resultado, build: pacote.build, arquivosPublicacao: pacote.arquivos.length}, null, 2));
console.log('PASS: hashes do baseline, código final e pacote de publicação.');
