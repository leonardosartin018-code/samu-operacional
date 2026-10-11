import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://bcdxgfcmhedlaswiylud.supabase.co',
  'sb_publishable_3rOX2Q23kZm_SyCh9k-VKA_9OxDg_AR'
);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let session = null;
let profile = null;
let currentPlantao = null;
let vehicles = [];
let team = [];
let occurrences = [];
let occurrenceTeam = [];
let rotation = [];
let professionals = [];
let scaleRows = [];
let bookMeta = null;
let internalScaleRows = [];
let fixedInternalRows = [];
let bookDriverFixedRows = [];
let selectedVehicle = null;
let selectedTeamVehicle = null;
let selectedEditOccurrence = null;
let selectedAssignProfessional = null;
let selectedIndividualMember = null;
let selectedExpressPermutaRow = null;
let pendingQuickRegistration = null;
let realtimeChannel = null;
let reloadTimer = null;
let expressTechSelected = new Map();
let expressNurseSelected = new Map();

const REGIONAL_ORDER = ['ABADIÂNIA','ALEXÂNIA','COCALZINHO','CORUMBÁ','GOIANÁPOLIS','JARANÁPOLIS','PIRENÓPOLIS','TEREZÓPOLIS'];
const BOOK_INTERNAL_SLOTS = [
  {code:'AMB-S1',label:'S 01 - IRACEMA',bookLabel:'AMB - S1',setor:'SANITARIA',funcao:'SANITARIA',order:10},
  {code:'AMB-S2',label:'S 02 - EXTRA',bookLabel:'AMB - S2',setor:'SANITARIA',funcao:'SANITARIA',order:20},
  {code:'AMB-03-EXTRA',label:'AMB - 03 EXTRA',bookLabel:'AMB - 03 EXTRA',setor:'SANITARIA',funcao:'SANITARIA',order:30},
  {code:'AMB-S4-EXTRA',label:'AMB - S4 EXTRA',bookLabel:'AMB - S4 EXTRA',setor:'SANITARIA',funcao:'SANITARIA',order:40},
  {code:'RADIO-01',label:'RADIO 01',setor:'CENTRAL',funcao:'RADIO',order:100},
  {code:'RADIO-02',label:'RADIO 02',setor:'CENTRAL',funcao:'RADIO',order:110},
  {code:'TARM-01',label:'TARM 01',setor:'CENTRAL',funcao:'TARM',order:120},
  {code:'TARM-02',label:'TARM 02',setor:'CENTRAL',funcao:'TARM',order:130},
  {code:'TARM-03',label:'TARM 03',setor:'CENTRAL',funcao:'TARM',order:140},
  {code:'LAVADOR-01',label:'LAVADOR 01',setor:'CENTRAL',funcao:'LAVADOR',order:150},
  {code:'LAVADOR-02',label:'LAVADOR 02',setor:'CENTRAL',funcao:'LAVADOR',order:160}
];

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

const norm = v => String(v || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toUpperCase()
  .replace(/\s+/g,' ')
  .trim();

const fmtDate = v => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtTime = v => v ? new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';

function minutesBetween(a,b){
  if(!a || !b) return null;
  const n = Math.round((new Date(b)-new Date(a))/60000);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function fmtMinutes(n){
  if(n === null || n === undefined) return '—';
  const h = Math.floor(n/60), m = n%60;
  return h ? h+'h '+String(m).padStart(2,'0')+'min' : m+' min';
}
function nowLocalTime(){
  const d = new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function localDateTimeIso(date,time){
  if(!date || !time) return new Date().toISOString();
  const d = new Date(date+'T'+time+':00');
  return d.toISOString();
}
function isOperator(){
  return ['ADMIN','RADIO_OPERADOR'].includes(profile?.papel);
}
function setSync(text,type='ok'){
  const el=$('#syncStatus');
  el.className='sync-strip'+(type==='ok'?'':' '+type);
  el.innerHTML='<span class="sync-dot"></span><span>'+esc(text)+'</span>';
}
function firstTwoNames(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0,2).join(' ') || '—';
}
function displayName(p){
  if(!p) return '—';
  return (p.nome_de_guerra || firstTwoNames(p.nome_completo)).toUpperCase();
}
function professionalRoleKey(p){
  const f=norm(p?.funcao_sistema);
  if(f.includes('TECN')) return 'tech';
  if(f.includes('ENFERM')) return 'nurse';
  if(f.includes('MEDIC')) return 'doctor';
  if(f.includes('MOTOL')) return 'moto';
  if(f.includes('CONDUTOR')) return 'driver';
  return 'other';
}
function canDriveProfessional(p){
  const f=norm(p?.funcao_sistema);
  return ['CONDUTOR','MOTOL','TARM','RADIO','LAVADOR','SANITARIA','MOTORISTA'].some(x=>f.includes(x));
}
function teamRoleKey(m){
  const f=norm(m?.funcao);
  if(f.includes('CONDUTOR')) return 'driver';
  if(f.includes('TECN')) return 'tech';
  if(f.includes('ENFERM')) return 'nurse';
  if(f.includes('MEDIC')) return 'doctor';
  if(f.includes('MOTOL')) return 'moto';
  return professionalRoleKey(m?.profissionais);
}
function roleLabel(k){
  return {driver:'CONDUTOR',tech:'TÉCNICO',nurse:'ENFERMEIRO',doctor:'MÉDICO',moto:'MOTOLÂNCIA'}[k] || 'PROFISSIONAL';
}
function vehicleType(v){ return norm(v?.tipo || v?.nome); }
function isAnapolisVehicle(v){ return norm(v?.bases?.nome)==='ANAPOLIS'; }
function vehicleById(id){ return vehicles.find(v=>v.id===id); }
function vehicleByCode(code){
  const n=norm(code).replace(/\s/g,'');
  return vehicles.find(v=>norm(v.codigo).replace(/\s/g,'')===n || norm(v.legacy_id).replace(/\s/g,'')===n || norm(v.nome).replace(/\s/g,'')===n);
}
function activeTeamRows(){
  return team.filter(m=>norm(m.status || 'ATIVO')==='ATIVO');
}
function vehicleMembers(v){
  const list=activeTeamRows().filter(m=>
    !isRotationMember(m) &&
    (m.viatura_id===v.id || (!m.viatura_id && norm(m.viatura_snapshot)===norm(v.nome)))
  );
  const order={driver:1,tech:2,nurse:3,doctor:4,moto:5,other:9};
  return list.sort((a,b)=>(order[teamRoleKey(a)]||9)-(order[teamRoleKey(b)]||9));
}
function expectedRoles(v){
  const t=vehicleType(v);
  if(t.includes('USA')) return ['driver','nurse','doctor'];
  if(t.includes('USB')) return ['driver','tech'];
  if(t.includes('MOTO')) return ['moto'];
  return [];
}
function requiredDispatchRoles(v){
  const t=vehicleType(v);
  if(t.includes('USA')) return ['driver','nurse'];
  if(t.includes('USB')) return ['driver','tech'];
  // Motolância terá dois pilotos visíveis, mas a exigência mínima de empenho
  // não foi definida operacionalmente ainda, então não bloqueamos aqui.
  return [];
}
function crewHasRole(mem,role){
  return mem.some(m=>teamRoleKey(m)===role || (role==='tech' && teamRoleKey(m)==='nurse' && norm(m.funcao).includes('TECN')));
}
function crewCompleteness(v,mem=vehicleMembers(v)){
  const req=requiredDispatchRoles(v);
  if(!mem.length && !req.length) return {state:'empty',label:'SEM EQUIPE'};
  if(!req.length) return {state:mem.length?'complete':'empty',label:mem.length?'EQUIPE DEFINIDA':'SEM EQUIPE'};
  // Em Anápolis, a prontidão considera também quem será puxado automaticamente
  // do revezamento no momento do empenho.
  const effective=(isAnapolisVehicle(v)&&!vehicleType(v).includes('MOTO'))?automaticDispatchCrew(v):mem;
  if(!effective.length) return {state:'empty',label:'SEM EQUIPE'};
  const ok=req.every(r=>crewHasRole(effective,r));
  return ok?{state:'complete',label:'APTA PARA EMPENHO'}:{state:'partial',label:'EQUIPE PARCIAL'};
}
function dispatchRequirementText(v){
  const t=vehicleType(v);
  if(t.includes('USA')) return 'CONDUTOR + ENFERMEIRO';
  if(t.includes('USB')) return 'CONDUTOR + TÉCNICO/ENFERMEIRO';
  return '';
}
function validateDispatchCrew(v){
  if(!v)return true;
  const req=requiredDispatchRoles(v);
  if(!req.length)return true;
  const crew=automaticDispatchCrew(v);
  const missing=req.filter(r=>!crewHasRole(crew,r));
  if(!missing.length)return true;
  alert('Não é possível empenhar '+(v.nome||v.codigo)+'.\n\nEquipe mínima obrigatória: '+dispatchRequirementText(v)+'.\n\nComplete a equipe ou coloque os profissionais necessários no revezamento antes de acionar a viatura.');
  return false;
}
function activeOccurrence(v){
  return occurrences.find(o=>o.viatura_id===v.id && !['FINALIZADA','QTA','CANCELADA'].includes(norm(o.status)));
}
function occurrenceMembers(occId){
  return occurrenceTeam.filter(x=>x.ocorrencia_id===occId);
}
function occurrenceCrewText(o){
  const arr=occurrenceMembers(o.id);
  if(!arr.length) return '—';
  return arr.map(x=>x.nome_snapshot || displayName(x.profissionais)).filter(Boolean).join(' • ');
}
function statusInfo(v){
  const s=norm(v?.status_atual || 'BASE');
  if(s.includes('OCOR')) return {key:'occurrence',cls:'status-occurrence',label:'EM OCORRÊNCIA'};
  if(s.includes('RETORN')) return {key:'returning',cls:'status-returning',label:'RETORNANDO'};
  if(s.includes('ASSEP')) return {key:'asepsis',cls:'status-asepsis',label:'ASSEPSIA'};
  if(s.includes('PANE') || s.includes('MECAN')) return {key:'mechanical',cls:'status-mechanical',label:'PANE / BAIXADA'};
  if(s.includes('EQUIPE')) return {key:'noCrew',cls:'status-noCrew',label:'FALTA DE EQUIPE'};
  if(s.includes('MACA')) return {key:'noStretcher',cls:'status-noStretcher',label:'SEM MACA'};
  return {key:'base',cls:'status-base',label:'QRV / BASE'};
}
function statusDbValue(key){
  return {base:'BASE',occurrence:'OCORRENCIA',returning:'RETORNANDO',asepsis:'ASSEPSIA',mechanical:'PANE',noCrew:'SEM EQUIPE',noStretcher:'SEM MACA'}[key] || key;
}
const ALA_CYCLE=['ALFA','BRAVO','CHARLIE','DELTA'];
const ALA_REFERENCE_DATE='2026-09-29';
const ALA_REFERENCE_INDEX=2; // 29/09/2026 = CHARLIE, referência do sistema anterior

function saoPauloNowParts(){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Sao_Paulo',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function addDaysIso(dateIso,delta){
  const d=new Date(dateIso+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+delta);
  return d.toISOString().slice(0,10);
}
function operationalShiftContext(){
  const p=saoPauloNowParts();
  const calendarDate=p.year+'-'+p.month+'-'+p.day;
  const hour=Number(p.hour||0);
  if(hour<7){
    return {date:addDaysIso(calendarDate,-1),turno:'NOTURNO',calendarDate,hour};
  }
  if(hour<19){
    return {date:calendarDate,turno:'DIURNO',calendarDate,hour};
  }
  return {date:calendarDate,turno:'NOTURNO',calendarDate,hour};
}
function localTodayIso(){
  return operationalShiftContext().date;
}
function alaForDate(dateIso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso||'')))return '—';
  const ref=Date.parse(ALA_REFERENCE_DATE+'T00:00:00Z');
  const cur=Date.parse(dateIso+'T00:00:00Z');
  const diff=Math.round((cur-ref)/86400000);
  const idx=((ALA_REFERENCE_INDEX+diff)%ALA_CYCLE.length+ALA_CYCLE.length)%ALA_CYCLE.length;
  return ALA_CYCLE[idx];
}
function normalizeTurno(value){
  const t=norm(value);
  return t.includes('NOT')?'NOTURNO':'DIURNO';
}
function syncDateAndAla(dateIso,turnoOverride=null){
  const ctx=operationalShiftContext();
  const date=dateIso||ctx.date;
  const ala=alaForDate(date);
  const turno=turnoOverride?normalizeTurno(turnoOverride):(date===ctx.date?ctx.turno:ctx.turno);
  $('#shiftDate').value=date;
  $('#dayAlaBadge').textContent='ALA DO DIA: '+ala+' • '+turno;
  if($('#expressAla'))$('#expressAla').value=ala;
  if($('#expressTurno'))$('#expressTurno').value=turno;
  return {ala,turno,date};
}
function selectedDate(){
  return $('#shiftDate').value || currentPlantao?.data_plantao || operationalShiftContext().date;
}

function openPage(id){
  $$('.page').forEach(x=>x.classList.remove('active'));
  $$('.tab').forEach(x=>x.classList.remove('active'));
  $('#'+id)?.classList.add('active');
  document.querySelector('.tab[data-page="'+id+'"]')?.classList.add('active');
  if(id==='history') renderHistory();
  if(id==='team'){
    renderTeamPreview();
    loadExpressScale();
    renderRegistry();
  }
  if(id==='book'){
    loadBookData().then(()=>{renderInternalEditors();renderBook();renderScaleConfirmationStates()}).catch(e=>alert(e.message||e));
  }
}
window.openPage=openPage;

function openModal(id){ $('#'+id)?.classList.add('show'); }
function closeModal(id){ $('#'+id)?.classList.remove('show'); }

async function ensureProfessionals(){
  if(professionals.length) return professionals;
  const {data,error}=await supabase.from('profissionais')
    .select('id,legacy_id,nome_completo,nome_de_guerra,funcao_sistema,categoria_origem,topico_ntfy,ativo')
    .eq('ativo',true)
    .order('nome_completo');
  if(error) throw error;
  professionals=data||[];
  return professionals;
}

async function choosePlantao(preferredDate,preferredTurno=null,preferredAla=null){
  const date=preferredDate||operationalShiftContext().date;
  let q=supabase.from('plantoes').select('*').eq('data_plantao',date);
  if(preferredTurno)q=q.eq('turno',normalizeTurno(preferredTurno));
  if(preferredAla)q=q.eq('ala',norm(preferredAla));
  const {data,error}=await q.order('iniciado_em',{ascending:false});
  if(error)throw error;
  const list=data||[];
  return list.find(x=>norm(x.status)==='ABERTO') || list[0] || null;
}
async function ensureOperationalPlantao(date,turno,ala){
  const exact=await choosePlantao(date,turno,ala);
  if(exact)return exact;
  const payload={
    data_plantao:date,turno:normalizeTurno(turno),ala:norm(ala),status:'ABERTO',
    iniciado_em:new Date().toISOString(),tipo_plantao:'OPERACIONAL',operador_abertura:profile?.nome||null
  };
  let {data,error}=await supabase.from('plantoes').insert(payload).select().single();
  if(error&&String(error.code)==='23505'){
    return await choosePlantao(date,turno,ala);
  }
  if(error)throw error;
  return data;
}

async function loadAll(preferredDate=null){
  const ctx=operationalShiftContext();
  const date=preferredDate||selectedDate()||ctx.date;
  const initialShift=syncDateAndAla(date);
  const ala=initialShift.ala;
  const turno=(date===ctx.date)?ctx.turno:initialShift.turno;
  const isCurrentShift=date===ctx.date;
  setSync('Identificando plantão atual e pré-carregando escalas...','warn');

  currentPlantao=null;
  vehicles=[];team=[];occurrences=[];rotation=[];occurrenceTeam=[];
  const warnings=[];

  try{
    try{
      currentPlantao=await choosePlantao(date,turno,ala);
      if(!currentPlantao&&isCurrentShift){
        currentPlantao=await ensureOperationalPlantao(date,turno,ala);
      }
      syncDateAndAla(date,currentPlantao?.turno||turno);
    }catch(e){
      console.warn('Falha ao carregar plantão',e);
      warnings.push('plantão');
      syncDateAndAla(date,turno);
    }

    // A frota e as bases são carregadas primeiro e de forma independente.
    // Assim, um erro em equipe/revezamento nunca mais faz as viaturas sumirem do painel.
    const [vr,br]=await Promise.all([
      supabase.from('viaturas').select('*').eq('ativo',true).order('ordem_exibicao'),
      supabase.from('bases').select('id,nome,tipo,municipio,ordem_exibicao').eq('ativo',true)
    ]);
    if(vr.error)throw vr.error;
    if(br.error)warnings.push('bases');
    const basesMap=new Map((br.data||[]).map(b=>[b.id,b]));
    vehicles=(vr.data||[]).map(v=>({...v,bases:basesMap.get(v.base_id)||null}));

    try{
      await ensureProfessionals();
    }catch(e){
      console.warn('Falha ao carregar profissionais',e);
      warnings.push('profissionais');
      professionals=[];
    }
    const profMap=new Map(professionals.map(p=>[p.id,p]));

    if(currentPlantao&&isCurrentShift){
      try{
        // Pré-carrega apenas as referências da escala. Ninguém entra como ATIVO automaticamente.
        await loadBookData();
      }catch(e){
        console.warn('Falha ao pré-carregar referências da escala',e);
        warnings.push('pré-carga das escalas');
      }
    }

    if(currentPlantao){
      const [tr,or,rr]=await Promise.all([
        supabase.from('equipe_plantao').select('*').eq('plantao_id',currentPlantao.id),
        supabase.from('ocorrencias').select('*').eq('plantao_id',currentPlantao.id).order('criado_em',{ascending:false}),
        supabase.from('revezamento_plantao').select('*').eq('plantao_id',currentPlantao.id).order('grupo_revezamento').order('ordem_inicial')
      ]);

      if(tr.error){console.warn(tr.error);warnings.push('equipe')}
      else team=(tr.data||[]).map(m=>({...m,profissionais:profMap.get(m.profissional_id)||null}));

      if(or.error){console.warn(or.error);warnings.push('ocorrências')}
      else occurrences=or.data||[];

      if(rr.error){console.warn(rr.error);warnings.push('revezamento')}
      else rotation=(rr.data||[]).map(m=>({...m,profissionais:profMap.get(m.profissional_id)||null}));

      if(occurrences.length){
        const ids=occurrences.map(o=>o.id);
        const et=await supabase.from('equipe_ocorrencia').select('*').in('ocorrencia_id',ids);
        if(et.error){console.warn(et.error);warnings.push('equipe das ocorrências')}
        else occurrenceTeam=(et.data||[]).map(m=>({...m,profissionais:profMap.get(m.profissional_id)||null}));
      }
    }

    syncRotationCriterionFromPlantao();
    renderAll();
    if(currentPlantao){
      const turno=normalizeTurno(currentPlantao.turno||initialShift.turno);
      $('#plantaoInfo').textContent='Plantão '+(currentPlantao.legacy_id||'')+' • '+fmtDate(date)+' • ALA '+(currentPlantao.ala||ala)+' • '+turno+' • '+currentPlantao.status;
    }else{
      $('#plantaoInfo').textContent=fmtDate(date)+' • ALA '+ala+' • '+initialShift.turno+' • ainda não há plantão aberto para esta data no novo banco';
    }

    if(warnings.length){
      setSync('Frota carregada. Atenção: não foi possível carregar '+[...new Set(warnings)].join(', ')+'.','warn');
    }else{
      setSync('Banco conectado • atualização em tempo real ativa');
    }
  }catch(e){
    console.error(e);
    // Mesmo em erro total, tenta renderizar o estado disponível para não deixar a tela vazia.
    try{renderAll()}catch(renderError){console.error(renderError)}
    setSync('Erro ao carregar o painel: '+(e.message||String(e)),'error');
  }
}

function renderAll(){
  renderSummary();
  renderFleet();
  renderRotation();
  renderRegional();
  renderDestinations();
  renderHistory();
  renderTeamPreview();
  renderScaleConfirmationStates();
  if(!$('#teamInternalPanel')?.classList.contains('hidden')) renderInternalEditors();
  if($('#book')?.classList.contains('active')) renderBook();
}
function confirmationLabel(ts,by){
  if(!ts)return {text:'NÃO CONFIRMADA',cls:'pending'};
  const who=by?' • '+by:'';
  return {text:'CONFIRMADA '+fmtTime(ts)+who,cls:'confirmed'};
}
function renderScaleConfirmationStates(){
  const op=confirmationLabel(currentPlantao?.escala_operacional_confirmada_em,currentPlantao?.escala_operacional_confirmada_por);
  const inn=confirmationLabel(currentPlantao?.escala_interna_confirmada_em,currentPlantao?.escala_interna_confirmada_por);
  if($('#expressConfirmState')){
    $('#expressConfirmState').textContent=op.text;
    $('#expressConfirmState').className='scale-confirm-state '+op.cls;
  }
  if($('#internalConfirmState')){
    $('#internalConfirmState').textContent=inn.text;
    $('#internalConfirmState').className='scale-confirm-state '+inn.cls;
  }
}

function renderSummary(){
  const an=vehicles.filter(isAnapolisVehicle),rg=vehicles.filter(v=>!isAnapolisVehicle(v));
  const calc=list=>{
    const x={base:0,occurrence:0,returning:0,other:0,total:list.length};
    list.forEach(v=>{const k=statusInfo(v).key;if(k==='base')x.base++;else if(k==='occurrence')x.occurrence++;else if(k==='returning')x.returning++;else x.other++});
    return x;
  };
  const a=calc(an),r=calc(rg),attention=a.returning+a.other+r.returning+r.other;
  $('#summary').innerHTML=[
    ['ANÁPOLIS QRV',a.base+' / '+a.total],
    ['ANÁPOLIS EM OCORRÊNCIA',a.occurrence],
    ['REGIONAL QRV',r.base+' / '+r.total],
    ['REGIONAL EM OCORRÊNCIA',r.occurrence],
    ['PRECISAM DE ATENÇÃO',attention]
  ].map(x=>'<div class="sum"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');
  $('#plantaoInfo').textContent=currentPlantao
    ? 'Plantão '+(currentPlantao.legacy_id||'')+' • '+fmtDate(currentPlantao.data_plantao)+' • '+currentPlantao.status
    : 'Nenhum plantão encontrado';
  $('#realShiftStart').textContent=currentPlantao?.iniciado_em ? fmtTime(currentPlantao.iniciado_em) : '—';
}

function memberSlotHtml(m){
  if(!m) return '<div class="crew-slot"><div class="crew-role">VAGA</div><div class="crew-name">—</div></div>';
  return '<div class="crew-slot"><div class="crew-role">'+esc(roleLabel(teamRoleKey(m)))+'</div><div class="crew-name">'+esc(displayName(m.profissionais))+'</div></div>';
}
function namedMemberSlotHtml(m,label){
  return '<div class="crew-slot"><div class="crew-role">'+esc(label)+'</div><div class="crew-name">'+esc(m?displayName(m.profissionais):'—')+'</div></div>';
}
function rotationPreviewSlotHtml(m,role){
  if(!m)return memberSlotHtml(null);
  return '<div class="crew-slot rotation-preview"><div class="crew-role">'+esc(roleLabel(role))+'</div><div class="crew-name">'+esc(displayName(m.profissionais))+'</div></div>';
}
function crewRowsForCard(v){
  const o=activeOccurrence(v);
  if(o){
    const occRows=occurrenceMembers(o.id);
    if(occRows.length)return occRows;
  }
  return vehicleMembers(v);
}
function crewGridHtml(v){
  const o=activeOccurrence(v);
  const mem=crewRowsForCard(v);
  const exp=expectedRoles(v);
  const used=new Set(mem.map(m=>m.profissional_id));
  let slots=[];
  if(vehicleType(v).includes('MOTO')){
    const m1=mem.find(m=>norm(m.funcao)==='MOTOLANCIA 1')||null;
    const m2=mem.find(m=>norm(m.funcao)==='MOTOLANCIA 2')||null;
    slots=[
      namedMemberSlotHtml(m1,'MOTOLÂNCIA 1'),
      namedMemberSlotHtml(m2,'MOTOLÂNCIA 2')
    ];
  }else if(exp.length){
    slots=exp.map(role=>{
      const m=mem.find(x=>teamRoleKey(x)===role || (role==='tech'&&teamRoleKey(x)==='nurse'&&norm(x.funcao).includes('TECN')));
      if(m)return memberSlotHtml(m);

      // Na base de Anápolis, quando não existe fixo nessa função,
      // já mostramos quem seria puxado automaticamente do revezamento.
      if(!o&&isAnapolisVehicle(v)&&!vehicleType(v).includes('MOTO')&&['driver','tech','nurse'].includes(role)){
        const next=dispatchCandidateForVehicleRole(v,role,used);
        if(next){used.add(next.profissional_id);return rotationPreviewSlotHtml(next,role)}
      }
      return memberSlotHtml(null);
    });
    const extra=mem.filter(m=>!exp.includes(teamRoleKey(m)) && !(teamRoleKey(m)==='nurse'&&exp.includes('tech')));
    slots.push(...extra.map(memberSlotHtml));
  }else slots=mem.map(memberSlotHtml);
  if(!slots.length) slots=[memberSlotHtml(null)];
  const cls=slots.length===1?'one':slots.length===2?'two':'';
  const comp=crewCompleteness(v,mem);
  const label=o?'EQUIPE DA OCORRÊNCIA':comp.label;
  const state=o?'complete':comp.state;
  return '<div class="crew-grid '+cls+'">'+slots.join('')+'</div>'+
    '<div class="crew-setup '+state+'"><b>'+label+'</b><span>'+(o?'Equipe efetivamente empenhada':'Fixo + próximo do revezamento')+'</span></div>';
}
function occurrenceInfoHtml(v,o){
  if(!o) return '';
  const qthRecorded=!!o.chegada_qth_em;
  return '<div class="occ-detail">OC. '+esc(o.numero||'—')+' • '+esc(o.natureza||'SEM NATUREZA')+'</div>'+
    '<div class="occ-address">'+esc([o.bairro,o.endereco,o.destino].filter(Boolean).join(' • '))+'</div>'+
    '<div class="occ-timeline">'+
      '<div class="occ-time-chip"><span>SAÍDA</span><b>'+fmtTime(o.saida_em||o.acionada_em)+'</b></div>'+
      '<div class="occ-time-chip"><span>QTH</span><b>'+fmtTime(o.chegada_qth_em)+'</b></div>'+
      '<div class="occ-time-chip"><span>INÍCIO RETORNO</span><b>'+fmtTime(o.inicio_retorno_em)+'</b></div>'+
    '</div>'+
    (statusInfo(v).key==='occurrence'
      ? '<div class="occurrence-main-actions">'+
          '<button class="qth-btn '+(qthRecorded?'recorded':'')+'" data-act="qth" data-o="'+o.id+'">'+(qthRecorded?'QTH REGISTRADO • '+fmtTime(o.chegada_qth_em):'CHEGADA NO QTH')+'</button>'+
          '<div class="occurrence-action-row">'+
            '<button class="qta-btn" data-act="qta" data-o="'+o.id+'" data-v="'+v.id+'">QTA</button>'+
            '<button class="edit-team-btn" data-act="edit-team" data-v="'+v.id+'">EDITAR EQUIPE</button>'+
            '<button class="return-btn" data-act="return" data-o="'+o.id+'" data-v="'+v.id+'">RETORNAR À BASE</button>'+
          '</div>'+
        '</div>'
      : '');
}
function statusStripHtml(v){
  if(!isOperator()) return '';
  const o=activeOccurrence(v);
  if(o && statusInfo(v).key==='occurrence') return '';
  return '<div class="status-strip">'+
    '<button data-status="base" data-v="'+v.id+'">BASE</button>'+
    '<button data-status="asepsis" data-v="'+v.id+'">ASSEPSIA</button>'+
    '<button data-status="mechanical" data-v="'+v.id+'">PANE</button>'+
    '<button data-status="noCrew" data-v="'+v.id+'">S/EQUIPE</button>'+
    '<button data-status="noStretcher" data-v="'+v.id+'">S/MACA</button>'+
  '</div>';
}
function vehicleCardHtml(v){
  const st=statusInfo(v),o=activeOccurrence(v);
  let primary='';
  if(st.key==='base') primary='<button class="dispatch-btn" data-act="dispatch" data-v="'+v.id+'">ACIONAR VIATURA</button>';
  if(st.key==='returning') primary='<button class="arrive-btn" data-act="arrive" data-o="'+(o?.id||'')+'" data-v="'+v.id+'">CHEGADA À BASE</button>';
  return '<article class="vehicle-card '+st.cls+'" data-team-card data-v="'+v.id+'">'+
    '<div class="vehicle-top"><div><div class="vehicle-name">'+esc(v.nome||v.codigo)+'</div><div class="vehicle-subhint">CLIQUE PARA EMPENHAR / EDITAR EQUIPE</div></div><span class="status-badge">'+st.label+'</span></div>'+
    crewGridHtml(v)+
    occurrenceInfoHtml(v,o)+
    (primary?'<div style="margin-top:6px">'+primary+'</div>':'')+
    statusStripHtml(v)+
  '</article>';
}
function operationalGroup(title,subtitle,cls,list,extra=''){
  const body=list.length?list.map(vehicleCardHtml).join(''):'<div class="vehicle-group-empty">Nenhuma viatura nesta linha.</div>';
  return '<div class="vehicle-operational-group '+cls+' '+extra+'">'+
    '<div class="vehicle-group-head"><div><b>'+esc(title)+'</b><span>'+esc(subtitle)+'</span></div><em>'+list.length+' viatura'+(list.length===1?'':'s')+'</em></div>'+
    '<div class="vehicle-row '+cls+'-row">'+body+'</div></div>';
}
function renderFleet(){
  const all=vehicles.filter(isAnapolisVehicle);
  const detached=['occurrence','asepsis','mechanical','noCrew','noStretcher'];
  const stays=v=>vehicleType(v).includes('MOTO') || !detached.includes(statusInfo(v).key);
  const moto=all.filter(v=>vehicleType(v).includes('MOTO'));
  const usa=all.filter(v=>vehicleType(v).includes('USA')&&!vehicleType(v).includes('USB')&&stays(v));
  const usb=all.filter(v=>vehicleType(v).includes('USB')&&stays(v));
  const lane=(key,title,subtitle,cls)=>{
    const list=all.filter(v=>!vehicleType(v).includes('MOTO')&&statusInfo(v).key===key)
      .sort((a,b)=>(vehicleType(a).includes('USA')?1:2)-(vehicleType(b).includes('USA')?1:2)||String(a.nome).localeCompare(String(b.nome),'pt-BR'));
    return list.length?operationalGroup(title,subtitle,cls,list,'dynamic-status-lane'):'';
  };
  $('#vehicles').innerHTML=
    operationalGroup('MOTOLÂNCIA','Resposta rápida • Anápolis','moto',moto)+
    operationalGroup('USA','Unidades de Suporte Avançado • QRV e retorno','usa',usa)+
    operationalGroup('USB','Unidades de Suporte Básico • QRV e retorno','usb',usb)+
    lane('occurrence','EM OCORRÊNCIA','Viaturas de Anápolis atualmente empenhadas','occurrence')+
    lane('asepsis','ASSEPSIA','Viaturas temporariamente retiradas da linha','asepsis')+
    lane('mechanical','BAIXADAS — PANE','Viaturas indisponíveis por pane / manutenção','mechanical')+
    lane('noCrew','BAIXADAS — FALTA DE EQUIPE','Viaturas indisponíveis por recurso humano','noCrew')+
    lane('noStretcher','SEM MACA','Viaturas temporariamente indisponíveis por falta de maca','noStretcher');
  bindVehicleActions($('#vehicles'));
}

function currentRotationCriterion(){
  return $('#rotationCriterion')?.value || 'baseTime';
}
function rotationCriterionDbValue(value){
  return value==='occurrences'?'MENOR_OCORRENCIAS':'TEMPO_BASE';
}
function syncRotationCriterionFromPlantao(){
  const saved=norm(
    currentPlantao?.criterio_usb_condutor ||
    currentPlantao?.criterio_usb_tecnico ||
    currentPlantao?.criterio_usa_equipe ||
    ''
  );
  const value=saved.includes('OCOR')?'occurrences':'baseTime';
  $('#rotationCriterion').value=value;
  renderRotationRuleHelp();
}
function renderRotationRuleHelp(){
  const crit=currentRotationCriterion();
  $('#rotationRuleHelp').textContent=crit==='occurrences'
    ? 'Critério ativo: menor número de ocorrências. Se houver empate, passa na frente quem está há mais tempo na base.'
    : 'Critério padrão: mais tempo disponível na base. Se houver empate, passa na frente quem tem menos ocorrências.';
}
async function persistRotationCriterion(value){
  renderRotationRuleHelp();
  renderRotation();
  if(!currentPlantao||!isOperator())return;
  const db=rotationCriterionDbValue(value);
  const payload={
    criterio_usb_condutor:db,
    criterio_usb_tecnico:db,
    criterio_usa_equipe:db,
    criterio_usa_condutor:db,
    criterio_usa_enfermeiro:db
  };
  Object.assign(currentPlantao,payload);
  const {error}=await supabase.from('plantoes').update(payload).eq('id',currentPlantao.id);
  if(error)console.warn('Não foi possível salvar o critério do revezamento:',error);
}
function isRotationMember(m){
  const t=norm(m?.tipo_escala);
  return t.includes('REVEZ') || (!!m?.grupo_revezamento && !m?.viatura_id);
}
function fixedVehicleForMemberType(m,type){
  if(!m?.viatura_id||isRotationMember(m))return null;
  const v=vehicleById(m.viatura_id);
  if(!v||!isAnapolisVehicle(v))return null;
  return vehicleType(v).includes(type)?v:null;
}
function activeOccurrenceIdsSet(){
  return new Set(occurrences.filter(o=>!['FINALIZADA','QTA','CANCELADA'].includes(norm(o.status))).map(o=>o.id));
}
function memberIsBusy(m){
  if(!m)return true;
  const activeIds=activeOccurrenceIdsSet();
  return occurrenceTeam.some(x=>x.profissional_id===m.profissional_id&&activeIds.has(x.ocorrencia_id));
}
function driverScopeForMember(m){
  const raw=norm(m?.revezamento_tipo_viatura||m?.grupo_revezamento||'');
  if(raw.includes('BOTH')||raw.includes('AMB'))return 'BOTH';
  if(raw.includes('USA'))return 'USA';
  if(raw.includes('USB'))return 'USB';
  const v=vehicleById(m?.viatura_id);
  if(v&&vehicleType(v).includes('USA'))return 'USA';
  if(v&&vehicleType(v).includes('USB'))return 'USB';
  return 'USB';
}
function driverRotationAllowsMember(m,type){
  if(teamRoleKey(m)!=='driver')return true;
  if(!isRotationMember(m))return true;
  const scope=driverScopeForMember(m);
  return scope==='BOTH'||scope===type;
}
function vehicleAvailableForRotation(v){
  return !!v && isAnapolisVehicle(v) && statusInfo(v).key==='base' && !activeOccurrence(v);
}
function memberEligibleForPriority(m,role,type){
  if(!m||norm(m.status||'ATIVO')!=='ATIVO')return false;
  if(teamRoleKey(m)!==role||memberIsBusy(m))return false;

  const fixed=fixedVehicleForMemberType(m,type);
  if(fixed)return vehicleAvailableForRotation(fixed);

  // Profissional fixo em outro tipo de viatura não entra nesta fila.
  if(m.viatura_id&&!isRotationMember(m))return false;

  if(role==='driver'&&!driverRotationAllowsMember(m,type))return false;
  if(role==='tech'&&type!=='USB')return false;
  if(role==='nurse'&&type!=='USA')return false;
  return true;
}
function latestReturnForVehicle(v){
  const times=occurrences
    .filter(o=>o.viatura_id===v.id)
    .map(o=>o.retorno_base_em||((norm(o.status)==='QTA')?o.qta_em:null))
    .filter(Boolean)
    .map(x=>new Date(x).getTime())
    .filter(Number.isFinite);
  if(!times.length)return null;
  return new Date(Math.max(...times)).toISOString();
}
function minutesSinceIso(ts){
  if(!ts)return 0;
  const n=Math.floor((Date.now()-new Date(ts).getTime())/60000);
  return Number.isFinite(n)?Math.max(0,n):0;
}
function vehicleBaseMinutes(v){
  if(!vehicleAvailableForRotation(v))return -1;
  const start=latestReturnForVehicle(v)||currentPlantao?.iniciado_em;
  return minutesSinceIso(start);
}
function personBaseMinutes(m,type){
  if(memberIsBusy(m))return -1;
  const fixed=fixedVehicleForMemberType(m,type);
  if(fixed)return vehicleBaseMinutes(fixed);
  return minutesSinceIso(m.ultimo_retorno_em||m.entrou_em||currentPlantao?.iniciado_em);
}
function personOccurrenceCount(m){
  const stored=Number(m?.ocorrencias_validas);
  if(Number.isFinite(stored))return stored;
  const ids=new Set(occurrenceTeam.filter(x=>x.profissional_id===m?.profissional_id).map(x=>x.ocorrencia_id));
  return occurrences.filter(o=>ids.has(o.id)&&!['QTA','CANCELADA'].includes(norm(o.status))).length;
}
function vehicleOccurrenceCount(v){
  return occurrences.filter(o=>o.viatura_id===v.id&&!['QTA','CANCELADA'].includes(norm(o.status))).length;
}
function assignmentPriorityLabel(m,type){
  const fixed=fixedVehicleForMemberType(m,type);
  if(fixed)return 'FIXO — '+(fixed.nome||fixed.codigo);
  if(teamRoleKey(m)==='driver')return 'REVEZAMENTO — '+driverScopeForMember(m);
  return 'REVEZAMENTO';
}
function priorityPeopleForRole(role,type,{rotationOnly=false}={}){
  const crit=currentRotationCriterion();
  return activeTeamRows()
    .filter(m=>memberEligibleForPriority(m,role,type))
    .filter(m=>!rotationOnly||isRotationMember(m)||!m.viatura_id)
    .sort((a,b)=>{
      const ab=personBaseMinutes(a,type),bb=personBaseMinutes(b,type);
      const ao=personOccurrenceCount(a),bo=personOccurrenceCount(b);
      if(crit==='occurrences'){
        if(ao!==bo)return ao-bo;
        if(ab!==bb)return bb-ab;
      }else{
        if(ab!==bb)return bb-ab;
        if(ao!==bo)return ao-bo;
      }
      return Number(a.ordem_inicial||999)-Number(b.ordem_inicial||999) ||
        String(displayName(a.profissionais)).localeCompare(String(displayName(b.profissionais)),'pt-BR');
    });
}
function priorityMetricText(m,type){
  return fmtMinutes(personBaseMinutes(m,type))+' base • '+personOccurrenceCount(m)+' oc.';
}
function priorityReasonText(m,type){
  return currentRotationCriterion()==='occurrences'
    ? 'Menor nº de ocorrências; empate decidido pelo maior tempo na base.'
    : 'Maior tempo na base; empate decidido pelo menor nº de ocorrências.';
}
function rotationPersonCard(title,role,type){
  const fila=priorityPeopleForRole(role,type);
  const first=fila[0];
  let html='<div class="priority-card"><div class="priority-card-title"><span>'+esc(title)+'</span><small>'+fila.length+' disponível(is)</small></div>';
  if(first){
    html+='<div class="priority-next"><b>'+esc(displayName(first.profissionais)||first.nome_snapshot||'—')+'</b>'+
      '<span>DA VEZ</span>'+
      '<div class="priority-assignment">'+esc(assignmentPriorityLabel(first,type))+'</div>'+
      '<div class="priority-next-meta"><span class="priority-pill">'+esc(fmtMinutes(personBaseMinutes(first,type)))+' na base</span><span class="priority-pill">'+personOccurrenceCount(first)+' ocorrência(s)</span></div>'+
      '<div class="priority-reason">'+esc(priorityReasonText(first,type))+'</div></div>';
    if(fila.length>1){
      html+=fila.slice(1,6).map((m,i)=>'<div class="priority-line"><div class="priority-line-main"><b>'+(i+2)+'. '+esc(displayName(m.profissionais)||m.nome_snapshot||'—')+'</b><small>'+esc(assignmentPriorityLabel(m,type))+'</small></div><div class="priority-line-metric">'+esc(priorityMetricText(m,type))+'</div></div>').join('');
    }
  }else{
    html+='<div class="priority-empty">Nenhum profissional disponível para esta fila neste momento.</div>';
  }
  return html+'</div>';
}
function doctorCandidateForVehicle(v,used=new Set()){
  const exact=activeTeamRows().filter(m=>
    teamRoleKey(m)==='doctor'&&!memberIsBusy(m)&&!isRotationMember(m)&&m.viatura_id===v.id
  );
  if(exact.length)return exact.find(m=>!used.has(m.profissional_id))||null;
  return activeTeamRows().filter(m=>
    teamRoleKey(m)==='doctor'&&!memberIsBusy(m)&&
    (!m.viatura_id||isRotationMember(m))&&!used.has(m.profissional_id)
  ).sort((a,b)=>personBaseMinutes(b,'USA')-personBaseMinutes(a,'USA'))[0]||null;
}
function dispatchCandidateForVehicleRole(v,role,used=new Set()){
  const type=vehicleType(v).includes('USA')?'USA':vehicleType(v).includes('USB')?'USB':'';
  if(!type)return null;
  const exact=activeTeamRows().filter(m=>
    teamRoleKey(m)===role&&!memberIsBusy(m)&&!isRotationMember(m)&&m.viatura_id===v.id
  );
  const exactPick=exact.find(m=>!used.has(m.profissional_id));
  if(exactPick)return exactPick;
  if(role==='doctor')return doctorCandidateForVehicle(v,used);
  return priorityPeopleForRole(role,type,{rotationOnly:true}).find(m=>!used.has(m.profissional_id))||null;
}
function availableUsaTeams(){
  const crit=currentRotationCriterion();
  return vehicles.filter(v=>
    isAnapolisVehicle(v)&&vehicleType(v).includes('USA')&&!vehicleType(v).includes('USB')&&
    v.participa_revezamento!==false&&vehicleAvailableForRotation(v)
  ).map(v=>{
    const used=new Set();
    const driver=dispatchCandidateForVehicleRole(v,'driver',used);if(driver)used.add(driver.profissional_id);
    const nurse=dispatchCandidateForVehicleRole(v,'nurse',used);if(nurse)used.add(nurse.profissional_id);
    const doctor=dispatchCandidateForVehicleRole(v,'doctor',used);
    return {
      v,driver,nurse,doctor,complete:!!driver&&!!nurse,
      base:vehicleBaseMinutes(v),occ:vehicleOccurrenceCount(v)
    };
  }).filter(x=>x.complete).sort((a,b)=>{
    if(crit==='occurrences'){
      if(a.occ!==b.occ)return a.occ-b.occ;
      if(a.base!==b.base)return b.base-a.base;
    }else{
      if(a.base!==b.base)return b.base-a.base;
      if(a.occ!==b.occ)return a.occ-b.occ;
    }
    return String(a.v.nome).localeCompare(String(b.v.nome),'pt-BR');
  });
}
function usaTeamRotationCard(){
  const fila=availableUsaTeams(),first=fila[0];
  let html='<div class="priority-card vehicle-priority"><div class="priority-card-title"><span>USA — Equipe / viatura da vez</span><small>'+fila.length+' completa(s)</small></div>';
  if(first){
    html+='<div class="priority-next"><b>'+esc(first.v.nome||first.v.codigo)+'</b><span>USA DA VEZ</span>'+
      '<div class="priority-assignment">Condutor '+esc(displayName(first.driver.profissionais))+' • Enfermeiro '+esc(displayName(first.nurse.profissionais))+' • Médico '+(first.doctor?esc(displayName(first.doctor.profissionais)):'não escalado (opcional)')+'</div>'+
      '<div class="priority-next-meta"><span class="priority-pill">'+esc(fmtMinutes(first.base))+' na base</span><span class="priority-pill">'+first.occ+' ocorrência(s)</span></div>'+
      '<div class="priority-reason">'+(currentRotationCriterion()==='occurrences'?'Menor nº de ocorrências; empate pelo maior tempo na base.':'Maior tempo na base; empate pelo menor nº de ocorrências.')+'</div></div>';
    html+=fila.slice(1,5).map((x,i)=>'<div class="priority-line"><div class="priority-line-main"><b>'+(i+2)+'. '+esc(x.v.nome||x.v.codigo)+'</b><small>Equipe completa disponível</small></div><div class="priority-line-metric">'+esc(fmtMinutes(x.base))+' • '+x.occ+' oc.</div></div>').join('');
  }else{
    html+='<div class="priority-empty">Nenhuma USA está na base com equipe completa disponível neste momento.</div>';
  }
  return html+'</div>';
}
function automaticDispatchCrew(v){
  const type=vehicleType(v);
  const fixed=vehicleMembers(v).filter(m=>!isRotationMember(m));
  if(type.includes('MOTO'))return fixed;
  const roles=type.includes('USA')?['driver','nurse','doctor']:type.includes('USB')?['driver','tech']:[];
  const used=new Set();
  const crew=[];
  roles.forEach(role=>{
    const existing=fixed.find(m=>teamRoleKey(m)===role || (role==='tech'&&teamRoleKey(m)==='nurse'&&norm(m.funcao).includes('TECN')));
    const pick=existing||dispatchCandidateForVehicleRole(v,role,used);
    if(pick&&!used.has(pick.profissional_id)){crew.push(pick);used.add(pick.profissional_id)}
  });
  fixed.forEach(m=>{if(!used.has(m.profissional_id)){crew.push(m);used.add(m.profissional_id)}});
  return crew;
}
function renderRotation(){
  renderRotationRuleHelp();
  $('#priority').innerHTML=
    rotationPersonCard('USB — Condutor da vez','driver','USB')+
    rotationPersonCard('USB — Técnico da vez','tech','USB')+
    usaTeamRotationCard()+
    rotationPersonCard('USA — Condutor da vez','driver','USA')+
    rotationPersonCard('USA — Enfermeiro da vez','nurse','USA');
}

function regionalOrderIndex(name){
  const i=REGIONAL_ORDER.indexOf(norm(name));
  return i<0?99:i;
}
function regionalVehicleHtml(v){
  const st=statusInfo(v), mem=vehicleMembers(v), comp=crewCompleteness(v), o=activeOccurrence(v);
  const crew=mem.length?mem.map(memberSlotHtml).join(''):memberSlotHtml(null);
  let actions='';
  if(st.key==='base') actions='<button class="dispatch-btn" data-act="dispatch" data-v="'+v.id+'">ACIONAR</button>';
  if(st.key==='returning') actions='<button class="arrive-btn" data-act="arrive" data-o="'+(o?.id||'')+'" data-v="'+v.id+'">CHEGADA À BASE</button>';
  if(st.key==='occurrence'&&o){
    actions='<button class="qth-btn '+(o.chegada_qth_em?'recorded':'')+'" data-act="qth" data-o="'+o.id+'">'+(o.chegada_qth_em?'QTH • '+fmtTime(o.chegada_qth_em):'CHEGADA NO QTH')+'</button>'+
      '<div class="occurrence-action-row"><button class="qta-btn" data-act="qta" data-o="'+o.id+'" data-v="'+v.id+'">QTA</button><button class="edit-team-btn" data-act="edit-team" data-v="'+v.id+'">EDITAR EQUIPE</button><button class="return-btn" data-act="return" data-o="'+o.id+'" data-v="'+v.id+'">RETORNAR À BASE</button></div>';
  }
  const select=isOperator() && st.key!=='occurrence'
    ? '<select class="status-select" data-status-select data-v="'+v.id+'"><option value="">ALTERAR SITUAÇÃO...</option><option value="base">BASE / QRV</option><option value="asepsis">ASSEPSIA</option><option value="mechanical">PANE / BAIXADA</option><option value="noCrew">FALTA DE EQUIPE</option><option value="noStretcher">SEM MACA</option></select>'
    : '';
  return '<div class="regional-vehicle '+st.cls+'" data-team-card data-v="'+v.id+'">'+
    '<div class="regional-vehicle-top"><div><div class="regional-vehicle-name">'+esc(v.nome||v.codigo)+'<span class="type-badge">'+esc(v.tipo||'')+'</span></div><div class="vehicle-subhint">CLIQUE PARA EDITAR EQUIPE</div></div><span class="status-badge">'+st.label+'</span></div>'+
    '<div class="regional-crew '+(mem.length===1?'one':mem.length===2?'two':'')+'">'+crew+'</div>'+
    '<div class="crew-setup '+comp.state+'"><b>'+comp.label+'</b><span>'+mem.length+' profissional(is)</span></div>'+
    (o?'<div class="regional-occ">OC. '+esc(o.numero||'—')+' • '+esc(o.natureza||'SEM NATUREZA')+'</div>'+occurrenceInfoHtml(v,o).replace(/^<div class="occ-detail"[\s\S]*?<div class="occurrence-main-actions">/,'<div class="occurrence-main-actions">'):'')+
    '<div class="regional-controls">'+actions+select+'</div>'+
  '</div>';
}
function renderRegional(){
  const reg=vehicles.filter(v=>!isAnapolisVehicle(v));
  const sts=reg.map(statusInfo);
  $('#regionalOverview').innerHTML=[
    ['QRV',sts.filter(x=>x.key==='base').length],
    ['OCORRÊNCIA',sts.filter(x=>x.key==='occurrence').length],
    ['RETORNANDO',sts.filter(x=>x.key==='returning').length],
    ['BAIXADAS',sts.filter(x=>['asepsis','mechanical','noCrew','noStretcher'].includes(x.key)).length]
  ].map(x=>'<div class="sum"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');

  const groups={};
  reg.forEach(v=>{const b=v.bases?.nome||'SEM BASE';(groups[b]??=[]).push(v)});
  $('#regionalGrid').innerHTML=Object.entries(groups)
    .sort((a,b)=>regionalOrderIndex(a[0])-regionalOrderIndex(b[0]))
    .map(([baseName,list])=>{
      list.sort((a,b)=>(vehicleType(a).includes('USA')?1:2)-(vehicleType(b).includes('USA')?1:2)||String(a.nome).localeCompare(String(b.nome),'pt-BR'));
      const states=list.map(statusInfo);
      const label=states.some(x=>x.key==='occurrence')?'OCORRÊNCIA':states.some(x=>x.key==='returning')?'RETORNANDO':states.every(x=>x.key==='base')?'QRV':'ATENÇÃO';
      return '<article class="regional-card"><div class="regional-card-head"><div><div class="regional-name">'+esc(baseName)+'</div><div class="regional-sub">USA antes da USB • '+list.length+' viatura(s)</div></div><span class="regional-base-status">'+label+'</span></div><div class="regional-vehicles">'+list.map(regionalVehicleHtml).join('')+'</div></article>';
    }).join('');
  bindVehicleActions($('#regionalGrid'));
}

function destinationCard(o){
  const v=vehicleById(o.viatura_id);
  return '<div class="destination-card">'+
    '<div class="occ-number">#'+esc(o.numero||'—')+'</div>'+
    '<div class="occ-place">'+esc(o.destino||o.bairro||'Destino não informado')+'</div>'+
    '<div class="occ-vehicle">'+esc(v?.nome||o.viatura_snapshot||'Sem viatura')+'</div>'+
    (isOperator()?'<div class="destination-actions"><button class="edit" data-edit-occ="'+o.id+'">EDITAR</button><button class="delete" data-delete-occ="'+o.id+'">EXCLUIR</button></div>':'')+
  '</div>';
}
function renderDestinations(){
  const active=occurrences.filter(o=>!['QTA','CANCELADA'].includes(norm(o.status)));
  const anIds=new Set(vehicles.filter(isAnapolisVehicle).map(v=>v.id));
  const an=active.filter(o=>o.viatura_id&&anIds.has(o.viatura_id));
  const rg=active.filter(o=>o.viatura_id&&!anIds.has(o.viatura_id));
  const un=active.filter(o=>!o.viatura_id);
  const make=list=>list.length?list.map(destinationCard).join(''):'<div class="priority-empty">Nenhuma ocorrência registrada.</div>';
  $('#destAnapolis').innerHTML=make(an);
  $('#destRegional').innerHTML=make(rg);
  $('#destUnassigned').innerHTML=make(un);
  $('#destUnassignedWrap').classList.toggle('hidden',!un.length);
  bindOccurrenceActions($('#base'));
}

function teamSearchText(p){
  return norm((p.nome_completo||'')+' '+(p.nome_de_guerra||'')+' '+(p.funcao_sistema||''));
}
function renderTeamSearch(q){
  const box=$('#teamSearchResults');
  const n=norm(q);
  if(n.length<3){box.classList.remove('show');box.innerHTML='';return}
  const list=professionals.filter(p=>teamSearchText(p).includes(n)).slice(0,20);
  box.innerHTML=list.length?list.map(p=>
    '<div class="team-search-result"><div><div class="team-search-name">'+esc(displayName(p))+'</div><div class="team-search-meta">'+esc(p.nome_completo||'')+'</div></div><div class="team-search-meta">'+esc(p.funcao_sistema||'')+'</div><button class="btn primary" data-assign-prof="'+p.id+'">ESCALAR</button></div>'
  ).join(''):'<div class="autocomplete-empty">Nenhum profissional encontrado.</div><button type="button" class="autocomplete-register" data-register-new="1">+ CADASTRAR NOVO PROFISSIONAL</button>';
  box.classList.add('show');
  box.querySelectorAll('[data-assign-prof]').forEach(b=>b.onclick=()=>openAssignModal(b.dataset.assignProf));
  const add=box.querySelector('[data-register-new]');
  if(add)add.onclick=()=>openQuickRegistration(q,'other',null,null);
}

function rosterPersonHtml(m){
  const v=vehicleById(m.viatura_id);
  const assign=v?.nome||m.viatura_snapshot||m.grupo_revezamento||m.tipo_escala||'SEM VIATURA';
  return '<div class="roster-person"><div><div class="roster-person-name">'+esc(displayName(m.profissionais))+'</div><div class="roster-person-meta">'+esc(m.funcao)+' • '+esc(assign)+'</div></div>'+
    '<div class="roster-person-actions"><button class="person-occ" data-individual-occ="'+m.id+'">LANÇAR Nº OCORRÊNCIA</button>'+(isOperator()?'<button class="person-remove" data-remove-member="'+m.id+'">RETIRAR DA ESCALA</button>':'')+'</div></div>';
}
function renderTeamPreview(){
  const active=activeTeamRows();
  $('#teamShiftRosterCount').textContent=active.length+' escalado(s)';
  const an=active.filter(m=>!m.viatura_id || isAnapolisVehicle(vehicleById(m.viatura_id)));
  const rg=active.filter(m=>m.viatura_id && !isAnapolisVehicle(vehicleById(m.viatura_id)));
  const renderRegion=(title,subtitle,list)=>{
    const groups=[['driver','CONDUTORES'],['tech','TÉCNICOS'],['nurse','ENFERMEIROS'],['doctor','MÉDICOS'],['moto','MOTOLÂNCIA']];
    return '<section class="roster-region"><div class="roster-region-head"><b>'+title+'</b><span>'+subtitle+'</span></div>'+
      groups.map(([key,label])=>{
        const arr=list.filter(m=>teamRoleKey(m)===key);
        if(!arr.length)return '';
        return '<div class="roster-role-group"><div class="roster-role-head"><b>'+label+'</b><span>'+arr.length+'</span></div><div class="roster-list">'+arr.map(rosterPersonHtml).join('')+'</div></div>';
      }).join('')+
      (!list.length?'<div class="priority-empty">Nenhum profissional escalado nesta região.</div>':'')+
    '</section>';
  };
  $('#teamPreview').innerHTML=
    renderRegion('ANÁPOLIS','Equipe operacional e profissionais em revezamento sem viatura fixa.',an)+
    renderRegion('BASES DESCENTRALIZADAS','Profissionais vinculados às viaturas regionais.',rg);
  $('#teamPreview').querySelectorAll('[data-individual-occ]').forEach(b=>b.onclick=()=>openIndividualOccurrence(b.dataset.individualOcc));
  $('#teamPreview').querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=()=>removeTeamMember(b.dataset.removeMember));
}

function renderHistory(){
  const tbody=$('#historyTable');
  if(!occurrences.length){
    tbody.innerHTML='<tr><td colspan="16">Nenhuma ocorrência registrada neste plantão.</td></tr>';
    return;
  }
  tbody.innerHTML=occurrences.map(o=>{
    const v=vehicleById(o.viatura_id);
    const tq=minutesBetween(o.saida_em||o.acionada_em,o.chegada_qth_em);
    const tr=minutesBetween(o.inicio_retorno_em,o.retorno_base_em);
    const tt=minutesBetween(o.saida_em||o.acionada_em,o.retorno_base_em||o.finalizado_em);
    return '<tr>'+
      '<td>'+esc(o.numero||'—')+'</td><td>'+esc(v?.nome||o.viatura_snapshot||'—')+'</td><td>'+esc(o.natureza||'—')+'</td><td>'+esc(o.bairro||'—')+'</td><td>'+esc(o.destino||'—')+'</td><td>'+esc(o.endereco||'—')+'</td><td>'+esc(occurrenceCrewText(o))+'</td>'+
      '<td>'+fmtTime(o.saida_em||o.acionada_em)+'</td><td>'+fmtTime(o.chegada_qth_em)+'</td><td>'+fmtMinutes(tq)+'</td><td>'+fmtTime(o.inicio_retorno_em)+'</td><td>'+fmtTime(o.retorno_base_em)+'</td><td>'+fmtMinutes(tr)+'</td><td>'+fmtMinutes(tt)+'</td><td>'+esc(o.observacao||'—')+'</td>'+
      '<td>'+(isOperator()?'<div class="history-actions"><button class="history-edit" data-edit-occ="'+o.id+'">EDITAR</button><button class="history-delete" data-delete-occ="'+o.id+'">EXCLUIR</button></div>':'—')+'</td>'+
    '</tr>';
  }).join('');
  bindOccurrenceActions($('#history'));
}

function bindVehicleActions(root){
  root.querySelectorAll('[data-team-card]').forEach(card=>{
    card.onclick=e=>{
      if(e.target.closest('button,select,input,textarea,a'))return;
      openTeamModal(card.dataset.v);
    };
  });
  root.querySelectorAll('[data-act="dispatch"]').forEach(b=>b.onclick=()=>{
    const v=vehicleById(b.dataset.v);
    if(!validateDispatchCrew(v))return;
    openOccurrenceModal(b.dataset.v);
  });
  root.querySelectorAll('[data-act="qth"]').forEach(b=>b.onclick=()=>setOccurrenceQth(b.dataset.o));
  root.querySelectorAll('[data-act="qta"]').forEach(b=>b.onclick=()=>setOccurrenceQta(b.dataset.o,b.dataset.v));
  root.querySelectorAll('[data-act="return"]').forEach(b=>b.onclick=()=>setReturning(b.dataset.o,b.dataset.v));
  root.querySelectorAll('[data-act="arrive"]').forEach(b=>b.onclick=()=>setArrived(b.dataset.o,b.dataset.v));
  root.querySelectorAll('[data-act="edit-team"]').forEach(b=>b.onclick=()=>openTeamModal(b.dataset.v));
  root.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>setVehicleStatus(b.dataset.v,b.dataset.status));
  root.querySelectorAll('[data-status-select]').forEach(s=>s.onchange=()=>{if(s.value)setVehicleStatus(s.dataset.v,s.value)});
}
function bindOccurrenceActions(root){
  root.querySelectorAll('[data-edit-occ]').forEach(b=>b.onclick=()=>openOccurrenceEdit(b.dataset.editOcc));
  root.querySelectorAll('[data-delete-occ]').forEach(b=>b.onclick=()=>deleteOccurrence(b.dataset.deleteOcc));
}

/* ---------- quick team ---------- */
function allowedForField(p,key){
  const r=professionalRoleKey(p);
  if(key==='driver') return canDriveProfessional(p);
  if(key==='tech') return r==='tech'||r==='nurse';
  if(key==='nurse') return r==='nurse';
  if(key==='doctor') return r==='doctor';
  if(key==='moto') return canDriveProfessional(p);
  return true;
}
function currentByRole(vId,key){
  return activeTeamRows().find(m=>m.viatura_id===vId && (teamRoleKey(m)===key || (key==='tech'&&teamRoleKey(m)==='nurse'&&norm(m.funcao).includes('TECN')))) || null;
}
function quickCfg(){
  return {
    driver:{input:'#qtDriver',hidden:'#qtDriverId',results:'#qtDriverResults',current:'#qtDriverCurrent',remove:'#qtDriverRemove'},
    tech:{input:'#qtTech',hidden:'#qtTechId',results:'#qtTechResults',current:'#qtTechCurrent',remove:'#qtTechRemove'},
    nurse:{input:'#qtNurse',hidden:'#qtNurseId',results:'#qtNurseResults',current:'#qtNurseCurrent',remove:'#qtNurseRemove'},
    doctor:{input:'#qtDoctor',hidden:'#qtDoctorId',results:'#qtDoctorResults',current:'#qtDoctorCurrent',remove:'#qtDoctorRemove'}
  };
}
function quickModalMode(v){
  const t=vehicleType(v);
  if(t.includes('MOTO'))return 'moto';
  if(t.includes('USA'))return 'usa';
  if(t.includes('USB'))return 'usb';
  return 'generic';
}
function effectiveQuickRole(key){
  const v=vehicleById(selectedTeamVehicle);
  return quickModalMode(v)==='moto' && (key==='driver'||key==='tech') ? 'moto' : key;
}
function currentQuickMember(vId,key){
  const v=vehicleById(vId);
  if(quickModalMode(v)==='moto'){
    const fn=key==='driver'?'MOTOLANCIA 1':key==='tech'?'MOTOLANCIA 2':null;
    if(!fn)return null;
    return activeTeamRows().find(m=>m.viatura_id===vId && norm(m.funcao)===fn)||null;
  }
  return currentByRole(vId,key);
}
function configureQuickTeamFields(v){
  const mode=quickModalMode(v);
  const fields={
    driver:document.querySelector('#teamModal [data-role="driver"]'),
    tech:document.querySelector('#teamModal [data-role="tech"]'),
    nurse:document.querySelector('#teamModal [data-role="nurse"]'),
    doctor:document.querySelector('#teamModal [data-role="doctor"]')
  };
  const visible=mode==='moto'?['driver','tech']:mode==='usa'?['driver','nurse','doctor']:mode==='usb'?['driver','tech']:Object.keys(fields);
  Object.entries(fields).forEach(([k,el])=>el?.classList.toggle('hidden',!visible.includes(k)));

  if(mode==='moto'){
    fields.driver.querySelector('label').textContent='MOTOLÂNCIA 1';
    fields.tech.querySelector('label').textContent='MOTOLÂNCIA 2';
    $('#qtDriver').placeholder='Digite o nome do piloto 1';
    $('#qtTech').placeholder='Digite o nome do piloto 2';
  }else{
    fields.driver.querySelector('label').textContent='CONDUTOR';
    fields.tech.querySelector('label').textContent='TÉCNICO DE ENFERMAGEM';
    $('#qtDriver').placeholder='Digite o nome do condutor';
    $('#qtTech').placeholder='Digite o nome do técnico ou enfermeiro';
  }
}
function professionalLabel(p,key){
  const short=displayName(p);
  const full=(p?.nome_completo||'').toUpperCase();
  return short===full ? full : short+' — '+full;
}
function defaultRoleForKey(key){
  return {driver:'Condutor',moto:'Motolância',tech:'Técnico de Enfermagem',nurse:'Enfermeiro',doctor:'Médico'}[key]||'Condutor';
}
function openQuickRegistration(name,key,input,hidden){
  pendingQuickRegistration={key,input,hidden};
  $('#quickRegName').value=String(name||'').trim();
  $('#quickRegWar').value='';
  $('#quickRegRole').value=defaultRoleForKey(key);
  openModal('quickRegisterModal');
}
function showAutocomplete(box,list,key,input,hidden){
  box.innerHTML=list.length
    ? list.map(p=>'<button type="button" class="autocomplete-result" data-prof="'+p.id+'"><b>'+esc(professionalLabel(p,key))+'</b><small>'+esc(p.funcao_sistema||'')+'</small></button>').join('')
    : '<div class="autocomplete-empty">Nenhum profissional encontrado.</div><button type="button" class="autocomplete-register" data-register-new="1">+ CADASTRAR NOVO PROFISSIONAL</button>';
  box.classList.add('show');
  box.querySelectorAll('[data-prof]').forEach(b=>b.onclick=()=>{
    const p=professionals.find(x=>x.id===b.dataset.prof);
    input.value=professionalLabel(p,key);
    hidden.value=p.id;
    box.classList.remove('show');
  });
  const add=box.querySelector('[data-register-new]');
  if(add)add.onclick=()=>openQuickRegistration(input.value,key,input,hidden);
}
function quickAutocomplete(key){
  const cfg=quickCfg()[key],input=$(cfg.input),hidden=$(cfg.hidden),box=$(cfg.results),q=norm(input.value);
  const role=effectiveQuickRole(key);
  hidden.value='';
  if(q.length<3){box.classList.remove('show');box.innerHTML='';return}
  const list=professionals.filter(p=>allowedForField(p,role)&&teamSearchText(p).includes(q)).slice(0,15);
  showAutocomplete(box,list,role,input,hidden);
}
function bindQuickInputs(){
  Object.entries(quickCfg()).forEach(([key,cfg])=>{
    const input=$(cfg.input),remove=$(cfg.remove);
    if(!input.dataset.bound){
      input.dataset.bound='1';
      input.addEventListener('input',()=>quickAutocomplete(key));
      input.addEventListener('keydown',e=>{if(e.key==='Escape')$(cfg.results).classList.remove('show')});
    }
    remove.onclick=()=>{
      $(cfg.hidden).value='__REMOVE__';
      input.value='';
      $(cfg.current).textContent='Será removido ao salvar.';
      $(cfg.results).classList.remove('show');
      remove.classList.remove('show');
    };
  });
}
async function openTeamModal(vId){
  if(!isOperator())return;
  if(!currentPlantao)await ensurePlantaoForBook();
  await ensureProfessionals();
  selectedTeamVehicle=vId;
  const v=vehicleById(vId);
  $('#teamModalTitle').textContent='Equipe rápida — '+(v?.nome||v?.codigo||'Viatura');
  bindQuickInputs();
  configureQuickTeamFields(v);
  Object.entries(quickCfg()).forEach(([key,cfg])=>{
    const cur=currentQuickMember(vId,key);
    $(cfg.input).value='';
    $(cfg.hidden).value='';
    $(cfg.results).innerHTML='';
    $(cfg.results).classList.remove('show');
    $(cfg.current).textContent=cur?'Atual: '+displayName(cur.profissionais):'Nenhum profissional nesta função.';
    $(cfg.remove).classList.toggle('show',!!cur);
  });
  openModal('teamModal');
  setTimeout(()=>$('#qtDriver').focus(),30);
}
async function deactivateTeamRow(m,now){
  const r=await supabase.from('equipe_plantao').update({status:'INATIVO',saiu_em:now}).eq('id',m.id);
  if(r.error)throw r.error;
  const v=vehicleById(m.viatura_id),o=v?activeOccurrence(v):null;
  if(o){
    await supabase.from('equipe_ocorrencia').delete().eq('ocorrencia_id',o.id).eq('profissional_id',m.profissional_id);
  }
}
async function assignProfessionalToVehicle(proId,vId,funcao,source='EDICAO_RAPIDA'){
  if(!currentPlantao)await ensurePlantaoForBook();
  const pro=professionals.find(p=>p.id===proId);
  const v=vehicleById(vId);
  if(!pro||!v)throw new Error('Profissional ou viatura não encontrado.');
  const now=new Date().toISOString();
  const currentSameRole=activeTeamRows().find(m=>m.viatura_id===vId && norm(m.funcao)===norm(funcao));
  if(currentSameRole?.profissional_id===proId)return;
  const elsewhere=activeTeamRows().find(m=>m.profissional_id===proId && m.id!==currentSameRole?.id);
  if(elsewhere){
    const oldV=vehicleById(elsewhere.viatura_id);
    if(!confirm(pro.nome_completo+' já está em '+(oldV?.nome||elsewhere.viatura_snapshot||'outra escala')+'.\n\nDeseja transferir para '+v.nome+'?'))return;
    await deactivateTeamRow(elsewhere,now);
  }
  if(currentSameRole)await deactivateTeamRow(currentSameRole,now);
  const ins=await supabase.from('equipe_plantao').insert({
    plantao_id:currentPlantao.id,profissional_id:proId,nome_snapshot:pro.nome_completo,funcao,tipo_escala:'FIXO EM VIATURA',
    viatura_id:vId,viatura_snapshot:v.nome,status:'ATIVO',entrou_em:now,origem_escala:source
  }).select('id').single();
  if(ins.error)throw ins.error;
  const o=activeOccurrence(v);
  if(o){
    const eo=await supabase.from('equipe_ocorrencia').upsert({
      ocorrencia_id:o.id,profissional_id:proId,funcao,nome_snapshot:pro.nome_completo,viatura_id:vId,viatura_snapshot:v.nome,tipo_escala_no_momento:'FIXO EM VIATURA'
    },{onConflict:'ocorrencia_id,profissional_id'});
    if(eo.error)throw eo.error;
  }
}
async function saveQuickTeam(){
  if(!isOperator()||!currentPlantao||!selectedTeamVehicle)return;
  const v=vehicleById(selectedTeamVehicle);
  const mode=quickModalMode(v);
  const rows=mode==='moto'
    ? [
        ['driver','#qtDriverId','Motolância 1','moto'],
        ['tech','#qtTechId','Motolância 2','moto']
      ]
    : mode==='usa'
      ? [
          ['driver','#qtDriverId','Condutor','driver'],
          ['nurse','#qtNurseId','Enfermeiro','nurse'],
          ['doctor','#qtDoctorId','Médico','doctor']
        ]
      : mode==='usb'
        ? [
            ['driver','#qtDriverId','Condutor','driver'],
            ['tech','#qtTechId','Técnico de Enfermagem','tech']
          ]
        : [
            ['driver','#qtDriverId','Condutor','driver'],
            ['tech','#qtTechId','Técnico de Enfermagem','tech'],
            ['nurse','#qtNurseId','Enfermeiro','nurse'],
            ['doctor','#qtDoctorId','Médico','doctor']
          ];
  $('#saveTeam').disabled=true;$('#saveTeam').textContent='SALVANDO...';
  try{
    for(const [key,idSel,funcao,allowedKey] of rows){
      const value=$(idSel).value;
      if(!value)continue;
      const cur=currentQuickMember(selectedTeamVehicle,key);
      if(value==='__REMOVE__'){
        if(cur)await deactivateTeamRow(cur,new Date().toISOString());
        continue;
      }
      const pro=professionals.find(p=>p.id===value);
      if(!pro||!allowedForField(pro,allowedKey))throw new Error('Profissional inválido para o campo '+(mode==='moto'?funcao:roleLabel(allowedKey))+'.');
      await assignProfessionalToVehicle(value,selectedTeamVehicle,funcao);
    }
    closeModal('teamModal');
    selectedTeamVehicle=null;
    await loadAll(selectedDate());
  }catch(e){alert('Não foi possível salvar a equipe: '+(e.message||e))}
  finally{$('#saveTeam').disabled=false;$('#saveTeam').textContent='SALVAR EQUIPE'}
}

/* ---------- occurrence ---------- */
function populateVehicleSelect(selectEl,selected=null,allowEmpty=true){
  selectEl.innerHTML=(allowEmpty?'<option value="">SEM VIATURA / LANÇAMENTO MANUAL</option>':'')+
    vehicles.map(v=>'<option value="'+v.id+'">'+esc(v.nome||v.codigo)+' • '+esc(v.bases?.nome||'')+'</option>').join('');
  if(selected)selectEl.value=selected;
}
function openOccurrenceModal(vId=null){
  if(!isOperator())return;
  if(!currentPlantao)return alert('Selecione um plantão antes de lançar ocorrência.');
  selectedVehicle=vId;
  populateVehicleSelect($('#occVehicleSelect'),vId,true);
  $('#occModalTitle').textContent=vId?'Acionar '+(vehicleById(vId)?.nome||'viatura'):'Lançar ocorrência manual';
  $('#occNumber').value='';$('#occNature').value='';$('#occBairro').value='';$('#occDestino').value='';$('#occEndereco').value='';$('#occObs').value='';$('#occStart').value=nowLocalTime();
  openModal('occModal');
}
async function saveOccurrence(){
  if(!isOperator()||!currentPlantao)return;
  const vId=$('#occVehicleSelect').value||null;
  const v=vehicleById(vId);
  if(vId&&!validateDispatchCrew(v))return;
  const now=localDateTimeIso(currentPlantao.data_plantao,$('#occStart').value||nowLocalTime());
  const crit=currentRotationCriterion();
  const autoCrew=v?automaticDispatchCrew(v):[];
  const payload={
    plantao_id:currentPlantao.id,viatura_id:vId,numero:$('#occNumber').value.trim()||null,natureza:$('#occNature').value.trim()||null,
    bairro:$('#occBairro').value.trim()||null,destino:$('#occDestino').value.trim()||null,endereco:$('#occEndereco').value.trim()||null,
    observacao:$('#occObs').value.trim()||null,status:vId?'EM OCORRENCIA':'FINALIZADA',acionada_em:now,saida_em:now,
    viatura_snapshot:v?.nome||null,base_snapshot:v?.bases?.nome||null,data_ocorrencia:currentPlantao.data_plantao,criado_por:profile?.nome||null,
    finalizado_em:vId?null:new Date().toISOString(),
    criterio_prioridade:vId?rotationCriterionDbValue(crit):null,
    motivo_prioridade:vId?(crit==='occurrences'?'Menor número de ocorrências; desempate pelo maior tempo na base.':'Maior tempo disponível na base; desempate pelo menor número de ocorrências.'):null,
    tempo_base_antes_min:vId?Math.max(0,vehicleBaseMinutes(v)):null
  };
  $('#saveOcc').disabled=true;
  try{
    const {data:o,error}=await supabase.from('ocorrencias').insert(payload).select().single();
    if(error)throw error;
    if(vId){
      const ur=await supabase.from('viaturas').update({status_atual:'OCORRENCIA'}).eq('id',vId);
      if(ur.error)throw ur.error;

      // Mantém fixos na própria viatura e completa as vagas com quem está da vez
      // nas filas de condutor/técnico/enfermeiro.
      if(autoCrew.length){
        const er=await supabase.from('equipe_ocorrencia').insert(autoCrew.map(m=>({
          ocorrencia_id:o.id,profissional_id:m.profissional_id,funcao:m.funcao,nome_snapshot:m.nome_snapshot||m.profissionais?.nome_completo,
          viatura_id:vId,viatura_snapshot:v.nome,tipo_escala_no_momento:m.tipo_escala
        })));
        if(er.error)throw er.error;
      }
    }
    closeModal('occModal');
    await loadAll(selectedDate());
  }catch(e){alert('Erro ao lançar ocorrência: '+(e.message||e))}
  finally{$('#saveOcc').disabled=false}
}
async function setOccurrenceQth(id){
  if(!isOperator())return;
  const o=occurrences.find(x=>x.id===id);
  if(o?.chegada_qth_em && !confirm('O QTH já foi registrado às '+fmtTime(o.chegada_qth_em)+'. Deseja atualizar o horário?'))return;
  const {error}=await supabase.from('ocorrencias').update({chegada_qth_em:new Date().toISOString()}).eq('id',id);
  if(error)alert(error.message);
}
async function setOccurrenceQta(oid,vid){
  if(!isOperator()||!confirm('CONFIRMAR QTA?\n\nA ocorrência não será contabilizada no revezamento e a viatura volta para BASE.'))return;
  const now=new Date().toISOString();
  const r=await supabase.from('ocorrencias').update({status:'QTA',qta_em:now,finalizado_em:now,finalizado_por:profile?.nome||null,creditou_revezamento:false}).eq('id',oid);
  if(r.error)return alert(r.error.message);

  // QTA não soma ocorrência, mas reinicia o relógio de tempo na base
  // para quem chegou a ser empenhado.
  const ids=[...new Set(occurrenceMembers(oid).map(x=>x.profissional_id).filter(Boolean))];
  for(const id of ids){
    const row=activeTeamRows().find(m=>m.profissional_id===id);
    if(row)await supabase.from('equipe_plantao').update({ultimo_retorno_em:now}).eq('id',row.id);
  }
  if(vid)await supabase.from('viaturas').update({status_atual:'BASE'}).eq('id',vid);
}
async function setReturning(oid,vid){
  if(!isOperator())return;
  const now=new Date().toISOString();
  if(oid){const r=await supabase.from('ocorrencias').update({status:'RETORNANDO',inicio_retorno_em:now}).eq('id',oid);if(r.error)return alert(r.error.message)}
  if(vid){const r=await supabase.from('viaturas').update({status_atual:'RETORNANDO'}).eq('id',vid);if(r.error)alert(r.error.message)}
}
async function creditOccurrence(occ){
  if(!occ||occ.creditou_revezamento)return;
  const members=occurrenceMembers(occ.id);
  const now=new Date().toISOString();
  for(const em of members){
    const m=activeTeamRows().find(x=>x.profissional_id===em.profissional_id);
    if(!m)continue;
    await supabase.from('equipe_plantao').update({
      ocorrencias_validas:Number(m.ocorrencias_validas||0)+1,
      ultima_ocorrencia_em:now,
      ultimo_retorno_em:now,
      pontuacao_revezamento:Number(m.pontuacao_revezamento||0)+Number(occ.peso_ocorrencia||1)
    }).eq('id',m.id);
  }
  await supabase.from('ocorrencias').update({creditou_revezamento:true}).eq('id',occ.id);
}
async function setArrived(oid,vid){
  if(!isOperator()||!confirm('Confirmar CHEGADA À BASE e finalizar o atendimento?'))return;
  const now=new Date().toISOString();
  const o=occurrences.find(x=>x.id===oid);
  if(oid){
    const r=await supabase.from('ocorrencias').update({status:'FINALIZADA',retorno_base_em:now,finalizado_em:now,finalizado_por:profile?.nome||null}).eq('id',oid);
    if(r.error)return alert(r.error.message);
    await creditOccurrence(o);
  }
  if(vid)await supabase.from('viaturas').update({status_atual:'BASE'}).eq('id',vid);
}
async function setVehicleStatus(vId,key){
  if(!isOperator())return;
  const v=vehicleById(vId);
  if(activeOccurrence(v))return alert('Finalize a ocorrência antes de alterar a situação da viatura.');
  const {error}=await supabase.from('viaturas').update({status_atual:statusDbValue(key)}).eq('id',vId);
  if(error)alert(error.message);
}
function openOccurrenceEdit(id){
  if(!isOperator())return;
  const o=occurrences.find(x=>x.id===id);if(!o)return;
  selectedEditOccurrence=o;
  $('#editOccNumber').value=o.numero||'';$('#editOccNature').value=o.natureza||'';$('#editOccBairro').value=o.bairro||'';$('#editOccDestino').value=o.destino||'';$('#editOccEndereco').value=o.endereco||'';$('#editOccObs').value=o.observacao||'';
  openModal('occEditModal');
}
async function saveOccurrenceEdit(){
  if(!isOperator()||!selectedEditOccurrence)return;
  const payload={numero:$('#editOccNumber').value.trim()||null,natureza:$('#editOccNature').value.trim()||null,bairro:$('#editOccBairro').value.trim()||null,destino:$('#editOccDestino').value.trim()||null,endereco:$('#editOccEndereco').value.trim()||null,observacao:$('#editOccObs').value.trim()||null};
  const {error}=await supabase.from('ocorrencias').update(payload).eq('id',selectedEditOccurrence.id);
  if(error)return alert(error.message);
  closeModal('occEditModal');selectedEditOccurrence=null;await loadAll(selectedDate());
}
async function deleteOccurrence(id){
  if(!isOperator())return;
  const o=occurrences.find(x=>x.id===id);if(!o)return;
  if(!confirm('EXCLUIR A OCORRÊNCIA #'+(o.numero||'—')+'?\n\nEla será removida do histórico e esta ação não pode ser desfeita.'))return;
  if(o.viatura_id && !['FINALIZADA','QTA','CANCELADA'].includes(norm(o.status))){
    await supabase.from('viaturas').update({status_atual:'BASE'}).eq('id',o.viatura_id);
  }
  const {error}=await supabase.from('ocorrencias').delete().eq('id',id);
  if(error)alert(error.message);else await loadAll(selectedDate());
}

/* ---------- escala expressa ---------- */
async function loadExpressScale(){
  const ala=$('#expressAla').value,turno=$('#expressTurno').value;
  const {data,error}=await supabase.from('escala_fixa_anapolis')
    .select('*,profissionais(id,nome_completo,nome_de_guerra,funcao_sistema)')
    .eq('ala',ala).eq('turno',turno).eq('ativo',true).order('ordem');
  if(error){
    $('#expressStatus').className='express-status warn';
    $('#expressStatus').textContent=error.message;
    return;
  }
  scaleRows=data||[];
  $('#expressStatus').className='express-status ok';
  $('#expressStatus').innerHTML='<b>'+scaleRows.length+' posições pré-carregadas.</b> Os nomes da escala aparecem como referência, mas ninguém entra escalado automaticamente. Clique em ESCALAR somente em quem realmente ficará no plantão.';
  renderExpressDrivers();
}
function expressDecisionTime(m){
  return new Date(m?.saiu_em||m?.entrou_em||m?.criado_em||0).getTime()||0;
}
function expressLatestDecision(r){
  return team
    .filter(m=>m.titular_profissional_id===r.profissional_id || (m.profissional_id===r.profissional_id && norm(m.ala_escala)===norm(currentPlantao?.ala) && norm(m.turno_escala)===norm(currentPlantao?.turno)))
    .sort((a,b)=>expressDecisionTime(b)-expressDecisionTime(a))[0]||null;
}
function expressRowState(r){
  const v=vehicleByCode(r.codigo_viatura);
  const active=activeTeamRows();
  let current=active.find(m=>
    teamRoleKey(m)==='driver' &&
    (m.titular_profissional_id===r.profissional_id ||
     (m.profissional_id===r.profissional_id && (m.viatura_id===v?.id || isRotationMember(m))))
  ) || null;
  if(!current && v) current=currentByRole(v.id,'driver');

  if(!r.profissional_id)return {state:'unresolved',label:'NÃO CADASTRADO',v,current};

  if(current){
    const isPermuta=norm(current.tipo_alteracao_escala)==='PERMUTA' || current.profissional_id!==r.profissional_id;
    if(isPermuta){
      const mode=isRotationMember(current)?'REVEZ.':'FIXO';
      return {state:'permuta',label:'PERMUTA • '+mode,v,current};
    }
    if(isRotationMember(current))return {state:'rotation',label:'REVEZAMENTO',v,current};
    return {state:'fixed',label:'FIXO',v,current};
  }

  const decision=expressLatestDecision(r);
  if(norm(decision?.tipo_alteracao_escala)==='AUSENTE')return {state:'absent',label:'AUSENTE',v,current:null};
  return {state:'vacant',label:'NÃO ESCALADO',v,current:null};
}
function expressCard(r){
  const st=expressRowState(r),v=st.v,current=st.current;
  const titular=r.profissionais?displayName(r.profissionais):r.nome_referencia;
  const currentName=current?displayName(current.profissionais):'—';
  const isFixed=st.state==='fixed';
  return '<article class="express-driver-card '+st.state+'">'+
    '<div class="express-driver-top"><div><div class="express-vtr">'+esc(v?.nome||r.codigo_viatura)+'</div><div class="express-vtr-type">'+(v?.tipo==='USA'?'SUPORTE AVANÇADO':'SUPORTE BÁSICO')+'</div></div><span class="express-row-badge '+st.state+'">'+st.label+'</span></div>'+
    '<div class="express-fixed-label">TITULAR DA ESCALA</div><div class="express-fixed-name">'+esc(titular||'SEM TITULAR')+'</div>'+
    '<div class="express-current-label">EM SERVIÇO</div><div class="express-current-name">'+esc(currentName)+'</div>'+
    (st.state==='permuta'?'<div class="express-permuta-note">SUBSTITUINDO: '+esc(titular||'TITULAR')+'</div>':'')+
    '<div class="express-driver-actions">'+
      '<button title="'+(isFixed?'Clique novamente para desescalar':'Escalar o titular fixo nesta viatura')+'" class="fixed '+(isFixed?'active':'')+'" data-exp-fixed="'+r.id+'">'+(isFixed?'✓ FIXO NA VIATURA':'✓ ESCALAR — FIXO')+'</button>'+
      '<button class="rotation '+(st.state==='rotation'?'active':'')+'" data-exp-rotation="'+r.id+'">↻ REVEZAMENTO</button>'+
      '<button class="swap '+(st.state==='permuta'?'active':'')+'" data-exp-swap="'+r.id+'">⇄ PERMUTA</button>'+
      '<button class="absent '+(st.state==='absent'?'active':'')+'" data-exp-absent="'+r.id+'">✕ AUSENTE</button>'+
    '</div>'+
  '</article>';
}
function renderExpressDrivers(){
  const usa=scaleRows.filter(r=>norm(r.codigo_viatura).startsWith('USA'));
  const usb=scaleRows.filter(r=>norm(r.codigo_viatura).startsWith('USB'));
  const group=(type,title,sub,list)=>{
    const ready=list.filter(r=>['fixed','rotation','permuta'].includes(expressRowState(r).state)).length;
    return '<section class="express-vehicle-section"><div class="express-vehicle-section-head"><div><h3>'+title+'</h3><p>'+sub+'</p></div><span>'+ready+'/'+list.length+' definidos</span></div><div class="express-driver-grid">'+(list.length?list.map(expressCard).join(''):'<div class="autocomplete-empty">Nenhum registro.</div>')+'</div></section>';
  };
  $('#expressDriverGrid').innerHTML=group('USA','USA — SUPORTE AVANÇADO','Condutores das Unidades de Suporte Avançado',usa)+group('USB','USB — SUPORTE BÁSICO','Condutores das Unidades de Suporte Básico',usb);
  $('#expressDriverGrid').querySelectorAll('[data-exp-fixed]').forEach(b=>b.onclick=()=>expressUseFixed(b.dataset.expFixed));
  $('#expressDriverGrid').querySelectorAll('[data-exp-rotation]').forEach(b=>b.onclick=()=>expressToggleRotation(b.dataset.expRotation));
  $('#expressDriverGrid').querySelectorAll('[data-exp-swap]').forEach(b=>b.onclick=()=>expressSwap(b.dataset.expSwap));
  $('#expressDriverGrid').querySelectorAll('[data-exp-absent]').forEach(b=>b.onclick=()=>expressAbsent(b.dataset.expAbsent));
}
async function expressUseFixed(rowId){
  if(!isOperator())return;
  if(!currentPlantao)await ensurePlantaoForBook();
  const r=scaleRows.find(x=>x.id===rowId),v=vehicleByCode(r?.codigo_viatura);
  if(!r?.profissional_id||!v)return alert('Titular ou viatura não vinculado ao banco.');
  try{
    const st=expressRowState(r);
    const now=new Date().toISOString();

    if(st.state==='fixed'&&st.current){
      const {error}=await supabase.from('equipe_plantao').update({
        status:'INATIVO',saiu_em:now,tipo_alteracao_escala:'DESESCALADO'
      }).eq('id',st.current.id);
      if(error)throw error;
    }else{
      // Ao trocar de REVEZAMENTO, PERMUTA ou AUSENTE para FIXO,
      // encerra a decisão anterior antes de escalar o titular na viatura.
      if(st.current)await deactivateTeamRow(st.current,now);
      const titularElsewhere=activeTeamRows().find(m=>m.profissional_id===r.profissional_id);
      if(titularElsewhere)await deactivateTeamRow(titularElsewhere,now);

      await assignProfessionalToVehicle(r.profissional_id,v.id,'Condutor','ESCALA_EXPRESSA');
      const cur=activeTeamRows().find(m=>m.viatura_id===v.id&&m.profissional_id===r.profissional_id&&teamRoleKey(m)==='driver');
      if(cur){
        const {error}=await supabase.from('equipe_plantao').update({
          titular_profissional_id:r.profissional_id,
          nome_titular_escala:r.nome_referencia,
          tipo_alteracao_escala:'FIXO',
          ala_escala:currentPlantao.ala,
          turno_escala:currentPlantao.turno
        }).eq('id',cur.id);
        if(error)throw error;
      }
    }
    await loadAll(selectedDate());await loadExpressScale();
  }catch(e){alert(e.message||e)}
}
function expressSwap(rowId){
  const r=scaleRows.find(x=>x.id===rowId),v=vehicleByCode(r?.codigo_viatura);
  if(!r||!v)return alert('Viatura não encontrada.');
  selectedExpressPermutaRow=r;
  $('#expressPermutaTitle').textContent='Permuta — '+(v.nome||r.codigo_viatura);
  $('#expressPermutaTitular').innerHTML='<b>Titular:</b> '+esc(r.nome_referencia||displayName(r.profissionais)||'—');
  $('#expressPermutaSearch').value='';
  $('#expressPermutaProId').value='';
  $('#expressPermutaMode').value='FIXO';
  $('#expressPermutaResults').innerHTML='';
  $('#expressPermutaResults').classList.remove('show');
  openModal('expressPermutaModal');
  setTimeout(()=>$('#expressPermutaSearch').focus(),40);
}
function expressPermutaAutocomplete(){
  const q=norm($('#expressPermutaSearch').value);
  const box=$('#expressPermutaResults');
  $('#expressPermutaProId').value='';
  if(q.length<3){box.classList.remove('show');box.innerHTML='';return}
  const titularId=selectedExpressPermutaRow?.profissional_id;
  const list=professionals.filter(p=>p.id!==titularId && allowedForField(p,'driver') && teamSearchText(p).includes(q)).slice(0,15);
  box.innerHTML=list.length
    ? list.map(p=>'<button type="button" class="autocomplete-result" data-express-perm-pro="'+p.id+'"><b>'+esc(professionalLabel(p,'driver'))+'</b><small>'+esc(p.funcao_sistema||'')+' • '+esc(p.nome_completo)+'</small></button>').join('')
    : '<div class="autocomplete-empty">Nenhum profissional compatível encontrado.</div><button type="button" class="autocomplete-register" data-register-new="1">+ CADASTRAR NOVO PROFISSIONAL</button>';
  box.classList.add('show');
  box.querySelectorAll('[data-express-perm-pro]').forEach(b=>b.onclick=()=>{
    const p=professionals.find(x=>x.id===b.dataset.expressPermPro);
    $('#expressPermutaSearch').value=professionalLabel(p,'driver');
    $('#expressPermutaProId').value=p.id;
    box.classList.remove('show');
  });
  const add=box.querySelector('[data-register-new]');
  if(add)add.onclick=()=>openQuickRegistration($('#expressPermutaSearch').value,'driver',$('#expressPermutaSearch'),$('#expressPermutaProId'));
}
async function saveExpressPermuta(){
  if(!isOperator()||!selectedExpressPermutaRow)return;
  if(!currentPlantao)await ensurePlantaoForBook();
  const r=selectedExpressPermutaRow,v=vehicleByCode(r.codigo_viatura);
  const proId=$('#expressPermutaProId').value;
  const mode=$('#expressPermutaMode').value;
  const pro=professionals.find(p=>p.id===proId);
  if(!pro)return alert('Selecione o condutor substituto.');
  if(!allowedForField(pro,'driver'))return alert('Para este campo, selecione Condutor, Motolância, TARM, Rádio-operador, Lavador ou Sanitária.');

  try{
    const now=new Date().toISOString();
    const old=expressRowState(r).current;
    if(old)await deactivateTeamRow(old,now);

    const elsewhere=activeTeamRows().find(m=>m.profissional_id===proId);
    if(elsewhere){
      const oldV=vehicleById(elsewhere.viatura_id);
      if(!confirm(pro.nome_completo+' já está em '+(oldV?.nome||elsewhere.viatura_snapshot||'outra escala')+'.\n\nDeseja transferir para esta permuta?'))return;
      await deactivateTeamRow(elsewhere,now);
    }

    const type=vehicleType(v).includes('USA')?'USA':'USB';
    const isRotation=mode==='REVEZAMENTO';
    const payload={
      plantao_id:currentPlantao.id,
      profissional_id:pro.id,
      nome_snapshot:pro.nome_completo,
      funcao:'Condutor',
      tipo_escala:isRotation?'REVEZAMENTO':'FIXO EM VIATURA',
      viatura_id:isRotation?null:v.id,
      viatura_snapshot:isRotation?null:v.nome,
      status:'ATIVO',
      entrou_em:now,
      origem_escala:'PERMUTA_ESCALA_EXPRESSA',
      grupo_revezamento:isRotation?type+'_CONDUTOR':null,
      revezamento_tipo_viatura:isRotation?type:null,
      titular_profissional_id:r.profissional_id,
      nome_titular_escala:r.nome_referencia,
      tipo_alteracao_escala:'PERMUTA',
      ala_escala:currentPlantao.ala,
      turno_escala:currentPlantao.turno
    };
    const {error}=await supabase.from('equipe_plantao').insert(payload);
    if(error)throw error;

    closeModal('expressPermutaModal');
    selectedExpressPermutaRow=null;
    await loadAll(selectedDate());await loadExpressScale();
  }catch(e){alert(e.message||e)}
}
async function expressToggleRotation(rowId){
  if(!isOperator())return;
  if(!currentPlantao)await ensurePlantaoForBook();
  const r=scaleRows.find(x=>x.id===rowId),v=vehicleByCode(r?.codigo_viatura);
  if(!r?.profissional_id||!v)return alert('Titular ou viatura não vinculado ao banco.');
  try{
    const st=expressRowState(r);
    const now=new Date().toISOString();

    if(st.state==='rotation'&&st.current){
      await supabase.from('equipe_plantao').update({
        status:'INATIVO',saiu_em:now,tipo_alteracao_escala:'DESESCALADO'
      }).eq('id',st.current.id);
    }else{
      if(st.current)await deactivateTeamRow(st.current,now);
      const existing=activeTeamRows().find(m=>m.profissional_id===r.profissional_id);
      if(existing)await deactivateTeamRow(existing,now);

      const pro=professionals.find(p=>p.id===r.profissional_id);
      const type=vehicleType(v).includes('USA')?'USA':'USB';
      const {error}=await supabase.from('equipe_plantao').insert({
        plantao_id:currentPlantao.id,
        profissional_id:r.profissional_id,
        nome_snapshot:pro?.nome_completo||r.nome_referencia,
        funcao:'Condutor',
        tipo_escala:'REVEZAMENTO',
        viatura_id:null,
        viatura_snapshot:null,
        status:'ATIVO',
        entrou_em:now,
        origem_escala:'ESCALA_EXPRESSA',
        grupo_revezamento:type+'_CONDUTOR',
        revezamento_tipo_viatura:type,
        titular_profissional_id:r.profissional_id,
        nome_titular_escala:r.nome_referencia,
        tipo_alteracao_escala:'REVEZAMENTO',
        ala_escala:currentPlantao.ala,
        turno_escala:currentPlantao.turno
      });
      if(error)throw error;
    }
    await loadAll(selectedDate());await loadExpressScale();
  }catch(e){alert(e.message||e)}
}
async function expressAbsent(rowId){
  if(!isOperator())return;
  if(!currentPlantao)await ensurePlantaoForBook();
  const r=scaleRows.find(x=>x.id===rowId),v=vehicleByCode(r?.codigo_viatura);
  if(!r?.profissional_id||!v)return;
  try{
    const now=new Date().toISOString();
    const st=expressRowState(r);
    if(st.current)await deactivateTeamRow(st.current,now);

    const pro=professionals.find(p=>p.id===r.profissional_id);
    const {error}=await supabase.from('equipe_plantao').insert({
      plantao_id:currentPlantao.id,
      profissional_id:r.profissional_id,
      nome_snapshot:pro?.nome_completo||r.nome_referencia,
      funcao:'Condutor',
      tipo_escala:'AUSENTE',
      viatura_id:null,
      viatura_snapshot:null,
      status:'INATIVO',
      entrou_em:now,
      saiu_em:now,
      origem_escala:'ESCALA_EXPRESSA',
      titular_profissional_id:r.profissional_id,
      nome_titular_escala:r.nome_referencia,
      tipo_alteracao_escala:'AUSENTE',
      ala_escala:currentPlantao.ala,
      turno_escala:currentPlantao.turno
    });
    if(error)throw error;
    await loadAll(selectedDate());await loadExpressScale();
  }catch(e){alert(e.message||e)}
}
async function setAllDriversRotation(){
  if(!isOperator())return;
  if(!currentPlantao)await ensurePlantaoForBook();
  const rows=activeTeamRows().filter(m=>teamRoleKey(m)==='driver'&&m.viatura_id&&isAnapolisVehicle(vehicleById(m.viatura_id))&&['USA','USB'].some(t=>vehicleType(vehicleById(m.viatura_id)).includes(t)));
  if(!rows.length)return alert('Não há condutores fixos ativos para colocar em revezamento.');
  for(const m of rows){
    const v=vehicleById(m.viatura_id),type=vehicleType(v).includes('USA')?'USA':'USB';
    await supabase.from('equipe_plantao').update({
      tipo_escala:'REVEZAMENTO',grupo_revezamento:type+'_CONDUTOR',revezamento_tipo_viatura:type,
      viatura_id:null,viatura_snapshot:null
    }).eq('id',m.id);
  }
  await loadAll(selectedDate());await loadExpressScale();
}
async function restoreFixedDrivers(){
  if(!isOperator()||!scaleRows.length)return;
  if(!currentPlantao)await ensurePlantaoForBook();
  if(!confirm('Restaurar todos os condutores fixos desta Ala/turno? As exceções atuais de condutor serão substituídas.'))return;
  for(const r of scaleRows){
    const v=vehicleByCode(r.codigo_viatura);
    if(v&&r.profissional_id)await assignProfessionalToVehicle(r.profissional_id,v.id,'Condutor','ESCALA_EXPRESSA');
  }
  await loadAll(selectedDate());await loadExpressScale();
}
function expressSearch(role,q){
  const input=role==='tech'?$('#expressTechSearch'):$('#expressNurseSearch');
  const box=role==='tech'?$('#expressTechResults'):$('#expressNurseResults');
  const n=norm(q);
  if(n.length<3){box.classList.remove('show');box.innerHTML='';return}
  const allowed=p=>role==='tech'?['tech','nurse'].includes(professionalRoleKey(p)):professionalRoleKey(p)==='nurse';
  const selected=role==='tech'?expressTechSelected:expressNurseSelected;
  const list=professionals.filter(p=>allowed(p)&&teamSearchText(p).includes(n)&&!selected.has(p.id)).slice(0,15);
  box.innerHTML=list.length?list.map(p=>'<button type="button" class="autocomplete-result" data-exp-prof="'+p.id+'"><b>'+esc(displayName(p))+'</b><small>'+esc(p.nome_completo)+' • '+esc(p.funcao_sistema)+'</small></button>').join(''):'<div class="autocomplete-empty">Nenhum profissional encontrado.</div>';
  box.classList.add('show');
  box.querySelectorAll('[data-exp-prof]').forEach(b=>b.onclick=()=>{
    const p=professionals.find(x=>x.id===b.dataset.expProf);selected.set(p.id,p);input.value='';box.classList.remove('show');renderExpressSelected();
  });
}
function renderExpressSelected(){
  const render=(map,el)=>{el.innerHTML=[...map.values()].map(p=>'<span class="selected-chip">'+esc(displayName(p))+'<button type="button" data-chip-remove="'+p.id+'">×</button></span>').join('');el.querySelectorAll('[data-chip-remove]').forEach(b=>b.onclick=()=>{map.delete(b.dataset.chipRemove);renderExpressSelected()})};
  render(expressTechSelected,$('#expressTechSelected'));render(expressNurseSelected,$('#expressNurseSelected'));
  $('#expressTechCount').textContent=expressTechSelected.size;$('#expressNurseCount').textContent=expressNurseSelected.size;
}
async function putProfessionalInRotation(pro,group,funcao){
  const now=new Date().toISOString();
  const existing=activeTeamRows().find(m=>m.profissional_id===pro.id);
  if(existing){
    if(existing.viatura_id)await deactivateTeamRow(existing,now);
    else{
      const {error}=await supabase.from('equipe_plantao').update({funcao,tipo_escala:'REVEZAMENTO',grupo_revezamento:group,viatura_id:null,viatura_snapshot:null,revezamento_tipo_viatura:group.startsWith('USA')?'USA':'USB',origem_escala:'ESCALA_EXPRESSA'}).eq('id',existing.id);
      if(error)throw error;
      return;
    }
  }
  const {error}=await supabase.from('equipe_plantao').insert({
    plantao_id:currentPlantao.id,profissional_id:pro.id,nome_snapshot:pro.nome_completo,funcao,tipo_escala:'REVEZAMENTO',status:'ATIVO',entrou_em:now,
    grupo_revezamento:group,revezamento_tipo_viatura:group.startsWith('USA')?'USA':'USB',origem_escala:'ESCALA_EXPRESSA'
  });
  if(error)throw error;
}
async function confirmExpress(){
  if(!isOperator())return;
  if(!currentPlantao)await ensurePlantaoForBook();
  const confirmButtons=[$('#confirmExpressBtn'),$('#confirmExpressTopBtn')].filter(Boolean);
  confirmButtons.forEach(b=>{b.disabled=true;b.textContent='CONFIRMANDO...'});
  try{
    for(const p of expressTechSelected.values())await putProfessionalInRotation(p,'USB_TECNICO','Técnico de Enfermagem');
    for(const p of expressNurseSelected.values())await putProfessionalInRotation(p,'USA_ENFERMEIRO','Enfermeiro');
    expressTechSelected.clear();expressNurseSelected.clear();renderExpressSelected();

    const now=new Date().toISOString();
    const {error}=await supabase.from('plantoes').update({
      escala_operacional_confirmada_em:now,
      escala_operacional_confirmada_por:profile?.nome||session?.user?.email||'OPERADOR'
    }).eq('id',currentPlantao.id);
    if(error)throw error;

    currentPlantao={...currentPlantao,
      escala_operacional_confirmada_em:now,
      escala_operacional_confirmada_por:profile?.nome||session?.user?.email||'OPERADOR'
    };
    await loadAll(selectedDate());
    await loadExpressScale();
    await refreshBookProjection();
    renderScaleConfirmationStates();
    $('#expressStatus').className='express-status ok';
    $('#expressStatus').innerHTML='<b>Escala operacional confirmada.</b> A equipe foi registrada e o LIVRO está sincronizado.';
  }catch(e){alert('Erro ao confirmar escala: '+(e.message||e))}
  finally{confirmButtons.forEach(b=>{b.disabled=false;b.textContent='CONFIRMAR ESCALA'})}
}

/* ---------- generic assignment ---------- */
function openAssignModal(proId){
  if(!isOperator())return;
  selectedAssignProfessional=professionals.find(p=>p.id===proId);if(!selectedAssignProfessional)return;
  $('#assignTitle').textContent='Escalar '+displayName(selectedAssignProfessional);
  $('#assignPersonInfo').textContent=selectedAssignProfessional.nome_completo+' • '+selectedAssignProfessional.funcao_sistema;
  populateVehicleSelect($('#assignVehicle'),null,false);
  $('#assignMode').value='FIXO';$('#assignVehicleWrap').classList.remove('hidden');openModal('assignModal');
}
async function confirmAssign(){
  const p=selectedAssignProfessional;if(!p||!currentPlantao)return;
  const mode=$('#assignMode').value;
  try{
    if(mode==='FIXO'){
      const v=vehicleById($('#assignVehicle').value);if(!v)return alert('Escolha uma viatura.');
      let funcao=p.funcao_sistema;
      if(professionalRoleKey(p)==='nurse'&&vehicleType(v).includes('USB'))funcao='Técnico de Enfermagem';
      await assignProfessionalToVehicle(p.id,v.id,funcao,'BUSCA_EQUIPE');
    }else if(mode==='REVEZ_USA'){
      if(!['driver','nurse'].includes(professionalRoleKey(p)))return alert('Para revezamento USA, use condutor ou enfermeiro.');
      await putProfessionalInRotation(p,professionalRoleKey(p)==='driver'?'USA_CONDUTOR':'USA_ENFERMEIRO',professionalRoleKey(p)==='driver'?'Condutor':'Enfermeiro');
    }else{
      if(!['driver','tech','nurse'].includes(professionalRoleKey(p)))return alert('Para revezamento USB, use condutor, técnico ou enfermeiro.');
      await putProfessionalInRotation(p,professionalRoleKey(p)==='driver'?'USB_CONDUTOR':'USB_TECNICO',professionalRoleKey(p)==='driver'?'Condutor':'Técnico de Enfermagem');
    }
    closeModal('assignModal');selectedAssignProfessional=null;$('#teamSearch').value='';$('#teamSearchResults').classList.remove('show');await loadAll(selectedDate());
  }catch(e){alert(e.message||e)}
}
async function removeTeamMember(id){
  if(!isOperator())return;
  const m=team.find(x=>x.id===id);if(!m)return;
  if(!confirm('Retirar '+displayName(m.profissionais)+' da escala atual?'))return;
  await deactivateTeamRow(m,new Date().toISOString());await loadAll(selectedDate());
}

/* ---------- individual occurrence ---------- */
function openIndividualOccurrence(teamId){
  const m=team.find(x=>x.id===teamId);if(!m)return;
  selectedIndividualMember=m;$('#individualOccTitle').textContent='Ocorrência — '+displayName(m.profissionais);
  $('#individualOccNumber').value='';$('#individualOccNature').value='';$('#individualOccObs').value='';openModal('individualOccModal');
}
async function saveIndividualOccurrence(){
  const m=selectedIndividualMember;if(!m||!currentPlantao)return;
  const now=new Date().toISOString();
  const {data:o,error}=await supabase.from('ocorrencias').insert({
    plantao_id:currentPlantao.id,numero:$('#individualOccNumber').value.trim()||null,natureza:$('#individualOccNature').value.trim()||'LANÇAMENTO INDIVIDUAL',
    observacao:$('#individualOccObs').value.trim()||null,status:'FINALIZADA',acionada_em:now,saida_em:now,finalizado_em:now,data_ocorrencia:currentPlantao.data_plantao,
    criado_por:profile?.nome||null,finalizado_por:profile?.nome||null,creditou_revezamento:true
  }).select().single();
  if(error)return alert(error.message);
  const eo=await supabase.from('equipe_ocorrencia').insert({ocorrencia_id:o.id,profissional_id:m.profissional_id,funcao:m.funcao,nome_snapshot:m.nome_snapshot||m.profissionais?.nome_completo,tipo_escala_no_momento:m.tipo_escala});
  if(eo.error)return alert(eo.error.message);
  await supabase.from('equipe_plantao').update({ocorrencias_validas:Number(m.ocorrencias_validas||0)+1,ultima_ocorrencia_em:now,ultimo_retorno_em:now}).eq('id',m.id);
  closeModal('individualOccModal');selectedIndividualMember=null;await loadAll(selectedDate());
}

/* ---------- registry ---------- */
function renderRegistry(){
  const rows=professionals.slice(0,250);
  $('#registryTable').innerHTML=rows.map(p=>'<tr><td>'+esc(p.nome_completo||'—')+'</td><td>'+esc(p.nome_de_guerra||'—')+'</td><td>'+esc(p.funcao_sistema||'—')+'</td><td>'+esc(p.topico_ntfy||'—')+'</td><td>ATIVO</td></tr>').join('');
  $('#regWarWrap').classList.remove('hidden');
}
async function registerProfessional(){
  if(!isOperator())return;
  const nome=$('#regName').value.trim(),funcao=$('#regRole').value,war=$('#regWarName').value.trim(),topic=$('#regTopic').value.trim();
  if(!nome)return alert('Informe o nome completo.');
  const {error}=await supabase.from('profissionais').insert({
    nome_completo:nome,nome_de_guerra:war||null,funcao_sistema:funcao,topico_ntfy:topic||null,
    notificar_padrao:false,ativo:true,data_cadastro:new Date().toISOString(),atualizado_em:new Date().toISOString()
  });
  if(error)return alert(error.message);
  professionals=[];await ensureProfessionals();renderRegistry();
  $('#regName').value='';$('#regWarName').value='';$('#regTopic').value='';
  $('#registryStatus').textContent='Profissional cadastrado com sucesso.';$('#registryStatus').classList.remove('hidden');
  setTimeout(()=>$('#registryStatus').classList.add('hidden'),2500);
}


async function saveQuickRegistration(){
  if(!isOperator())return;
  const nome=$('#quickRegName').value.trim();
  const war=$('#quickRegWar').value.trim();
  const funcao=$('#quickRegRole').value;
  if(!nome)return alert('Informe o nome completo.');
  const {data,error}=await supabase.from('profissionais').insert({
    nome_completo:nome,nome_de_guerra:war||null,funcao_sistema:funcao,
    notificar_padrao:false,ativo:true,data_cadastro:new Date().toISOString(),atualizado_em:new Date().toISOString()
  }).select('id,legacy_id,nome_completo,nome_de_guerra,funcao_sistema,categoria_origem,topico_ntfy,ativo').single();
  if(error)return alert(error.message);

  professionals.push(data);
  professionals.sort((a,b)=>String(a.nome_completo).localeCompare(String(b.nome_completo),'pt-BR'));
  const pending=pendingQuickRegistration;
  if(pending?.input&&pending?.hidden){
    if(!allowedForField(data,pending.key)){
      alert('Profissional cadastrado, mas a função escolhida não é permitida neste campo.');
    }else{
      pending.input.value=professionalLabel(data,pending.key);
      pending.hidden.value=data.id;
    }
  }
  pendingQuickRegistration=null;
  closeModal('quickRegisterModal');
  renderRegistry();
}

async function ensureOperationalScaleFromFixed(){
  if(!currentPlantao||!vehicles.length||!professionals.length)return;
  const ala=currentPlantao.ala||alaForDate(currentPlantao.data_plantao);
  const turno=normalizeTurno(currentPlantao.turno||operationalShiftContext().turno);
  const [fixRes,teamRes]=await Promise.all([
    supabase.from('escala_fixa_anapolis').select('*').eq('ala',ala).eq('turno',turno).eq('ativo',true).order('ordem'),
    supabase.from('equipe_plantao').select('*').eq('plantao_id',currentPlantao.id)
  ]);
  if(fixRes.error)throw fixRes.error;
  if(teamRes.error)throw teamRes.error;
  const fixedRows=fixRes.data||[];
  const existing=teamRes.data||[];
  const now=new Date().toISOString();

  for(const fixed of fixedRows){
    const v=vehicleByCode(fixed.codigo_viatura);
    if(!v||!fixed.profissional_id)continue;

    const historicalPosition=existing.find(m=>
      (m.titular_profissional_id===fixed.profissional_id && norm(m.ala_escala)===norm(ala) && norm(m.turno_escala)===norm(turno)) ||
      (norm(m.origem_escala)==='AUTO_ESCALA_FIXA' && norm(m.nome_titular_escala)===norm(fixed.nome_referencia))
    );
    if(historicalPosition)continue;

    const activeAtVehicle=existing.find(m=>norm(m.status)==='ATIVO'&&m.viatura_id===v.id&&norm(m.funcao).includes('CONDUTOR'));
    if(activeAtVehicle){
      const tipo=activeAtVehicle.profissional_id===fixed.profissional_id?'FIXO':'PERMUTA';
      const {error}=await supabase.from('equipe_plantao').update({
        titular_profissional_id:fixed.profissional_id,
        nome_titular_escala:fixed.nome_referencia,
        tipo_alteracao_escala:tipo,
        ala_escala:ala,turno_escala:turno
      }).eq('id',activeAtVehicle.id);
      if(error)throw error;
      continue;
    }

    const activeTitular=existing.find(m=>norm(m.status)==='ATIVO'&&m.profissional_id===fixed.profissional_id);
    if(activeTitular){
      const {error}=await supabase.from('equipe_plantao').update({
        titular_profissional_id:fixed.profissional_id,
        nome_titular_escala:fixed.nome_referencia,
        ala_escala:ala,turno_escala:turno
      }).eq('id',activeTitular.id);
      if(error)throw error;
      continue;
    }

    const pro=professionals.find(p=>p.id===fixed.profissional_id);
    const {data:inserted,error}=await supabase.from('equipe_plantao').insert({
      plantao_id:currentPlantao.id,
      profissional_id:fixed.profissional_id,
      nome_snapshot:pro?.nome_completo||fixed.nome_referencia,
      funcao:'Condutor',
      tipo_escala:'FIXO EM VIATURA',
      viatura_id:v.id,
      viatura_snapshot:v.nome,
      status:'ATIVO',
      entrou_em:currentPlantao.iniciado_em||now,
      ocorrencias_validas:0,
      origem_escala:'AUTO_ESCALA_FIXA',
      titular_profissional_id:fixed.profissional_id,
      nome_titular_escala:fixed.nome_referencia,
      tipo_alteracao_escala:'FIXO',
      ala_escala:ala,
      turno_escala:turno
    }).select('*').single();
    if(error)throw error;
    if(inserted)existing.push(inserted);
  }
}

/* ---------- livro do plantão / serviço interno ---------- */
function showTeamScope(scope){
  const internal=scope==='internal';
  $('#teamOperationalPanel')?.classList.toggle('hidden',internal);
  $('#teamInternalPanel')?.classList.toggle('hidden',!internal);
  $$('.scale-scope-btn').forEach(b=>b.classList.toggle('active',b.dataset.teamScope===scope));
  if(internal){
    loadBookData().then(()=>{renderInternalEditors();renderBook()}).catch(e=>alert(e.message||e));
  }
}
function internalStatusValue(row,fixed){
  const t=norm(row?.tipo_alteracao||'');
  if(t==='PERMUTA')return 'PERMUTA';
  if(t==='AUSENTE')return 'AUSENTE';
  if(t==='VAGO'||t==='DESESCALADO')return 'VAGO';
  if(t==='FIXO'||t==='ESCALADO')return 'ESCALADO';
  // O titular previsto aparece pré-carregado, mas só fica escalado após confirmação do rádio-operador.
  return 'VAGO';
}
function findProfessionalByReference(name){
  const n=norm(name);
  if(!n)return null;
  let exact=professionals.find(p=>norm(p.nome_completo)===n);
  if(exact)return exact;
  const tokens=n.split(' ').filter(x=>x.length>2 && !['DOS','DAS','DE','DA'].includes(x));
  let best=null,bestScore=0;
  professionals.forEach(p=>{
    const pn=norm(p.nome_completo),pt=pn.split(' ');
    const score=tokens.filter(t=>pt.includes(t)).length/Math.max(tokens.length,1);
    if(score>bestScore){best=p;bestScore=score}
  });
  return bestScore>=.72?best:null;
}
async function ensurePlantaoForBook(){
  if(currentPlantao)return currentPlantao;
  const ctx=operationalShiftContext();
  const date=selectedDate()||ctx.date;
  const ala=alaForDate(date);
  const turno=(date===ctx.date)?ctx.turno:ctx.turno;
  currentPlantao=await ensureOperationalPlantao(date,turno,ala);
  syncDateAndAla(date,currentPlantao.turno||turno);
  return currentPlantao;
}
async function loadBookData(){
  await ensureProfessionals();
  await ensurePlantaoForBook();
  const ala=currentPlantao.ala||alaForDate(currentPlantao.data_plantao);
  const turno=normalizeTurno(currentPlantao.turno||operationalShiftContext().turno);
  const [bm,di,fi,fd]=await Promise.all([
    supabase.from('livro_plantao').select('*').eq('plantao_id',currentPlantao.id).maybeSingle(),
    supabase.from('escala_interna_plantao').select('*').eq('plantao_id',currentPlantao.id).eq('status','ATIVO').order('ordem'),
    supabase.from('escala_fixa_interna_anapolis').select('*').eq('ala',ala).eq('turno',turno).eq('ativo',true).order('ordem'),
    supabase.from('escala_fixa_anapolis').select('*').eq('ala',ala).eq('turno',turno).eq('ativo',true).order('ordem')
  ]);
  if(bm.error)throw bm.error;if(di.error)throw di.error;if(fi.error)throw fi.error;if(fd.error)throw fd.error;
  bookMeta=bm.data||null;internalScaleRows=di.data||[];fixedInternalRows=fi.data||[];bookDriverFixedRows=fd.data||[];

  // A escala fixa é apenas referência visual. A equipe ativa nasce somente após clique/confirmacão do operador.
  await ensureAutomaticBookNumber();
}
async function ensureInternalScaleFromFixed(){
  if(!currentPlantao||!fixedInternalRows.length)return;
  const existingCodes=new Set(internalScaleRows.map(x=>x.codigo_posicao));
  const inserts=[];
  for(const fixed of fixedInternalRows){
    if(existingCodes.has(fixed.codigo_posicao))continue;
    const resolved=fixed.profissional_id
      ? professionals.find(p=>p.id===fixed.profissional_id)
      : findProfessionalByReference(fixed.nome_referencia);
    inserts.push({
      plantao_id:currentPlantao.id,
      escala_fixa_id:fixed.id,
      setor:fixed.setor,
      codigo_posicao:fixed.codigo_posicao,
      funcao:fixed.funcao,
      profissional_id:resolved?.id||fixed.profissional_id||null,
      nome_snapshot:resolved?.nome_completo||fixed.nome_referencia||null,
      titular_profissional_id:resolved?.id||fixed.profissional_id||null,
      titular_nome_snapshot:fixed.nome_referencia||resolved?.nome_completo||null,
      tipo_alteracao:'ESCALADO',
      status:'ATIVO',
      ordem:fixed.ordem,
      atualizado_em:new Date().toISOString()
    });
  }
  if(!inserts.length)return;
  const {error}=await supabase.from('escala_interna_plantao').upsert(inserts,{onConflict:'plantao_id,codigo_posicao'});
  if(error)throw error;
  const {data,error:reloadError}=await supabase.from('escala_interna_plantao')
    .select('*').eq('plantao_id',currentPlantao.id).eq('status','ATIVO').order('ordem');
  if(reloadError)throw reloadError;
  internalScaleRows=data||[];
}
async function ensureAutomaticBookNumber(){
  if(!currentPlantao)return;
  if(bookMeta?.parte_diaria)return;

  const {data:allBooks,error:listError}=await supabase.from('livro_plantao').select('parte_diaria');
  if(listError)throw listError;
  const nums=(allBooks||[]).map(x=>Number.parseInt(x.parte_diaria,10)).filter(Number.isFinite);
  let next=Math.max(531,...nums)+1;

  const payload={
    plantao_id:currentPlantao.id,
    parte_diaria:String(next),
    ano:Number(currentPlantao.data_plantao.slice(0,4)),
    status:'RASCUNHO',
    atualizado_por:profile?.nome||null,
    atualizado_em:new Date().toISOString()
  };
  let {data,error}=await supabase.from('livro_plantao').insert(payload).select().single();

  if(error&&String(error.code)==='23505'){
    const retry=await supabase.from('livro_plantao').select('parte_diaria');
    const retryNums=(retry.data||[]).map(x=>Number.parseInt(x.parte_diaria,10)).filter(Number.isFinite);
    next=Math.max(531,...retryNums)+1;
    const again=await supabase.from('livro_plantao').insert({...payload,parte_diaria:String(next)}).select().single();
    data=again.data;error=again.error;
  }
  if(error)throw error;
  bookMeta=data;
}
function internalRow(code){return internalScaleRows.find(x=>x.codigo_posicao===code)||null}
function fixedInternalRow(code){return fixedInternalRows.find(x=>x.codigo_posicao===code)||null}
function professionalNameById(id){const p=professionals.find(x=>x.id===id);return p?displayName(p):''}
function internalTitularName(code){
  const fixed=fixedInternalRow(code);
  return fixed?.nome_referencia||professionalNameById(fixed?.profissional_id)||'';
}
function internalDisplayNameByCode(code){
  const row=internalRow(code),fixed=fixedInternalRow(code),status=internalStatusValue(row,fixed);
  if(status==='AUSENTE')return 'AUSENTE';
  if(status==='VAGO')return '------';
  if(status==='PERMUTA'){
    return row?.nome_snapshot||professionalNameById(row?.profissional_id)||'------';
  }
  return row?.nome_snapshot||professionalNameById(row?.profissional_id)||fixed?.nome_referencia||professionalNameById(fixed?.profissional_id)||'------';
}
function internalDisplayName(row){
  if(!row)return '------';
  if(norm(row.tipo_alteracao)==='AUSENTE')return 'AUSENTE';
  if(norm(row.tipo_alteracao)==='VAGO')return '------';
  return row.nome_snapshot||professionalNameById(row.profissional_id)||'------';
}
function bookDriverName(code,index=0){
  if(code==='MOTOLANCIA'){
    const v=vehicles.find(x=>isAnapolisVehicle(x)&&vehicleType(x).includes('MOTO'));
    const mem=v?vehicleMembers(v).filter(m=>['driver','moto'].includes(teamRoleKey(m))):[];
    return mem[index]?displayName(mem[index].profissionais):'------';
  }
  const v=vehicleByCode(code);
  if(!v)return '------';
  const m=vehicleMembers(v).find(x=>teamRoleKey(x)==='driver');
  if(m)return displayName(m.profissionais);
  const q=priorityPeopleForRole('driver',vehicleType(v).includes('USA')?'USA':'USB',{rotationOnly:true});
  return q.length?'REVEZAMENTO':'------';
}
function monthNamePt(dateIso){
  return new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'}).format(new Date(dateIso+'T12:00:00Z')).toUpperCase();
}
function internalSlotHtml(slot){
  const row=internalRow(slot.code),fixed=fixedInternalRow(slot.code);
  const titular=fixed?.nome_referencia||professionalNameById(fixed?.profissional_id)||'SEM TITULAR PREVISTO';
  const status=internalStatusValue(row,fixed);
  const substitute=status==='PERMUTA'?(row?.nome_snapshot||professionalNameById(row?.profissional_id)||''):'';
  const statusClass=status.toLowerCase();
  return '<div class="internal-slot '+slot.funcao.toLowerCase()+' status-'+statusClass+'" data-internal-slot="'+slot.code+'">'+
    '<div class="internal-slot-head"><b>'+esc(slot.label)+'</b><span>'+esc(slot.funcao)+'</span></div>'+
    '<div class="internal-fixed-label">ESCALADO NA ESCALA FIXA</div>'+
    '<div class="internal-fixed-name '+(!fixed?'internal-empty-fixed':'')+'">'+esc(titular)+'</div>'+
    '<input type="hidden" data-int-type="'+slot.code+'" value="'+status+'">'+
    '<input type="hidden" data-int-id="'+slot.code+'" value="'+esc(row?.profissional_id||'')+'">'+
    '<div class="internal-status-actions">'+
      '<button title="'+(status==='ESCALADO'?'Clique novamente para desescalar':'Clique para escalar')+'" type="button" class="escalado '+(status==='ESCALADO'?'active':'')+'" data-int-status="'+slot.code+'" data-value="ESCALADO">'+(status==='ESCALADO'?'✓ ESCALADO':'✓ ESCALAR')+'</button>'+
      '<button type="button" class="ausente '+(status==='AUSENTE'?'active':'')+'" data-int-status="'+slot.code+'" data-value="AUSENTE">✕ AUSENTE</button>'+
      '<button type="button" class="permuta '+(status==='PERMUTA'?'active':'')+'" data-int-status="'+slot.code+'" data-value="PERMUTA">⇄ PERMUTA</button>'+
    '</div>'+
    '<div class="internal-permuta-box '+(status==='PERMUTA'?'show':'')+'" data-int-permuta="'+slot.code+'">'+
      '<label>QUEM ESTÁ NO LUGAR DE '+esc(titular)+'</label>'+
      '<div class="autocomplete-shell"><input data-int-search="'+slot.code+'" autocomplete="off" placeholder="Digite 3 letras do substituto..." value="'+esc(substitute)+'"><div class="autocomplete-results" data-int-results="'+slot.code+'"></div></div>'+
      '<div class="internal-permuta-selected">'+(substitute?'Substituto: '+esc(substitute):'Selecione o substituto para registrar a permuta.')+'</div>'+
    '</div>'+
    '<div class="internal-card-footer"><small>Situação selecionada: <b>'+status+'</b> • confirme a equipe para gravar</small></div>'+
  '</div>';
}
function renderInternalEditorTo(selector){
  const el=$(selector);if(!el)return;
  const groups=[
    {key:'sanitarias',title:'AMBULÂNCIAS SANITÁRIAS',sub:'S 01, S 02 e posições extras',filter:s=>s.funcao==='SANITARIA'},
    {key:'radio',title:'RÁDIO-OPERADORES',sub:'1º e 2º horários do rádio',filter:s=>s.funcao==='RADIO'},
    {key:'tarm',title:'TARMs',sub:'Equipe de atendimento e regulação da central',filter:s=>s.funcao==='TARM'},
    {key:'lavadores',title:'LAVADORES',sub:'Equipe de higienização e apoio operacional',filter:s=>s.funcao==='LAVADOR'}
  ];
  el.innerHTML=groups.map(g=>{
    const slots=BOOK_INTERNAL_SLOTS.filter(g.filter);
    const defined=slots.filter(s=>{
      const row=internalRow(s.code),fixed=fixedInternalRow(s.code),status=internalStatusValue(row,fixed);
      return status!=='VAGO';
    }).length;
    return '<section class="internal-section-group '+g.key+'">'+
      '<div class="internal-section-head"><div><h3>'+g.title+'</h3><p>'+g.sub+'</p></div><span class="internal-section-count">'+defined+'/'+slots.length+' definidos</span></div>'+
      '<div class="internal-section-body">'+slots.map(internalSlotHtml).join('')+'</div>'+
    '</section>';
  }).join('');
  el.querySelectorAll('[data-int-status]').forEach(b=>b.onclick=()=>{
    const code=b.dataset.intStatus,card=el.querySelector('[data-internal-slot="'+code+'"]');
    const typeEl=card.querySelector('[data-int-type="'+code+'"]');
    let value=b.dataset.value;
    if(value==='ESCALADO'&&typeEl.value==='ESCALADO')value='VAGO';
    typeEl.value=value;
    card.querySelectorAll('[data-int-status="'+code+'"]').forEach(x=>x.classList.toggle('active',value!=='VAGO'&&x.dataset.value===value));
    card.querySelector('[data-int-permuta="'+code+'"]').classList.toggle('show',value==='PERMUTA');
    card.classList.remove('status-escalado','status-ausente','status-permuta','status-vago');
    card.classList.add('status-'+value.toLowerCase());
    const footer=card.querySelector('.internal-card-footer small');
    if(footer)footer.innerHTML='Situação atual: <b>'+value+'</b>';
    if(value!=='PERMUTA'){
      card.querySelector('[data-int-id="'+code+'"]').value='';
      const search=card.querySelector('[data-int-search="'+code+'"]');if(search)search.value='';
    }
  });
  el.querySelectorAll('[data-int-search]').forEach(inp=>inp.oninput=()=>internalAutocomplete(inp.dataset.intSearch,inp.value,el));
}
function renderInternalEditors(){
  const ala=currentPlantao?.ala||alaForDate(selectedDate());
  const turno=normalizeTurno(currentPlantao?.turno||operationalShiftContext().turno);
  if($('#internalAlaTurnoBadge'))$('#internalAlaTurnoBadge').textContent='ALA '+ala+' • '+turno;
  renderInternalEditorTo('#teamInternalEditor');
  renderInternalEditorTo('#internalScaleEditor');
}
function internalAutocomplete(code,q,root=document){
  const box=root.querySelector('[data-int-results="'+code+'"]'),n=norm(q);
  if(!box)return;
  const hidden=root.querySelector('[data-int-id="'+code+'"]');
  if(hidden)hidden.value='';
  if(n.length<3){box.classList.remove('show');box.innerHTML='';return}
  const list=professionals.filter(p=>teamSearchText(p).includes(n)).slice(0,15);
  const input=root.querySelector('[data-int-search="'+code+'"]'),idEl=root.querySelector('[data-int-id="'+code+'"]');
  box.innerHTML=list.length
    ? list.map(p=>'<button type="button" class="autocomplete-result" data-int-prof="'+p.id+'"><b>'+esc(professionalLabel(p,'other'))+'</b><small>'+esc(p.funcao_sistema||'')+' • '+esc(p.nome_completo)+'</small></button>').join('')
    : '<div class="autocomplete-empty">Nenhum profissional encontrado.</div><button type="button" class="autocomplete-register" data-register-new="1">+ CADASTRAR NOVO PROFISSIONAL</button>';
  box.classList.add('show');
  box.querySelectorAll('[data-int-prof]').forEach(b=>b.onclick=()=>{
    const p=professionals.find(x=>x.id===b.dataset.intProf);
    input.value=professionalLabel(p,'other');if(idEl)idEl.value=p.id;box.classList.remove('show');
    const selected=input.closest('.internal-permuta-box')?.querySelector('.internal-permuta-selected');
    if(selected)selected.textContent='Substituto: '+displayName(p);
  });
  const add=box.querySelector('[data-register-new]');
  if(add)add.onclick=()=>openQuickRegistration(input.value,'other',input,idEl);
}
function buildInternalPayloadFromCard(slot,root){
  const fixed=fixedInternalRow(slot.code);
  const card=root.querySelector('[data-internal-slot="'+slot.code+'"]');
  if(!card)return null;
  const type=card.querySelector('[data-int-type="'+slot.code+'"]')?.value||'VAGO';
  let proId=card.querySelector('[data-int-id="'+slot.code+'"]')?.value||null;
  let snapshot=null;
  if(type==='ESCALADO'){
    const fixedPro=fixed?.profissional_id?professionals.find(x=>x.id===fixed.profissional_id):findProfessionalByReference(fixed?.nome_referencia);
    proId=fixedPro?.id||fixed?.profissional_id||null;
    snapshot=fixedPro?.nome_completo||fixed?.nome_referencia||null;
    if(!proId&&!snapshot)throw new Error('Não foi possível localizar o titular de '+slot.label+'.');
  }
  if(type==='PERMUTA'){
    if(!proId)throw new Error('Selecione quem está substituindo '+(fixed?.nome_referencia||'o titular')+' em '+slot.label+'.');
    snapshot=professionals.find(x=>x.id===proId)?.nome_completo||null;
    if(!snapshot)throw new Error('Substituto inválido em '+slot.label+'.');
  }
  if(type==='AUSENTE'||type==='VAGO'){proId=null;snapshot=null}
  const titularPro=fixed?.profissional_id?professionals.find(x=>x.id===fixed.profissional_id):findProfessionalByReference(fixed?.nome_referencia);
  return {
    plantao_id:currentPlantao.id,
    escala_fixa_id:fixed?.id||null,
    setor:slot.setor,codigo_posicao:slot.code,funcao:slot.funcao,
    profissional_id:proId,nome_snapshot:snapshot,
    titular_profissional_id:titularPro?.id||fixed?.profissional_id||null,
    titular_nome_snapshot:fixed?.nome_referencia||titularPro?.nome_completo||null,
    tipo_alteracao:type,status:'ATIVO',ordem:slot.order,
    atualizado_em:new Date().toISOString()
  };
}
async function confirmInternalTeam(rootSelector='#teamInternalEditor'){
  if(!isOperator())return;
  await ensurePlantaoForBook();
  await ensureProfessionals();
  const root=$(rootSelector);
  if(!root)return;
  const btn=rootSelector==='#internalScaleEditor'?$('#confirmInternalBookBtn'):$('#confirmInternalBtn');
  if(btn){btn.disabled=true;btn.textContent='CONFIRMANDO...'}
  try{
    const payloads=BOOK_INTERNAL_SLOTS.map(slot=>buildInternalPayloadFromCard(slot,root)).filter(Boolean);
    if(!payloads.length)throw new Error('Nenhuma posição interna encontrada para confirmar.');
    const {error}=await supabase.from('escala_interna_plantao').upsert(payloads,{onConflict:'plantao_id,codigo_posicao'});
    if(error)throw error;

    const now=new Date().toISOString();
    const confirmedBy=profile?.nome||session?.user?.email||'OPERADOR';
    const pr=await supabase.from('plantoes').update({
      escala_interna_confirmada_em:now,
      escala_interna_confirmada_por:confirmedBy
    }).eq('id',currentPlantao.id);
    if(pr.error)throw pr.error;
    currentPlantao={...currentPlantao,escala_interna_confirmada_em:now,escala_interna_confirmada_por:confirmedBy};

    await loadBookData();
    await syncBookScaleMetadata();
    renderInternalEditors();
    renderBook();
    renderScaleConfirmationStates();
    setSync('Equipe interna confirmada • LIVRO atualizado');
  }catch(e){
    alert('Não foi possível confirmar a equipe interna: '+(e.message||e));
  }finally{
    if(btn){btn.disabled=false;btn.textContent='CONFIRMAR EQUIPE INTERNA'}
  }
}
function confirmedInternalRow(code){
  const row=internalRow(code);
  if(!row)return null;
  const status=internalStatusValue(row,fixedInternalRow(code));
  return ['ESCALADO','PERMUTA'].includes(status)?row:null;
}
async function syncBookScaleMetadata(){
  if(!currentPlantao)return;
  if(!bookMeta)await loadBookData();
  const r1=confirmedInternalRow('RADIO-01');
  const r2=confirmedInternalRow('RADIO-02');
  const payload={
    plantao_id:currentPlantao.id,
    parte_diaria:bookMeta?.parte_diaria||null,
    ano:bookMeta?.ano||Number(currentPlantao.data_plantao.slice(0,4)),
    chefe_servico:bookMeta?.chefe_servico||null,
    radio_1_profissional_id:r1?.profissional_id||null,
    radio_1_nome_snapshot:r1?internalDisplayNameByCode('RADIO-01'):null,
    radio_2_profissional_id:r2?.profissional_id||null,
    radio_2_nome_snapshot:r2?internalDisplayNameByCode('RADIO-02'):null,
    observacoes:bookMeta?.observacoes||null,
    texto_responsabilidade:bookMeta?.texto_responsabilidade||null,
    texto_transmissao:bookMeta?.texto_transmissao||null,
    status:bookMeta?.status||'RASCUNHO',
    atualizado_por:profile?.nome||session?.user?.email||null,
    atualizado_em:new Date().toISOString()
  };
  const {data,error}=await supabase.from('livro_plantao').upsert(payload,{onConflict:'plantao_id'}).select().single();
  if(error)throw error;
  bookMeta=data;
}
async function refreshBookProjection(){
  if(!currentPlantao)return;
  await loadBookData();
  await syncBookScaleMetadata();
  if($('#book')?.classList.contains('active'))renderBook();
}
async function saveInternalSlot(code,root=document){
  if(!isOperator())return;
  await ensurePlantaoForBook();
  const slot=BOOK_INTERNAL_SLOTS.find(x=>x.code===code),fixed=fixedInternalRow(code);
  const type=root.querySelector('[data-int-type="'+code+'"]')?.value||'ESCALADO';
  let proId=root.querySelector('[data-int-id="'+code+'"]')?.value||null;
  let snapshot=null;
  if(type==='ESCALADO'){
    const fixedPro=fixed?.profissional_id?professionals.find(x=>x.id===fixed.profissional_id):findProfessionalByReference(fixed?.nome_referencia);
    proId=fixedPro?.id||fixed?.profissional_id||null;
    snapshot=fixedPro?.nome_completo||fixed?.nome_referencia||null;
  }
  if(type==='PERMUTA'){
    if(!proId)return alert('Selecione quem está substituindo '+(fixed?.nome_referencia||'o titular')+'.');
    snapshot=professionals.find(x=>x.id===proId)?.nome_completo||null;
  }
  if(type==='AUSENTE'||type==='VAGO'){proId=null;snapshot=null}
  const titularPro=fixed?.profissional_id?professionals.find(x=>x.id===fixed.profissional_id):findProfessionalByReference(fixed?.nome_referencia);
  const payload={
    plantao_id:currentPlantao.id,escala_fixa_id:fixed?.id||null,setor:slot.setor,codigo_posicao:slot.code,funcao:slot.funcao,
    profissional_id:proId,nome_snapshot:snapshot,titular_profissional_id:titularPro?.id||fixed?.profissional_id||null,
    titular_nome_snapshot:fixed?.nome_referencia||titularPro?.nome_completo||null,tipo_alteracao:type,status:'ATIVO',ordem:slot.order,atualizado_em:new Date().toISOString()
  };
  const {error}=await supabase.from('escala_interna_plantao').upsert(payload,{onConflict:'plantao_id,codigo_posicao'});
  if(error)return alert(error.message);
  await loadBookData();
  await syncBookScaleMetadata();
  renderInternalEditors();renderBook();
}
function collectPermutas(){
  const out=[];
  bookDriverFixedRows.forEach(fr=>{
    const v=vehicleByCode(fr.codigo_viatura);if(!v)return;
    const cur=vehicleMembers(v).find(m=>teamRoleKey(m)==='driver');
    const titular=fr.nome_referencia||professionalNameById(fr.profissional_id);
    if(cur&&titular&&norm(displayName(cur.profissionais))!==norm(titular)&&norm(cur.profissionais?.nome_completo)!==norm(titular)){
      out.push({funcao:'CONDUTOR',substituto:cur.profissionais?.nome_completo||displayName(cur.profissionais),substituido:titular});
    }
  });
  internalScaleRows.filter(r=>norm(r.tipo_alteracao)==='PERMUTA').forEach(r=>out.push({
    funcao:r.funcao==='SANITARIA'?'SANITARIA':r.funcao,
    substituto:r.nome_snapshot||professionalNameById(r.profissional_id)||'—',
    substituido:r.titular_nome_snapshot||professionalNameById(r.titular_profissional_id)||'—'
  }));
  return out;
}
function renderBook(){
  if(!$('#bookDocument'))return;
  const date=currentPlantao?.data_plantao||selectedDate(),ala=currentPlantao?.ala||alaForDate(date),turno=normalizeTurno(currentPlantao?.turno||operationalShiftContext().turno);
  if($('#bookParte'))$('#bookParte').value=bookMeta?.parte_diaria||'';
  if($('#bookChefe'))$('#bookChefe').value=bookMeta?.chefe_servico||'';
  if($('#bookObs'))$('#bookObs').value=bookMeta?.observacoes||'';
  $('#bookAlaTurno').textContent='ALA '+ala+' '+turno;
  $('#bookPartePreview').textContent=bookMeta?.parte_diaria||'—';
  $('#bookAnoPreview').textContent=bookMeta?.ano||date.slice(0,4);
  $('#bookDayPreview').textContent=String(Number(date.slice(8,10)));
  $('#bookMonthPreview').textContent=monthNamePt(date);
  $('#bookChefePreview').textContent='Sr. '+(bookMeta?.chefe_servico||'—');

  $('#bookRadio1').textContent=internalDisplayNameByCode('RADIO-01');
  $('#bookRadio2').textContent=internalDisplayNameByCode('RADIO-02');

  const driverRows=[
    ['MOTOLANCIA',bookDriverName('MOTOLANCIA',0)],['MOTOLANCIA',bookDriverName('MOTOLANCIA',1)],
    ['USA 01',bookDriverName('USA01')],['USA 02',bookDriverName('USA02')],['USA 06',bookDriverName('USA06')],
    ['USB 01',bookDriverName('USB01')],['USB 02',bookDriverName('USB02')],['USB 03',bookDriverName('USB03')],
    ['USB 04',bookDriverName('USB04')],['USB 05',bookDriverName('USB05')],['USB 06',bookDriverName('USB06')],
    ['',''],['AMB - S1',internalDisplayNameByCode('AMB-S1')],['AMB - S2',internalDisplayNameByCode('AMB-S2')],
    ['AMB - 03 EXTRA',internalDisplayNameByCode('AMB-03-EXTRA')],['AMB - S4 EXTRA',internalDisplayNameByCode('AMB-S4-EXTRA')]
  ];
  $('#bookDriversBody').innerHTML=driverRows.map(r=>'<tr><td>'+esc(r[0])+'</td><td>'+esc(r[1])+'</td></tr>').join('');

  const central=BOOK_INTERNAL_SLOTS.filter(x=>x.setor==='CENTRAL');
  $('#bookInternalBody').innerHTML=central.map(s=>'<tr><td>'+esc(s.label)+'</td><td>'+esc(internalDisplayNameByCode(s.code))+'</td></tr>').join('');

  const perm=collectPermutas(),template=['CONDUTOR','CONDUTOR','RADIO','RADIO','SANITARIA','SANITARIA','LAVADOR','LAVADOR'];
  const used=new Set();
  const rows=template.map(fn=>{
    const idx=perm.findIndex((p,i)=>!used.has(i)&&norm(p.funcao)===norm(fn));
    if(idx>=0){used.add(idx);return perm[idx]}
    return {funcao:fn,substituto:'',substituido:''};
  });
  perm.forEach((p,i)=>{if(!used.has(i))rows.push(p)});
  $('#bookPermutasBody').innerHTML=rows.map(p=>'<tr><th>'+esc(p.funcao)+'</th><td>'+esc(p.substituto)+'</td><td>'+esc(p.substituido)+'</td></tr>').join('');
  $('#bookObsPreview').textContent=bookMeta?.observacoes||'';
}
async function saveBook(){
  if(!isOperator())return;
  await ensurePlantaoForBook();
  const r1=confirmedInternalRow('RADIO-01'),r2=confirmedInternalRow('RADIO-02');
  const p1=r1?.profissional_id||null;
  const p2=r2?.profissional_id||null;
  const payload={
    plantao_id:currentPlantao.id,parte_diaria:$('#bookParte').value.trim()||null,ano:Number(currentPlantao.data_plantao.slice(0,4)),
    chefe_servico:$('#bookChefe').value.trim()||null,radio_1_profissional_id:p1,radio_1_nome_snapshot:p1?internalDisplayNameByCode('RADIO-01'):null,
    radio_2_profissional_id:p2,radio_2_nome_snapshot:p2?internalDisplayNameByCode('RADIO-02'):null,observacoes:$('#bookObs').value.trim()||null,
    atualizado_por:profile?.nome||null,atualizado_em:new Date().toISOString()
  };
  const {error}=await supabase.from('livro_plantao').upsert(payload,{onConflict:'plantao_id'});
  if(error)return alert(error.message);
  await loadBookData();renderBook();alert('Livro salvo.');
}

/* ---------- shift ---------- */
async function endShift(){
  if(!isOperator()||!currentPlantao)return;
  if(!confirm('ENCERRAR O PLANTÃO '+fmtDate(currentPlantao.data_plantao)+'?'))return;
  const {error}=await supabase.from('plantoes').update({status:'ENCERRADO',encerrado_em:new Date().toISOString(),operador_encerramento:profile?.nome||null}).eq('id',currentPlantao.id);
  if(error)alert(error.message);else await loadAll();
}
function exportCSV(){
  const rows=[['Ocorrencia','Viatura','Natureza','Bairro','Destino','Endereco','Equipe','Status','Saida','QTH','Inicio retorno','Chegada base','Observacao'],
    ...occurrences.map(o=>{
      const v=vehicleById(o.viatura_id);
      return [o.numero||'',v?.nome||o.viatura_snapshot||'',o.natureza||'',o.bairro||'',o.destino||'',o.endereco||'',occurrenceCrewText(o),o.status||'',o.saida_em||'',o.chegada_qth_em||'',o.inicio_retorno_em||'',o.retorno_base_em||'',o.observacao||''];
    })
  ];
  const csv=rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='samu_'+selectedDate()+'.csv';a.click();URL.revokeObjectURL(a.href);
}

/* ---------- realtime ---------- */
function scheduleReload(){
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(()=>loadAll(selectedDate()),280);
}
function subscribeRealtime(){
  if(realtimeChannel)supabase.removeChannel(realtimeChannel);
  realtimeChannel=supabase.channel('samu-operacional-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'viaturas'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'equipe_plantao'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'ocorrencias'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'equipe_ocorrencia'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'revezamento_plantao'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'livro_plantao'},()=>{if($('#book')?.classList.contains('active'))loadBookData().then(renderBook)})
    .on('postgres_changes',{event:'*',schema:'public',table:'escala_interna_plantao'},()=>{
      loadBookData().then(()=>{renderInternalEditors();if($('#book')?.classList.contains('active'))renderBook()}).catch(console.error);
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'plantoes'},scheduleReload)
    .subscribe(s=>{if(s==='SUBSCRIBED')setSync('Banco conectado • atualização em tempo real ativa')});
}

/* ---------- session ---------- */
async function applySession(s){
  session=s;
  if(!s){
    $('#auth').classList.remove('hidden');$('#app').classList.add('hidden');return;
  }
  const {data:p}=await supabase.from('usuarios_perfis').select('*').eq('user_id',s.user.id).maybeSingle();
  profile=p;
  $('#roleBadge').textContent=p?.papel||'CONSULTA';
  $('#auth').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#endShiftBtn').disabled=!isOperator();$('#manualOccBtn').disabled=!isOperator();

  // O plantão operacional muda às 07:00. Entre 00:00 e 06:59,
  // continuamos no NOTURNO iniciado às 19:00 do dia anterior.
  const shift=operationalShiftContext();
  syncDateAndAla(shift.date,shift.turno);
  await loadAll(shift.date);
  subscribeRealtime();
}

/* ---------- events ---------- */
$$('.auth-tab').forEach(b=>b.onclick=()=>{
  $$('.auth-tab').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  $('#loginForm').classList.toggle('hidden',b.dataset.auth!=='login');
  $('#signupForm').classList.toggle('hidden',b.dataset.auth!=='signup');
});
$('#loginForm').onsubmit=async e=>{
  e.preventDefault();
  const msg=$('#authMsg');
  const btn=$('#loginForm button[type="submit"]');
  msg.textContent='Entrando...';
  if(btn)btn.disabled=true;
  try{
    const {data,error}=await supabase.auth.signInWithPassword({
      email:$('#loginEmail').value.trim(),
      password:$('#loginPass').value
    });
    if(error)throw error;
    if(data?.session)await applySession(data.session);
    msg.textContent='';
  }catch(error){
    console.error('Falha no login',error);
    msg.textContent=error?.message||'Não foi possível entrar. Tente novamente.';
  }finally{
    if(btn)btn.disabled=false;
  }
};
$('#signupForm').onsubmit=async e=>{
  e.preventDefault();
  const {data,error}=await supabase.auth.signUp({
    email:$('#signupEmail').value.trim(),password:$('#signupPass').value,
    options:{data:{nome:$('#signupName').value.trim()},emailRedirectTo:'https://leonardosartin018-code.github.io/samu-operacional/'}
  });
  $('#authMsg').textContent=error?error.message:(data.session?'Conta criada.':'Conta criada. Confira seu e-mail para confirmar.');
};
$('#logoutBtn').onclick=()=>supabase.auth.signOut();
$$('.tab').forEach(b=>b.onclick=()=>openPage(b.dataset.page));
$$('[data-open-page]').forEach(b=>b.onclick=()=>openPage(b.dataset.openPage));
$$('[data-close-modal]').forEach(b=>b.onclick=()=>closeModal(b.dataset.closeModal));
$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
$('#shiftDate').onchange=()=>{syncDateAndAla($('#shiftDate').value,operationalShiftContext().turno);loadAll($('#shiftDate').value)};
$('#exportBtn').onclick=exportCSV;$('#endShiftBtn').onclick=endShift;$('#manualOccBtn').onclick=()=>openOccurrenceModal(null);
$('#regionalBtn').onclick=()=>$('#regionalIntegrated').scrollIntoView({behavior:'smooth',block:'start'});
$('#rotationCriterion').onchange=e=>persistRotationCriterion(e.target.value);
$('#teamReloadBtn').onclick=()=>loadAll(selectedDate());
$('#saveOcc').onclick=saveOccurrence;$('#saveTeam').onclick=saveQuickTeam;$('#saveOccEdit').onclick=saveOccurrenceEdit;
$('#loadScaleBtn').onclick=loadExpressScale;$('#expressAla').onchange=()=>{scaleRows=[];$('#expressStatus').className='express-status';$('#expressStatus').innerHTML='Ala alterada. Clique em <b>CARREGAR ESCALA FIXA</b>.'};$('#expressTurno').onchange=()=>{scaleRows=[];$('#expressStatus').className='express-status';$('#expressStatus').innerHTML='Turno alterado. Clique em <b>CARREGAR ESCALA FIXA</b>.'};
$('#allDriversRotationBtn').onclick=setAllDriversRotation;$('#restoreFixedDriversBtn').onclick=restoreFixedDrivers;
$('#expressTechSearch').oninput=e=>expressSearch('tech',e.target.value);$('#expressNurseSearch').oninput=e=>expressSearch('nurse',e.target.value);
$('#applyExpressPreviewBtn').onclick=()=>{$('#expressStatus').className='express-status ok';$('#expressStatus').innerHTML='<b>Prévia preparada:</b> '+expressTechSelected.size+' técnico(s)/enfermeiro(s) para USB e '+expressNurseSelected.size+' enfermeiro(s) para USA. Clique em CONFIRMAR para gravar.'};
$('#confirmExpressBtn').onclick=confirmExpress;
$('#confirmExpressTopBtn').onclick=confirmExpress;
$('#teamSearch').oninput=e=>renderTeamSearch(e.target.value);$('#clearTeamSearchBtn').onclick=()=>{$('#teamSearch').value='';$('#teamSearchResults').classList.remove('show');$('#teamSearchResults').innerHTML=''};
$('#assignMode').onchange=()=>$('#assignVehicleWrap').classList.toggle('hidden',$('#assignMode').value!=='FIXO');
$('#confirmAssignBtn').onclick=confirmAssign;$('#saveIndividualOccBtn').onclick=saveIndividualOccurrence;
$('#regRole').onchange=renderRegistry;$('#registerProfessionalBtn').onclick=registerProfessional;
$$('.scale-scope-btn').forEach(b=>b.onclick=()=>showTeamScope(b.dataset.teamScope));
$('#internalReloadBtn').onclick=()=>loadBookData().then(()=>{renderInternalEditors();renderBook();renderScaleConfirmationStates()});
$('#confirmInternalBtn').onclick=()=>confirmInternalTeam('#teamInternalEditor');
$('#confirmInternalBookBtn').onclick=()=>confirmInternalTeam('#internalScaleEditor');
$('#saveBookBtn').onclick=saveBook;$('#printBookBtn').onclick=()=>window.print();
$('#expressPermutaSearch').oninput=expressPermutaAutocomplete;
$('#saveExpressPermutaBtn').onclick=saveExpressPermuta;
$('#saveQuickRegisterBtn').onclick=saveQuickRegistration;

supabase.auth.onAuthStateChange((_,s)=>{
  // Consultas ao Supabase precisam ocorrer fora do callback de autenticação.
  setTimeout(()=>{
    if(session?.access_token===s?.access_token)return;
    applySession(s).catch(error=>{
      console.error('Falha ao carregar sessão',error);
      $('#authMsg').textContent=error?.message||'Não foi possível carregar o acesso. Tente novamente.';
    });
  },0);
});
const {data:{session:initialSession}}=await supabase.auth.getSession();
await applySession(initialSession);
