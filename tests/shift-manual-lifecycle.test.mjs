import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../shift-manual-lifecycle.js',import.meta.url),'utf8');
const {isOpenShift,chooseUnfinishedShift,shiftContextOf,shouldBlockDateNavigation}=
  await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const clock={date:'2026-11-22',turno:'NOTURNO'};
const alaForDate=()=> 'ALFA';
const day={
  id:'diurno',data_plantao:'2026-11-22',turno:'DIURNO',ala:'ALFA',
  status:'ABERTO',iniciado_em:'2026-11-22T12:21:00Z'
};
const night={
  id:'noturno',data_plantao:'2026-11-22',turno:'NOTURNO',ala:'ALFA',
  status:'ABERTO',iniciado_em:'2026-11-22T22:00:00Z'
};
const old={
  id:'historico',data_plantao:'2026-10-11',turno:'DIURNO',ala:'CHARLIE',
  status:'ABERTO',iniciado_em:'2026-10-11T11:00:00Z'
};

test('às 19h, quando diurno ainda está aberto, não escolher noturno criado automaticamente',()=>{
  const picked=chooseUnfinishedShift([night,old,day],clock,alaForDate);
  assert.equal(picked.id,'diurno');
});

test('às 7h, após noite sem encerramento, preservar plantão noturno anterior',()=>{
  const nightYesterday={...night,data_plantao:'2026-11-21',ala:'DELTA',iniciado_em:'2026-11-21T22:00:00Z'};
  const morning={...day,data_plantao:'2026-11-22'};
  const chosen=chooseUnfinishedShift([morning,nightYesterday],{
    date:'2026-11-22',turno:'DIURNO'
  },alaForDate);
  assert.equal(chosen.id,nightYesterday.id);
});

test('o plantão aberto carregado continua selecionado mesmo após a virada e atualização',()=>{
  const chosen=chooseUnfinishedShift([night],clock,alaForDate,day);
  assert.equal(chosen.id,'diurno');
  assert.deepEqual(shiftContextOf(chosen,alaForDate),{
    date:'2026-11-22',turno:'DIURNO',ala:'ALFA'
  });
});

test('registros antigos não se sobrepõem à equipe atual',()=>{
  const chosen=chooseUnfinishedShift([old,night],clock,alaForDate);
  assert.equal(chosen.id,'noturno');
});

test('sem plantão recente, mantém o último aberto para conferência em vez de apagar os dados',()=>{
  const chosen=chooseUnfinishedShift([old],clock,alaForDate);
  assert.equal(chosen.id,'historico');
});

test('não trata um plantão encerrado como aberto nem permite troca de data enquanto houver aberto',()=>{
  assert.equal(isOpenShift({...day,status:'ENCERRADO'}),false);
  assert.equal(shouldBlockDateNavigation(day,'2026-11-23'),true);
  assert.equal(shouldBlockDateNavigation(day,'2026-11-22'),false);
  assert.equal(shouldBlockDateNavigation({...day,status:'ENCERRADO'},'2026-11-23'),false);
});

test('a ordem da geração do Livro deve preceder status ENCERRADO no código de encerramento',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=app.indexOf('async function executeShiftTransitionLocal(mode){');
  const end=app.indexOf('\nasync function endShift(){',start);
  assert.ok(start>0&&end>start);
  const closing=app.slice(start,end);
  const generate=closing.indexOf('const prepared=await exportClosingReport(');
  const update=closing.indexOf(".update({status:'ENCERRADO'");
  assert.ok(generate>=0&&update>generate,
    'o plantão não pode ser encerrado antes de preparar Livro e relatório');
  assert.match(closing,/if\(!prepared\?\.blob\?\.size/);
  assert.match(closing,/downloadReadySamuPdf\(\)/);
});

test('relógio não chama criação automática, apenas carrega dados do plantão protegido',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=app.indexOf('async function loadAllContents(');
  const end=app.indexOf('\nfunction renderAll(){',start);
  const load=app.slice(start,end);
  assert.doesNotMatch(load,/await ensureOperationalPlantao\(/);
  const syncStart=app.indexOf('async function synchronizeCurrentOperationalShift(');
  const syncEnd=app.indexOf('\nfunction stopOperationalShiftMonitor()',syncStart);
  const sync=app.slice(syncStart,syncEnd);
  assert.match(sync,/loadAll\(ctx.date,ctx.turno,true\)/);
  assert.match(sync,/isOpenShift\(currentPlantao\)/);
});

test('não permite navegar para outra data com plantão ainda aberto',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=app.indexOf("$('#shiftDate').onchange=async()=>{");
  assert.ok(start>=0);
  assert.match(app.slice(start,start+520),/shouldBlockDateNavigation/);
});

test('o botão possui o nome solicitado pelo rádio-operador',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/ENCERRAR PLANTÃO \/ ENVIAR LIVRO/);
});
