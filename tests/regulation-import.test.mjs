/*
 * Executar: node --test tests/regulation-import.test.mjs
 * Dados fictícios para não colocar registros reais de pacientes no repositório.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const content = readFileSync(new URL('../regulation-import.js', import.meta.url), 'utf8');
const {parseRegulationClipboard, formatImportedAddress, formatImportedObservation} =
  await import('data:text/javascript;base64,' + Buffer.from(content).toString('base64'));

const pasted = [
  'Avaliação Médica',
  'Paciente',
  'PACIENTE EXEMPLO',
  'Idade',
  '42',
  'Sexo',
  'Feminino',
  'Histórico\tMédico Regulador\tData/Hora',
  'AVALIAÇÃO CLÍNICA DE TESTE.\tDRA PROFISSIONAL EXEMPLO\t15/11/2026 15:49:44',
  'Localização da Ocorrência',
  'Município',
  '',
  'ANAPOLIS',
  'Logradouro *',
  'RUA EXEMPLO',
  'Complemento',
  'Q8 L8',
  'Bairro *',
  'CENTRO',
  'Ponto de Referência *',
  'PROX UNIDADE DE SAÚDE'
].join('\n');

test('extrai todos os campos de uma cópia com tabela tabulada', () => {
  const result = parseRegulationClipboard(pasted);
  assert.equal(result.valid, true);
  assert.equal(result.data.paciente, 'PACIENTE EXEMPLO');
  assert.equal(result.data.idade, '42');
  assert.equal(result.data.sexo, 'Feminino');
  assert.equal(result.data.historico, 'AVALIAÇÃO CLÍNICA DE TESTE.');
  assert.equal(result.data.medicoRegulador, 'DRA PROFISSIONAL EXEMPLO');
  assert.equal(result.data.dataHoraAvaliacao, '15/11/2026 15:49:44');
  assert.equal(result.data.bairro, 'CENTRO');
  assert.equal(result.data.logradouro, 'RUA EXEMPLO');
  assert.equal(result.data.referencia, 'PROX UNIDADE DE SAÚDE');
});

test('preserva dois históricos tabulados, médicos e horários, sem importar controles de cancelamento', () => {
  const copied = pasted.replace(
    'AVALIAÇÃO CLÍNICA DE TESTE.\tDRA PROFISSIONAL EXEMPLO\t15/11/2026 15:49:44',
    'ENCAMINHAMENTO PARA UNIDADE.\tDRA PRIMEIRA EXEMPLO\t15/11/2026 17:52:18\n' +
    'PACIENTE APRESENTA SINAIS CLÍNICOS E FEBRE.\tDR SEGUNDO EXEMPLO\t15/11/2026 17:22:49\n' +
    'Motivo Cancelamento\nSelecione um motivo\nNova Ocorrência a ser Atendida\nSelecione uma ocorrência'
  );
  const result = parseRegulationClipboard(copied);
  assert.equal(result.valid, true);
  assert.equal(result.data.historico,
    '1. ENCAMINHAMENTO PARA UNIDADE.\n2. PACIENTE APRESENTA SINAIS CLÍNICOS E FEBRE.');
  assert.equal(result.data.medicoRegulador,
    '1. DRA PRIMEIRA EXEMPLO\n2. DR SEGUNDO EXEMPLO');
  assert.equal(result.data.dataHoraAvaliacao,
    '1. 15/11/2026 17:52:18\n2. 15/11/2026 17:22:49');
  assert.ok(!result.data.historico.includes('Motivo Cancelamento'));
  assert.ok(!result.data.historico.includes('Selecione um motivo'));
  const savedText = formatImportedObservation(result.data, 'NOTA DO OPERADOR');
  assert.match(savedText, /PACIENTE APRESENTA SINAIS CLÍNICOS E FEBRE/);
  assert.match(savedText, /DR SEGUNDO EXEMPLO/);
  assert.match(savedText, /15\/11\/2026 17:22:49/);
  assert.match(savedText, /OBSERVAÇÃO OPERACIONAL\nNOTA DO OPERADOR/);
});

test('captura três históricos tabulados sem descartar registros intermediários', () => {
  const copied = pasted.replace(
    'AVALIAÇÃO CLÍNICA DE TESTE.\tDRA PROFISSIONAL EXEMPLO\t15/11/2026 15:49:44',
    'PRIMEIRA EVOLUÇÃO.\tDRA A\t15/11/2026 12:30:00\n' +
    'SEGUNDA EVOLUÇÃO.\tDR B\t15/11/2026 13:30:00\n' +
    'TERCEIRA EVOLUÇÃO.\tDR C\t15/11/2026 14:30:00'
  );
  const data = parseRegulationClipboard(copied).data;
  assert.equal(data.historico.split('\n').length, 3);
  assert.ok(data.historico.includes('2. SEGUNDA EVOLUÇÃO.'));
  assert.ok(data.medicoRegulador.includes('3. DR C'));
  assert.ok(data.dataHoraAvaliacao.includes('3. 15/11/2026 14:30:00'));
});

test('aceita históricos médicos em linhas individuais e cabeçalho separado', () => {
  const copied = pasted.replace(
    'Histórico\tMédico Regulador\tData/Hora\nAVALIAÇÃO CLÍNICA DE TESTE.\tDRA PROFISSIONAL EXEMPLO\t15/11/2026 15:49:44',
    'Histórico\nMédico Regulador\nData/Hora\n' +
    'EVOLUÇÃO INICIAL.\nDRA PRIMEIRA\n15/11/2026 10:00:00\n' +
    'EVOLUÇÃO POSTERIOR.\nDR SEGUNDO\n15/11/2026 11:00:00'
  );
  const result = parseRegulationClipboard(copied);
  assert.equal(result.valid, true);
  assert.equal(result.data.historico, '1. EVOLUÇÃO INICIAL.\n2. EVOLUÇÃO POSTERIOR.');
  assert.equal(result.data.medicoRegulador, '1. DRA PRIMEIRA\n2. DR SEGUNDO');
});

test('aceita avaliações com colunas separadas por múltiplos espaços', () => {
  const copied = pasted.replace(
    'AVALIAÇÃO CLÍNICA DE TESTE.\tDRA PROFISSIONAL EXEMPLO\t15/11/2026 15:49:44',
    'RELATO A.   DRA A   15/11/2026 10:00:00\nRELATO B.   DR B   15/11/2026 11:00:00'
  );
  const data = parseRegulationClipboard(copied).data;
  assert.equal(data.historico, '1. RELATO A.\n2. RELATO B.');
});

test('aceita rótulo Observação vazio sem gravar texto inventado', () => {
  assert.equal(parseRegulationClipboard(pasted + '\nObservação').data.observacaoOrigem, '');
});

test('copia a observação inteira quando há texto após o rótulo', () => {
  const result = parseRegulationClipboard(pasted + '\nObservação\nOBSERVAR ACESSO.\nPORTÃO LATERAL.');
  assert.equal(result.data.observacaoOrigem, 'OBSERVAR ACESSO.\nPORTÃO LATERAL.');
});

test('aceita formato com rótulos e valores em linhas separadas', () => {
  const value = 'Paciente:\nTESTE\nBairro:\nCENTRO\nLogradouro:\nRUA A\nHistórico:\nRELATO\nMédico Regulador:\nMEDICO A';
  const result = parseRegulationClipboard(value);
  assert.equal(result.valid, true);
  assert.equal(result.data.historico, 'RELATO');
  assert.equal(result.data.medicoRegulador, 'MEDICO A');
});

test('não inventa médico regulador em uma linha médica ambígua', () => {
  const value = pasted.replace('AVALIAÇÃO CLÍNICA DE TESTE.\tDRA PROFISSIONAL EXEMPLO\t',
    'AVALIAÇÃO CLÍNICA DE TESTE. DRA PROFISSIONAL EXEMPLO ');
  const result = parseRegulationClipboard(value);
  assert.equal(result.data.medicoRegulador, '');
  assert.ok(result.warnings.some(warning => warning.includes('manualmente')));
});

test('monta endereço sem transformar endereço em destino da vítima', () => {
  const data = parseRegulationClipboard(pasted).data;
  assert.equal(formatImportedAddress(data), 'RUA EXEMPLO • Q8 L8 • Referência: PROX UNIDADE DE SAÚDE');
});

test('preserva notas manuais como bloco distinto dos dados clínicos', () => {
  const data = parseRegulationClipboard(pasted).data;
  const text = formatImportedObservation(data, 'OBSERVAÇÃO DO RÁDIO');
  assert.match(text, /Médico regulador: DRA PROFISSIONAL EXEMPLO/);
  assert.match(text, /Data\/hora da avaliação médica: 15\/11\/2026 15:49:44/);
  assert.match(text, /OBSERVAÇÃO OPERACIONAL\nOBSERVAÇÃO DO RÁDIO/);
});

test('rejeita colagens não reconhecidas e textos exagerados', () => {
  assert.equal(parseRegulationClipboard('qualquer mensagem').valid, false);
  assert.equal(parseRegulationClipboard('X'.repeat(20001)).valid, false);
});
