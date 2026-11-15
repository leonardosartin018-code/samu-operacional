/*
 * Estrutura legível do relatório completo, independente do renderizador PDF.
 * Ordem: pessoas escaladas -> situação das viaturas -> atendimentos -> tempos
 * -> produtividade -> equipe interna. Sem dados fictícios.
 */
const comparePt = (a,b) => String(a || '').localeCompare(String(b || ''),'pt-BR',{numeric:true,sensitivity:'base'});
const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
const empty = value => String(value ?? '').trim() || '—';
const baseIsAnapolis = name => normalized(name).includes('ANAPOLIS');
const isOpen = status => ['EM OCORRENCIA','RETORNANDO'].includes(normalized(status));
const readableStatus = status => ({
  'EM OCORRENCIA':'EM OCORRÊNCIA',
  'RETORNANDO':'RETORNANDO',
  'FINALIZADA':'FINALIZADA',
  'CANCELADA':'CANCELADA',
  'QTA':'QTA'
})[normalized(status)] || empty(status);

function assignment(m) {
  const change = normalized(m.tipo_alteracao_escala || m.tipo_alteracao);
  if (change === 'PERMUTA') {
    const titular = m.nome_titular_escala || m.titular_nome_snapshot;
    return titular ? 'PERMUTA (titular: ' + titular + ')' : 'PERMUTA';
  }
  const kind = normalized(m.tipo_escala);
  if (kind === 'FIXO') return 'FIXO';
  if (kind.includes('REVEZ')) return 'REVEZAMENTO';
  return kind || (m.grupo_revezamento ? 'REVEZAMENTO' : 'ESCALADO');
}

function vehicleOrQueue(m) {
  if (m.viatura_id) return empty(m.viatura_snapshot || m.viaturas?.nome || m.viatura_nome);
  if (m.grupo_revezamento) return 'FILA ' + normalized(m.grupo_revezamento).replace(/_/g,' ');
  return empty(m.viatura_snapshot || m.viaturas?.nome || 'SEM VIATURA / APOIO');
}

export function buildSamuCompleteReport(model, displayDestination) {
  const {record, activeMembers, completed, perVehicle, perPerson,
    memberName,memberBase,occurrenceBase,crew,numbers,clock,qth,toQth,total,
    averageQth,averageReturn} = model;
  const events = [...record.events].sort((a,b) =>
    String(a.acionada_em||a.criado_em||'').localeCompare(String(b.acionada_em||b.criado_em||'')));
  const fleet = [...perVehicle.values()].sort((a,b)=>
    (baseIsAnapolis(a.base)?0:1)-(baseIsAnapolis(b.base)?0:1)||
    comparePt(a.base,b.base)||comparePt(a.name,b.name));
  const team = [...activeMembers].sort((a,b)=>
    (baseIsAnapolis(memberBase(a))?0:1)-(baseIsAnapolis(memberBase(b))?0:1)||
    comparePt(memberBase(a),memberBase(b))||
    comparePt(vehicleOrQueue(a),vehicleOrQueue(b))||
    comparePt(a.funcao,b.funcao)||comparePt(memberName(a),memberName(b)));
  const sections=[];
  const add=(title,headers,rows)=>sections.push({title,headers,rows});

  // 1. Abrir com os NOMES ESCALADOS, não com estatísticas nem tabela de ocorrências.
  for (const [title, filter] of [
    ['01 — EQUIPE OPERACIONAL ESCALADA • ANÁPOLIS',m=>baseIsAnapolis(memberBase(m))],
    ['01 — EQUIPE OPERACIONAL ESCALADA • BASES DESCENTRALIZADAS',m=>!baseIsAnapolis(memberBase(m))]
  ]) {
    add(title,['Base','Viatura / fila','Profissional','Função','Vínculo'],
      team.filter(filter).map(m=>[
        empty(memberBase(m)),vehicleOrQueue(m),memberName(m),empty(m.funcao),assignment(m)
      ]));
  }
  const empenhadas = events.filter(o=>isOpen(o.status) && o.viatura_id);
  add('01 — EQUIPES EFETIVAMENTE EMPENHADAS NO PLANTÃO',
    ['Viatura','Nº ocorrência','Situação','Equipe do atendimento'],
    empenhadas.map(o=>[
      o.viatura_snapshot||o.viaturas?.nome||'—',o.numero||'Sem número',readableStatus(o.status),crew(o)
    ]));

  // 2. Situação é um retrato do instante da emissão, não histórico retroativo.
  for (const [title,filter] of [
    ['02 — SITUAÇÃO DAS VIATURAS • ANÁPOLIS',v=>baseIsAnapolis(v.base)],
    ['02 — SITUAÇÃO DAS VIATURAS • BASES DESCENTRALIZADAS',v=>!baseIsAnapolis(v.base)]
  ]) {
    add(title,['Base','Viatura','Situação na emissão','Finalizadas','Nº de ocorrências'],
      fleet.filter(filter).map(v=>[
        v.base,v.name,v.state,String(v.events.length),numbers(v.events)
      ]));
  }

  // 3. Um registro por atendimento, incluindo eventos em aberto e QTA.
  for (const [title,filter] of [
    ['03 — OCORRÊNCIAS • ANÁPOLIS',o=>baseIsAnapolis(occurrenceBase(o))],
    ['03 — OCORRÊNCIAS • BASES DESCENTRALIZADAS',o=>!baseIsAnapolis(occurrenceBase(o))]
  ]) {
    const scoped = events.filter(filter);
    add(title,['Nº','Viatura','Natureza','Situação','Bairro','Destino / resultado','Equipe empenhada'],
      scoped.map(o=>[
        o.numero||'—',o.viatura_snapshot||o.viaturas?.nome||'Sem viatura',
        empty(o.natureza),readableStatus(o.status),empty(o.bairro),
        displayDestination(o.destino),crew(o)
      ]));
    add(title+' • ENDEREÇOS E RELATOS',
      ['Nº','Viatura','Endereço / referência','Relato e observações'],
      scoped.map(o=>[
        o.numero||'—',o.viatura_snapshot||o.viaturas?.nome||'Sem viatura',
        empty([o.bairro,o.endereco].filter(Boolean).join(' • ')),empty(o.observacao)
      ]));
  }

  // 4. Tempos separados para manter largura de colunas legível no A4 paisagem.
  add('04 — TEMPOS DE DESLOCAMENTO E ATENDIMENTO',
    ['Ocorrência','Viatura','Saída','Chegada QTH','Até QTH','Início retorno','Chegada base','Tempo total'],
    events.map(o=>[
      o.numero||'—',o.viatura_snapshot||o.viaturas?.nome||'Sem viatura',
      clock(o.saida_em||o.acionada_em),qth(o),
      o.qth_nao_informado?'Não informado':emptyDuration(toQth(o)),
      clock(o.inicio_retorno_em),clock(o.retorno_base_em),emptyDuration(total(o))
    ]));

  // 5. Participação individual, sem contar QTA como atendimento finalizado.
  add('05 — PARTICIPAÇÃO POR PROFISSIONAL',
    ['Profissional','Função','Base / vínculo','Finalizadas','Ocorrências'],
    [...perPerson.values()].sort((a,b)=>comparePt(a.name,b.name)).map(p=>[
      p.name,empty(p.role),empty(p.base),String(p.events.size),numbers([...p.events.values()])
    ]));

  // 6. Rádio-operadores, TARM, lavadores e demais posições confirmadas.
  add('06 — SERVIÇO INTERNO',
    ['Posição','Função','Profissional','Alteração'],
    record.internal.filter(m=>normalized(m.status)==='ATIVO').map(m=>[
      empty(m.codigo_posicao),empty(m.funcao),memberName(m),empty(m.tipo_alteracao)
    ]));
  const counts = {
    total:events.length,
    finalizadas:completed.length,
    andamento:events.filter(o=>isOpen(o.status)).length,
    qta:events.filter(o=>normalized(o.status)==='QTA').length,
    canceladas:events.filter(o=>normalized(o.status)==='CANCELADA').length,
    escalados:new Set(activeMembers.map(m=>m.profissional_id||memberName(m))).size,
    viaturas:fleet.length,
    mediaQth:averageQth,
    mediaRetorno:averageReturn
  };
  return {sections,counts};
}
function emptyDuration(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const mins = Math.max(0,Math.round(n));
  return Math.floor(mins/60) + 'h ' + String(mins%60).padStart(2,'0') + 'min';
}
