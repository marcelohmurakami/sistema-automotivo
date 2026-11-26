import test from 'node:test';
import assert from 'node:assert/strict';
import {diasDaJornada,periodosDaJornada,intervaloBloqueio,atendeClientes,corFuncionario} from '../src/lib/gestaoFuncionario.ts';
test('jornada vazia e horários com intervalo sobrevivem à edição',()=>{
 assert.deepEqual(periodosDaJornada(diasDaJornada(null)),[]);
 const periodos=[{dia:1,inicio:'08:00',fim:'12:00'},{dia:1,inicio:'13:00',fim:'18:00'},{dia:6,inicio:'09:00',fim:'14:00'}];
 assert.deepEqual(periodosDaJornada(diasDaJornada(periodos)),periodos);
});
test('impede horário invertido, intervalo fora do turno e horas inválidas',()=>{
 for(const ajuste of [{inicio:'19:00',fim:'08:00'},{inicio:'25:00'},{intervalo:true,intervaloInicio:'07:00',intervaloFim:'12:00'},{intervalo:true,intervaloInicio:'12:00',intervaloFim:'19:00'},{intervalo:true,intervaloInicio:'14:00',intervaloFim:'13:00'}])assert.throws(()=>periodosDaJornada([{...diasDaJornada(null)[1],ativo:true,...ajuste}]));
});
test('dias inteiros incluem o último dia e usam Brasília',()=>{
 assert.deepEqual(intervaloBloqueio('2026-12-31','2027-01-01',true),{inicio:'2026-12-31T03:00:00.000Z',fim:'2027-01-02T03:00:00.000Z'});
 assert.deepEqual(intervaloBloqueio('2026-12-01T08:15','2026-12-01T09:40',false),{inicio:'2026-12-01T11:15:00.000Z',fim:'2026-12-01T12:40:00.000Z'});
});
test('recusa datas inexistentes, período invertido e duração acima de dois anos',()=>{
 for(const [ini,fim,inteiro] of [['2026-02-30','2026-03-01',true],['','2026-12-01',true],['2026-12-01','2026-11-30',true],['2026-12-01T08:00','2026-12-01T08:00',false],['2026-12-01T24:00','2026-12-02T01:00',false],['2026-12-01','2029-12-01',true]])assert.throws(()=>intervaloBloqueio(ini,fim,inteiro));
});
test('cadastros antigos mantêm atendimento e uma cor válida',()=>{
 assert.equal(atendeClientes({}),true);assert.equal(atendeClientes({dados:{atende_clientes:'false'}}),false);
 assert.equal(corFuncionario({}), '#3b82f6');assert.equal(corFuncionario({dados:{cor_agenda:'url(x)'}}),'#3b82f6');assert.equal(corFuncionario({dados:{cor_agenda:'#Ab12EF'}}),'#Ab12EF');
});
