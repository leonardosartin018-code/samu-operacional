import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const from=app.indexOf('function activeShiftHandoffPreview(){');
const to=app.indexOf('\nfunction shiftClosingPending()',from);
assert.ok(from>0&&to>from,'O componente de repasse deve existir no acionamento');
const body=app.slice(from,to);
const htmlSafe=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function preview(ocorrences,members=[]) {
  const fn=new Function('activeHandoffOccurrences','occurrenceMembers','vehicleById','displayName','fmtTime','norm','esc',
    body+'\nreturn activeShiftHandoffPreview;');
  return fn(()=>ocorrences.filter(o=>['EM OCORRENCIA','RETORNANDO'].includes(o.status)),()=>members,()=>({nome:'USB 01'}),m=>m?.nome_completo||'',
    x=>x?'17:00':'—',s=>String(s||'').toUpperCase(),htmlSafe)();
}
test('exibe a equipe efetivamente empenhada sem assumir dobra no próximo plantão',()=>{
  const html=preview([{id:'o1',viatura_id:'v1',numero:'73',status:'EM OCORRENCIA',
    natureza:'TESTE',acionada_em:'2026-11-15T20:00:00Z'}],
    [{nome_snapshot:'CONDUTOR EXEMPLO',funcao:'CONDUTOR'},{nome_snapshot:'TÉCNICA EXEMPLO',funcao:'TÉCNICO'}]);
  assert.match(html,/CONDUTOR EXEMPLO/);
  assert.match(html,/TÉCNICA EXEMPLO/);
  assert.match(html,/data-handoff-occurrence="o1"/);
  assert.match(html,/name="shiftHandoffMode" value="clean" checked/);
  assert.match(html,/data-handoff-list hidden/);
});
test('não polui a janela quando não há equipes empenhadas',()=>{
  assert.doesNotMatch(preview([]),/data-handoff-occurrence=/);
  assert.doesNotMatch(preview([]),/data-handoff-list/);
});
test('não inclui ocorrências finalizadas ou QTA no repasse',()=>{
  const html=preview([{id:'a',status:'QTA',numero:'1'},{id:'b',status:'FINALIZADA',numero:'2'}]);
  assert.doesNotMatch(html,/data-handoff-occurrence=/);
});
test('escapa textos externos antes de colocar no HTML',()=>{
  const html=preview([{id:'o1',status:'RETORNANDO',numero:'<script>',natureza:'<b>falso</b>'}]);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<b>falso<\/b>/);
});
