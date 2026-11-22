import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const names=readFileSync(new URL('../names-review.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('conferência de 370 cadastros não exige classificação por função',()=>{
  assert.match(names,/Nome de guerra — aparece nos cards/);
  assert.match(names,/Mostrar somente não conferidos/);
  assert.match(names,/Bombeiros militares/);
  assert.doesNotMatch(names,/roleSelect/);
  assert.doesNotMatch(names,/\[data-role\]/);
});

test('salvar nome confirmado não envia função nova nem limpa múltiplas funções',()=>{
  const save=names.slice(names.indexOf('const changes=[...dirty]'));
  assert.match(save,/expected_funcao:p.funcao_sistema/);
  assert.doesNotMatch(save,/item\.funcoes_habilitadas/);
  assert.doesNotMatch(save,/item\.funcao_sistema/);
});

test('cards usam o nome corrigido mesmo com relação antiga da escala',()=>{
  const begin=app.indexOf('function displayName(p){');
  const end=app.indexOf('function professionalRoleKey(',begin);
  assert.ok(begin>=0 && end>begin);
  const source=app.slice(begin,end);
  const live=[{id:'id1',nome_de_guerra:'SARTIN',nome_exibicao:'SARTIN',
    nome_completo:'NOME COMPLETO FICTÍCIO'}];
  const display=new Function('professionals','firstTwoNames',
    source+';return displayName;')(live,name=>String(name).split(' ').slice(0,2).join(' '));
  assert.equal(display({id:'id1',nome_de_guerra:'LEONARDO',nome_exibicao:'LEONARDO'}),'SARTIN');
  assert.equal(display(live[0]),'SARTIN');
});

test('nome de referência da escala prioriza profissional confirmado',()=>{
  const start=app.indexOf('function findProfessionalByReference(name){');
  const end=app.indexOf('async function ensurePlantaoForBook(',start);
  assert.ok(start>=0&&end>start);
  const source=app.slice(start,end);
  const people=[{id:'p1',nome_completo:'PESSOA FICTÍCIA',
    nome_de_guerra:'SARTIN',nome_exibicao:'SARTIN',nomes_anteriores:['LEONARDO']}];
  const find=new Function('professionals','norm','displayName',
    source+';return fixedReferenceName;')(people,
      v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),
      p=>p.nome_exibicao||p.nome_de_guerra);
  assert.equal(find({profissional_id:'p1',nome_referencia:'LEONARDO'}),'SARTIN');
  assert.equal(find({profissional_id:null,nome_referencia:'LEONARDO'}),'SARTIN');
  assert.equal(find({profissional_id:null,nome_referencia:'NÃO VINCULADO'}),'NÃO VINCULADO');
});
