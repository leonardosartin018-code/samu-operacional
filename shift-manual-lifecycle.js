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
