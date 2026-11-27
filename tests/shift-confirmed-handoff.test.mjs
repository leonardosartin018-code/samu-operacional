import test from 'node:test';import assert from 'node:assert/strict';import {confirmedHandoffSuccessor} from '../shift-manual-lifecycle.js';
const old={id:'old',data_plantao:'2026-11-22',turno:'DIURNO',ala:'ALFA',status:'ABERTO',iniciado_em:'2026-11-22T10:00:00Z'};
const next={...old,id:'next',data_plantao:'2026-11-26',iniciado_em:'2026-11-26T10:00:00Z',repasse_plantao:{incoming:{source_shift_id:'another-old',mode:'clean',confirmed_at:'2026-11-26T10:00:00Z'}}};
test('turno confirmado em outro computador supera pin legado ainda aberto',()=>assert.equal(confirmedHandoffSuccessor([old,next],old),next));
test('novo horário e registro criado sem confirmação não forçam virada',()=>assert.equal(confirmedHandoffSuccessor([old,{...next,repasse_plantao:null}],old),null));
test('um pin mais novo não regride para confirmação antiga',()=>assert.equal(confirmedHandoffSuccessor([next],{...old,id:'latest',iniciado_em:'2026-11-27T10:00:00Z'}),null));
test('confirmação encerrada ou incompleta não é tratada como turno vigente',()=>{assert.equal(confirmedHandoffSuccessor([{...next,status:'ENCERRADO'}],old),null);assert.equal(confirmedHandoffSuccessor([{...next,repasse_plantao:{incoming:{mode:'clean'}}}],old),null);});
