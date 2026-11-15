/*
 * Peso de esforço para fins de justiça da fila do SAMU.
 * A ocorrência real continua sendo UNA: o peso afeta apenas a pontuação
 * de prioridade e o intervalo de descanso sugerido após retorno à base.
 */
export function occurrenceEffortWeight(value) {
  const weight=Number(value);
  return Number.isInteger(weight)&&weight>=1&&weight<=3?weight:1;
}
export function effortRestMinutes(weight) {
  return (occurrenceEffortWeight(weight)-1)*30;
}
export function weightedCompletedScore(occurrences) {
  return (occurrences||[])
    .filter(o=>String(o.status||'').toUpperCase().trim()==='FINALIZADA')
    .reduce((total,o)=>total+occurrenceEffortWeight(o.peso_ocorrencia),0);
}
export function restTimeRemaining(occurrence,nowMs=Date.now()) {
  if (!occurrence||String(occurrence.status||'').toUpperCase().trim()!=='FINALIZADA')return 0;
  const end=Date.parse(String(occurrence.retorno_base_em||''));
  if(!Number.isFinite(end))return 0;
  const minutes=effortRestMinutes(occurrence.peso_ocorrencia);
  return Math.max(0,Math.ceil((end+minutes*60000-nowMs)/60000));
}
export function lastCompletedOccurrence(list) {
  return (list||[])
    .filter(o=>String(o.status||'').toUpperCase().trim()==='FINALIZADA'&&
      Number.isFinite(Date.parse(String(o.retorno_base_em||''))))
    .sort((a,b)=>Date.parse(b.retorno_base_em)-Date.parse(a.retorno_base_em))[0]||null;
}
export function effortAdjustmentNote({weight,reason,operator,time}) {
  const w=occurrenceEffortWeight(weight);
  if(w===1)return '';
  const explanation=String(reason||'').trim().replace(/[\r\n]+/g,' ');
  if(!explanation)throw new Error('Informe o motivo do peso especial.');
  if(explanation.length>180)throw new Error('A justificativa deve ter no máximo 180 caracteres.');
  return '[REVEZAMENTO — PESO ESPECIAL] Peso '+w+
    ' (1 ocorrência real, '+w+' pontos na fila); descanso sugerido: '+
    effortRestMinutes(w)+' min. Motivo: '+explanation+
    '. Registrado por '+String(operator||'operador').trim()+
    ' em '+String(time||'horário não informado')+'.';
}
