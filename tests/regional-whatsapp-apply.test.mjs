import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const first=app.indexOf('async function saveRegionalWhatsappIntoTeam(){');
const last=app.indexOf('\n/* ---------- quick team ---------- */',first);
assert.ok(first>0&&last>first,'A função de salvamento deve existir no app.js');
const source=app.slice(first,last);

async function runCase({rows,existing=[]}){
  const writes=[],messages=[],changes=[];
  const vehicle={id:'v1',nome:'USB ALEXÂNIA',bases:{nome:'Alexânia'}};
  const button={disabled:false,textContent:'CONFIRMAR, CADASTRAR NOVOS E ESCALAR'};
  const db={
    from(table){return {
      insert(payload){writes.push({table,payload,operation:'insert'});return {
        select(){return {single:async()=>({data:{id:table==='profissionais'?'new-'+writes.length:'team-'+writes.length},error:null})}}
      }},
      update(payload){writes.push({table,payload,operation:'update'});return {
        eq(){return Promise.resolve({error:null})}
      }}
    }}
  };
  let actionCount=0;
  const injected={
    regionalWhatsappDraft:{vehicleId:'v1',warnings:[],items:rows},
    vehicleById:id=>id==='v1'?vehicle:null,
    isOperator:()=>true,canEditOpenShift:()=>true,isAnapolisVehicle:()=>false,
    currentPlantao:{id:'shift-1',status:'ABERTO'},selectedTeamVehicle:'v1',
    $:selector=>selector==='#regionalWhatsappApply'?button:null,
    regionalWhatsappCurrentCandidates:()=>rows,
    regionalSlotsForVehicle:()=>['driver','tech'],
    vehicleType:()=> 'USB',
    norm:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim(),
    alert:message=>{messages.push(message);return undefined},
    activeOccurrence:()=>null,
    regionalCanFillRole:()=>true,
    activeTeamRows:()=>existing,
    displayName:p=>p.nome_exibicao||p.nome_completo,
    offline:{userAction:async(label,callback)=>{actionCount++;return callback()}},
    REGIONAL_ROLE:{driver:{databaseRole:'Condutor'},tech:{databaseRole:'Técnico de Enfermagem'}},
    supabase:db,
    currentQuickMember:(vId,key)=>existing.find(m=>m.viatura_id===vId&&m.key===key),
    regionalWhatsappRoleForSlot:key=>key==='driver'?'Condutor':'Técnico de Enfermagem',
    markOperationalDirty:()=>changes.push('dirty'),
    clearRegionalWhatsappDraft:()=>changes.push('clear'),
    quickDriverReference:null,quickDriverOriginal:null,
    closeModal:()=>changes.push('closed'),
    professionals:[],
    loadAll:async()=>changes.push('reloaded'),
    selectedDate:()=> '2026-11-22',
    setSync:m=>messages.push(m),regionalWhatsappStatus:m=>messages.push(m)
  };
  const names=Object.keys(injected),fn=new Function(...names,source+
    ';return saveRegionalWhatsappIntoTeam;')(...names.map(k=>injected[k]));
  await fn();
  return {writes,messages,changes,actionCount,button};
}

test('nomes novos só são cadastrados quando o operador confirma',async()=>{
  const rows=[
    {name:'Jamerilson',key:'driver',slot:'driver',selectedId:null,
      resolution:{status:'NEW',candidates:[]}},
    {name:'Raíssa',key:'tech',slot:'tech',selectedId:null,
      resolution:{status:'NEW',candidates:[]}}
  ];
  const out=await runCase({rows});
  assert.equal(out.actionCount,1);
  const created=out.writes.filter(w=>w.table==='profissionais');
  const assignments=out.writes.filter(w=>w.table==='equipe_plantao');
  assert.equal(created.length,2);
  assert.equal(assignments.length,2);
  assert.equal(created[0].payload.nome_completo,'Jamerilson');
  assert.equal(created[1].payload.nome_completo,'Raíssa');
  assert.equal(created[1].payload.funcao_sistema,'Técnico de Enfermagem');
  assert.equal(created[0].payload.categoria_origem,'WHATSAPP REGIONAL');
  assert.equal(assignments[0].payload.origem_escala,'WHATSAPP_REGIONAL');
  assert.ok(out.changes.includes('reloaded'));
});

test('profissional já existente não é recadastrado',async()=>{
  const existingPerson={id:'old-1',nome_completo:'CONDUTOR EXISTENTE',nome_de_guerra:'CONDUTOR',funcao_sistema:'Condutor'};
  const rows=[{name:'Condutor',key:'driver',slot:'driver',
    resolution:{status:'MATCHED',professional:existingPerson,candidates:[existingPerson]}}];
  const out=await runCase({rows});
  assert.equal(out.writes.filter(w=>w.table==='profissionais').length,0);
  assert.equal(out.writes.filter(w=>w.table==='equipe_plantao').length,1);
  assert.equal(out.writes.find(w=>w.table==='equipe_plantao').payload.profissional_id,'old-1');
});

test('se já estiver escalado em outra viatura, não movimenta automaticamente',async()=>{
  const p={id:'p1',nome_completo:'EXEMPLO'};
  const rows=[{name:'Exemplo',key:'driver',slot:'driver',
    resolution:{status:'MATCHED',professional:p,candidates:[p]}}];
  const out=await runCase({rows,existing:[{profissional_id:'p1',viatura_id:'v2'}]});
  assert.equal(out.actionCount,0);
  assert.equal(out.writes.length,0);
  assert.ok(out.messages.some(m=>/outra viatura/.test(m)));
});

test('não cria nomes nem movimenta equipe quando a mesma pessoa ocupa duas funções',async()=>{
  const p={id:'p1',nome_completo:'TESTE'};
  const rows=[
    {name:'Teste A',key:'driver',slot:'driver',resolution:{status:'MATCHED',professional:p}},
    {name:'Teste B',key:'tech',slot:'tech',resolution:{status:'MATCHED',professional:p}}
  ];
  const out=await runCase({rows});
  assert.equal(out.actionCount,0);
  assert.equal(out.writes.length,0);
  assert.ok(out.messages.some(m=>/mais de uma posição/.test(m)));
});
