import assert from 'node:assert/strict';
import {test} from 'node:test';
import {diasCalendario,moverCalendario,ocupaDiaAgenda,diaAgenda,horaAgenda} from '../src/lib/calendarioAgenda.ts';
test('Semana alinhada de segunda a domingo; dia mantém seleção',()=>{
 assert.deepEqual(diasCalendario('2026-11-11','semana'),['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']);
 assert.deepEqual(diasCalendario('2026-11-11','dia'),['2026-11-11']);
});
test('Meses respeitam dias da semana, ano bissexto e virada de ano',()=>{
 const fevereiro=diasCalendario('2028-02-20','mes');assert(fevereiro.includes('2028-02-29'));assert.equal(new Date(fevereiro[0]+'T12:00').getDay(),1);assert.equal(fevereiro.length%7,0);
 assert.equal(moverCalendario('2026-01-31','mes',1),'2026-02-01');assert.equal(moverCalendario('2026-12-31','mes',1),'2027-01-01');assert.equal(moverCalendario('2026-01-01','mes',-1),'2025-12-01');
 assert.equal(moverCalendario('2026-11-09','semana',1),'2026-11-16');
});
test('Sem término aparece inclusive à meia-noite, sem inventar duração',()=>{
 const x={id:'a',inicio:'2026-11-09T00:00:00',fim:null,situacao:'agendado'};
 assert(ocupaDiaAgenda(x,'2026-11-09'));assert(!ocupaDiaAgenda(x,'2026-11-08'));assert(!ocupaDiaAgenda(x,'2026-11-10'));assert.equal(x.fim,null);
});
test('Atendimento atravessando dias e fim exclusivo',()=>{
 const x={id:'a',inicio:'2026-11-09T23:00:00',fim:'2026-11-11T00:00:00',situacao:'agendado'};
 assert(ocupaDiaAgenda(x,'2026-11-09'));assert(ocupaDiaAgenda(x,'2026-11-10'));assert(!ocupaDiaAgenda(x,'2026-11-11'));
});
test('Visita ocupa ida, margem e retorno sem alterar horário do atendimento',()=>{
 const x={id:'a',inicio:'2026-11-09T00:20:00',fim:'2026-11-09T23:50:00',situacao:'agendado',visita:true,deslocamento_minutos:30,logistica:{origem:'A',destino:'B',margem_minutos:10,retorno_minutos:20}};
 assert(ocupaDiaAgenda(x,'2026-11-08'));assert(ocupaDiaAgenda(x,'2026-11-09'));assert(ocupaDiaAgenda(x,'2026-11-10'));assert.equal(diaAgenda(x.inicio),'2026-11-09');
});

test('Assistência mantém o horário de Brasília mesmo com o aparelho em outro fuso',()=>{
 const fuso='America/Sao_Paulo',x={id:'fuso',inicio:'2026-11-10T02:30:00Z',fim:'2026-11-10T03:00:00Z',situacao:'agendado'};
 assert.equal(diaAgenda(x.inicio,fuso),'2026-11-09');
 assert.equal(horaAgenda(x.inicio,fuso),'23:30');
 assert(ocupaDiaAgenda(x,'2026-11-09',fuso));assert(!ocupaDiaAgenda(x,'2026-11-10',fuso));
});
