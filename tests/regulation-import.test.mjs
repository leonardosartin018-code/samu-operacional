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
