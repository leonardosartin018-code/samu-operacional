import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('async function executeShiftTransitionLocal(mode){');
const end=app.indexOf('\nasync function endShift(){',start);
assert.ok(start>0&&end>start,'Não foi encontrada a rotina de encerramento');
const routine=app.slice(start,end);

async function simulate({pdfFails=false,unsaved=false}={}){
  const state={writes:[],alerts:[],downloads:0,loaded:[],staysOpen:true,reportCalls:0,pendingShown:0};
  const shift={id:'ficticio',data_plantao:'2026-11-22',turno:'DIURNO',ala:'ALFA',
    status:'ABERTO',iniciado_em:'2026-11-22T10:00:00Z'};
  const db={
    from(table){assert.equal(table,'plantoes');return {
      update(payload){
        state.writes.push(payload);state.staysOpen=false;
        return {
          eq(){return this},
          select(){return {maybeSingle:async()=>({data:{id:'ficticio',encerrado_em:payload.encerrado_em},error:null})}}
        };
      }
    }}
  };
  const variables={
    isOperator:()=>true,
    shiftTransitionBusy:false,
    $:()=>({checked:true,scrollIntoView:()=>{}}),
    currentPlantao:shift,
    shiftTransitionPlantaoId:'ficticio',
    alert:value=>state.alerts.push(String(value)),
    norm:value=>String(value||'').toUpperCase(),
    canReopenCurrentShift:()=>false,
    operationalNeedsConfirmation:()=>unsaved,
    internalNeedsConfirmation:()=>false,
    unsavedOperationalScale:false,unsavedInternalScale:false,unsavedBook:false,
    anyDraftModalOpen:()=>false,
    shiftClosingPending:()=>unsaved?[{key:'operational'}]:[],
    renderShiftClosingPending:()=>state.pendingShown++,
    readShiftHandoffDecision:()=>({mode:'clean',occurrence_ids:[],source_shift_id:shift.id,target:{date:'2026-11-22',turno:'NOTURNO',ala:'ALFA'}}),
    updateShiftTransitionButtons:()=>{},
    exportClosingReport:async (record,options)=>{
      state.reportCalls++;
      assert.equal(record.status,'ENCERRADO');
      assert.deepEqual(options,{includeBook:true,download:false});
      if(pdfFails)throw new Error('Falha simulada no arquivo');
      return {blob:{size:400},shiftId:shift.id};
    },
    supabase:db,profile:{nome:'OPERADOR FICTÍCIO'},
    session:{user:{email:'operador@example.invalid'}},
    downloadReadySamuPdf:()=>state.downloads++,
    rememberShiftSelection:()=>{},
    loadAll:async(date,turno)=>state.loaded.push({date,turno}),
    loadExpressScale:async()=>{},
    clearOperationalDirty:()=>{},clearInternalDirty:()=>{},
    lastClockShiftKey:'',operationalShiftKey:()=> '2026-11-22|NOTURNO|ALFA',
    closeModal:()=>{},setSync:()=>{},
    autoFollowCurrentShift:true,
    console:{error:()=>{}}
  };
  const args=Object.keys(variables);
  const fn=new Function(...args,routine+';return executeShiftTransitionLocal;')(
    ...args.map(key=>variables[key])
  );
  await fn('end');
  return state;
}

test('falha na geração do Livro impede encerramento sem perder o plantão',async()=>{
  const state=await simulate({pdfFails:true});
  assert.equal(state.reportCalls,1);
  assert.equal(state.writes.length,0);
  assert.equal(state.staysOpen,true);
  assert.equal(state.downloads,0);
  assert.equal(state.loaded.length,0);
  assert.ok(state.alerts.some(msg=>/Falha simulada/.test(msg)));
});

test('dados não confirmados impedem gerar Livro ou encerrar',async()=>{
  const state=await simulate({unsaved:true});
  assert.equal(state.reportCalls,0);
  assert.equal(state.writes.length,0);
  assert.equal(state.pendingShown,1);
  assert.equal(state.alerts.length,0);
});

test('confirmação explícita prepara Livro antes de encerrar o registro',async()=>{
  const state=await simulate();
  assert.equal(state.reportCalls,1);
  assert.equal(state.writes.length,1);
  assert.equal(state.writes[0].status,'ENCERRADO');
  assert.equal(state.downloads,1);
  assert.deepEqual(state.loaded,[{date:'2026-11-22',turno:'DIURNO'}]);
});
