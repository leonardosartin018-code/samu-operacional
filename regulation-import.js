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
  const i = lines.findIndex(line => {
    const s = fold(line);
    return s.includes('historico') && s.includes('medico regulador') && s.includes('data/hora');
  });
  if (i < 0) return null;
  let end = lines.findIndex((line, j) => j > i && fold(line).includes('localizacao da ocorrencia'));
  if (end < 0) end = lines.length;
  const rows = lines.slice(i + 1, end).filter(Boolean);
  if (!rows.length) return null;
  const first = rows[0].split(/\t+/).map(x => x.trim()).filter(Boolean);
  let cols = first.length >= 3 ? first : [];
  if (!cols.length && rows.length === 1) {
    const spaced = rows[0].split(/ {2,}/).map(x => x.trim()).filter(Boolean);
    if (spaced.length >= 3) cols = spaced;
  }
  if (cols.length >= 3 && CLINICAL_DATE.test(cols[cols.length - 1])) {
    return {
      historico: cols.slice(0, -2).join(' ').trim(),
      medicoRegulador: cols[cols.length - 2],
      dataHoraAvaliacao: cols[cols.length - 1].match(CLINICAL_DATE)[0]
    };
  }
  if (rows.length >= 3 && CLINICAL_DATE.test(rows[rows.length - 1])) {
    return {
      historico: rows.slice(0, -2).join('\n'),
      medicoRegulador: rows[rows.length - 2],
      dataHoraAvaliacao: rows[rows.length - 1].match(CLINICAL_DATE)[0]
    };
  }
  return {ambiguous: true};
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
  if (table?.ambiguous) {
    warnings.push('A linha do histórico e médico não ficou separada na cópia. Preencha esses campos manualmente.');
  } else if (table) {
    for (const key of ['historico', 'medicoRegulador', 'dataHoraAvaliacao']) {
      if (table[key]) data[key] = table[key];
    }
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
