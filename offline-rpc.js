const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const equal = (column, value) => ({column, operator: 'eq', value});
const within = (column, value) => ({column, operator: 'in', value});
const rowById = (context, table, id) => context.rows(table, [equal('id', id)])[0];

async function checked(query) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function requireOpen(context, id) {
  const shift = rowById(context, 'plantoes', id);
  if (!shift || shift.status !== 'ABERTO') throw new Error('O plantão precisa estar aberto.');
  return shift;
}

async function guaranteeBook(params, context) {
  const previous = context.rows('livro_plantao', [equal('plantao_id', params.p_plantao_id)])[0];
  if (previous?.parte_diaria?.trim()) return previous;
  const shift = rowById(context, 'plantoes', params.p_plantao_id);
  if (!shift || shift.status !== 'ABERTO') return null;
  if (!['DIURNO', 'NOTURNO'].includes(shift.turno) || shift.data_plantao < '2026-11-11') return null;
  const elapsedDays = (Date.parse(shift.data_plantao + 'T12:00:00Z') - Date.parse('2026-11-11T12:00:00Z')) / 86400000;
  const number = 541 + 2 * elapsedDays + (shift.turno === 'NOTURNO' ? 1 : 0);
  return checked(context.from('livro_plantao').upsert({
    ...(previous || {}), plantao_id: shift.id, parte_diaria: String(number),
    ano: previous?.ano || Number(shift.data_plantao.slice(0, 4)), chefe_servico: 'MAJ BAZÍLIO'
  }, {onConflict: 'plantao_id'}).select().single());
}

async function undoReturn(params, context) {
  const occurrence = rowById(context, 'ocorrencias', params.p_ocorrencia_id);
  const vehicle = rowById(context, 'viaturas', params.p_viatura_id);
  if (!occurrence || occurrence.viatura_id !== vehicle?.id || occurrence.status !== 'RETORNANDO' ||
      occurrence.inicio_retorno_em !== params.p_inicio_retorno || vehicle.status_atual !== 'RETORNANDO') {
    throw new Error('A situação da ocorrência mudou. Reabra o cartão.');
  }
  requireOpen(context, occurrence.plantao_id);
  await checked(context.from('ocorrencias').update({status: 'EM OCORRENCIA', inicio_retorno_em: null}).eq('id', occurrence.id));
  await checked(context.from('viaturas').update({status_atual: 'OCORRENCIA'}).eq('id', vehicle.id));
  return null;
}

async function manualPriority(params, context) {
  requireOpen(context, params.p_plantao_id);
  const ids = params.p_ids || [];
  const group = params.p_grupo;
  if (!['USB_DRIVER', 'USB_TECH', 'USA_DRIVER', 'USA_NURSE', 'USB_VIATURA', 'USA_VIATURA'].includes(group) ||
      ids.length > 40 || new Set(ids).size !== ids.length) throw new Error('Fila de prioridade inválida.');
  const vehicleQueue = group.endsWith('_VIATURA');
  const candidates = context.rows(vehicleQueue ? 'viaturas' : 'equipe_plantao', [within('id', ids)]);
  for (const id of ids) {
    const member = candidates.find(row => row.id === id);
    if (!member || (!vehicleQueue && (member.plantao_id !== params.p_plantao_id || member.status !== 'ATIVO'))) {
      throw new Error('A fila mudou. Confira a seleção.');
    }
    if (vehicleQueue) {
      const base = rowById(context, 'bases', member.base_id);
      if (!member.ativo || normalized(base?.nome) !== 'ANAPOLIS' ||
          !normalized(member.tipo || member.nome).startsWith(group.slice(0, 3))) throw new Error('Viatura fora da fila.');
    } else {
      const role = normalized(member.funcao);
      const rotation = normalized(member.tipo_escala).includes('REVEZ') || (member.grupo_revezamento && !member.viatura_id);
      const validRole = group.endsWith('_DRIVER') ? role.includes('CONDUTOR') :
        group === 'USA_NURSE' ? role.includes('ENFERM') : role.includes('TECN') || role.includes('ENFERM');
      if (!rotation || !validRole) throw new Error('Profissional fora do revezamento selecionado.');
    }
  }
  await checked(context.from('prioridade_manual_revezamento').delete()
    .eq('plantao_id', params.p_plantao_id).eq('grupo', group));
  if (ids.length) await checked(context.from('prioridade_manual_revezamento').insert(ids.map((id, index) => ({
    plantao_id: params.p_plantao_id, grupo: group, equipe_plantao_id: vehicleQueue ? null : id,
    viatura_id: vehicleQueue ? id : null, posicao: index + 1
  }))));
  return null;
}

function busyElsewhere(context, professionalId, occurrenceId, shiftId) {
  const active = new Set(context.rows('ocorrencias', [within('status', ['EM OCORRENCIA', 'RETORNANDO'])])
    .filter(row => row.id !== occurrenceId &&
      (row.plantao_id === shiftId || Date.parse(row.acionada_em) > Date.now() - 48 * 3600000)).map(row => row.id));
  return context.rows('equipe_ocorrencia', [equal('profissional_id', professionalId)]).some(row =>
    row.profissional_id === professionalId && active.has(row.ocorrencia_id));
}

async function convertFixed(params, context) {
  const shift = requireOpen(context, params.p_plantao_id);
  const ids = params.p_ids || [];
  if (!ids.length || ids.length > 80 || new Set(ids).size !== ids.length) throw new Error('Seleção coletiva inválida.');
  const local = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'}).formatToParts(new Date());
  const part = name => local.find(item => item.type === name).value;
  const hour = Number(part('hour'));
  const date = new Date(part('year') + '-' + part('month') + '-' + part('day') + 'T12:00:00Z');
  if (hour < 7) date.setUTCDate(date.getUTCDate() - 1);
  if (shift.data_plantao !== date.toISOString().slice(0, 10) ||
      shift.turno !== (hour >= 7 && hour < 19 ? 'DIURNO' : 'NOTURNO')) {
    throw new Error('A conversão coletiva exige o plantão vigente.');
  }
  const members = context.rows('equipe_plantao', [equal('plantao_id', shift.id), equal('status', 'ATIVO')]);
  const updates = [];
  for (const member of members.filter(row => row.viatura_id)) {
    const vehicle = rowById(context, 'viaturas', member.viatura_id);
    const base = rowById(context, 'bases', vehicle?.base_id);
    const type = normalized(vehicle?.tipo);
    const role = normalized(member.funcao);
    const driver = role.includes('CONDUTOR');
    const nurse = role.includes('ENFERM');
    const tech = role.includes('TECN') || nurse;
    const validRole = driver || (type === 'USA' ? nurse : tech);
    const scope = params.p_escopo;
    const validScope = scope === 'TODOS' || scope === type ||
      (scope === 'CONDUTORES' && driver) || (scope === 'ENFERMEIROS' && type === 'USA' && nurse) ||
      (scope === 'TECNICOS' && type === 'USB' && tech);
    if (!vehicle?.ativo || !['USA', 'USB'].includes(type) || base?.tipo !== 'PRINCIPAL' ||
        normalized(base?.nome) !== 'ANAPOLIS' || !validRole || !validScope) continue;
    updates.push({id: member.id, values: {
      tipo_escala: 'REVEZAMENTO', viatura_id: null, viatura_snapshot: null,
      grupo_revezamento: type + '_' + (driver ? 'CONDUTOR' : type === 'USA' ? 'ENFERMEIRO' : 'TECNICO'),
      revezamento_tipo_viatura: type, tipo_alteracao_escala: 'REVEZAMENTO',
      ordem_inicial: member.ordem_inicial ?? vehicle.ordem_exibicao
    }});
  }
  if (JSON.stringify(updates.map(row => row.id).sort()) !== JSON.stringify([...ids].sort())) {
    throw new Error('A equipe mudou desde a prévia. Confira a escala.');
  }
  const profile = context.rows('usuarios_perfis', [equal('user_id', context.userId)])[0];
  for (const update of updates) await checked(context.from('equipe_plantao').update(update.values).eq('id', update.id));
  await checked(context.from('plantoes').update({
    escala_operacional_confirmada_em: new Date().toISOString(),
    escala_operacional_confirmada_por: profile?.nome || context.userId
  }).eq('id', shift.id));
  return ids.length;
}

async function correctCrew(params, context) {
  const occurrence = rowById(context, 'ocorrencias', params.p_ocorrencia_id);
  if (!occurrence || occurrence.viatura_id !== params.p_viatura_id ||
      !['EM OCORRENCIA', 'RETORNANDO'].includes(occurrence.status) || occurrence.creditou_revezamento) {
    throw new Error('A ocorrência mudou ou foi encerrada.');
  }
  requireOpen(context, occurrence.plantao_id);
  const vehicle = rowById(context, 'viaturas', params.p_viatura_id);
  const type = normalized(vehicle?.tipo);
  const choices = params.p_escolhas;
  if (!vehicle?.ativo || !['USA', 'USB'].includes(type) || !Array.isArray(choices)) throw new Error('Equipe inválida.');
  const old = context.rows('equipe_ocorrencia', [equal('ocorrencia_id', occurrence.id)]);
  const oldIds = old.map(row => row.profissional_id).sort();
  if (JSON.stringify(oldIds) !== JSON.stringify([...(params.p_anteriores || [])].sort())) {
    throw new Error('A equipe já foi alterada. Reabra a correção.');
  }
  const roles = type === 'USA' ? ['driver', 'nurse', 'doctor'] : ['driver', 'tech'];
  if (choices.length < 2 || choices.length > roles.length ||
      new Set(choices.map(row => row.id)).size !== choices.length ||
      new Set(choices.map(row => row.role)).size !== choices.length ||
      roles.slice(0, 2).some(role => !choices.some(row => row.role === role)) ||
      choices.some(row => !roles.includes(row.role))) throw new Error('Informe a equipe mínima compatível.');
  const selected = choices.map(choice => {
    const member = rowById(context, 'equipe_plantao', choice.id);
    const professional = rowById(context, 'profissionais', member?.profissional_id);
    const role = normalized(member?.funcao);
    const validRole = choice.role === 'driver' ? role.includes('CONDUTOR') :
      choice.role === 'nurse' ? role.includes('ENFERM') :
      choice.role === 'tech' ? role.includes('TECN') || role.includes('ENFERM') : role.includes('MEDIC');
    if (!member || !professional?.ativo || member.status !== 'ATIVO' ||
        member.plantao_id !== occurrence.plantao_id || !validRole ||
        busyElsewhere(context, member.profissional_id, occurrence.id, occurrence.plantao_id)) throw new Error('Profissional indisponível.');
    const base = rowById(context, 'bases', vehicle.base_id);
    const central = normalized(base?.nome) === 'ANAPOLIS';
    if (member.viatura_id && member.viatura_id !== vehicle.id) {
      const origin = rowById(context, 'viaturas', member.viatura_id);
      if (origin?.base_id !== vehicle.base_id) throw new Error('Profissional fixo em outra base.');
    } else if (!member.viatura_id && !central) throw new Error('A base usa equipe vinculada à própria base.');
    const rotating = !member.viatura_id &&
      (normalized(member.tipo_escala).includes('REVEZ') || member.grupo_revezamento);
    const group = normalized(member.grupo_revezamento);
    if (rotating && (!central || (choice.role === 'driver' &&
        ![type, 'BOTH'].some(scope => normalized(member.revezamento_tipo_viatura || group).includes(scope))) ||
        (choice.role === 'nurse' && !group.includes('USA')) || (choice.role === 'tech' && !group.includes('USB')))) {
      throw new Error('Profissional fora do revezamento desta unidade.');
    }
    return {choice, member, professional};
  });
  const ids = selected.map(({member}) => member.profissional_id);
  for (const link of old) {
    const preserveAdhocDoctor = link.tipo_escala_no_momento === 'AVULSO_ACIONAMENTO' &&
      normalized(link.funcao).includes('MEDIC') && !choices.some(row => row.role === 'doctor');
    if (!ids.includes(link.profissional_id) && !preserveAdhocDoctor) {
      await checked(context.from('equipe_ocorrencia').delete().eq('id', link.id));
    }
  }
  for (const {choice, member, professional} of selected) {
    const previous = old.find(row => row.profissional_id === member.profissional_id);
    const role = choice.role === 'driver' ? 'Condutor' : choice.role === 'nurse' ? 'Enfermeiro' :
      choice.role === 'tech' ? (normalized(member.funcao).includes('TECN') ? 'Técnico de Enfermagem' : 'Enfermeiro') : 'Médico';
    const values = {funcao: role, nome_snapshot: member.nome_snapshot || professional.nome_completo};
    if (previous) await checked(context.from('equipe_ocorrencia').update(values).eq('id', previous.id));
    else await checked(context.from('equipe_ocorrencia').insert({
      ...values, ocorrencia_id: occurrence.id, profissional_id: member.profissional_id,
      viatura_id: vehicle.id, viatura_snapshot: vehicle.nome, tipo_escala_no_momento: member.tipo_escala
    }));
  }
  return choices.length;
}

const handlers = {
  garantir_livro_parte_diaria: guaranteeBook,
  corrigir_retorno_ocorrencia: undoReturn,
  definir_prioridade_manual_revezamento: manualPriority,
  converter_fixos_para_revezamento: convertFixed,
  corrigir_equipe_ocorrencia: correctCrew
};

export async function runLocalRpc(name, params, context) {
  const handler = handlers[name];
  if (!handler) throw new Error('Operação ainda não preparada para uso local: ' + name);
  return handler(params, context);
}
