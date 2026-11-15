import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../rotation-weight-rules.js',import.meta.url),'utf8');
const {occurrenceEffortWeight,effortRestMinutes,weightedCompletedScore,
  restTimeRemaining,lastCompletedOccurrence,effortAdjustmentNote}=
  await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('pesos permitidos são 1, 2 e 3; outros são convertidos para 1',()=>{
  assert.equal(occurrenceEffortWeight(1),1);
  assert.equal(occurrenceEffortWeight('2'),2);
  assert.equal(occurrenceEffortWeight(3),3);
  assert.equal(occurrenceEffortWeight(19),1);
  assert.equal(occurrenceEffortWeight(-2),1);
});

test('peso aumenta pontuação sem criar mais ocorrências reais',()=>{
  const cases=[
    {id:'a',status:'FINALIZADA',peso_ocorrencia:2},
    {id:'b',status:'FINALIZADA',peso_ocorrencia:1},
    {id:'c',status:'RETORNANDO',peso_ocorrencia:3},
    {id:'d',status:'QTA',peso_ocorrencia:3}
  ];
  assert.equal(cases.filter(o=>o.status==='FINALIZADA').length,2);
  assert.equal(weightedCompletedScore(cases),3);
});

test('descanso é 0, 30 ou 60 minutos segundo o peso',()=>{
  assert.equal(effortRestMinutes(1),0);
  assert.equal(effortRestMinutes(2),30);
  assert.equal(effortRestMinutes(3),60);
});

test('tempo de descanso é calculado do retorno real, não do início da saída',()=>{
  const now=Date.parse('2026-11-15T21:00:00Z');
  const occ={status:'FINALIZADA',peso_ocorrencia:2,retorno_base_em:'2026-11-15T20:40:00Z'};
  assert.equal(restTimeRemaining(occ,now),10);
  assert.equal(restTimeRemaining(occ,now+15*60000),0);
  assert.equal(restTimeRemaining({...occ,status:'RETORNANDO'},now),0);
  assert.equal(restTimeRemaining({...occ,retorno_base_em:null},now),0);
});

test('considera o último retorno finalizado quando há várias ocorrências',()=>{
  const earlier={status:'FINALIZADA',peso_ocorrencia:3,retorno_base_em:'2026-11-15T19:00:00Z'};
  const later={status:'FINALIZADA',peso_ocorrencia:2,retorno_base_em:'2026-11-15T20:45:00Z'};
  assert.equal(lastCompletedOccurrence([earlier,later]),later);
});

test('registro administrativo exige motivo para peso especial',()=>{
  assert.throws(()=>effortAdjustmentNote({weight:2,reason:'   '}));
  const note=effortAdjustmentNote({weight:2,reason:'Transferência intermunicipal',operator:'OPERADOR',time:'15/11/2026 19:30'});
  assert.match(note,/Peso 2/);
  assert.match(note,/30 min/);
  assert.match(note,/1 ocorrência real/);
  assert.match(note,/Transferência intermunicipal/);
  assert.equal(effortAdjustmentNote({weight:1,reason:''}),'');
});
