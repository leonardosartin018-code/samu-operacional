import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../samu-report-structure.js',import.meta.url),'utf8');
const {buildSamuCompleteReport}=
  await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const m1={
  profissional_id:'a',viatura_id:'v1',viatura_snapshot:'USB 01',nome_snapshot:'PROFISSIONAL FIXO',
  funcao:'CONDUTOR',tipo_escala:'FIXO',status:'ATIVO',viaturas:{nome:'USB 01',bases:{nome:'Anápolis'}}
};
const m2={
  profissional_id:'b',viatura_id:null,grupo_revezamento:'REVEZ_USB',nome_snapshot:'PROFISSIONAL REVEZAMENTO',
  funcao:'TÉCNICO',tipo_escala:'REVEZ_USB',status:'ATIVO'
};
const m3={
  profissional_id:'c',viatura_id:'v2',viatura_snapshot:'USB 02',nome_snapshot:'PROFISSIONAL PERMUTA',
  nome_titular_escala:'PROFISSIONAL TITULAR',tipo_alteracao_escala:'PERMUTA',funcao:'CONDUTOR',
  tipo_escala:'FIXO',status:'ATIVO',viaturas:{nome:'USB 02',bases:{nome:'Abadiânia'}}
};
const occ={
  id:'o1',numero:'73',viatura_id:'v1',viatura_snapshot:'USB 01',base_snapshot:'Anápolis',
  natureza:'CLÍNICO',status:'FINALIZADA',bairro:'CENTRO',
  endereco:'RUA TESTE',destino:'UPA',observacao:'RELATO DE TESTE',
  qth_nao_informado:true,acionada_em:'2026-11-15T12:00:00Z',saida_em:'2026-11-15T12:01:00Z'
};
const occ2={...occ,id:'o2',numero:'74',status:'RETORNANDO',destino:'HOSPITAL MUNICIPAL'};
const record={events:[occ,occ2],internal:[{status:'ATIVO',codigo_posicao:'RADIO-01',
  funcao:'RÁDIO',nome_snapshot:'PROFISSIONAL RÁDIO'}]};
const model={
  record,activeMembers:[m3,m2,m1],completed:[occ],
  perVehicle:new Map([
    ['v1',{base:'Anápolis',name:'USB 01',state:'Ocorrência',events:[occ]}],
    ['v2',{base:'Abadiânia',name:'USB 02',state:'QRV / Base',events:[]}]
  ]),
  perPerson:new Map([['a',{name:'PROFISSIONAL FIXO',role:'CONDUTOR',base:'Anápolis',
    events:new Map([['o1',occ]])}]]),
  memberName:m=>m.nome_snapshot,memberBase:m=>m.viaturas?.bases?.nome||'Anápolis',
  occurrenceBase:o=>o.base_snapshot,crew:o=>'PROFISSIONAL FIXO / PROFISSIONAL REVEZAMENTO',
  numbers:list=>list.map(o=>o.numero).join(', ')||'—',
  clock:value=>value?'12:01':'—',qth:o=>o.qth_nao_informado?'NÃO INFORMADO':'—',
  toQth:()=>null,total:()=>18,averageQth:'Não calculável',averageReturn:'12min'
};

test('a escala é a primeira parte, antes das situações e ocorrências',()=>{
  const result=buildSamuCompleteReport(model,v=>v||'NÃO INFORMADO');
  const headings=result.sections.map(x=>x.title);
  assert.ok(headings[0].startsWith('01'));
  assert.ok(headings[1].startsWith('01'));
  assert.ok(headings.indexOf(headings.find(x=>x.startsWith('02'))) > headings.lastIndexOf('01 — EQUIPES EFETIVAMENTE EMPENHADAS NO PLANTÃO'));
  assert.ok(headings.indexOf(headings.find(x=>x.startsWith('03'))) > headings.indexOf(headings.find(x=>x.startsWith('02'))));
});

test('inclui todos os profissionais ativos, fixos, revezamento e permuta',()=>{
  const {sections}=buildSamuCompleteReport(model,v=>v||'NÃO INFORMADO');
  const scale=sections.slice(0,2).flatMap(s=>s.rows);
  assert.equal(scale.length,3);
  assert.ok(scale.some(r=>r[2]==='PROFISSIONAL FIXO'&&r[4]==='FIXO'));
  assert.ok(scale.some(r=>r[2]==='PROFISSIONAL REVEZAMENTO'&&r[4]==='REVEZAMENTO'));
  assert.ok(scale.some(r=>r[2]==='PROFISSIONAL PERMUTA'&&r[4].includes('PERMUTA')));
});

test('registra viaturas e status sem confundir fotografia atual com histórico',()=>{
  const {sections}=buildSamuCompleteReport(model,v=>v);
  const rows=sections.filter(s=>s.title.startsWith('02')).flatMap(s=>s.rows);
  assert.equal(rows.length,2);
  assert.ok(rows.some(r=>r[1]==='USB 01'&&r[2]==='Ocorrência'));
  assert.ok(rows.some(r=>r[1]==='USB 02'&&r[2]==='QRV / Base'));
});

test('preserva ocorrências finalizadas, em retorno e destino da vítima',()=>{
  const {sections,counts}=buildSamuCompleteReport(model,v=>v||'NÃO INFORMADO');
  const occRows=sections.filter(s=>s.title.startsWith('03')&&!s.title.includes('ENDEREÇOS')).flatMap(s=>s.rows);
  assert.equal(occRows.length,2);
  assert.ok(occRows.some(r=>r[0]==='74'&&r[5]==='HOSPITAL MUNICIPAL'));
  assert.equal(counts.total,2);
  assert.equal(counts.finalizadas,1);
  assert.equal(counts.andamento,1);
});

test('tempos sem QTH continuam não informados, sem cálculo presumido',()=>{
  const {sections}=buildSamuCompleteReport(model,v=>v);
  const rows=sections.find(s=>s.title.startsWith('04')).rows;
  assert.equal(rows[0][3],'NÃO INFORMADO');
  assert.equal(rows[0][4],'Não informado');
});

test('mantém observações em seção separada, sem criar tabela horizontal gigante',()=>{
  const {sections}=buildSamuCompleteReport(model,v=>v);
  const section=sections.find(s=>s.title.includes('ENDEREÇOS E RELATOS'));
  assert.ok(section.rows.some(r=>r[3]==='RELATO DE TESTE'));
});
