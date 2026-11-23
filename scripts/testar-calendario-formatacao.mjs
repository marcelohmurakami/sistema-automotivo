import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {horaAgenda, diaAgenda} from '../src/lib/calendarioAgenda.ts';

const horaAnterior = (s, timeZone) => new Date(s).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', timeZone});
const diaAnterior = (s, timeZone) => new Intl.DateTimeFormat('sv-SE', {timeZone}).format(new Date(s));
const datas = Array.from({length:160}, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 5 * 86400000 + (i % 24) * 3600000).toISOString());
const zonas = [undefined, 'America/Sao_Paulo', 'UTC', 'America/New_York', 'Pacific/Auckland'];
let verificacoes = 0;
for (const zona of zonas) for (const data of datas) {
  assert.equal(horaAgenda(data, zona), horaAnterior(data, zona)); verificacoes++;
  if (zona) {assert.equal(diaAgenda(data, zona), diaAnterior(data, zona)); verificacoes++;}
}
assert.equal(horaAgenda('inválida'), horaAnterior('inválida')); verificacoes++;
assert.throws(() => horaAgenda(datas[0], 'fuso-inválido'), RangeError); verificacoes++;
assert.throws(() => diaAgenda('inválida', 'UTC'), RangeError); verificacoes++;

const medir = (fn) => {
  let caracteres = 0; const inicio = performance.now();
  for (let i = 0; i < 3000; i++) caracteres += fn(datas[i % datas.length], 'America/Sao_Paulo').length;
  return {segundos:(performance.now()-inicio)/1000, chamadas:3000, caracteres};
};
const rodadas = [];
for (let i = 0; i < 5; i++) {
  const medidas = {};
  for (const fase of i % 2 ? ['depois','antes'] : ['antes','depois']) {
    medidas[fase] = medir(fase === 'antes' ? horaAnterior : horaAgenda);
  }
  assert.equal(medidas.antes.caracteres, medidas.depois.caracteres);
  rodadas.push(medidas);
}
if (process.env.QA_OUTPUT) {
  const out = resolve(process.env.QA_OUTPUT); await mkdir(out, {recursive:true});
  await writeFile(resolve(out, 'formatacao-agenda.json'), JSON.stringify({verificacoes,rodadas,escopo:'Formatação de 3000 horários em Node. Não representa tempo de abertura de tela nem rede.'},null,2));
}
console.log(JSON.stringify({verificacoes,rodadas}));
