/*
 * Leitor local do texto copiado do sistema de regulação.
 * Não envia informações clínicas a serviços externos.
 */
const FIELDS = {
  paciente: 'paciente',
  idade: 'idade',
  sexo: 'sexo',
  municipio: 'municipio',
  logradouro: 'logradouro',
  complemento: 'complemento',
  bairro: 'bairro',
  'ponto de referencia': 'referencia',
  observacao: 'observacaoOrigem',
  historico: 'historico',
  'medico regulador': 'medicoRegulador',
  'data/hora': 'dataHoraAvaliacao'
};
const CLINICAL_DATE = /\b\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?\b/;
const TRACKED_KEYS = [
  'paciente', 'idade', 'sexo', 'historico', 'medicoRegulador',
  'dataHoraAvaliacao', 'municipio', 'logradouro',
  'complemento', 'bairro', 'referencia', 'observacaoOrigem'
];
const INITIAL_DATA = () => Object.fromEntries(TRACKED_KEYS.map(key => [key, '']));

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function fieldOnLine(line) {
  const clean = line.trim().replace(/\s*\*+\s*$/, '');
  const colon = clean.indexOf(':');
  const label = (colon < 0 ? clean : clean.slice(0, colon)).replace(/\s*\*+\s*$/, '').trim();
  const key = FIELDS[fold(label).replace(/\s+/g, ' ')];
  if (!key) return null;
  return {key, inline: colon < 0 ? '' : clean.slice(colon + 1).trim()};
}
function parseMedicalTable(lines) {
  const i = lines.findIndex((line, index) => {
    const value = fold(line).replace(/\s+/g, ' ').trim();
    return (value.includes('historico') && value.includes('medico regulador') && value.includes('data/hora')) ||
      (value === 'historico' &&
        fold(lines[index + 1]).trim() === 'medico regulador' &&
        fold(lines[index + 2]).trim() === 'data/hora');
  });
  if (i < 0) return null;
  const separateHeader = fold(lines[i]).trim() === 'historico';
  const start = i + (separateHeader ? 3 : 1);
  // Algumas telas adicionam os controles de cancelamento/redirect entre
  // a avaliação médica e o endereço. Esses controles não são históricos.
  const stop = lines.findIndex((line, j) => j >= start &&
    /^(?:localizacao da ocorrencia|motivo cancelamento|nova ocorrencia a ser atendida|observacao)$/.test(
      fold(line).replace(/\s+/g, ' ').trim()));
  const rawRows = lines.slice(start, stop < 0 ? lines.length : stop);
  if (!rawRows.length) return {entries: [], ambiguous: true};

  const entries = [];
  const pending = [];
  let ambiguous = false;
  const insertEntry = (historico, medicoRegulador, dataHoraAvaliacao) => {
    const date = String(dataHoraAvaliacao || '').match(CLINICAL_DATE)?.[0];
    if (!historico?.trim() || !medicoRegulador?.trim() || !date) return false;
    entries.push({
      historico: historico.trim(),
      medicoRegulador: medicoRegulador.trim(),
      dataHoraAvaliacao: date
    });
    return true;
  };

  for (const line of rawRows) {
    // O navegador normalmente copia a tabela HTML em três colunas, por TAB.
    const tabular = line.split(/\t+/).map(value => value.trim()).filter(Boolean);
    // Alguns sistemas usam múltiplos espaços em vez de TAB.
    const spaced = tabular.length >= 3 ? tabular :
      line.split(/ {2,}/).map(value => value.trim()).filter(Boolean);
    if (spaced.length >= 3 && CLINICAL_DATE.test(spaced[spaced.length - 1])) {
      if (pending.length) {
        // Preserva linhas anteriores no diagnóstico de conteúdo ambíguo.
        ambiguous = true;
        pending.length = 0;
      }
      if (!insertEntry(spaced.slice(0, -2).join(' '),
        spaced[spaced.length - 2], spaced[spaced.length - 1])) ambiguous = true;
      continue;
    }

    // Também aceita a cópia de células em linhas sucessivas:
    // histórico / médico / data, repetidas N vezes.
    const isolatedDate = line.match(CLINICAL_DATE)?.[0];
    if (isolatedDate && line.replace(isolatedDate, '').trim() === '') {
      if (pending.length >= 2) {
        const medico = pending.pop();
        if (!insertEntry(pending.join(' '), medico, isolatedDate)) ambiguous = true;
      } else ambiguous = true;
      pending.length = 0;
      continue;
    }
    pending.push(line);
  }
  if (pending.length) ambiguous = true;
  return {entries, ambiguous};
}

function formatClinicalValues(entries, key) {
  if (!entries.length) return '';
  if (entries.length === 1) return entries[0][key];
  return entries.map((entry, index) => (index + 1) + '. ' + entry[key]).join('\n');
}

export function parseRegulationClipboard(input) {
  const original = String(input || '');
  const data = INITIAL_DATA();
  const warnings = [];
  if (original.length > 20000) {
    return {valid: false, data, recognized: 0, warnings: ['Texto maior que 20 mil caracteres. Selecione apenas a ocorrência.']};
  }
  const lines = original.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
    .split('\n').map(line => line.trim()).filter(Boolean);
  if (!lines.length) return {valid: false, data, recognized: 0, warnings: []};

  for (let i = 0; i < lines.length; i++) {
    const matched = fieldOnLine(lines[i]);
    if (!matched) continue;
    const {key, inline} = matched;
    if (key === 'observacaoOrigem') {
      const rest = [inline, ...lines.slice(i + 1)].filter(Boolean);
      data[key] = rest.join('\n');
      break;
    }
    const next = lines[i + 1];
    const value = inline || ((next && !fieldOnLine(next)
      && !/^(?:localiza[cç][aã]o da ocorr[eê]ncia|avalia[cç][aã]o m[eé]dica)$/i.test(next))
      ? next : '');
    if (value) data[key] = value;
  }

  const table = parseMedicalTable(lines);
  if (table?.entries?.length) {
    // Nunca utilizar apenas a primeira linha: cada avaliação é preservada
    // na mesma posição em histórico, médico e data/hora (1, 2, 3...).
    for (const key of ['historico', 'medicoRegulador', 'dataHoraAvaliacao']) {
      data[key] = formatClinicalValues(table.entries, key);
    }
    if (table.ambiguous) {
      warnings.push('Algumas linhas da avaliação médica não puderam ser separadas. Confira a cópia original e ajuste manualmente.');
    }
  } else if (table?.ambiguous) {
    warnings.push('A linha do histórico e médico não ficou separada na cópia. Preencha esses campos manualmente.');
  }

  const recognized = TRACKED_KEYS.filter(key => data[key].trim()).length;
  if (!data.logradouro && !data.bairro) warnings.push('Endereço e bairro não identificados. Confira antes de acionar.');
  if (!data.historico) warnings.push('Histórico médico não identificado.');
  if (!data.medicoRegulador) warnings.push('Médico regulador não identificado.');
  if (!data.paciente) warnings.push('Paciente não identificado.');
  return {
    valid: recognized >= 3 && !!(data.logradouro || data.bairro || data.historico),
    recognized, data, warnings
  };
}

export function formatImportedAddress(data) {
  return [
    data.logradouro,
    data.complemento,
    data.referencia ? 'Referência: ' + data.referencia : ''
  ].map(x => String(x || '').trim()).filter(Boolean).join(' • ');
}

export function formatImportedObservation(data, manual = '') {
  const rows = [
    ['Paciente', data.paciente], ['Idade', data.idade], ['Sexo', data.sexo],
    ['Histórico médico', data.historico], ['Médico regulador', data.medicoRegulador],
    ['Data/hora da avaliação médica', data.dataHoraAvaliacao],
    ['Município', data.municipio], ['Logradouro', data.logradouro],
    ['Complemento', data.complemento], ['Ponto de referência', data.referencia],
    ['Observação da regulação', data.observacaoOrigem]
  ].filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => label + ': ' + String(value).trim());
  const blocks = [];
  if (rows.length) blocks.push('DADOS IMPORTADOS DA REGULAÇÃO\n' + rows.join('\n'));
  if (String(manual || '').trim()) blocks.push('OBSERVAÇÃO OPERACIONAL\n' + String(manual).trim());
  return blocks.join('\n\n');
}
