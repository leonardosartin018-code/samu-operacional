// A virada das 7h/19h não é um evento de encerramento do plantão.
// Só o operador pode fechar e iniciar a próxima escala.
export function isOpenShift(shift){
  return String(shift?.status||'').toUpperCase().trim()==='ABERTO';
}
export function shiftContextOf(shift,alaForDate){
  if(!shift?.data_plantao)return null;
  const date=shift.data_plantao;
  return {
    date,turno:String(shift.turno||'DIURNO').toUpperCase().includes('NOT')?'NOTURNO':'DIURNO',
    ala:shift.ala||alaForDate(date)
  };
}
export function chooseUnfinishedShift(shifts,clock,alaForDate,currentlyOpen=null){
  // Enquanto houver uma escala sendo usada NESTA sessão, ela tem prioridade.
  if(isOpenShift(currentlyOpen))return currentlyOpen;
  const valid=(shifts||[]).filter(s=>isOpenShift(s)&&
    s.data_plantao && s.turno && s.ala);
  if(!valid.length)return null;
  const priorDay=new Date(clock.date+'T12:00:00Z');
  priorDay.setUTCDate(priorDay.getUTCDate()-1);
  const recentStart=priorDay.toISOString().slice(0,10);
  const recent=valid.filter(s=>s.data_plantao>=recentStart&&s.data_plantao<=clock.date);
  // Se o navegador antigo já criou o próximo turno às 19h sem encerrar
  // o anterior, manter a escala MAIS ANTIGA dentre as duas recentes.
  const ordered=(recent.length?recent:valid).slice().sort((a,b)=>
    Date.parse(a.iniciado_em||a.data_plantao)-Date.parse(b.iniciado_em||b.data_plantao));
  return recent.length?ordered[0]:ordered[ordered.length-1];
}
export function maySwitchShiftAutomatically(currentShift){
  return !isOpenShift(currentShift);
}
export function shouldBlockDateNavigation(currentShift,requestedDate){
  return isOpenShift(currentShift)&&requestedDate!==currentShift.data_plantao;
}

// Regional crews cover the day and night of the same service date.
// Never infer a fresh 24-hour roster from a prior night or an unknown base.
export function regionalRosterForNight(source,target,members,vehicles){
  if(!source?.data_plantao||source.data_plantao!==(target?.data_plantao||target?.date)||
    String(source.turno||'').toUpperCase()!=='DIURNO'||
    String(target?.turno||'').toUpperCase()!=='NOTURNO')return [];
  const regional=new Set((vehicles||[]).filter(v=>{
    const name=String(v.bases?.nome||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
    return v.ativo!==false&&name&&name!=='ANAPOLIS';
  }).map(v=>v.id));
  return (members||[]).filter(m=>m.plantao_id===source.id&&
    String(m.status||'').toUpperCase()==='ATIVO'&&m.profissional_id&&regional.has(m.viatura_id));
}

// A newer turn confirmed by an operator supersedes a stale local pin, even
// when an unrelated legacy record was never closed. The clock is not evidence.
export function confirmedHandoffSuccessor(shifts,currentShift=null){
  const started=p=>{
    const value=Date.parse(p?.iniciado_em||p?.criado_em||p?.data_plantao||'');
    return Number.isFinite(value)?value:-Infinity;
  };
  const candidates=(shifts||[]).filter(p=>{
    const incoming=p?.repasse_plantao?.incoming;
    return isOpenShift(p)&&p.id!==currentShift?.id&&p.data_plantao&&p.turno&&p.ala&&
      typeof incoming?.source_shift_id==='string'&&incoming.source_shift_id.length>0&&
      ['clean','carry'].includes(incoming.mode)&&Number.isFinite(Date.parse(incoming.confirmed_at||''))&&
      started(p)>started(currentShift);
  });
  return candidates.sort((a,b)=>started(b)-started(a))[0]||null;
}
