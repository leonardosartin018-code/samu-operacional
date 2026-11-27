import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalRosterForNight} from '../shift-manual-lifecycle.js';
const day={id:'day',data_plantao:'2026-11-26',turno:'DIURNO'};
const night={id:'night',data_plantao:'2026-11-26',turno:'NOTURNO'};
const vehicles=[
  {id:'anapolis',bases:{nome:'Anápolis'}},
  {id:'regional',bases:{nome:'Alexânia'}},
  {id:'unknown'},
  {id:'inactive',ativo:false,bases:{nome:'Abadiânia'}}
];
const member=(id,extra={})=>({id,plantao_id:'day',profissional_id:id,
  viatura_id:'regional',status:'ATIVO',funcao:'Enfermeiro',...extra});
test('preserva guarnição regional completa e parcial do diurno no noturno',()=>{
  const rows=[member('driver',{funcao:'Condutor'}),member('nurse')];
  assert.deepEqual(regionalRosterForNight(day,night,rows,vehicles),rows);
  assert.equal(regionalRosterForNight(day,night,[rows[1]],vehicles).length,1);
});
test('não copia Anápolis, revezamento, base desconhecida ou viatura desativada',()=>{
  const rows=['anapolis',null,'unknown','inactive'].map((id,i)=>member('p'+i,{viatura_id:id}));
  assert.deepEqual(regionalRosterForNight(day,night,rows,vehicles),[]);
});
test('não recupera removidos, registros de outro turno ou pessoas sem identificação',()=>{
  const rows=[member('removed',{status:'INATIVO'}),member('other',{plantao_id:'older'}),
    member('empty',{profissional_id:null}),member('replacement')];
  assert.deepEqual(regionalRosterForNight(day,night,rows,vehicles),[rows[3]]);
});
test('não renova a equipe para mais 24h ou ao saltar uma data',()=>{
  const rows=[member('p')];
  assert.deepEqual(regionalRosterForNight(night,{data_plantao:'2026-11-27',turno:'DIURNO'},rows,vehicles),[]);
  assert.deepEqual(regionalRosterForNight(day,{...night,data_plantao:'2026-11-27'},rows,vehicles),[]);
  assert.deepEqual(regionalRosterForNight(day,{...night,turno:'DIURNO'},rows,vehicles),[]);
  assert.deepEqual(regionalRosterForNight(null,night,rows,vehicles),[]);
});
