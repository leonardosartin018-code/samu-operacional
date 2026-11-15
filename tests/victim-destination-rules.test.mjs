/*
 * Testes com situações fictícias. Executar:
 * node --test tests/victim-destination-rules.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../victim-destination-rules.js', import.meta.url), 'utf8');
const {canManageVictimDestination} =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const occurrence = {occurrenceStatus:'EM OCORRENCIA',vehicleStatus:'occurrence'};
const returning = {occurrenceStatus:'RETORNANDO',vehicleStatus:'returning'};

test('antes de QTH informado ou marcado como não informado não exibe o destino em ocorrência', () => {
  assert.equal(canManageVictimDestination({...occurrence,qthRecorded:false,qthNotInformed:false}), false);
});

test('depois de chegar no QTH exibe informar ou editar destino', () => {
  assert.equal(canManageVictimDestination({...occurrence,qthRecorded:true,qthNotInformed:false}), true);
});

test('QTH NÃO INFORMADO libera destino sem inventar horário de chegada', () => {
  const row = {...occurrence,qthRecorded:false,qthNotInformed:true};
  assert.equal(canManageVictimDestination(row), true);
  assert.equal(row.qthRecorded, false);
});

test('no retorno permite destino mesmo sem QTH ou marcação não informado', () => {
  assert.equal(canManageVictimDestination({...returning,qthRecorded:false,qthNotInformed:false}), true);
});

test('no retorno permite corrigir destino previamente informado', () => {
  assert.equal(canManageVictimDestination({...returning,qthRecorded:false,qthNotInformed:true}), true);
  assert.equal(canManageVictimDestination({...returning,qthRecorded:true,qthNotInformed:false}), true);
});

test('ocorrências finalizadas e QTA não podem ser editadas pelo botão operacional', () => {
  for(const status of ['FINALIZADA','QTA','CANCELADA']){
    assert.equal(canManageVictimDestination({occurrenceStatus:status,vehicleStatus:'returning',qthRecorded:true}),false);
  }
});

test('não permite salvar quando viatura não está mais em ocorrência ou retorno', () => {
  for(const status of ['base','mechanical','asepsis','noCrew']){
    assert.equal(canManageVictimDestination({occurrenceStatus:'EM OCORRENCIA',vehicleStatus:status,qthNotInformed:true}),false);
  }
});

test('retorno de outra ocorrência inconsistente não é liberado', () => {
  assert.equal(canManageVictimDestination({occurrenceStatus:'EM OCORRENCIA',vehicleStatus:'returning'}),true);
  assert.equal(canManageVictimDestination({occurrenceStatus:'RETORNANDO',vehicleStatus:'occurrence',qthRecorded:false,qthNotInformed:false}),false);
});

test('sem ocorrência e sem estado não libera controle', () => {
  assert.equal(canManageVictimDestination(),false);
});
