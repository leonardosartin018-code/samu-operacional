/*
 * Regra de exibição/edição do destino da vítima.
 * O horário QTH e o destino são informações independentes.
 *
 * Em ocorrência: disponível após chegada ao QTH OU QTH não informado.
 * Retornando: disponível mesmo que a chegada ao QTH não tenha sido informada.
 * Fora de atendimento/retorno: preserva bloqueio para não alterar ocorrências encerradas.
 */
export function canManageVictimDestination({
  occurrenceStatus,
  vehicleStatus,
  qthRecorded = false,
  qthNotInformed = false
} = {}) {
  const inAttendance = occurrenceStatus === 'EM OCORRENCIA' && vehicleStatus === 'occurrence';
  const returning = occurrenceStatus === 'RETORNANDO' && vehicleStatus === 'returning';
  if (!inAttendance && !returning) return false;
  return Boolean(qthRecorded || qthNotInformed || returning);
}
