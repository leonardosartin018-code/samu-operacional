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
let manualRotation = [];
let manualRotationDraft = null;
let professionals = [];
let scaleRows = [];
let bookMeta = null;
let internalScaleRows = [];
let fixedInternalRows = [];
let bookDriverFixedRows = [];
let selectedVehicle = null;
let selectedTeamVehicle = null;
let selectedEditOccurrence = null;
let selectedVictimOccurrenceId = null;
let selectedEarlyExitMemberId = null;
let selectedAssignProfessional = null;
let selectedAssignTeamRow = null;
let selectedIndividualMember = null;
let selectedExpressPermutaRow = null;
let pendingQuickRegistration = null;
let realtimeChannel = null;
let reloadTimer = null;
let operationalShiftTimer = null;
let operationalShiftSyncBusy = false;
let autoFollowCurrentShift = true;
// A escala escolhida manualmente é apenas a referência de titulares para o plantão aberto.
let manualScaleReference = null;
let pendingScaleReference = null;
let lastOperationalShiftKey = '';
let lastClockShiftKey = '';
let shiftTransitionBusy = false;
let shiftTransitionPlantaoId = null;
let expressTechSelected = new Map();
let expressNurseSelected = new Map();
let unsavedOperationalScale = false;
let unsavedInternalScale = false;
let unsavedBook = false;
let pendingShiftWarningKey = '';
const modalDraftSnapshots = new Map();
const TRACKED_DRAFT_MODALS = new Set([
  'teamModal','occModal','occEditModal','victimDestinationModal','earlyExitModal','manualRotationModal','expressPermutaModal',
  'quickRegisterModal','assignModal','individualOccModal'
]);

// Agrupamento visual por proximidade rodoviária aproximada (não é rota de despacho).
// Pares confirmados na região: Abadiânia/Alexânia, Corumbá/Cocalzinho,
// Pirenópolis/Jaranápolis e Goianápolis/Terezópolis.
const REGIONAL_ORDER = ['ABADIANIA','ALEXANIA','CORUMBA','COCALZINHO','PIRENOPOLIS','JARANAPOLIS','GOIANAPOLIS','TEREZOPOLIS'];
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
function canEditOpenShift(){
  if(!isOperator())return false;
  if(currentPlantao&&norm(currentPlantao.status)!=='ABERTO'){
    alert('Este plantão está encerrado. Clique em INICIAR PRÓXIMA ESCALA para fazer novos registros.');
    return false;
  }
  return true;
}
function setSync(text,type='ok'){
  const el=$('#syncStatus');
  el.className='sync-strip'+(type==='ok'?'':' '+type);
  el.innerHTML='<span class="sync-dot"></span><span>'+esc(text)+'</span>';
}
function markOperationalDirty(){
  unsavedOperationalScale=true;
  renderScaleConfirmationStates();
}
function clearOperationalDirty(){
  unsavedOperationalScale=false;
  renderScaleConfirmationStates();
}
function markInternalDirty(){
  unsavedInternalScale=true;
  renderScaleConfirmationStates();
}
function clearInternalDirty(){
  unsavedInternalScale=false;
  renderScaleConfirmationStates();
}
function operationalNeedsConfirmation(){
  return !!currentPlantao && (unsavedOperationalScale || !currentPlantao.escala_operacional_confirmada_em);
}
function internalNeedsConfirmation(){
  return !!currentPlantao && (unsavedInternalScale || !currentPlantao.escala_interna_confirmada_em);
}
function unsavedRiskMessage({includeOperational=false,includeInternal=false,includeBook=false,action='continuar'}={}){
  const items=[];
  if(includeOperational && operationalNeedsConfirmation())items.push('• A ESCALA OPERACIONAL ainda precisa ser CONFIRMADA.');
  if(includeInternal && internalNeedsConfirmation())items.push('• A EQUIPE INTERNA ainda precisa ser CONFIRMADA.');
  if(includeBook && unsavedBook)items.push('• O LIVRO possui alterações que ainda não foram salvas.');
  if(!items.length)return '';
  return 'ATENÇÃO — HÁ DADOS PENDENTES\n\n'+items.join('\n')+'\n\nSe você '+action+', poderá perder alterações ou deixar a escala sem confirmação.\n\nDeseja continuar mesmo assim?';
}
function confirmUnsavedRisk(options){
  const msg=unsavedRiskMessage(options);
  return !msg || confirm(msg);
}
function activeTeamScope(){
  return $('#teamInternalPanel')?.classList.contains('hidden')?'operational':'internal';
}
function serializeModalDraft(id){
  const modal=$('#'+id);
  if(!modal)return '';
  return [...modal.querySelectorAll('input,select,textarea')]
    .filter(el=>!['button','submit'].includes(el.type))
    .map(el=>el.id+'='+String(el.value||''))
    .join('|');
}
function modalHasUnsavedDraft(id){
  if(!TRACKED_DRAFT_MODALS.has(id))return false;
  const initial=modalDraftSnapshots.get(id);
  return initial!==undefined && serializeModalDraft(id)!==initial;
}
function anyDraftModalOpen(){
  return [...TRACKED_DRAFT_MODALS].some(id=>$('#'+id)?.classList.contains('show')&&modalHasUnsavedDraft(id));
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
  updateScaleReferenceUI({ala,turno,date});
  return {ala,turno,date};
}
function selectedDate(){
  return $('#shiftDate').value || currentPlantao?.data_plantao || operationalShiftContext().date;
}
function operationalShiftKey(ctx=operationalShiftContext()){
  return ctx.date+'|'+ctx.turno+'|'+alaForDate(ctx.date);
}
function nextShiftContext(ctx){
  const date=normalizeTurno(ctx.turno)==='NOTURNO'?addDaysIso(ctx.date,1):ctx.date;
  const turno=normalizeTurno(ctx.turno)==='NOTURNO'?'DIURNO':'NOTURNO';
  return {date,turno,ala:alaForDate(date)};
}
function shiftExpectedStart(ctx){
  return new Date(ctx.date+'T'+(normalizeTurno(ctx.turno)==='DIURNO'?'07:00:00':'19:00:00')+'-03:00');
}
function shiftExpectedEnd(ctx){
  const night=normalizeTurno(ctx.turno)==='NOTURNO';
  return new Date((night?addDaysIso(ctx.date,1):ctx.date)+'T'+(night?'07:00:00':'19:00:00')+'-03:00');
}
function shiftTitle(ctx){
  return 'ALA '+(ctx.ala||alaForDate(ctx.date))+' • '+normalizeTurno(ctx.turno)+' • '+fmtDate(ctx.date);
}
async function resolveOperationalShiftContext(){
  const clock=operationalShiftContext();
  const next=nextShiftContext(clock);
  const {data,error}=await supabase.from('plantoes').select('id')
    .eq('data_plantao',next.date).eq('turno',next.turno).eq('ala',next.ala)
    .eq('status','ABERTO').limit(1);
  if(error)throw error;
  return data?.length?next:{...clock,ala:alaForDate(clock.date)};
}
function plantaoShiftKey(p=currentPlantao){
  if(!p)return '';
  return String(p.data_plantao||'')+'|'+normalizeTurno(p.turno||'')+'|'+norm(p.ala||'');
}
function currentScaleContext(){
  const now=operationalShiftContext();
  if(currentPlantao){
    return {
      date:currentPlantao.data_plantao||now.date,
      ala:norm(currentPlantao.ala||alaForDate(currentPlantao.data_plantao||now.date)),
      turno:normalizeTurno(currentPlantao.turno||now.turno)
    };
  }
  const date=selectedDate()||now.date;
  return {
    date,
    ala:alaForDate(date),
    turno:date===now.date?now.turno:normalizeTurno($('#expressTurno')?.value||now.turno)
  };
}
function activeScaleReference(){
  const ctx=currentScaleContext();
  return manualScaleReference
    ? {...ctx,ala:manualScaleReference.ala,turno:manualScaleReference.turno}
    : ctx;
}
function updateScaleReferenceUI(baseContext=null){
  const base=baseContext||currentScaleContext();
  const selected=manualScaleReference||base;
  if($('#expressAla'))$('#expressAla').value=selected.ala;
  if($('#expressTurno'))$('#expressTurno').value=selected.turno;
  const manual=!!manualScaleReference;
  const mode=$('#scaleReferenceMode');
  if(mode){
    mode.classList.toggle('manual',manual);
    mode.textContent=manual?'MANUAL • REFERÊNCIA ESCOLHIDA':'AUTOMÁTICA • ALA E TURNO DO PLANTÃO';
  }
  $('#autoScaleReferenceBtn')?.classList.toggle('hidden',!manual);
  if($('#expressCurrentShift')){
    $('#expressCurrentShift').textContent=manual
      ? 'PLANTÃO: ALA '+base.ala+' • '+base.turno+' • '+fmtDate(base.date)+' | REFERÊNCIA MANUAL: '+selected.ala+' • '+selected.turno
      : 'ALA '+base.ala+' • '+base.turno+' • '+fmtDate(base.date);
  }
}
function askToApplyScaleReference(){
  const ala=norm($('#expressAla').value);
  const turno=normalizeTurno($('#expressTurno').value);
  const base=currentScaleContext();
  if(!ALA_CYCLE.includes(ala))return alert('Escolha uma Ala válida.');
  if(ala===base.ala&&turno===base.turno){
    return restoreAutomaticScaleReference();
  }
  if(manualScaleReference?.ala===ala&&manualScaleReference?.turno===turno){
    updateScaleReferenceUI();
    return;
  }
  pendingScaleReference={ala,turno,date:base.date,plantaoKey:plantaoShiftKey()};
  $('#scaleReferenceDetails').innerHTML=
    '<p><b>Plantão operacional aberto:</b> '+esc(shiftTitle(base))+'</p>'+
    '<p><b>Escala de referência solicitada:</b> ALA '+esc(ala)+' • '+esc(turno)+'</p>'+
    '<p><strong>ATENÇÃO:</strong> Você está escolhendo os titulares de uma Ala/turno diferente. Isso não muda a data, a Ala ou o turno do plantão operacional, não encerra plantões e não substitui registros já realizados.</p>'+
    '<p>As decisões de FIXO, PERMUTA, REVEZAMENTO e AUSENTE feitas a partir dessa referência serão registradas no plantão aberto atual. Revise os nomes antes de confirmar. Alterações pendentes da escala ainda precisam ser confirmadas.</p>';
  $('#scaleReferenceAcknowledge').checked=false;
  $('#applyScaleReferenceBtn').disabled=true;
  openModal('scaleReferenceModal');
}
async function applyManualScaleReference(){
  if(!pendingScaleReference||!$('#scaleReferenceAcknowledge').checked)return;
  const pending=pendingScaleReference;
  if(pending.plantaoKey!==plantaoShiftKey()||pending.date!==currentScaleContext().date){
    pendingScaleReference=null;
    closeModal('scaleReferenceModal');
    updateScaleReferenceUI();
    return alert('O plantão mudou durante a escolha. Confira os dados e selecione a escala novamente.');
  }
  manualScaleReference={ala:pending.ala,turno:pending.turno};
  pendingScaleReference=null;
  closeModal('scaleReferenceModal');
  await loadExpressScale();
  setSync('Referência manual ativa: '+manualScaleReference.ala+' • '+manualScaleReference.turno+' | Plantão operacional permanece '+shiftTitle(currentScaleContext()),'warn');
}
async function restoreAutomaticScaleReference(){
  if(manualScaleReference&&!confirmUnsavedRisk({includeOperational:true,includeInternal:true,includeBook:true,action:'voltar à escala automática'})){
    updateScaleReferenceUI();
    return false;
  }
  manualScaleReference=null;
  pendingScaleReference=null;
  await loadExpressScale();
  setSync('Escala de referência automática • '+shiftTitle(currentScaleContext()));
  return true;
}
async function synchronizeCurrentOperationalShift(force=false){
  if(!session||operationalShiftSyncBusy||(!autoFollowCurrentShift&&!force))return;
  operationalShiftSyncBusy=true;
  try{
    const clockKey=operationalShiftKey();
    const ctx=await resolveOperationalShiftContext();
    const key=operationalShiftKey(ctx);
    if(!force&&clockKey===lastClockShiftKey&&plantaoShiftKey()===key)return;
    if(key!==plantaoShiftKey()&&(unsavedOperationalScale||unsavedInternalScale||unsavedBook||anyDraftModalOpen())){
      if(pendingShiftWarningKey!==key){
        pendingShiftWarningKey=key;
        alert('TROCA DE PLANTÃO DETECTADA\n\nExistem alterações não salvas nesta tela. Salve ou confirme antes de trocar o plantão.');
      }
      setSync('Troca de plantão aguardando salvamento','warn');
      return;
    }
    if(manualScaleReference&&key!==plantaoShiftKey()){
      // Uma nova abertura de plantão volta à referência automática, nunca arrasta outra Ala.
      manualScaleReference=null;
    }
    syncDateAndAla(ctx.date,ctx.turno);
    await loadAll(ctx.date,ctx.turno);
    await loadExpressScale();
    if(currentPlantao)await loadBookData();
    if(!$('#teamInternalPanel')?.classList.contains('hidden'))renderInternalEditors();
    if($('#book')?.classList.contains('active'))renderBook();
    lastOperationalShiftKey=key;
    lastClockShiftKey=clockKey;
    pendingShiftWarningKey='';
    setSync(currentPlantao&&norm(currentPlantao.status)==='ENCERRADO'
      ?'Plantão encerrado • use INICIAR PRÓXIMA ESCALA'
      :'Plantão sincronizado • '+shiftTitle(ctx),currentPlantao&&norm(currentPlantao.status)==='ENCERRADO'?'warn':'ok');
  }catch(error){
    console.error('Falha ao sincronizar plantão',error);
    setSync('Falha ao sincronizar plantão: '+(error.message||error),'warn');
  }finally{
    operationalShiftSyncBusy=false;
  }
}
function stopOperationalShiftMonitor(){
  if(operationalShiftTimer){
    clearInterval(operationalShiftTimer);
    operationalShiftTimer=null;
  }
}
function startOperationalShiftMonitor(){
  stopOperationalShiftMonitor();
  operationalShiftTimer=setInterval(()=>{
    if(!session)return;
    // O alerta de última hora deve atualizar sem precisar recarregar o banco,
    // inclusive se o plantão tiver sido selecionado manualmente.
    if(currentPlantao&&$('#base')?.classList.contains('active'))renderRotation();
    if(currentPlantao&&$('#team')?.classList.contains('active'))renderTeamPreview();
    if(!autoFollowCurrentShift)return;
    const key=operationalShiftKey();
    if(key!==lastClockShiftKey || !currentPlantao){
      synchronizeCurrentOperationalShift().catch(console.error);
    }
  },30000);
}

function openPage(id, options={}){
  const teamView=id==='team'&&options.teamView==='roster'?'roster':'edit';
  const current=document.querySelector('.page.active')?.id||'';
  if(current && current!==id){
    if(current==='team'){
      // Só cobra a confirmação da seção aberta. Alterações pendentes
      // de qualquer seção continuam protegidas contra perda.
      const scope=activeTeamScope();
      if(!confirmUnsavedRisk({
        includeOperational:scope==='operational'||unsavedOperationalScale,
        includeInternal:scope==='internal'||unsavedInternalScale,
        action:'sair desta página'
      }))return false;
    }
    if(current==='book'){
      if(!confirmUnsavedRisk({includeInternal:true,includeBook:true,action:'sair do LIVRO'}))return false;
    }
  }
  // Equipe do Dia mostra a relação já escalada, sem apagar rascunhos
  // nem recarregar a escala quando a navegação continua na mesma página.
  if(id==='team'&&teamView==='roster'&&activeTeamScope()==='internal'){
    if(showTeamScope('operational')===false)return false;
  }
  [...document.querySelectorAll('.page')].forEach(x=>x.classList.remove('active'));
  [...document.querySelectorAll('.tab')].forEach(x=>x.classList.remove('active'));
  $('#'+id)?.classList.add('active');
  const tabSelector=id==='team'
    ? '.tab[data-page="team"][data-team-view="'+teamView+'"]'
    : '.tab[data-page="'+id+'"]';
  document.querySelector(tabSelector)?.classList.add('active');
  if(id==='history') renderHistory();
  if(id==='team'){
    const navigateToTeamSection=()=>{
      if(teamView==='roster'){
        $('.team-preview-wrap')?.scrollIntoView({behavior:'smooth',block:'start'});
      }else{
        $('#team')?.scrollIntoView({behavior:'smooth',block:'start'});
      }
    };
    if(current==='team'){
      renderTeamPreview();
      navigateToTeamSection();
    }else{
      const ready=autoFollowCurrentShift?synchronizeCurrentOperationalShift():Promise.resolve();
      ready.then(()=>{
        renderTeamPreview();
        loadExpressScale();
        renderRegistry();
        navigateToTeamSection();
      }).catch(e=>alert(e.message||e));
    }
  }
  if(id==='book'){
    const ready=autoFollowCurrentShift?synchronizeCurrentOperationalShift():Promise.resolve();
    ready.then(()=>loadBookData()).then(()=>{renderInternalEditors();renderBook();renderScaleConfirmationStates()}).catch(e=>alert(e.message||e));
  }
}
window.openPage=openPage;

function openModal(id){
  $('#'+id)?.classList.add('show');
  if(TRACKED_DRAFT_MODALS.has(id)){
    setTimeout(()=>modalDraftSnapshots.set(id,serializeModalDraft(id)),0);
  }
}
function closeModal(id){
  $('#'+id)?.classList.remove('show');
  modalDraftSnapshots.delete(id);
}
function requestCloseModal(id){
  if(id==='scaleReferenceModal'){
    pendingScaleReference=null;
    closeModal(id);
    updateScaleReferenceUI();
    return true;
  }
  if(modalHasUnsavedDraft(id)){
    if(!confirm('ATENÇÃO\n\nHá informações preenchidas que ainda não foram salvas.\nSe fechar agora, esses dados serão perdidos.\n\nDeseja fechar mesmo assim?'))return false;
  }
  closeModal(id);
  return true;
}

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
  if(exact){
    if(norm(exact.status)==='ENCERRADO')throw new Error('Este plantão já foi encerrado. Inicie a próxima escala.');
    return exact;
  }
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

async function loadAll(preferredDate=null,preferredTurno=null){
  const ctx=operationalShiftContext();
  const previous=currentPlantao;
  const date=preferredDate||selectedDate()||ctx.date;
  const turno=normalizeTurno(preferredTurno||(previous?.data_plantao===date?previous.turno:null)||ctx.turno);
  const initialShift=syncDateAndAla(date,turno);
  const ala=initialShift.ala;
  const isCurrentShift=autoFollowCurrentShift&&(date===ctx.date||!!preferredTurno);
  setSync('Identificando plantão atual e pré-carregando escalas...','warn');

  currentPlantao=null;
  vehicles=[];team=[];occurrences=[];rotation=[];manualRotation=[];occurrenceTeam=[];
  const warnings=[];

  try{
    try{
      currentPlantao=await choosePlantao(date,turno,ala);
      if(!currentPlantao&&isCurrentShift&&date===ctx.date&&turno===ctx.turno){
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

    if(currentPlantao&&isCurrentShift&&norm(currentPlantao.status)==='ABERTO'){
      try{
        // Pré-carrega apenas as referências da escala. Ninguém entra como ATIVO automaticamente.
        await loadBookData();
      }catch(e){
        console.warn('Falha ao pré-carregar referências da escala',e);
        warnings.push('pré-carga das escalas');
      }
    }

    if(currentPlantao){
      const [tr,or,rr,mr]=await Promise.all([
        supabase.from('equipe_plantao').select('*').eq('plantao_id',currentPlantao.id),
        supabase.from('ocorrencias').select('*').eq('plantao_id',currentPlantao.id).order('criado_em',{ascending:false}),
        supabase.from('revezamento_plantao').select('*').eq('plantao_id',currentPlantao.id).order('grupo_revezamento').order('ordem_inicial'),
        supabase.from('prioridade_manual_revezamento').select('id,plantao_id,grupo,equipe_plantao_id,viatura_id,posicao,criado_em').eq('plantao_id',currentPlantao.id)
      ]);

      if(tr.error){console.warn(tr.error);warnings.push('equipe')}
      else team=(tr.data||[]).map(m=>({...m,profissionais:profMap.get(m.profissional_id)||null}));

      if(or.error){console.warn(or.error);warnings.push('ocorrências')}
      else occurrences=or.data||[];

      if(rr.error){console.warn(rr.error);warnings.push('revezamento')}
      else rotation=(rr.data||[]).map(m=>({...m,profissionais:profMap.get(m.profissional_id)||null}));
      if(mr.error){console.warn(mr.error);warnings.push('ordem manual')}
      else manualRotation=mr.data||[];

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
  const op=unsavedOperationalScale
    ? {text:'ALTERADA — CONFIRMAR',cls:'pending'}
    : confirmationLabel(currentPlantao?.escala_operacional_confirmada_em,currentPlantao?.escala_operacional_confirmada_por);
  const inn=unsavedInternalScale
    ? {text:'ALTERADA — CONFIRMAR',cls:'pending'}
    : confirmationLabel(currentPlantao?.escala_interna_confirmada_em,currentPlantao?.escala_interna_confirmada_por);
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
  if($('#endShiftBtn')){
    const open=norm(currentPlantao?.status)==='ABERTO';
    $('#endShiftBtn').disabled=!isOperator()||!currentPlantao;
    $('#endShiftBtn').textContent=open?'TROCAR / ENCERRAR':'INICIAR PRÓXIMA ESCALA';
    $('#endShiftBtn').classList.toggle('danger',open);
    $('#endShiftBtn').classList.toggle('primary',!open);
  }
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
/* Desfecho da ocorrência reutiliza o destino persistido no banco. */
const VICTIM_DESTINATION_OPTIONS=['UPA','UPA PED','HOSPITAL MUNICIPAL','SANTA CASA','ALFREDO ABRAAO','HEANA','HEG','TRANSPORTADO POR TERCEIROS','RECUSA','NÃO ENCONTRADO','QTA'];
function victimDestinationDisplay(value){
  const dest=String(value||'').trim();
  if(!dest)return 'NÃO INFORMADO';
  if(norm(dest)==='UPA PED')return 'UPA PEDIÁTRICA';
  if(norm(dest)==='ALFREDO ABRAAO')return 'ALFREDO ABRAÃO';
  if(norm(dest)==='RECUSA')return 'RECUSA DE TRANSPORTE';
  return dest;
}
function victimDestinationControlsHtml(o,v){
  if(!o?.chegada_qth_em||!v||!['occurrence','returning'].includes(statusInfo(v).key))return '';
  const recorded=!!String(o.destino||'').trim();
  return '<div class="victim-destination-card '+(recorded?'recorded':'pending')+'">'+
    '<div class="victim-destination-result"><span>DESTINO DA VÍTIMA</span><strong>'+esc(victimDestinationDisplay(o.destino))+'</strong></div>'+
    (isOperator()?'<button type="button" class="victim-destination-btn" data-act="victim-destination" data-o="'+esc(o.id)+'">'+
      (recorded?'✎ EDITAR DESTINO':'✎ INFORMAR DESTINO')+'</button>':'')+
  '</div>';
}
function refreshVictimDestinationChoice(){
  const choice=$('#victimDestinationChoice')?.value;
  $('#victimDestinationOtherWrap')?.classList.toggle('hidden',choice!=='OUTROS');
  $('#victimDestinationQtaHint')?.classList.toggle('hidden',choice!=='QTA');
  if($('#saveVictimDestinationBtn'))$('#saveVictimDestinationBtn').textContent=choice==='QTA'?'CONFIRMAR QTA':'SALVAR DESTINO';
}
function openVictimDestination(occId){
  if(!isOperator())return;
  const o=occurrences.find(x=>x.id===occId);
  if(!o)return alert('Ocorrência não encontrada.');
  const v=vehicleById(o.viatura_id);
  if(!o.chegada_qth_em||!v||!['occurrence','returning'].includes(statusInfo(v).key)){
    return alert('O destino da vítima fica disponível após a chegada no QTH, durante a ocorrência ou o retorno.');
  }
  selectedVictimOccurrenceId=o.id;
  $('#victimDestinationTitle').textContent='Destino da vítima • '+(v.nome||v.codigo)+' • OC. '+(o.numero||'—');
  $('#victimDestinationCurrent').textContent='Destino atual: '+victimDestinationDisplay(o.destino);
  const saved=String(o.destino||'').trim();
  const preset=VICTIM_DESTINATION_OPTIONS.includes(saved)?saved:(saved?'OUTROS':'');
  $('#victimDestinationChoice').value=preset;
  $('#victimDestinationOther').value=preset==='OUTROS'?saved:'';
  refreshVictimDestinationChoice();
  openModal('victimDestinationModal');
}
async function saveVictimDestination(){
  if(!isOperator()||!selectedVictimOccurrenceId)return;
  const oid=selectedVictimOccurrenceId;
  const selected=$('#victimDestinationChoice').value;
  const custom=$('#victimDestinationOther').value.trim();
  if(!selected)return alert('Escolha onde a vítima ficou.');
  if(selected==='OUTROS'&&!custom)return alert('Digite o local onde a vítima ficou em OUTROS.');
  const dest=selected==='OUTROS'?custom:selected;
  if(dest.length>180)return alert('O destino informado é muito longo.');
  const button=$('#saveVictimDestinationBtn');
  button.disabled=true;
  try{
    const {data:record,error:readError}=await supabase.from('ocorrencias')
      .select('id,status,chegada_qth_em,viatura_id').eq('id',oid).maybeSingle();
    if(readError)throw readError;
    if(!record||!record.chegada_qth_em||['FINALIZADA','QTA','CANCELADA'].includes(norm(record.status))){
      throw new Error('A ocorrência foi encerrada ou ainda não tem chegada ao QTH. Atualize o painel.');
    }
    const v=vehicleById(record.viatura_id);
    if(!v||!['occurrence','returning'].includes(statusInfo(v).key)){
      throw new Error('A viatura não está mais em ocorrência ou retorno. Atualize o painel.');
    }
    if(dest==='QTA'){
      const saved=await setOccurrenceQta(oid,record.viatura_id);
      if(!saved)return;
    }else{
      const {error}=await supabase.from('ocorrencias').update({destino:dest}).eq('id',oid);
      if(error)throw error;
      await loadAll(selectedDate());
    }
    selectedVictimOccurrenceId=null;
    closeModal('victimDestinationModal');
  }catch(error){
    alert('Não foi possível salvar o destino da vítima: '+(error.message||error));
  }finally{button.disabled=false}
}

function occurrenceInfoHtml(v,o){
  if(!o) return '';
  const qthRecorded=!!o.chegada_qth_em;
  const inicio=o.saida_em||o.acionada_em;
  const tempoQth=minutesBetween(inicio,o.chegada_qth_em);
  return '<div class="occ-detail">OC. '+esc(o.numero||'—')+' • '+esc(o.natureza||'SEM NATUREZA')+'</div>'+
    '<div class="occ-address">'+esc([o.bairro,o.endereco,o.destino].filter(Boolean).join(' • '))+'</div>'+
    '<div class="occ-timeline">'+
      '<div class="occ-time-chip"><span>INÍCIO / SAÍDA</span><b>'+fmtTime(inicio)+'</b></div>'+
      '<div class="occ-time-chip"><span>CHEGADA QTH</span><b>'+fmtTime(o.chegada_qth_em)+'</b></div>'+
      '<div class="occ-time-chip qth-duration"><span>TEMPO ATÉ QTH</span><b>'+fmtMinutes(tempoQth)+'</b></div>'+
      '<div class="occ-time-chip"><span>INÍCIO RETORNO</span><b>'+fmtTime(o.inicio_retorno_em)+'</b></div>'+
    '</div>'+
    victimDestinationControlsHtml(o,v)+
    (statusInfo(v).key==='occurrence'
      ? '<div class="occurrence-main-actions">'+
          '<button class="qth-btn '+(qthRecorded?'recorded':'')+'" data-act="qth" data-o="'+o.id+'">'+(qthRecorded?'QTH REGISTRADO • '+fmtTime(o.chegada_qth_em)+' • '+fmtMinutes(tempoQth):'CHEGADA NO QTH')+'</button>'+
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
  const current=statusInfo(v).key;
  if(o && current==='occurrence') return '';
  const btn=(key,label)=>'<button class="'+(current===key?'active':'')+'" data-status="'+key+'" data-v="'+v.id+'" title="Alterar situação para '+label+'">'+label+'</button>';
  return '<div class="status-strip">'+
    btn('base','BASE')+
    btn('asepsis','ASSEPSIA')+
    btn('mechanical','PANE')+
    btn('noCrew','S/EQUIPE')+
    btn('noStretcher','S/MACA')+
  '</div>';
}
function vehicleCardHtml(v){
  const st=statusInfo(v),o=activeOccurrence(v);
  let primary='';
  if(st.key==='base') primary='<button class="dispatch-btn" data-act="dispatch" data-v="'+v.id+'">ACIONAR VIATURA</button>';
  if(st.key==='returning') primary='<button class="arrive-btn" data-act="arrive" data-o="'+(o?.id||'')+'" data-v="'+v.id+'">CHEGADA À BASE</button>';
  return '<article class="vehicle-card '+st.cls+'" data-team-card data-v="'+v.id+'">'+
    (st.key==='occurrence'
      ? '<div class="vehicle-giroflex" aria-hidden="true"><span class="giroflex-led red"></span><span class="giroflex-led red"></span><span class="giroflex-led red"></span><span class="giroflex-led red"></span><span class="giroflex-led red"></span><span class="giroflex-led red"></span></div>'
      : '')+
    '<div class="vehicle-top"><div><div class="vehicle-name">'+esc(v.nome||v.codigo)+'</div><div class="vehicle-subhint">'+(st.key==='occurrence'?'EQUIPE EMPENHADA • CLIQUE PARA EDITAR':'CLIQUE PARA EMPENHAR / EDITAR EQUIPE')+'</div></div><span class="status-badge">'+st.label+'</span></div>'+
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
  const lane=(key,title,subtitle,cls,predicate=null)=>{
    const list=all.filter(v=>!vehicleType(v).includes('MOTO')&&statusInfo(v).key===key&&(!predicate||predicate(v)))
      .sort((a,b)=>(vehicleType(a).includes('USA')?1:2)-(vehicleType(b).includes('USA')?1:2)||String(a.nome).localeCompare(String(b.nome),'pt-BR',{numeric:true}));
    return list.length?operationalGroup(title,subtitle,cls,list,'dynamic-status-lane'):'';
  };
  // Não misturar USA e USB empenhadas na mesma linha: cada grupo ganha
  // cartões largos e seus próprios totais, sem ocultar outros tipos.
  const isUSA=v=>vehicleType(v).includes('USA')&&!vehicleType(v).includes('USB');
  const isUSB=v=>vehicleType(v).includes('USB');
  $('#vehicles').innerHTML=
    operationalGroup('MOTOLÂNCIA','Resposta rápida • Anápolis','moto',moto)+
    operationalGroup('USA','Unidades de Suporte Avançado • QRV e retorno','usa',usa)+
    operationalGroup('USB','Unidades de Suporte Básico • QRV e retorno','usb',usb)+
    lane('occurrence','USA EM OCORRÊNCIA','Suporte Avançado • viaturas empenhadas','occurrence occurrence-usa',isUSA)+
    lane('occurrence','USB EM OCORRÊNCIA','Suporte Básico • viaturas empenhadas','occurrence occurrence-usb',isUSB)+
    lane('occurrence','OUTRAS VIATURAS EM OCORRÊNCIA','Outras unidades empenhadas','occurrence occurrence-other',v=>!isUSA(v)&&!isUSB(v))+
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
/* ---------- Saída antecipada programada: justiça e bloqueio preventivo ---------- */
const EARLY_EXIT_CUTOFF_MINUTES=60;
const EARLY_EXIT_BASE_BONUS_MINUTES=18;
const EARLY_EXIT_OCCURRENCE_BONUS=0.5;
function earlyExitTimeLabel(m){
  if(!m?.saida_prevista_em)return '';
  const date=new Date(m.saida_prevista_em);
  return Number.isFinite(date.getTime())?
    date.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}):'—';
}
function earlyExitStatus(m,nowMs=Date.now()){
  if(!isRotationMember(m)||!m?.saida_prevista_em)return null;
  const ms=new Date(m.saida_prevista_em).getTime();
  if(!Number.isFinite(ms))return null;
  const minutesLeft=Math.ceil((ms-nowMs)/60000);
  const goal=Math.max(0,Math.min(2,Number(m.antecipacao_meta_extra||0)));
  const baseline=Math.max(0,Number(m.antecipacao_ocorrencias_inicio??personOccurrenceCount(m)));
  const completed=Math.max(0,personOccurrenceCount(m)-baseline);
  const remaining=Math.max(0,goal-completed);
  return {
    minutesLeft,goal,baseline,completed,remaining,
    // Regra operacional absoluta, independentemente de ocorrências pendentes.
    cutoff:minutesLeft<=EARLY_EXIT_CUTOFF_MINUTES,
    due:minutesLeft<=0,
    bonusActive:minutesLeft>EARLY_EXIT_CUTOFF_MINUTES&&remaining>0&&goal>0
  };
}
function earlyExitPriorityBonus(m){
  const p=earlyExitStatus(m);
  return p?.bonusActive?{base:EARLY_EXIT_BASE_BONUS_MINUTES,occ:EARLY_EXIT_OCCURRENCE_BONUS}:{base:0,occ:0};
}
function earlyExitStatusLabel(m){
  const p=earlyExitStatus(m);
  if(!p)return '';
  if(p.due)return 'SAÍDA '+earlyExitTimeLabel(m)+' • HORÁRIO ATINGIDO';
  if(p.cutoff)return 'SAÍDA '+earlyExitTimeLabel(m)+' • NÃO SUGERIR NOVOS ACIONAMENTOS';
  return 'SAÍDA '+earlyExitTimeLabel(m)+' • '+p.completed+'/'+p.goal+' ATENDIMENTOS DA META';
}
function earlyExitSummaryHtml(){
  const scheduled=activeTeamRows().filter(m=>isRotationMember(m)&&earlyExitStatus(m));
  if(!scheduled.length)return '';
  return '<section class="early-exit-summary"><div class="early-exit-summary-head">SAÍDAS ANTECIPADAS PROGRAMADAS</div>'+
    scheduled.map(m=>{
      const st=earlyExitStatus(m);
      const urgent=st.cutoff;
      const note=st.due?'HORÁRIO DE SAÍDA ATINGIDO • conferir retorno e retirar da escala.':
        st.cutoff?'ÚLTIMA HORA • fora de novas sugestões de revezamento.':
        'Prioridade moderada • '+st.completed+' de '+st.goal+' atendimentos da meta.';
      return '<div class="early-exit-summary-line '+(urgent?'warning':'')+'">'+
        '<div><b>'+esc(priorityPersonName(m))+'</b><small>'+esc(earlyExitTimeLabel(m))+' • '+esc(roleLabel(teamRoleKey(m)))+
        '</small><span>'+esc(note)+'</span></div>'+
        (isOperator()?'<button type="button" data-schedule-exit="'+esc(m.id)+'">✎ EDITAR</button>':'')+
      '</div>';
    }).join('')+
    '<p class="early-exit-summary-note">A saída é programada, não automática. Se houver ocorrência em andamento, o operador deve acompanhar e decidir o encerramento com segurança.</p></section>';
}
function earlyExitIsoForShift(time){
  if(!currentPlantao||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Informe um horário válido.');
  const shiftDate=currentPlantao.data_plantao;
  const isNight=normalizeTurno(currentPlantao.turno)==='NOTURNO';
  const targetDate=isNight&&time<'19:00'?addDaysIso(shiftDate,1):shiftDate;
  const ts=new Date(targetDate+'T'+time+':00-03:00');
  const start=shiftExpectedStart({date:shiftDate,turno:currentPlantao.turno});
  const end=shiftExpectedEnd({date:shiftDate,turno:currentPlantao.turno});
  if(ts<start||ts>end)throw new Error('O horário de saída precisa estar dentro deste plantão ('+
    start.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})+' até '+
    end.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})+').');
  if(ts.getTime()<=Date.now())throw new Error('O horário de saída precisa ser posterior ao horário atual.');
  return ts.toISOString();
}
function openEarlyExitModal(teamId){
  if(!isOperator())return;
  const m=activeTeamRows().find(row=>row.id===teamId);
  if(!m||!isRotationMember(m)||!['driver','tech','nurse'].includes(teamRoleKey(m))){
    return alert('A saída antecipada pode ser programada para condutores, técnicos e enfermeiros em revezamento.');
  }
  selectedEarlyExitMemberId=m.id;
  $('#earlyExitProfessional').textContent=priorityPersonName(m)+' • '+roleLabel(teamRoleKey(m))+
    ' • '+(m.grupo_revezamento||'REVEZAMENTO');
  const existing=earlyExitStatus(m);
  $('#earlyExitTime').value=existing?earlyExitTimeLabel(m):'';
  $('#earlyExitExtra').value=existing&&existing.goal>0?String(existing.goal):'2';
  $('#earlyExitRemoveBtn').classList.toggle('hidden',!existing);
  updateEarlyExitPreview();
  openModal('earlyExitModal');
}
function updateEarlyExitPreview(){
  const m=activeTeamRows().find(x=>x.id===selectedEarlyExitMemberId);
  if(!m)return;
  const time=$('#earlyExitTime').value;
  const target=Number($('#earlyExitExtra').value||2);
  let note='Escolha um horário para calcular a última hora de revezamento.';
  if(time){
    try{
      const iso=earlyExitIsoForShift(time);
      const cutoff=new Date(new Date(iso).getTime()-EARLY_EXIT_CUTOFF_MINUTES*60000);
      note='Último horário de indicação: '+cutoff.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})+
        '. Meta de até '+target+' ocorrência(s) adicionais após o registro, sem garantia de cumprimento.';
      if(cutoff.getTime()<=Date.now())note+=' A última hora já começou: nenhuma prioridade extra será aplicada.';
    }catch(e){note=e.message||String(e)}
  }
  $('#earlyExitPreview').textContent=note;
}
async function saveEarlyExit(){
  if(!canEditOpenShift()||!currentPlantao||!selectedEarlyExitMemberId)return;
  const m=activeTeamRows().find(x=>x.id===selectedEarlyExitMemberId);
  if(!m||!isRotationMember(m))return alert('O profissional não está mais no revezamento. Atualize a escala.');
  let iso;
  try{iso=earlyExitIsoForShift($('#earlyExitTime').value)}catch(e){return alert(e.message||e)}
  const target=Number($('#earlyExitExtra').value);
  if(![1,2].includes(target))return alert('Escolha uma meta de 1 ou 2 atendimentos.');
  const nowCutoff=new Date(iso).getTime()-EARLY_EXIT_CUTOFF_MINUTES*60000<=Date.now();
  if(nowCutoff&&!confirm('Este profissional já está na última hora antes da saída. Ele não receberá prioridade extra nem será sugerido para novos acionamentos. Deseja registrar mesmo assim?'))return;
  const button=$('#earlyExitSaveBtn');button.disabled=true;
  try{
    const {data,error}=await supabase.from('equipe_plantao').update({
      saida_prevista_em:iso,antecipacao_meta_extra:target,
      antecipacao_ocorrencias_inicio:personOccurrenceCount(m)
    }).eq('id',m.id).eq('plantao_id',currentPlantao.id).eq('status','ATIVO').select('id').maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('A escala deste profissional mudou. Atualize a página.');
    selectedEarlyExitMemberId=null;
    closeModal('earlyExitModal');
    await loadAll(selectedDate());
    setSync('Saída antecipada registrada. A última hora bloqueia novos acionamentos deste profissional.','warn');
  }catch(e){alert('Erro ao programar saída: '+(e.message||e))}
  finally{button.disabled=false}
}
async function removeEarlyExit(){
  if(!canEditOpenShift()||!currentPlantao||!selectedEarlyExitMemberId)return;
  const m=activeTeamRows().find(x=>x.id===selectedEarlyExitMemberId);
  if(!m||!confirm('Cancelar a saída antecipada de '+priorityPersonName(m)+'? Ele voltará à prioridade normal do revezamento.'))return;
  const button=$('#earlyExitRemoveBtn');button.disabled=true;
  try{
    const {data,error}=await supabase.from('equipe_plantao').update({
      saida_prevista_em:null,antecipacao_meta_extra:null,antecipacao_ocorrencias_inicio:null
    }).eq('id',m.id).eq('plantao_id',currentPlantao.id).eq('status','ATIVO').select('id').maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('O profissional já não está ativo no plantão.');
    selectedEarlyExitMemberId=null;closeModal('earlyExitModal');
    await loadAll(selectedDate());
    setSync('Programação cancelada; prioridade normal restaurada.');
  }catch(e){alert('Erro ao cancelar a programação: '+(e.message||e))}
  finally{button.disabled=false}
}
function bindEarlyExitButtons(root){
  root?.querySelectorAll('[data-schedule-exit]').forEach(b=>
    b.onclick=()=>openEarlyExitModal(b.dataset.scheduleExit));
}
function memberEligibleForPriority(m,role,type){
  if(!m||norm(m.status||'ATIVO')!=='ATIVO')return false;
  if(teamRoleKey(m)!==role||memberIsBusy(m))return false;
  if(isRotationMember(m)&&earlyExitStatus(m)?.cutoff)return false;

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
/* Sequência temporária por grupo, não modifica o critério automático. */
const MANUAL_GROUPS={
 USA_VIATURA:{label:'Viaturas USA',type:'USA'},USB_VIATURA:{label:'Viaturas USB',type:'USB'},
 USA_DRIVER:{label:'Condutores USA',type:'USA',role:'driver'},
 USA_NURSE:{label:'Enfermeiros USA',type:'USA',role:'nurse'},
 USB_DRIVER:{label:'Condutores USB',type:'USB',role:'driver'},
 USB_TECH:{label:'Técnicos / Enfermeiros USB',type:'USB',role:'tech'}
};
function manualRank(group,id,returnTime){
 const row=manualRotation.find(x=>x.grupo===group&&(x.equipe_plantao_id===id||x.viatura_id===id));
 if(!row)return null;
 if(returnTime&&new Date(returnTime).getTime()>=new Date(row.criado_em).getTime())return null;
 return Number(row.posicao)||null;
}
function manualRankMember(m,role,type){
 if(!m||!isRotationMember(m))return null;
 const name=type+'_'+(role==='driver'?'DRIVER':role==='tech'?'TECH':'NURSE');
 return manualRank(name,m.id,m.ultimo_retorno_em);
}
function manualRankVehicle(v){
 if(!v)return null;
 const type=vehicleType(v).includes('USA')?'USA':vehicleType(v).includes('USB')?'USB':'';
 return type?manualRank(type+'_VIATURA',v.id,latestReturnForVehicle(v)):null;
}
function compareManualRank(a,b){
 if(a===null&&b===null)return 0;
 return a===null?1:b===null?-1:a-b;
}
function manualQueueItems(group){
 const cfg=MANUAL_GROUPS[group];if(!cfg)return [];
 if(!cfg.role){
  const list=cfg.type==='USA'?availableUsaTeams():availableUsbTeams();
  return list.map(x=>({id:x.v.id,label:x.v.nome||x.v.codigo,detail:'Equipe mínima disponível'}));
 }
 return priorityPeopleForRole(cfg.role,cfg.type,{rotationOnly:true}).filter(isRotationMember)
   .map(m=>({id:m.id,label:priorityPersonName(m),detail:priorityMetricText(m,cfg.type)}));
}
function openManualQueue(group){
 if(!isOperator()||!currentPlantao||norm(currentPlantao.status)!=='ABERTO')return;
 const cfg=MANUAL_GROUPS[group];if(!cfg)return;
 const items=manualQueueItems(group);
 if(items.length<2)return alert('É necessário ter pelo menos duas opções disponíveis para ordenar.');
 manualRotationDraft={group,plantaoId:currentPlantao.id,items};
 $('#manualRotationTitle').textContent='Personalizar sequência • '+cfg.label;
 renderManualQueueDraft();openModal('manualRotationModal');
}
function renderManualQueueDraft(){
 const draft=manualRotationDraft,root=$('#manualRotationList');if(!draft||!root)return;
 root.innerHTML=draft.items.map((x,i)=>
  '<div class="manual-rotation-item"><b class="manual-rotation-position">'+(i+1)+'º</b>'+
  '<div class="manual-rotation-description"><strong>'+esc(x.label)+'</strong><small>'+esc(x.detail)+'</small></div>'+
  '<div class="manual-rotation-actions"><button type="button" data-manual-move="'+i+'" data-dir="-1" '+(!i?'disabled':'')+'>↑</button>'+
  '<button type="button" data-manual-move="'+i+'" data-dir="1" '+(i===draft.items.length-1?'disabled':'')+'>↓</button></div></div>').join('');
 root.querySelectorAll('[data-manual-move]').forEach(b=>b.onclick=()=>{
  const i=Number(b.dataset.manualMove),j=i+Number(b.dataset.dir);
  if(j<0||j>=draft.items.length)return;
  [draft.items[i],draft.items[j]]=[draft.items[j],draft.items[i]];
  renderManualQueueDraft();
 });
 $('#manualRotationNotice').textContent='Prioridade temporária: após cada retorno à base, a pessoa ou viatura volta à classificação automática. A saída antecipada e os impedimentos continuam prevalecendo.';
 $('#manualRotationReset').classList.toggle('hidden',!manualRotation.some(x=>x.grupo===draft.group));
}
async function persistManualQueue(reset=false){
 const draft=manualRotationDraft;
 if(!draft||!isOperator()||!currentPlantao)return;
 if(norm(currentPlantao.status)!=='ABERTO'||draft.plantaoId!==currentPlantao.id)return alert('O plantão mudou. Atualize a fila.');
 const save=$('#manualRotationSave'),resetBtn=$('#manualRotationReset');save.disabled=true;resetBtn.disabled=true;
 try{
  const {error}=await supabase.rpc('definir_prioridade_manual_revezamento',{
   p_plantao_id:draft.plantaoId,p_grupo:draft.group,p_ids:reset?[]:draft.items.map(x=>x.id)
  });
  if(error)throw error;
  manualRotationDraft=null;closeModal('manualRotationModal');
  await loadAll(selectedDate());
  setSync(reset?'Prioridade automática restaurada.':'Ordem temporária salva; cada retorno à base restaura o critério automático.','warn');
 }catch(e){alert('Erro ao salvar a ordem: '+(e.message||e))}
 finally{save.disabled=false;resetBtn.disabled=false}
}
async function clearManualOnReturn(oid,vid){
 if(!currentPlantao)return;
 const people=new Set(occurrenceMembers(oid).map(x=>x.profissional_id).filter(Boolean));
 const ids=activeTeamRows().filter(m=>people.has(m.profissional_id)).map(m=>m.id);
 if(ids.length){
  const {error}=await supabase.from('prioridade_manual_revezamento').delete()
   .eq('plantao_id',currentPlantao.id).in('equipe_plantao_id',ids);
  if(error)console.warn('Prioridade manual de pessoa será invalidada pelo relógio de retorno.',error);
 }
 if(vid){
  const {error}=await supabase.from('prioridade_manual_revezamento').delete()
   .eq('plantao_id',currentPlantao.id).eq('viatura_id',vid);
  if(error)console.warn('Prioridade manual da viatura será invalidada pelo relógio de retorno.',error);
 }
}
function bindManualQueueButtons(root){
 root?.querySelectorAll('[data-manual-order]').forEach(b=>b.onclick=()=>openManualQueue(b.dataset.manualOrder));
}
function priorityPeopleForRole(role,type,{rotationOnly=false}={}){
  const crit=currentRotationCriterion();
  return activeTeamRows()
    .filter(m=>memberEligibleForPriority(m,role,type))
    .filter(m=>!rotationOnly||isRotationMember(m)||!m.viatura_id)
    .sort((a,b)=>{
      const oneTime=compareManualRank(manualRankMember(a,role,type),manualRankMember(b,role,type));
      if(oneTime)return oneTime;
      // Bônus pequeno e limitado a 1-2 atendimentos desde a programação.
      // Quem está realmente à frente por tempo/ocorrências mantém vantagem.
      const ab=personBaseMinutes(a,type)+earlyExitPriorityBonus(a).base;
      const bb=personBaseMinutes(b,type)+earlyExitPriorityBonus(b).base;
      const ao=personOccurrenceCount(a)-earlyExitPriorityBonus(a).occ;
      const bo=personOccurrenceCount(b)-earlyExitPriorityBonus(b).occ;
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
    const oneTime=compareManualRank(manualRankVehicle(a.v),manualRankVehicle(b.v));
    if(oneTime)return oneTime;
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
/* ---------- Painel lateral de prioridade: somente filas reais ---------- */
function availableUsbTeams(){
  const crit=currentRotationCriterion();
  return vehicles.filter(v=>
    isAnapolisVehicle(v)&&vehicleType(v).includes('USB')&&
    v.participa_revezamento!==false&&vehicleAvailableForRotation(v)
  ).map(v=>{
    const used=new Set();
    const driver=dispatchCandidateForVehicleRole(v,'driver',used);
    if(driver)used.add(driver.profissional_id);
    const tech=dispatchCandidateForVehicleRole(v,'tech',used);
    return {
      v,driver,tech,complete:!!driver&&!!tech,
      base:vehicleBaseMinutes(v),occ:vehicleOccurrenceCount(v)
    };
  }).filter(x=>x.complete).sort((a,b)=>{
    const oneTime=compareManualRank(manualRankVehicle(a.v),manualRankVehicle(b.v));
    if(oneTime)return oneTime;
    if(crit==='occurrences'){
      if(a.occ!==b.occ)return a.occ-b.occ;
      if(a.base!==b.base)return b.base-a.base;
    }else{
      if(a.base!==b.base)return b.base-a.base;
      if(a.occ!==b.occ)return a.occ-b.occ;
    }
    return String(a.v.nome||a.v.codigo).localeCompare(String(b.v.nome||b.v.codigo),'pt-BR',{numeric:true});
  });
}
function rotationMembersForDisplay(role,type){
  return activeTeamRows().filter(m=>
    isRotationMember(m)&&teamRoleKey(m)===role&&
    (role!=='driver'||driverRotationAllowsMember(m,type))
  );
}
function priorityPersonName(m){
  return m?.profissionais?displayName(m.profissionais):(m?.nome_snapshot||'—');
}
function compactRotationQueue(role,type,label){
  const members=rotationMembersForDisplay(role,type);
  if(!members.length)return '';
  // A ordenação permanece a mesma usada para escolher profissionais no despacho.
  const available=priorityPeopleForRole(role,type,{rotationOnly:true})
    .filter(m=>isRotationMember(m));
  const group=type+'_'+(role==='driver'?'DRIVER':role==='tech'?'TECH':'NURSE');
  const hasManual=available.some(m=>manualRankMember(m,role,type)!==null);
  let html='<div class="rotation-people-card">'+
    '<div class="rotation-people-head"><b>'+esc(label)+' EM REVEZAMENTO</b>'+
    '<small>'+available.length+' disponível(is)'+(hasManual?' • ORDEM PONTUAL':'')+'</small>'+
    (isOperator()&&available.length>1?'<button type="button" class="manual-order-btn" data-manual-order="'+group+'">↕ ORDENAR FILA</button>':'')+
    '</div>';
  if(available.length){
    html+='<div class="rotation-person-next">'+
      '<span class="rotation-next-tag">PRÓXIMO DA VEZ</span>'+
      '<strong>'+esc(priorityPersonName(available[0]))+'</strong>'+
      (earlyExitStatus(available[0])?'<small class="early-exit-queue-note">'+esc(earlyExitStatusLabel(available[0]))+'</small>':'')+
      (isOperator()?'<button type="button" class="early-exit-mini" data-schedule-exit="'+esc(available[0].id)+'">SAÍDA</button>':'')+'</div>';
    if(available.length>1){
      html+='<div class="rotation-person-order">'+available.slice(1,6).map((m,i)=>
        '<div class="rotation-person-row"><span>'+(i+2)+'.</span><b>'+
        esc(priorityPersonName(m))+'</b>'+
        (earlyExitStatus(m)?'<small class="early-exit-queue-note">'+esc(earlyExitStatusLabel(m))+'</small>':'')+
        (isOperator()?'<button type="button" class="early-exit-mini" data-schedule-exit="'+esc(m.id)+'">SAÍDA</button>':'')+
        '</div>').join('')+'</div>';
    }
  }else{
    html+='<p class="rotation-person-unavailable">Profissionais em revezamento, mas nenhum disponível na base agora.</p>';
  }
  return html+'</div>';
}
function nextVehicleRotationCard(type,hasRotation){
  const list=type==='USA'?availableUsaTeams():availableUsbTeams();
  const first=list[0];
  let html='<div class="rotation-next-vehicle">';
  if(!first){
    return html+'<span class="rotation-vehicle-label">PRÓXIMA '+type+'</span>'+
      '<p class="rotation-vehicle-empty">Nenhuma '+type+' apta para empenho na base neste momento.</p></div>';
  }
  const prefix=first.v.nome||first.v.codigo;
  html+='<div class="manual-vehicle-header"><span class="rotation-vehicle-label">PRÓXIMA '+type+' DA VEZ</span>'+
    (isOperator()&&list.length>1?'<button type="button" class="manual-order-btn" data-manual-order="'+type+'_VIATURA">↕ ORDENAR VIATURAS</button>':'')+
    '</div><strong class="rotation-vehicle-prefix">'+esc(prefix)+'</strong>'+
    (vehicleManualRank(first.v)!==null?'<span class="manual-order-active">PRIORIDADE MANUAL TEMPORÁRIA</span>':'');
  if(hasRotation){
    const roles=type==='USA'
      ? [['Condutor',first.driver],['Enfermeiro',first.nurse]]
      : [['Condutor',first.driver],['Técnico / Enfermeiro',first.tech]];
    const fixed=roles.filter(([,m])=>
      m?.viatura_id===first.v.id&&!isRotationMember(m)
    );
    if(fixed.length){
      html+='<div class="rotation-fixed-crew">'+fixed.map(([role,m])=>
        '<div class="rotation-fixed-person"><b>'+esc(priorityPersonName(m))+'</b>'+
        '<small>'+esc(role)+' • FIXO NA '+esc(prefix)+'</small></div>'
      ).join('')+'</div>';
    }
  }
  return html+'</div>';
}
function rotationPanelGroup(type){
  const roles=type==='USA'
    ? [['driver','Condutores'],['nurse','Enfermeiros']]
    : [['driver','Condutores'],['tech','Técnicos / Enfermeiros']];
  const queues=roles.map(([role,title])=>compactRotationQueue(role,type,title));
  const hasRotation=roles.some(([role])=>rotationMembersForDisplay(role,type).length>0);
  return '<section class="rotation-panel-group rotation-panel-'+type.toLowerCase()+'">'+
    '<div class="rotation-panel-heading"><b>'+type+'</b>'+
    '<span>'+(hasRotation?'ESCALA COM REVEZAMENTO':'EQUIPE FIXA')+'</span></div>'+
    nextVehicleRotationCard(type,hasRotation)+
    queues.join('')+
  '</section>';
}
function renderRotation(){
  renderRotationRuleHelp();
  const hasAnyRotation=['USA','USB'].some(type=>
    (type==='USA'?['driver','nurse']:['driver','tech'])
      .some(role=>rotationMembersForDisplay(role,type).length>0)
  );
  $('#priority').innerHTML=
    earlyExitSummaryHtml()+
    (!hasAnyRotation?'<p class="rotation-no-revezamento">Sem revezamento de profissionais neste plantão. Exibindo somente as próximas viaturas.</p>':'')+
    rotationPanelGroup('USA')+
    rotationPanelGroup('USB');
  bindEarlyExitButtons($('#priority'));
  bindManualQueueButtons($('#priority'));
}

/* Valores rodoviários de referência do estudo da SES/GO para a Região Pireneus.
   Estudo histórico: NÃO são tempos de atendimento, GPS ou trânsito atual.
   Jaranápolis não consta da matriz e depende de conferência externa da rota. */
const REGIONAL_COVERAGE_CITY={
  ABADIANIA:{label:'Abadiânia',map:'Abadiânia, Goiás, Brasil'},
  ALEXANIA:{label:'Alexânia',map:'Alexânia, Goiás, Brasil'},
  ANAPOLIS:{label:'Anápolis',map:'Anápolis, Goiás, Brasil'},
  COCALZINHO:{label:'Cocalzinho de Goiás',map:'Cocalzinho de Goiás, Goiás, Brasil'},
  CORUMBA:{label:'Corumbá de Goiás',map:'Corumbá de Goiás, Goiás, Brasil'},
  GOIANAPOLIS:{label:'Goianápolis',map:'Goianápolis, Goiás, Brasil'},
  JARANAPOLIS:{label:'Jaranápolis',map:'Jaranápolis, Pirenópolis, Goiás, Brasil'},
  PIRENOPOLIS:{label:'Pirenópolis',map:'Pirenópolis, Goiás, Brasil'},
  TEREZOPOLIS:{label:'Terezópolis de Goiás',map:'Terezópolis de Goiás, Goiás, Brasil'}
};
const REGIONAL_ROAD_KM={"ABADIANIA":{"ALEXANIA":30,"ANAPOLIS":36,"COCALZINHO":63,"CORUMBA":43,"GOIANAPOLIS":55,"PIRENOPOLIS":53,"TEREZOPOLIS":57},"ALEXANIA":{"ANAPOLIS":66,"COCALZINHO":64,"CORUMBA":45,"GOIANAPOLIS":85,"PIRENOPOLIS":66,"TEREZOPOLIS":87},"ANAPOLIS":{"COCALZINHO":73,"CORUMBA":53,"GOIANAPOLIS":25,"PIRENOPOLIS":63,"TEREZOPOLIS":27},"COCALZINHO":{"CORUMBA":21,"GOIANAPOLIS":99,"PIRENOPOLIS":41,"TEREZOPOLIS":101},"CORUMBA":{"GOIANAPOLIS":79,"PIRENOPOLIS":20,"TEREZOPOLIS":81},"GOIANAPOLIS":{"PIRENOPOLIS":89,"TEREZOPOLIS":17},"PIRENOPOLIS":{"TEREZOPOLIS":91}};
let regionalCoverageTarget='';
let regionalCoverageType='USB';

function coverageCityKey(name){
  const value=norm(name);
  if(value.includes('JARANAPOLIS'))return 'JARANAPOLIS';
  if(value.includes('COCALZINHO'))return 'COCALZINHO';
  if(value.includes('CORUMBA'))return 'CORUMBA';
  if(value.includes('GOIANAPOLIS'))return 'GOIANAPOLIS';
  if(value.includes('TEREZOPOLIS')||value.includes('TERESOPOLIS'))return 'TEREZOPOLIS';
  if(value.includes('PIRENOPOLIS'))return 'PIRENOPOLIS';
  if(value.includes('ABADIANIA'))return 'ABADIANIA';
  if(value.includes('ALEXANIA'))return 'ALEXANIA';
  if(value.includes('ANAPOLIS'))return 'ANAPOLIS';
  return null;
}
function coverageRoadKm(origin,destination){
  if(origin===destination)return 0;
  return REGIONAL_ROAD_KM[origin]?.[destination]??REGIONAL_ROAD_KM[destination]?.[origin]??null;
}
function coverageRouteUrl(origin,destination){
  const a=REGIONAL_COVERAGE_CITY[origin],b=REGIONAL_COVERAGE_CITY[destination];
  return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(a.map)+
    '&destination='+encodeURIComponent(b.map)+'&travelmode=driving';
}
function renderRegionalCoverage(){
  const panel=$('#regionalCoverage');
  if(!panel)return;
  const regionalKeys=[...new Set(vehicles.filter(v=>!isAnapolisVehicle(v)).map(v=>coverageCityKey(v.bases?.nome)).filter(Boolean))];
  const cities=REGIONAL_ORDER.map(coverageCityKey).filter(k=>regionalKeys.includes(k));
  if(!cities.length){
    panel.innerHTML='<div class="coverage-empty">Ainda não há bases descentralizadas carregadas para comparar.</div>';
    return;
  }
  if(!cities.includes(regionalCoverageTarget))regionalCoverageTarget=cities[0];
  const destinations=cities.map(key=>'<option value="'+key+'"'+(key===regionalCoverageTarget?' selected':'')+'>'+esc(REGIONAL_COVERAGE_CITY[key].label)+'</option>').join('');
  const options=[
    {value:'USB',label:'USB (suporte básico)'},
    {value:'USA',label:'USA (suporte avançado)'},
    {value:'AMBOS',label:'USB ou USA (comparar cobertura)'}
  ];
  const types=options.map(x=>'<option value="'+x.value+'"'+(x.value===regionalCoverageType?' selected':'')+'>'+x.label+'</option>').join('');
  const candidateKeys=[...cities,'ANAPOLIS'].filter((key,i,arr)=>key!==regionalCoverageTarget&&arr.indexOf(key)===i);
  const candidates=candidateKeys.map(key=>{
    const sourceVehicles=vehicles.filter(v=>coverageCityKey(v.bases?.nome)===key&&
      (vehicleType(v).includes('USB')||vehicleType(v).includes('USA'))&&
      (regionalCoverageType==='AMBOS'||vehicleType(v).includes(regionalCoverageType)));
    const qrv=sourceVehicles.filter(v=>statusInfo(v).key==='base'&&!activeOccurrence(v));
    const ready=qrv.filter(v=>crewCompleteness(v).state==='complete');
    const state=ready.length?'ready':qrv.length?'verify':'busy';
    const display=ready.length?ready:qrv.length?qrv:sourceVehicles;
    const km=coverageRoadKm(key,regionalCoverageTarget);
    return {key,sourceVehicles,qrv,ready,state,display,km};
  }).filter(x=>x.sourceVehicles.length>0);
  const stateSort={ready:0,verify:1,busy:2};
  candidates.sort((a,b)=>stateSort[a.state]-stateSort[b.state]||
    (a.km===null?1:0)-(b.km===null?1:0)||
    (a.km??Infinity)-(b.km??Infinity)||
    REGIONAL_COVERAGE_CITY[a.key].label.localeCompare(REGIONAL_COVERAGE_CITY[b.key].label,'pt-BR'));
  const readyCount=candidates.filter(x=>x.state==='ready').length;
  const rows=candidates.map(x=>{
    const label=REGIONAL_COVERAGE_CITY[x.key].label;
    const summary=x.state==='ready'?'QRV informado • equipe mínima registrada':x.state==='verify'?'QRV informado • verificar guarnição':'Nenhuma viatura compatível marcada QRV';
    const units=x.display.map(v=>esc(v.nome||v.codigo||'Viatura')+' ('+esc(statusInfo(v).label)+')').join(' • ');
    const reference=x.km===null?'Distância não cadastrada':x.km+' km de referência rodoviária';
    return '<article class="coverage-option '+x.state+'">'+
      '<div class="coverage-option-head"><b>'+esc(label)+'</b><span class="coverage-status">'+summary+'</span></div>'+
      '<div class="coverage-option-body"><strong>'+reference+'</strong><small>'+units+'</small></div>'+
      '<a class="coverage-map-link" target="_blank" rel="noopener noreferrer" href="'+coverageRouteUrl(x.key,regionalCoverageTarget)+'">VER ROTA E TEMPO NO MAPS ↗</a>'+
    '</article>';
  }).join('');
  panel.innerHTML=
    '<div class="coverage-header"><div><h3>Guia de cobertura entre bases</h3>'+
    '<p>Consulte quais viaturas podem cobrir outra cidade e compare a distância rodoviária de referência. Confira o tempo estimado no Maps antes de decidir.</p></div>'+
    '<span class="coverage-counter">'+readyCount+' base(s) com QRV e equipe mínima</span></div>'+
    '<div class="coverage-filters"><label>Cidade que precisa de atendimento<select id="coverageTarget">'+destinations+'</select></label>'+
    '<label>Recurso definido pela regulação<select id="coverageType">'+types+'</select></label></div>'+
    '<p class="coverage-warning">Ordem por disponibilidade informada e distância de referência, <b>não por tempo real de chegada</b>. Confirmar posição da ambulância, equipe, viabilidade do deslocamento, rota e autorização do médico regulador. Distâncias entre centros de municípios; não representam o endereço da ocorrência.</p>'+
    '<div class="coverage-options">'+(rows||'<p class="coverage-empty">Não há viaturas do tipo selecionado nas demais bases cadastradas.</p>')+'</div>'+
    '<p class="coverage-source">Referências de quilômetros: matriz histórica de municípios da Região Pireneus (SES/GO). Jaranápolis não consta dessa matriz. O Maps permite consultar cada rota e o tempo estimado, sujeitos às condições atuais.</p>';
  $('#coverageTarget').onchange=e=>{regionalCoverageTarget=e.target.value;renderRegionalCoverage()};
  $('#coverageType').onchange=e=>{regionalCoverageType=e.target.value;renderRegionalCoverage()};
}

function regionalOrderIndex(name){
  const i=REGIONAL_ORDER.indexOf(coverageCityKey(name));
  return i<0?99:i;
}
// Proximidade sequencial: a próxima base é sempre a mais próxima da anterior
// entre as ainda não listadas, pela matriz de distâncias de referência.
// Para Jaranápolis: Pirenópolis 35 km e Anápolis 44 km. Sem distância direta,
// o valor calculado é a soma de trechos cadastrados, marcado como estimativa.
function regionalConsecutiveDistance(a,b){
  if(!a||!b)return {km:null,estimated:true};
  if(a===b)return {km:0,estimated:false};
  const direct=coverageRoadKm(a,b);
  if(direct!==null)return {km:direct,estimated:false};
  if(a!=='JARANAPOLIS'&&b!=='JARANAPOLIS')return {km:null,estimated:true};
  const other=a==='JARANAPOLIS'?b:a;
  const via=[['PIRENOPOLIS',35],['ANAPOLIS',44]].map(([city,first])=>{
    const second=other===city?0:coverageRoadKm(city,other);
    return second===null?null:{km:first+second,estimated:other!==city};
  }).filter(Boolean).sort((x,y)=>x.km-y.km);
  return via[0]||{km:null,estimated:true};
}
function regionalNearestNeighborOrder(entries){
  const left=entries.map(([baseName,list])=>({baseName,list,key:coverageCityKey(baseName)}));
  if(!left.length)return [];
  const abadiania=left.findIndex(x=>x.key==='ABADIANIA');
  const start=abadiania>=0?abadiania:left.reduce((best,x,i)=>regionalOrderIndex(x.baseName)<regionalOrderIndex(left[best].baseName)?i:best,0);
  const first=left.splice(start,1)[0];
  const sorted=[{...first,kmFromPrevious:null,estimated:false}];
  while(left.length){
    const last=sorted[sorted.length-1];
    left.sort((a,b)=>(regionalConsecutiveDistance(last.key,a.key).km??Infinity)-
      (regionalConsecutiveDistance(last.key,b.key).km??Infinity)||
      regionalOrderIndex(a.baseName)-regionalOrderIndex(b.baseName)||
      a.baseName.localeCompare(b.baseName,'pt-BR'));
    const next=left.shift(),dist=regionalConsecutiveDistance(last.key,next.key);
    sorted.push({...next,kmFromPrevious:dist.km,estimated:dist.estimated});
  }
  return sorted;
}
function regionalVehicleHtml(v){
  // Reutiliza os mesmos cartões da frota de Anápolis: guarnição, ocorrência,
  // QTH, destino da vítima, retorno, edição e cores de situação permanecem
  // consistentes em todas as bases descentralizadas.
  return vehicleCardHtml(v);
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
  $('#regionalGrid').innerHTML=regionalNearestNeighborOrder(Object.entries(groups))
    .map(({baseName,list,kmFromPrevious,estimated},index)=>{
      list.sort((a,b)=>(vehicleType(a).includes('USA')?1:2)-(vehicleType(b).includes('USA')?1:2)||String(a.nome).localeCompare(String(b.nome),'pt-BR'));
      const states=list.map(statusInfo);
      const label=states.some(x=>x.key==='occurrence')?'OCORRÊNCIA':states.some(x=>x.key==='returning')?'RETORNANDO':states.every(x=>x.key==='base')?'QRV':'ATENÇÃO';
      return '<article class="regional-card"><div class="regional-card-head"><div><div class="regional-name"><span class="regional-sequence" aria-label="Ordem '+(index+1)+'">'+(index+1)+'</span>'+esc(baseName)+'</div><div class="regional-sub">USA antes da USB • '+list.length+' viatura(s)</div>'+
        '<div class="regional-distance">'+(index===0?'INÍCIO DA SEQUÊNCIA':kmFromPrevious===null?'DISTÂNCIA NÃO CADASTRADA':
          (estimated?'≈ ':'')+kmFromPrevious+' km da base anterior'+(estimated?' • via trechos de referência':'') )+'</div></div><span class="regional-base-status">'+label+'</span></div><div class="regional-vehicles">'+list.map(regionalVehicleHtml).join('')+'</div></article>';
    }).join('');
  bindVehicleActions($('#regionalGrid'));
  renderRegionalCoverage();
}

function destinationCard(o){
  const v=vehicleById(o.viatura_id);
  return '<div class="destination-card">'+
    '<div class="occ-number">OC. '+esc(o.numero||'—')+'</div>'+
    '<div class="occ-vehicle">'+esc(v?.nome||o.viatura_snapshot||'Sem viatura')+'</div>'+
    '<div class="destination-victim-label">VÍTIMA FICOU / RESULTADO</div>'+
    '<div class="occ-place">'+esc(victimDestinationDisplay(o.destino))+'</div>'+
    (isOperator()?'<div class="destination-actions"><button class="edit" data-edit-occ="'+o.id+'">EDITAR</button><button class="delete" data-delete-occ="'+o.id+'">EXCLUIR</button></div>':'')+
  '</div>';
}
function renderDestinations(){
  const active=occurrences.filter(o=>norm(o.status)!=='CANCELADA');
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
  return '<div class="roster-person"><div><div class="roster-person-name">'+esc(displayName(m.profissionais))+'</div><div class="roster-person-meta">'+esc(m.funcao)+' • '+esc(assign)+'</div>'+
    (earlyExitStatus(m)?'<div class="early-exit-roster-label">'+esc(earlyExitStatusLabel(m))+'</div>':'')+'</div>'+
    '<div class="roster-person-actions">'+
      '<button class="person-occ" data-individual-occ="'+m.id+'">LANÇAR Nº OCORRÊNCIA</button>'+
      (isOperator()&&isRotationMember(m)&&['driver','tech','nurse'].includes(teamRoleKey(m))
        ?'<button type="button" class="person-early-exit" data-schedule-exit="'+esc(m.id)+'">'+
          (earlyExitStatus(m)?'EDITAR SAÍDA':'PROGRAMAR SAÍDA')+'</button>':'')+
      (isOperator()?'<button class="person-edit" data-edit-member="'+m.id+'">EDITAR</button><button class="person-remove" data-remove-member="'+m.id+'">RETIRAR DA ESCALA</button>':'')+
    '</div></div>';
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
        return '<div class="roster-role-group role-'+key+'"><div class="roster-role-head"><b>'+label+'</b><span>'+arr.length+'</span></div><div class="roster-list">'+arr.map(rosterPersonHtml).join('')+'</div></div>';
      }).join('')+
      (!list.length?'<div class="priority-empty">Nenhum profissional escalado nesta região.</div>':'')+
    '</section>';
  };
  $('#teamPreview').innerHTML=
    renderRegion('ANÁPOLIS','Equipe operacional e profissionais em revezamento sem viatura fixa.',an)+
    renderRegion('BASES DESCENTRALIZADAS','Profissionais vinculados às viaturas regionais.',rg);
  $('#teamPreview').querySelectorAll('[data-individual-occ]').forEach(b=>b.onclick=()=>openIndividualOccurrence(b.dataset.individualOcc));
  $('#teamPreview').querySelectorAll('[data-edit-member]').forEach(b=>b.onclick=()=>openEditTeamMember(b.dataset.editMember));
  $('#teamPreview').querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=()=>removeTeamMember(b.dataset.removeMember));
  bindEarlyExitButtons($('#teamPreview'));
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
      '<td>'+esc(o.numero||'—')+'</td><td>'+esc(v?.nome||o.viatura_snapshot||'—')+'</td><td>'+esc(o.natureza||'—')+'</td><td>'+esc(o.bairro||'—')+'</td><td>'+esc(victimDestinationDisplay(o.destino))+'</td><td>'+esc(o.endereco||'—')+'</td><td>'+esc(occurrenceCrewText(o))+'</td>'+
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
  root.querySelectorAll('[data-act="victim-destination"]').forEach(b=>b.onclick=()=>openVictimDestination(b.dataset.o));
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
  Object.entries(fields).forEach(([key,el])=>{
    const register=el?.querySelector('[data-quick-register]');
    if(!register)return;
    const role=effectiveQuickRole(key);
    const title={
      driver:'CONDUTOR',tech:'TÉCNICO / ENFERMEIRO',nurse:'ENFERMEIRO',
      doctor:'MÉDICO',moto:'PILOTO'
    }[role]||'PROFISSIONAL';
    register.textContent='+ CADASTRAR '+title;
  });

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
    const register=$('#teamModal [data-quick-register="'+key+'"]');
    if(register){
      register.onclick=()=>{
        if(!isOperator())return alert('Somente operadores podem cadastrar profissionais.');
        openQuickRegistration(input.value,effectiveQuickRole(key),input,$(cfg.hidden));
      };
    }
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
    const pro=cur && (
      professionals.find(p=>p.id===cur.profissional_id) ||
      cur.profissionais ||
      {nome_completo:cur.nome_snapshot||'PROFISSIONAL ESCALADO'}
    );
    // Exibe a equipe já gravada no próprio campo: ao adicionar outra função,
    // não é necessário escolher novamente condutor, técnico, enfermeiro ou médico.
    $(cfg.input).value=pro?professionalLabel(pro,effectiveQuickRole(key)):'';
    $(cfg.hidden).value=cur?.profissional_id||'';
    $(cfg.results).innerHTML='';
    $(cfg.results).classList.remove('show');
    $(cfg.current).textContent=cur?'Já escalado: '+displayName(pro)+' • mantido ao salvar':'Nenhum profissional nesta função.';
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
  markOperationalDirty();
}
async function assignProfessionalToVehicle(proId,vId,funcao,source='EDICAO_RAPIDA',transferApproved=false){
  if(!currentPlantao)await ensurePlantaoForBook();
  const pro=professionals.find(p=>p.id===proId);
  const v=vehicleById(vId);
  if(!pro||!v)throw new Error('Profissional ou viatura não encontrado.');
  const now=new Date().toISOString();
  const currentSameRole=activeTeamRows().find(m=>m.viatura_id===vId && norm(m.funcao)===norm(funcao));
  if(currentSameRole?.profissional_id===proId)return true;
  const elsewhere=activeTeamRows().find(m=>m.profissional_id===proId && m.id!==currentSameRole?.id);
  if(elsewhere){
    const oldV=vehicleById(elsewhere.viatura_id);
    if(!transferApproved&&!confirm(pro.nome_completo+' já está em '+(oldV?.nome||elsewhere.viatura_snapshot||'outra escala')+'.\n\nDeseja transferir para '+v.nome+'?'))return false;
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
  markOperationalDirty();
  return true;
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
      // Ao complementar uma equipe parcial, não regrave nem substitua quem
      // já estava escalado na viatura. Só processe nomes realmente alterados.
      if(cur?.profissional_id===value)continue;
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
  if(!canEditOpenShift()||!currentPlantao)return;
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
  if(!o)return alert('Ocorrência não encontrada.');
  if(o.chegada_qth_em && !confirm('O QTH já foi registrado às '+fmtTime(o.chegada_qth_em)+'. Deseja atualizar o horário?'))return;

  const previous=o.chegada_qth_em||null;
  const now=new Date().toISOString();
  o.chegada_qth_em=now;
  renderAll();

  const {error}=await supabase.from('ocorrencias').update({chegada_qth_em:now}).eq('id',id);
  if(error){
    o.chegada_qth_em=previous;
    renderAll();
    return alert('Não foi possível registrar a chegada no QTH: '+error.message);
  }
  await loadAll(selectedDate());
}
async function setOccurrenceQta(oid,vid){
  if(!isOperator()||!confirm('CONFIRMAR QTA?\n\nA ocorrência não será contabilizada no revezamento e a viatura volta para BASE.'))return false;
  const now=new Date().toISOString();
  const r=await supabase.from('ocorrencias').update({status:'QTA',destino:'QTA',qta_em:now,finalizado_em:now,finalizado_por:profile?.nome||null,creditou_revezamento:false}).eq('id',oid);
  if(r.error){alert(r.error.message);return false;}

  // QTA não soma ocorrência, mas reinicia o relógio de tempo na base
  // para quem chegou a ser empenhado.
  const ids=[...new Set(occurrenceMembers(oid).map(x=>x.profissional_id).filter(Boolean))];
  for(const id of ids){
    const row=activeTeamRows().find(m=>m.profissional_id===id);
    if(row)await supabase.from('equipe_plantao').update({ultimo_retorno_em:now}).eq('id',row.id);
  }
  await clearManualOnReturn(oid,vid);
  if(vid)await supabase.from('viaturas').update({status_atual:'BASE'}).eq('id',vid);
  await loadAll(selectedDate());
  return true;
}
async function setReturning(oid,vid){
  if(!isOperator())return;
  const now=new Date().toISOString();
  if(oid){const r=await supabase.from('ocorrencias').update({status:'RETORNANDO',inicio_retorno_em:now}).eq('id',oid);if(r.error)return alert(r.error.message)}
  if(vid){const r=await supabase.from('viaturas').update({status_atual:'RETORNANDO'}).eq('id',vid);if(r.error)return alert(r.error.message)}
  await loadAll(selectedDate());
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
    await clearManualOnReturn(oid,vid);
  }
  if(vid)await supabase.from('viaturas').update({status_atual:'BASE'}).eq('id',vid);
  await loadAll(selectedDate());
}
async function setVehicleStatus(vId,key){
  if(!isOperator())return;
  const v=vehicleById(vId);
  if(!v)return alert('Viatura não encontrada.');
  if(activeOccurrence(v))return alert('Finalize a ocorrência antes de alterar a situação da viatura.');

  const previous=v.status_atual;
  const next=statusDbValue(key);
  v.status_atual=next;
  renderAll();
  setSync((v.nome||v.codigo)+' → '+statusInfo(v).label,'warn');

  const {error}=await supabase.from('viaturas').update({status_atual:next}).eq('id',vId);
  if(error){
    v.status_atual=previous;
    renderAll();
    setSync('Falha ao alterar situação da viatura','error');
    return alert('Não foi possível alterar a situação da viatura: '+error.message);
  }

  await loadAll(selectedDate());
  setSync((v.nome||v.codigo)+' atualizada para '+statusInfo(vehicleById(vId)||v).label);
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
  const scaleCtx=activeScaleReference();
  const ala=scaleCtx.ala,turno=scaleCtx.turno;
  updateScaleReferenceUI();

  const {data,error}=await supabase.from('escala_fixa_anapolis')
    .select('*,profissionais(id,nome_completo,nome_de_guerra,funcao_sistema)')
    .eq('ala',ala).eq('turno',turno).eq('ativo',true).order('ordem');
  if(error){
    scaleRows=[];
    renderExpressDrivers();
    $('#expressStatus').className='express-status warn';
    $('#expressStatus').textContent=error.message;
    return;
  }
  scaleRows=data||[];
  $('#expressStatus').className='express-status '+(manualScaleReference?'warn':'ok');
  $('#expressStatus').innerHTML='<b>'+scaleRows.length+' posições carregadas.</b> '+(manualScaleReference
    ? 'REFERÊNCIA MANUAL: ALA '+esc(ala)+' • '+esc(turno)+'. Confira os titulares; o plantão operacional não foi alterado.'
    : 'Confira e confirme os profissionais em serviço.');
  renderExpressDrivers();
}
function expressDecisionTime(m){
  return new Date(m?.saiu_em||m?.entrou_em||m?.criado_em||0).getTime()||0;
}
function expressLatestDecision(r){
  return team
    .filter(m=>m.titular_profissional_id===r.profissional_id || (m.profissional_id===r.profissional_id && norm(m.ala_escala)===norm(activeScaleReference().ala) && norm(m.turno_escala)===norm(activeScaleReference().turno)))
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
    '<div class="express-driver-top"><div class="express-vtr">'+esc(v?.nome||r.codigo_viatura)+'</div><span class="express-row-badge '+st.state+'">'+st.label+'</span></div>'+
    '<div class="express-person-line"><span class="express-fixed-label">Titular</span><strong class="express-fixed-name">'+esc(titular||'SEM TITULAR')+'</strong></div>'+
    '<div class="express-person-line"><span class="express-current-label">Em serviço</span><strong class="express-current-name">'+esc(currentName)+'</strong></div>'+
    '<div class="express-driver-actions">'+
      '<button title="'+(isFixed?'Clique novamente para desescalar':'Escalar o titular fixo nesta viatura')+'" class="fixed '+(isFixed?'active':'')+'" data-exp-fixed="'+r.id+'">'+(isFixed?'✓ FIXO':'✓ FIXO')+'</button>'+
      '<button class="rotation '+(st.state==='rotation'?'active':'')+'" data-exp-rotation="'+r.id+'">↻ REVEZAR</button>'+
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
    return '<section class="express-vehicle-section"><div class="express-vehicle-section-head"><div><h3>'+title+'</h3></div><span>'+ready+' de '+list.length+' escalados</span></div><div class="express-driver-grid">'+(list.length?list.map(expressCard).join(''):'<div class="autocomplete-empty">Nenhum registro.</div>')+'</div></section>';
  };
  $('#expressDriverGrid').innerHTML=group('USA','USA — SUPORTE AVANÇADO','Condutores das Unidades de Suporte Avançado',usa)+group('USB','USB — SUPORTE BÁSICO','Condutores das Unidades de Suporte Básico',usb);
  $('#expressDriverGrid').querySelectorAll('[data-exp-fixed]').forEach(b=>b.onclick=()=>expressUseFixed(b.dataset.expFixed));
  $('#expressDriverGrid').querySelectorAll('[data-exp-rotation]').forEach(b=>b.onclick=()=>expressToggleRotation(b.dataset.expRotation));
  $('#expressDriverGrid').querySelectorAll('[data-exp-swap]').forEach(b=>b.onclick=()=>expressSwap(b.dataset.expSwap));
  $('#expressDriverGrid').querySelectorAll('[data-exp-absent]').forEach(b=>b.onclick=()=>expressAbsent(b.dataset.expAbsent));
}
async function expressUseFixed(rowId){
  if(!canEditOpenShift())return;
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
          ala_escala:activeScaleReference().ala,
          turno_escala:activeScaleReference().turno
        }).eq('id',cur.id);
        if(error)throw error;
      }
    }
    markOperationalDirty();
    await loadAll(selectedDate());await loadExpressScale();
  }catch(e){alert(e.message||e)}
}
function expressSwap(rowId){
  if(!canEditOpenShift())return;
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
      ala_escala:activeScaleReference().ala,
      turno_escala:activeScaleReference().turno
    };
    const {error}=await supabase.from('equipe_plantao').insert(payload);
    if(error)throw error;

    closeModal('expressPermutaModal');
    selectedExpressPermutaRow=null;
    markOperationalDirty();
    await loadAll(selectedDate());await loadExpressScale();
  }catch(e){alert(e.message||e)}
}
async function expressToggleRotation(rowId){
  if(!canEditOpenShift())return;
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
        ala_escala:activeScaleReference().ala,
        turno_escala:activeScaleReference().turno
      });
      if(error)throw error;
    }
    markOperationalDirty();
    await loadAll(selectedDate());await loadExpressScale();
  }catch(e){alert(e.message||e)}
}
async function expressAbsent(rowId){
  if(!canEditOpenShift())return;
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
      ala_escala:activeScaleReference().ala,
      turno_escala:activeScaleReference().turno
    });
    if(error)throw error;
    markOperationalDirty();
    await loadAll(selectedDate());await loadExpressScale();
  }catch(e){alert(e.message||e)}
}
async function setAllDriversRotation(){
  if(!canEditOpenShift())return;
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
  markOperationalDirty();
  await loadAll(selectedDate());await loadExpressScale();
}
async function restoreFixedDrivers(){
  if(!canEditOpenShift()||!scaleRows.length)return;
  if(!currentPlantao)await ensurePlantaoForBook();
  if(!confirm('Restaurar todos os condutores fixos desta Ala/turno? As exceções atuais de condutor serão substituídas.'))return;
  for(const r of scaleRows){
    const v=vehicleByCode(r.codigo_viatura);
    if(v&&r.profissional_id)await assignProfessionalToVehicle(r.profissional_id,v.id,'Condutor','ESCALA_EXPRESSA');
  }
  markOperationalDirty();
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
  box.innerHTML=list.length?list.map(p=>'<button type="button" class="autocomplete-result" data-exp-prof="'+esc(p.id)+'"><b>'+esc(displayName(p))+'</b><small>'+esc(p.nome_completo)+' • '+esc(p.funcao_sistema)+'</small></button>').join(''):'<div class="autocomplete-empty">Nenhum profissional encontrado.</div><button type="button" class="autocomplete-register" data-exp-register="1">+ CADASTRAR NOVO PROFISSIONAL</button>';
  box.classList.add('show');
  box.querySelectorAll('[data-exp-prof]').forEach(b=>b.onclick=()=>{
    const p=professionals.find(x=>x.id===b.dataset.expProf);
    if(p)selectExpressProfessional(p,role);
  });
  const register=box.querySelector('[data-exp-register]');
  if(register)register.onclick=()=>openExpressRegistration(role);
}
function selectExpressProfessional(p,role){
  const selected=role==='tech'?expressTechSelected:expressNurseSelected;
  const other=role==='tech'?expressNurseSelected:expressTechSelected;
  if(other.has(p.id)){
    alert(displayName(p)+' já está selecionado para '+(role==='tech'?'USA':'USB')+'. Remova da outra lista antes de escolher esta função.');
    return;
  }
  const input=role==='tech'?$('#expressTechSearch'):$('#expressNurseSearch');
  const box=role==='tech'?$('#expressTechResults'):$('#expressNurseResults');
  if(!selected.has(p.id))selected.set(p.id,{professional:p,mode:'REVEZAMENTO',vehicleId:''});
  input.value='';
  box.innerHTML='';
  box.classList.remove('show');
  markOperationalDirty();
  renderExpressSelected();
}
function openExpressRegistration(role){
  if(!isOperator())return alert('Somente operadores podem cadastrar profissionais.');
  const input=role==='tech'?$('#expressTechSearch'):$('#expressNurseSearch');
  const box=role==='tech'?$('#expressTechResults'):$('#expressNurseResults');
  openQuickRegistration(input.value,role,null,null);
  pendingQuickRegistration.expressRole=role;
  box.classList.remove('show');
}
function expressFixedVehicles(role){
  const type=role==='tech'?'USB':'USA';
  return vehicles.filter(v=>isAnapolisVehicle(v)&&vehicleType(v).includes(type))
    .sort((a,b)=>String(a.nome||a.codigo).localeCompare(String(b.nome||b.codigo),'pt-BR',{numeric:true}));
}
function renderExpressSelected(){
  const render=(map,element,role)=>{
    if(!element)return;
    const vehiclesForRole=expressFixedVehicles(role);
    element.innerHTML=[...map.entries()].map(([id,item])=>{
      const p=item.professional;
      const fixed=item.mode==='FIXO';
      const choices=vehiclesForRole.map(v=>
        '<option value="'+esc(v.id)+'"'+(item.vehicleId===v.id?' selected':'')+'>'+esc(v.nome||v.codigo)+'</option>'
      ).join('');
      return '<div class="express-person-card">'+
        '<div class="express-person-card-head"><strong>'+esc(displayName(p))+'</strong>'+
        '<button type="button" class="express-person-remove" data-exp-remove="'+esc(id)+'" aria-label="Remover '+esc(displayName(p))+'">×</button></div>'+
        '<label class="express-person-field"><span>TIPO DE ESCALA</span>'+
          '<select data-exp-mode="'+esc(id)+'" aria-label="Tipo de escala de '+esc(displayName(p))+'">'+
            '<option value="REVEZAMENTO"'+(!fixed?' selected':'')+'>REVEZAMENTO</option>'+
            '<option value="FIXO"'+(fixed?' selected':'')+'>FIXO EM VIATURA</option>'+
          '</select></label>'+
        (fixed?'<label class="express-person-field"><span>VIATURA FIXA</span>'+
          '<select data-exp-vehicle="'+esc(id)+'" aria-label="Viatura fixa de '+esc(displayName(p))+'">'+
            '<option value="">SELECIONE A VIATURA</option>'+choices+
          '</select></label>':'<span class="express-person-hint">Fila '+(role==='tech'?'USB':'USA')+' de revezamento</span>')+
      '</div>';
    }).join('');
    element.querySelectorAll('[data-exp-remove]').forEach(btn=>btn.onclick=()=>{
      map.delete(btn.dataset.expRemove);
      markOperationalDirty();
      renderExpressSelected();
    });
    element.querySelectorAll('[data-exp-mode]').forEach(select=>select.onchange=()=>{
      const item=map.get(select.dataset.expMode);
      if(!item)return;
      item.mode=select.value==='FIXO'?'FIXO':'REVEZAMENTO';
      if(item.mode!=='FIXO')item.vehicleId='';
      markOperationalDirty();
      renderExpressSelected();
    });
    element.querySelectorAll('[data-exp-vehicle]').forEach(select=>select.onchange=()=>{
      const item=map.get(select.dataset.expVehicle);
      if(!item)return;
      item.vehicleId=select.value;
      markOperationalDirty();
      renderExpressSelected();
    });
  };
  render(expressTechSelected,$('#expressTechSelected'),'tech');
  render(expressNurseSelected,$('#expressNurseSelected'),'nurse');
  $('#expressTechCount').textContent=expressTechSelected.size;
  $('#expressNurseCount').textContent=expressNurseSelected.size;
}
function preparedExpressSelections(){
  return [
    ...[...expressTechSelected.values()].map(item=>({...item,role:'tech',funcao:'Técnico de Enfermagem',group:'USB_TECNICO'})),
    ...[...expressNurseSelected.values()].map(item=>({...item,role:'nurse',funcao:'Enfermeiro',group:'USA_ENFERMEIRO'}))
  ];
}
function validateExpressSelections(entries){
  const fixedPositions=new Set(),people=new Set();
  const warnings=[];
  for(const item of entries){
    const p=item.professional;
    if(!p?.id||!professionals.some(x=>x.id===p.id))throw new Error('Um dos profissionais selecionados não está disponível no cadastro. Atualize e confira.');
    if(people.has(p.id))throw new Error(displayName(p)+' está duplicado na seleção. Remova uma das entradas.');
    people.add(p.id);
    if(!allowedForField(p,item.role))throw new Error(displayName(p)+' não possui função compatível com '+(item.role==='tech'?'USB':'USA')+'.');
    if(!['FIXO','REVEZAMENTO'].includes(item.mode))throw new Error('Escolha FIXO ou REVEZAMENTO para '+displayName(p)+'.');
    if(item.mode==='FIXO'){
      const v=vehicleById(item.vehicleId);
      if(!v||!expressFixedVehicles(item.role).some(x=>x.id===v.id)){
        throw new Error('Selecione uma viatura '+(item.role==='tech'?'USB':'USA')+' de Anápolis para '+displayName(p)+'.');
      }
      const key=item.role+'|'+v.id;
      if(fixedPositions.has(key))throw new Error('A viatura '+v.nome+' recebeu dois profissionais FIXOS na mesma função. Escolha apenas um.');
      fixedPositions.add(key);
      const occupant=currentByRole(v.id,item.role);
      if(occupant&&occupant.profissional_id!==p.id){
        warnings.push((v.nome||v.codigo)+': '+displayName(occupant.profissionais)+' será substituído por '+displayName(p)+'.');
      }
    }
    const existing=activeTeamRows().find(m=>m.profissional_id===p.id);
    if(existing){
      const destination=item.mode==='FIXO'?item.vehicleId:null;
      const samePlacement=item.mode==='FIXO'
        ? existing.viatura_id===destination&&!isRotationMember(existing)&&teamRoleKey(existing)===item.role
        : isRotationMember(existing)&&norm(existing.grupo_revezamento)===norm(item.group);
      if(!samePlacement)warnings.push(displayName(p)+' já consta em outra posição da escala e será transferido.');
    }
  }
  if(warnings.length&&!confirm('ATENÇÃO — ALTERAÇÕES NA EQUIPE\n\n'+[...new Set(warnings)].join('\n')+'\n\nDeseja continuar com essas alterações?'))return false;
  return true;
}
async function putProfessionalInRotation(pro,group,funcao){
  const now=new Date().toISOString();
  const existing=activeTeamRows().find(m=>m.profissional_id===pro.id);
  if(existing){
    if(existing.viatura_id)await deactivateTeamRow(existing,now);
    else{
      const {error}=await supabase.from('equipe_plantao').update({funcao,tipo_escala:'REVEZAMENTO',grupo_revezamento:group,viatura_id:null,viatura_snapshot:null,revezamento_tipo_viatura:group.startsWith('USA')?'USA':'USB',origem_escala:'ESCALA_EXPRESSA'}).eq('id',existing.id);
      if(error)throw error;
      markOperationalDirty();
      return;
    }
  }
  const {error}=await supabase.from('equipe_plantao').insert({
    plantao_id:currentPlantao.id,profissional_id:pro.id,nome_snapshot:pro.nome_completo,funcao,tipo_escala:'REVEZAMENTO',status:'ATIVO',entrou_em:now,
    grupo_revezamento:group,revezamento_tipo_viatura:group.startsWith('USA')?'USA':'USB',origem_escala:'ESCALA_EXPRESSA'
  });
  if(error)throw error;
  markOperationalDirty();
}
async function confirmExpress(){
  if(!isOperator())return;
  if(currentPlantao&&norm(currentPlantao.status)!=='ABERTO')return alert('Plantão encerrado. Inicie a próxima escala.');
  const prepared=preparedExpressSelections();
  try{
    if(!validateExpressSelections(prepared))return;
  }catch(e){alert('Verifique a seleção de profissionais: '+(e.message||e));return}
  if(!currentPlantao){
    try{await ensurePlantaoForBook()}catch(e){alert(e.message||e);return}
  }
  const confirmButtons=[$('#confirmExpressBtn'),$('#confirmExpressTopBtn')].filter(Boolean);
  confirmButtons.forEach(b=>{b.disabled=true;b.textContent='CONFIRMANDO...'});
  let assignmentsApplied=0;
  try{
    for(const item of prepared){
      if(item.mode==='FIXO'){
        const applied=await assignProfessionalToVehicle(item.professional.id,item.vehicleId,item.funcao,'ESCALA_EXPRESSA',true);
        if(applied===false)throw new Error('Transferência cancelada para '+displayName(item.professional));
      }else{
        await putProfessionalInRotation(item.professional,item.group,item.funcao);
      }
      assignmentsApplied++;
    }

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
    expressTechSelected.clear();
    expressNurseSelected.clear();
    renderExpressSelected();
    clearOperationalDirty();
    renderScaleConfirmationStates();
    $('#expressStatus').className='express-status ok';
    $('#expressStatus').innerHTML='<b>Escala operacional confirmada.</b> Profissionais fixos e em revezamento registrados; LIVRO sincronizado.';
  }catch(e){
    if(assignmentsApplied){
      try{await loadAll(selectedDate());await loadExpressScale()}catch(refreshError){console.error('Falha ao recarregar equipe após erro',refreshError)}
    }
    alert('Erro ao confirmar escala: '+(e.message||e)+(assignmentsApplied?'\n\nAlgumas alterações podem ter sido gravadas. Verifique a equipe antes de tentar novamente.':''));
  }
  finally{confirmButtons.forEach(b=>{b.disabled=false;b.textContent='CONFIRMAR ESCALA'})}
}

/* ---------- generic assignment ---------- */
function configureAssignModes(role){
  const allowed={
    driver:['FIXO','REVEZ_USA','REVEZ_USB'],
    tech:['FIXO','REVEZ_USB'],
    nurse:['FIXO','REVEZ_USA','REVEZ_USB'],
    doctor:['FIXO'],
    moto:['FIXO']
  }[role]||['FIXO'];
  [...$('#assignMode').options].forEach(o=>{
    const show=allowed.includes(o.value);
    o.hidden=!show;
    o.disabled=!show;
  });
  if(!allowed.includes($('#assignMode').value))$('#assignMode').value=allowed[0];
}
function assignmentModeForMember(m){
  if(!m||!isRotationMember(m))return 'FIXO';
  const group=norm(m.grupo_revezamento||m.revezamento_tipo_viatura||m.tipo_escala);
  return group.includes('USA')?'REVEZ_USA':'REVEZ_USB';
}
function assignmentRoleForMember(m,p){
  return m?teamRoleKey(m):professionalRoleKey(p);
}
function fixedFunctionForRole(role,p,v){
  if(role==='driver')return 'Condutor';
  if(role==='tech')return 'Técnico de Enfermagem';
  if(role==='nurse')return vehicleType(v).includes('USB')?'Técnico de Enfermagem':'Enfermeiro';
  if(role==='doctor')return 'Médico';
  if(role==='moto')return p?.funcao_sistema||'Motolância';
  return p?.funcao_sistema||'Profissional';
}
function validateFixedAssignment(role,v){
  const type=vehicleType(v);
  if(role==='driver'&&!type.includes('USA')&&!type.includes('USB'))return 'Condutor deve ficar em uma USA ou USB.';
  if(role==='tech'&&!type.includes('USB'))return 'Técnico deve ficar em uma USB.';
  if(role==='doctor'&&!type.includes('USA'))return 'Médico deve ficar em uma USA.';
  if(role==='nurse'&&!type.includes('USA')&&!type.includes('USB'))return 'Enfermeiro deve ficar em USA ou USB.';
  if(role==='moto'&&!type.includes('MOTO'))return 'Piloto de motolância deve ficar na Motolância.';
  return '';
}
function openAssignModal(proId){
  if(!isOperator())return;
  selectedAssignTeamRow=null;
  selectedAssignProfessional=professionals.find(p=>p.id===proId);if(!selectedAssignProfessional)return;
  const role=professionalRoleKey(selectedAssignProfessional);
  configureAssignModes(role);
  $('#assignTitle').textContent='Escalar '+displayName(selectedAssignProfessional);
  $('#assignPersonInfo').textContent=selectedAssignProfessional.nome_completo+' • '+selectedAssignProfessional.funcao_sistema;
  populateVehicleSelect($('#assignVehicle'),null,false);
  $('#assignMode').value='FIXO';
  $('#assignVehicleWrap').classList.remove('hidden');
  $('#confirmAssignBtn').textContent='ESCALAR';
  openModal('assignModal');
}
function openEditTeamMember(teamId){
  if(!isOperator())return;
  const m=team.find(x=>x.id===teamId&&norm(x.status||'ATIVO')==='ATIVO');
  if(!m)return alert('Esse profissional não está mais ativo nesta escala.');
  const p=m.profissionais||professionals.find(x=>x.id===m.profissional_id);
  if(!p)return alert('Profissional não encontrado no cadastro.');

  selectedAssignTeamRow=m;
  selectedAssignProfessional=p;
  const role=assignmentRoleForMember(m,p);
  configureAssignModes(role);
  populateVehicleSelect($('#assignVehicle'),m.viatura_id||null,false);

  const mode=assignmentModeForMember(m);
  $('#assignMode').value=mode;
  $('#assignVehicleWrap').classList.toggle('hidden',mode!=='FIXO');
  $('#assignTitle').textContent='Editar '+displayName(p);

  const v=vehicleById(m.viatura_id);
  const current=v?.nome||m.viatura_snapshot||m.grupo_revezamento||m.tipo_escala||'SEM VIATURA';
  $('#assignPersonInfo').textContent=p.nome_completo+' • '+roleLabel(role)+' • Atual: '+current;
  $('#confirmAssignBtn').textContent='SALVAR ALTERAÇÃO';
  openModal('assignModal');
}
async function syncEditedMemberOccurrence(oldRow,newVehicle,funcao){
  const oldVehicle=vehicleById(oldRow?.viatura_id);
  const oldOccurrence=oldVehicle?activeOccurrence(oldVehicle):null;
  if(oldOccurrence){
    const del=await supabase.from('equipe_ocorrencia').delete()
      .eq('ocorrencia_id',oldOccurrence.id)
      .eq('profissional_id',oldRow.profissional_id);
    if(del.error)throw del.error;
  }
  if(newVehicle){
    const newOccurrence=activeOccurrence(newVehicle);
    if(newOccurrence){
      const p=selectedAssignProfessional;
      const up=await supabase.from('equipe_ocorrencia').upsert({
        ocorrencia_id:newOccurrence.id,
        profissional_id:oldRow.profissional_id,
        funcao,
        nome_snapshot:p?.nome_completo||oldRow.nome_snapshot,
        viatura_id:newVehicle.id,
        viatura_snapshot:newVehicle.nome,
        tipo_escala_no_momento:'FIXO EM VIATURA'
      },{onConflict:'ocorrencia_id,profissional_id'});
      if(up.error)throw up.error;
    }
  }
}
async function confirmAssign(){
  const p=selectedAssignProfessional;if(!p||!currentPlantao)return;
  const mode=$('#assignMode').value;
  const editRow=selectedAssignTeamRow;
  const role=assignmentRoleForMember(editRow,p);
  try{
    if(editRow){
      const now=new Date().toISOString();

      if(mode==='FIXO'){
        const v=vehicleById($('#assignVehicle').value);if(!v)return alert('Escolha uma viatura.');
        const invalid=validateFixedAssignment(role,v);if(invalid)return alert(invalid);
        const funcao=fixedFunctionForRole(role,p,v);

        const occupied=activeTeamRows().find(m=>m.id!==editRow.id&&m.viatura_id===v.id&&teamRoleKey(m)===teamRoleKey({...editRow,funcao}));
        if(occupied){
          if(!confirm('Já existe '+roleLabel(teamRoleKey(occupied))+' em '+v.nome+'.\n\nDeseja substituir '+displayName(occupied.profissionais)+'?'))return;
          await deactivateTeamRow(occupied,now);
        }

        const {error}=await supabase.from('equipe_plantao').update({
          funcao,
          tipo_escala:'FIXO EM VIATURA',
          viatura_id:v.id,
          viatura_snapshot:v.nome,
          grupo_revezamento:null,
          revezamento_tipo_viatura:null,
          origem_escala:'EDICAO_EQUIPE',
          status:'ATIVO',
          saiu_em:null
        }).eq('id',editRow.id);
        if(error)throw error;
        await syncEditedMemberOccurrence(editRow,v,funcao);
      }else{
        if(role==='doctor'||role==='moto')return alert('Essa função não participa do revezamento.');
        if(mode==='REVEZ_USA'&&!['driver','nurse'].includes(role))return alert('Neste revezamento USA entram Condutor ou Enfermeiro.');
        if(mode==='REVEZ_USB'&&!['driver','tech','nurse'].includes(role))return alert('Neste revezamento USB entram Condutor, Técnico ou Enfermeiro.');

        const type=mode==='REVEZ_USA'?'USA':'USB';
        const funcao=role==='driver'?'Condutor':type==='USA'?'Enfermeiro':'Técnico de Enfermagem';
        const group=type+'_'+(role==='driver'?'CONDUTOR':type==='USA'?'ENFERMEIRO':'TECNICO');

        await syncEditedMemberOccurrence(editRow,null,funcao);
        const {error}=await supabase.from('equipe_plantao').update({
          funcao,
          tipo_escala:'REVEZAMENTO',
          viatura_id:null,
          viatura_snapshot:null,
          grupo_revezamento:group,
          revezamento_tipo_viatura:type,
          origem_escala:'EDICAO_EQUIPE',
          status:'ATIVO',
          saiu_em:null
        }).eq('id',editRow.id);
        if(error)throw error;
      }

      markOperationalDirty();
      closeModal('assignModal');
      selectedAssignTeamRow=null;
      selectedAssignProfessional=null;
      await loadAll(selectedDate());
      await loadExpressScale();
      await refreshBookProjection();
      return;
    }

    if(mode==='FIXO'){
      const v=vehicleById($('#assignVehicle').value);if(!v)return alert('Escolha uma viatura.');
      const invalid=validateFixedAssignment(role,v);if(invalid)return alert(invalid);
      const funcao=fixedFunctionForRole(role,p,v);
      await assignProfessionalToVehicle(p.id,v.id,funcao,'BUSCA_EQUIPE');
    }else if(mode==='REVEZ_USA'){
      if(!['driver','nurse'].includes(role))return alert('Para revezamento USA, use condutor ou enfermeiro.');
      await putProfessionalInRotation(p,role==='driver'?'USA_CONDUTOR':'USA_ENFERMEIRO',role==='driver'?'Condutor':'Enfermeiro');
    }else{
      if(!['driver','tech','nurse'].includes(role))return alert('Para revezamento USB, use condutor, técnico ou enfermeiro.');
      await putProfessionalInRotation(p,role==='driver'?'USB_CONDUTOR':'USB_TECNICO',role==='driver'?'Condutor':'Técnico de Enfermagem');
    }
    closeModal('assignModal');
    selectedAssignProfessional=null;
    $('#teamSearch').value='';
    $('#teamSearchResults').classList.remove('show');
    await loadAll(selectedDate());
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
  const pending=pendingQuickRegistration;
  if(pending?.expressRole){
    const roleKey=professionalRoleKey({funcao_sistema:funcao});
    if(pending.expressRole==='nurse'&&roleKey!=='nurse'){
      return alert('Para a USA, cadastre com a função Enfermeiro.');
    }
    if(pending.expressRole==='tech'&&!['tech','nurse'].includes(roleKey)){
      return alert('Para a USB, escolha Técnico de Enfermagem ou Enfermeiro.');
    }
  }
  // Não grave no banco com função incompatível com a posição solicitada.
  if(pending?.input&&pending?.hidden&&!allowedForField({funcao_sistema:funcao},pending.key)){
    return alert('A função selecionada não é compatível com este campo da equipe. Escolha a função correta antes de cadastrar.');
  }
  const {data,error}=await supabase.from('profissionais').insert({
    nome_completo:nome,nome_de_guerra:war||null,funcao_sistema:funcao,
    notificar_padrao:false,ativo:true,data_cadastro:new Date().toISOString(),atualizado_em:new Date().toISOString()
  }).select('id,legacy_id,nome_completo,nome_de_guerra,funcao_sistema,categoria_origem,topico_ntfy,ativo').single();
  if(error)return alert(error.message);

  professionals.push(data);
  professionals.sort((a,b)=>String(a.nome_completo).localeCompare(String(b.nome_completo),'pt-BR'));
  if(pending?.expressRole){
    selectExpressProfessional(data,pending.expressRole);
  }
  if(pending?.input&&pending?.hidden){
    if(!allowedForField(data,pending.key)){
      alert('Profissional cadastrado, mas a função escolhida não é permitida neste campo.');
    }else{
      pending.input.value=professionalLabel(data,pending.key);
      pending.hidden.value=data.id;
      const results=quickCfg()[Object.keys(quickCfg()).find(key=>$(quickCfg()[key].input)===pending.input)]?.results;
      if(results){
        $(results).classList.remove('show');
        $(results).innerHTML='';
      }
    }
  }
  pendingQuickRegistration=null;
  closeModal('quickRegisterModal');
  renderRegistry();
}

async function ensureOperationalScaleFromFixed(){
  if(!currentPlantao||!vehicles.length||!professionals.length)return;
  const scaleCtx=currentScaleContext();
  const ala=scaleCtx.ala;
  const turno=scaleCtx.turno;
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
  const current=activeTeamScope();
  if(current!==scope){
    const allowed=current==='operational'
      ? confirmUnsavedRisk({includeOperational:true,action:'abrir o Serviço Interno'})
      : confirmUnsavedRisk({includeInternal:true,action:'voltar para a Escala Operacional'});
    if(!allowed)return false;
  }
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
  if(currentPlantao&&norm(currentPlantao.status)==='ENCERRADO'){
    throw new Error('Plantão encerrado. Use INICIAR PRÓXIMA ESCALA antes de alterar os dados.');
  }
  if(currentPlantao&&norm(currentPlantao.status)==='ABERTO')return currentPlantao;
  const ctx=autoFollowCurrentShift?await resolveOperationalShiftContext():currentScaleContext();
  currentPlantao=await ensureOperationalPlantao(ctx.date,ctx.turno,ctx.ala||alaForDate(ctx.date));
  syncDateAndAla(ctx.date,currentPlantao.turno||ctx.turno);
  return currentPlantao;
}
async function loadBookData(){
  await ensureProfessionals();
  if(!currentPlantao)await ensurePlantaoForBook();
  const ala=currentPlantao.ala||alaForDate(currentPlantao.data_plantao);
  const turno=normalizeTurno(currentPlantao.turno||operationalShiftContext().turno);
  const fixedReference=activeScaleReference();
  const [bm,di,fi,fd]=await Promise.all([
    supabase.from('livro_plantao').select('*').eq('plantao_id',currentPlantao.id).maybeSingle(),
    supabase.from('escala_interna_plantao').select('*').eq('plantao_id',currentPlantao.id).eq('status','ATIVO').order('ordem'),
    supabase.from('escala_fixa_interna_anapolis').select('*').eq('ala',ala).eq('turno',turno).eq('ativo',true).order('ordem'),
    supabase.from('escala_fixa_anapolis').select('*').eq('ala',fixedReference.ala).eq('turno',fixedReference.turno).eq('ativo',true).order('ordem')
  ]);
  if(bm.error)throw bm.error;if(di.error)throw di.error;if(fi.error)throw fi.error;if(fd.error)throw fd.error;
  bookMeta=bm.data||null;internalScaleRows=di.data||[];fixedInternalRows=fi.data||[];bookDriverFixedRows=fd.data||[];

  // A escala fixa é apenas referência visual. A equipe ativa nasce somente após clique/confirmacão do operador.
  if(norm(currentPlantao.status)==='ABERTO')await ensureAutomaticBookNumber();
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
    markInternalDirty();
  });
  el.querySelectorAll('[data-int-search]').forEach(inp=>inp.oninput=()=>{markInternalDirty();internalAutocomplete(inp.dataset.intSearch,inp.value,el)});
}
function renderInternalEditors(){
  const scaleCtx=currentScaleContext();
  if($('#internalAlaTurnoBadge'))$('#internalAlaTurnoBadge').textContent='ALA '+scaleCtx.ala+' • '+scaleCtx.turno;
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
    markInternalDirty();
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
  if(!canEditOpenShift())return;
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
    clearInternalDirty();
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
  if(!canEditOpenShift())return;
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
  if(!canEditOpenShift())return;
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
  unsavedBook=false;
  await loadBookData();renderBook();alert('Livro salvo.');
}

/* ---------- Troca e encerramento manual de plantão ---------- */
function openShiftTransition(){
  if(!isOperator())return;
  if(!currentPlantao)return alert('Nenhum plantão carregado.');
  const p=currentPlantao;
  const open=norm(p.status)==='ABERTO';
  const next=nextShiftContext(p);
  const earlyEnd=open&&Date.now()<shiftExpectedEnd(p).getTime();
  const earlyStart=Date.now()<shiftExpectedStart(next).getTime();
  const active=occurrences.filter(o=>!['FINALIZADA','QTA','CANCELADA'].includes(norm(o.status))).length;
  const points=[
    '<b>Plantão atual:</b> '+esc(shiftTitle(p))+' — '+(open?'ABERTO':'ENCERRADO'),
    '<b>Próximo plantão:</b> '+esc(shiftTitle(next)),
    earlyEnd?'<strong>O turno atual ainda não chegou ao horário previsto de encerramento.</strong>':'',
    earlyStart?'<strong>O próximo turno será iniciado antes do horário previsto.</strong>':'',
    open&&active?'<strong>'+active+' ocorrência(s) em andamento.</strong> Serão mantidas no registro do plantão anterior; confira o repasse.':'',
    open&&(operationalNeedsConfirmation()||internalNeedsConfirmation()||unsavedBook||anyDraftModalOpen())
      ?'<strong>Há informações não confirmadas ou não salvas.</strong> Elas podem ser perdidas ao trocar de escala.':'',
    'A escala anterior fica no histórico. O sistema não encerra ocorrências nem altera automaticamente a situação das viaturas.'
  ].filter(Boolean);
  $('#shiftTransitionTitle').textContent=open?'Trocar ou encerrar plantão':'Iniciar próxima escala';
  $('#shiftTransitionDetails').innerHTML=points.map(p=>'<p>'+p+'</p>').join('');
  $('#shiftTransitionAcknowledge').checked=false;
  $('#shiftEndOnlyBtn').classList.toggle('hidden',!open);
  $('#shiftEndStartBtn').classList.toggle('hidden',!open);
  $('#shiftStartOnlyBtn').classList.toggle('hidden',open);
  ['#shiftEndOnlyBtn','#shiftEndStartBtn','#shiftStartOnlyBtn'].forEach(id=>$(id).disabled=true);
  shiftTransitionPlantaoId=p.id;
  openModal('shiftTransitionModal');
}
function updateShiftTransitionButtons(){
  const allowed=$('#shiftTransitionAcknowledge').checked&&!shiftTransitionBusy;
  ['#shiftEndOnlyBtn','#shiftEndStartBtn','#shiftStartOnlyBtn'].forEach(id=>$(id).disabled=!allowed);
}
async function executeShiftTransition(mode){
  if(!isOperator()||shiftTransitionBusy||!$('#shiftTransitionAcknowledge').checked)return;
  if(!currentPlantao||shiftTransitionPlantaoId!==currentPlantao.id){
    alert('O plantão mudou. Abra novamente a janela para conferir os dados.');
    closeModal('shiftTransitionModal');
    return;
  }
  const old={...currentPlantao};
  const open=norm(old.status)==='ABERTO';
  if(mode!=='start'&&!open)return alert('O plantão já foi encerrado.');
  if(mode==='start'&&open)return alert('Encerre o plantão atual antes de iniciar o próximo.');
  shiftTransitionBusy=true;
  updateShiftTransitionButtons();
  let closed=false;
  try{
    if(open){
      const {data,error}=await supabase.from('plantoes')
        .update({status:'ENCERRADO',encerrado_em:new Date().toISOString(),operador_encerramento:profile?.nome||session?.user?.email||'OPERADOR'})
        .eq('id',old.id).eq('status','ABERTO').select('id').maybeSingle();
      if(error)throw error;
      if(!data)throw new Error('Este plantão já foi modificado por outro operador. Atualize a tela.');
      closed=true;
    }
    if(mode==='end'){
      autoFollowCurrentShift=false;
      unsavedBook=false;
      await loadAll(old.data_plantao,old.turno);
      await loadExpressScale();
      clearOperationalDirty();
      clearInternalDirty();
      lastClockShiftKey=operationalShiftKey();
      closeModal('shiftTransitionModal');
      setSync('Plantão encerrado. Você pode iniciar o próximo quando quiser.','warn');
      return;
    }
    const next=nextShiftContext(old);
    const np=await ensureOperationalPlantao(next.date,next.turno,next.ala);
    if(norm(np.status)!=='ABERTO')throw new Error('O próximo plantão não está aberto.');
    autoFollowCurrentShift=true;
    await loadAll(next.date,next.turno);
    await loadExpressScale();
    if(currentPlantao)await loadBookData();
    lastOperationalShiftKey=operationalShiftKey(next);
    lastClockShiftKey=operationalShiftKey();
    clearOperationalDirty();
    clearInternalDirty();
    unsavedBook=false;
    closeModal('shiftTransitionModal');
    setSync('Novo plantão iniciado • '+shiftTitle(next));
    alert('Próximo plantão iniciado. Confira a escala e confirme os profissionais em serviço.');
  }catch(error){
    console.error('Falha ao trocar plantão',error);
    if(closed){
      autoFollowCurrentShift=false;
      await loadAll(old.data_plantao,old.turno);
      closeModal('shiftTransitionModal');
      alert('O plantão anterior foi encerrado, mas a próxima escala não pôde ser iniciada. Clique em INICIAR PRÓXIMA ESCALA para tentar novamente.\n\n'+(error.message||error));
    }else{
      alert('Não foi possível realizar a troca: '+(error.message||error));
    }
  }finally{
    shiftTransitionBusy=false;
    updateShiftTransitionButtons();
  }
}
async function endShift(){
  openShiftTransition();
}
function exportCSV(){
  const rows=[['Ocorrencia','Viatura','Natureza','Bairro','Destino da vitima','Endereco','Equipe','Status','Saida','QTH','Inicio retorno','Chegada base','Observacao'],
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
  if(shiftTransitionBusy)return;
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(()=>{
    if(shiftTransitionBusy)return;
    const refresh=autoFollowCurrentShift
      ? synchronizeCurrentOperationalShift(true)
      : loadAll(selectedDate(),currentPlantao?.turno);
    Promise.resolve(refresh).catch(console.error);
  },280);
}
function subscribeRealtime(){
  if(realtimeChannel)supabase.removeChannel(realtimeChannel);
  realtimeChannel=supabase.channel('samu-operacional-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'viaturas'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'equipe_plantao'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'ocorrencias'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'equipe_ocorrencia'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'revezamento_plantao'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'prioridade_manual_revezamento'},scheduleReload)
    .on('postgres_changes',{event:'*',schema:'public',table:'livro_plantao'},()=>{if($('#book')?.classList.contains('active'))loadBookData().then(renderBook)})
    .on('postgres_changes',{event:'*',schema:'public',table:'escala_interna_plantao'},()=>{
      loadBookData().then(()=>{renderInternalEditors();if($('#book')?.classList.contains('active'))renderBook()}).catch(console.error);
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'plantoes'},scheduleReload)
    .subscribe(s=>{if(s==='SUBSCRIBED')setSync('Banco conectado • atualização em tempo real ativa')});
}

/* ---------- session ---------- */
async function applySession(s){
  session=s;
  if(!s){
    stopOperationalShiftMonitor();
    lastOperationalShiftKey='';
    $('#auth').classList.remove('hidden');$('#app').classList.add('hidden');return;
  }
  const {data:p}=await supabase.from('usuarios_perfis').select('*').eq('user_id',s.user.id).maybeSingle();
  profile=p;
  $('#roleBadge').textContent=p?.papel||'CONSULTA';
  $('#auth').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#endShiftBtn').disabled=!isOperator();$('#manualOccBtn').disabled=!isOperator();

  // Segue automaticamente o plantão vigente. A virada 07:00/19:00
  // atualiza Escala Operacional e Serviço Interno juntos.
  autoFollowCurrentShift=true;
  manualScaleReference=null;
  pendingScaleReference=null;
  lastOperationalShiftKey='';
  await synchronizeCurrentOperationalShift(true);
  subscribeRealtime();
  startOperationalShiftMonitor();
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
$('#logoutBtn').onclick=()=>{
  if(!confirmUnsavedRisk({includeOperational:true,includeInternal:true,includeBook:true,action:'sair do sistema'}))return;
  if(anyDraftModalOpen()&&!confirm('Há uma janela com dados não salvos. Sair mesmo assim?'))return;
  supabase.auth.signOut();
};
$$('.tab').forEach(b=>b.onclick=()=>openPage(b.dataset.page,{teamView:b.dataset.teamView}));
$$('[data-open-page]').forEach(b=>b.onclick=()=>openPage(b.dataset.openPage));
$$('[data-close-modal]').forEach(b=>b.onclick=()=>requestCloseModal(b.dataset.closeModal));
$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)requestCloseModal(m.id)}));
$('#shiftDate').onchange=async()=>{
  const previous=currentPlantao?.data_plantao||operationalShiftContext().date;
  if(!confirmUnsavedRisk({includeOperational:true,includeInternal:true,includeBook:true,action:'trocar a data do plantão'})){
    $('#shiftDate').value=previous;
    return;
  }
  const ctx=operationalShiftContext();
  const date=$('#shiftDate').value;
  // Mudança deliberada de data/plantão restaura as referências automáticas.
  manualScaleReference=null;
  pendingScaleReference=null;
  autoFollowCurrentShift=date===ctx.date;
  if(autoFollowCurrentShift){
    await synchronizeCurrentOperationalShift(true);
  }else{
    lastOperationalShiftKey='';
    syncDateAndAla(date,$('#expressTurno')?.value||ctx.turno);
    await loadAll(date);
    await loadExpressScale();
  }
};
$('#exportBtn').onclick=exportCSV;$('#endShiftBtn').onclick=endShift;$('#manualOccBtn').onclick=()=>openOccurrenceModal(null);
$('#shiftTransitionAcknowledge').onchange=updateShiftTransitionButtons;
$('#shiftEndOnlyBtn').onclick=()=>executeShiftTransition('end');
$('#shiftEndStartBtn').onclick=()=>executeShiftTransition('end_start');
$('#shiftStartOnlyBtn').onclick=()=>executeShiftTransition('start');
$('#regionalBtn')?.addEventListener('click',()=>$('#regionalIntegrated').scrollIntoView({behavior:'smooth',block:'start'}));
$('#rotationCriterion').onchange=e=>persistRotationCriterion(e.target.value);
$('#earlyExitTime').oninput=updateEarlyExitPreview;
$('#earlyExitExtra').onchange=updateEarlyExitPreview;
$('#earlyExitSaveBtn').onclick=saveEarlyExit;
$('#earlyExitRemoveBtn').onclick=removeEarlyExit;
$('#manualRotationSave').onclick=()=>persistManualQueue();
$('#manualRotationReset').onclick=()=>{if(confirm('Cancelar a prioridade manual desta fila e voltar ao revezamento automático?'))persistManualQueue(true)};
$('#teamReloadBtn').onclick=()=>{
  if(!confirmUnsavedRisk({includeOperational:true,includeInternal:true,action:'atualizar a equipe'}))return;
  autoFollowCurrentShift?synchronizeCurrentOperationalShift(true):loadAll(selectedDate());
};
$('#saveOcc').onclick=saveOccurrence;$('#saveTeam').onclick=saveQuickTeam;$('#saveOccEdit').onclick=saveOccurrenceEdit;
$('#victimDestinationChoice').onchange=refreshVictimDestinationChoice;
$('#saveVictimDestinationBtn').onclick=saveVictimDestination;
$('#loadScaleBtn').onclick=askToApplyScaleReference;
$('#autoScaleReferenceBtn').onclick=()=>restoreAutomaticScaleReference().catch(e=>alert(e.message||e));
$('#scaleReferenceAcknowledge').onchange=()=>{$('#applyScaleReferenceBtn').disabled=!$('#scaleReferenceAcknowledge').checked};
$('#applyScaleReferenceBtn').onclick=()=>applyManualScaleReference().catch(e=>alert(e.message||e));
['#expressAla','#expressTurno'].forEach(sel=>{
  $(sel).addEventListener('change',()=>{
    $('#expressStatus').className='express-status warn';
    $('#expressStatus').textContent='Escolha preparada. Clique em APLICAR ESCALA para revisar o aviso e confirmar com CIENTE.';
  });
});
$('#allDriversRotationBtn').onclick=setAllDriversRotation;$('#restoreFixedDriversBtn').onclick=restoreFixedDrivers;
$('#expressTechSearch').oninput=e=>expressSearch('tech',e.target.value);$('#expressNurseSearch').oninput=e=>expressSearch('nurse',e.target.value);
$('#expressTechAddBtn').onclick=()=>openExpressRegistration('tech');
$('#expressNurseAddBtn').onclick=()=>openExpressRegistration('nurse');
$('#applyExpressPreviewBtn').onclick=()=>{$('#expressStatus').className='express-status ok';$('#expressStatus').innerHTML='<b>Prévia preparada:</b> '+expressTechSelected.size+' técnico(s)/enfermeiro(s) para USB e '+expressNurseSelected.size+' enfermeiro(s) para USA. Clique em CONFIRMAR para gravar.'};
$('#confirmExpressBtn').onclick=confirmExpress;
$('#confirmExpressTopBtn').onclick=confirmExpress;
$('#teamSearch').oninput=e=>renderTeamSearch(e.target.value);$('#clearTeamSearchBtn').onclick=()=>{$('#teamSearch').value='';$('#teamSearchResults').classList.remove('show');$('#teamSearchResults').innerHTML=''};
$('#assignMode').onchange=()=>$('#assignVehicleWrap').classList.toggle('hidden',$('#assignMode').value!=='FIXO');
$('#confirmAssignBtn').onclick=confirmAssign;$('#saveIndividualOccBtn').onclick=saveIndividualOccurrence;
$('#regRole').onchange=renderRegistry;$('#registerProfessionalBtn').onclick=registerProfessional;
$$('.scale-scope-btn').forEach(b=>b.onclick=()=>showTeamScope(b.dataset.teamScope));
$('#internalReloadBtn').onclick=()=>{
  if(!confirmUnsavedRisk({includeInternal:true,action:'recarregar o Serviço Interno'}))return;
  loadBookData().then(()=>{renderInternalEditors();renderBook();renderScaleConfirmationStates()});
};
$('#confirmInternalBtn').onclick=()=>confirmInternalTeam('#teamInternalEditor');
$('#confirmInternalBookBtn').onclick=()=>confirmInternalTeam('#internalScaleEditor');
$('#saveBookBtn').onclick=saveBook;$('#printBookBtn').onclick=()=>window.print();
['#bookChefe','#bookObs'].forEach(sel=>{if($(sel))$(sel).addEventListener('input',()=>{unsavedBook=true})});
$('#expressPermutaSearch').oninput=expressPermutaAutocomplete;
$('#saveExpressPermutaBtn').onclick=saveExpressPermuta;
$('#saveQuickRegisterBtn').onclick=saveQuickRegistration;

window.addEventListener('beforeunload',e=>{
  const page=document.querySelector('.page.active')?.id||'';
  const unconfirmedScalePage=page==='team'&&(
    activeTeamScope()==='operational' ? operationalNeedsConfirmation() : internalNeedsConfirmation()
  );
  if(unsavedOperationalScale||unsavedInternalScale||unsavedBook||anyDraftModalOpen()||unconfirmedScalePage){
    e.preventDefault();
    e.returnValue='';
  }
});

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&session&&autoFollowCurrentShift){
    const key=operationalShiftKey();
    if(key!==lastClockShiftKey || !currentPlantao){
      synchronizeCurrentOperationalShift().catch(console.error);
    }
  }
});

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
