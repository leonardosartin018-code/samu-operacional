import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const roleSource=readFileSync(new URL('../professional-functions.js',import.meta.url),'utf8');
const helpers=new Function(roleSource.replace(/export (const|function) /g,'$1 ')+
  ';return {hasProfessionalFunction};')();
const parserSource=readFileSync(new URL('../regional-whatsapp-import.js',import.meta.url),'utf8');
const {parseRegionalCrewClipboard,resolveRegionalCrewName,regionalCanFillRole,regionalSlotsForVehicle}=
  new Function('hasProfessionalFunction',
    parserSource.replace(/^import[^\n]*\n/gm,'').replace(/export (const|function) /g,'$1 ')+
      ';return {parseRegionalCrewClipboard,resolveRegionalCrewName,regionalCanFillRole,regionalSlotsForVehicle};'
  )(helpers.hasProfessionalFunction);
const person=(id,name,role,extra={})=>({
  id,ativo:true,nome_completo:name,nome_de_guerra:name.split(' ')[0],
  funcao_sistema:role,categoria_origem:'CADASTRO REGIONAL',...extra
});

test('copiar conversa de Alexânia reconhece condutor e técnica, inclusive acentos',()=>{
  const text='[22/11/2026, 07:20] Alexânia: Bom dia!\n[22/11/2026, 07:22] Alexânia: Condutor: Jamerilson\nTécnica: Raíssa';
  const out=parseRegionalCrewClipboard(text);
  assert.equal(out.error,null);
  assert.equal(out.base,'ALEXANIA');
  assert.deepEqual(out.members.map(m=>[m.key,m.name]),[
    ['driver','Jamerilson'],['tech','Raíssa']
  ]);
});

test('tabela compacta com USA, enfermeiro e médico em uma só linha',()=>{
  const out=parseRegionalCrewClipboard('Equipe USA\nCondutor - Gilmar / Enfermeira - Vanessa / Médico: Augusto');
  assert.equal(out.error,null);
  assert.deepEqual(out.members.map(m=>m.key),['driver','nurse','doctor']);
  assert.deepEqual(regionalSlotsForVehicle('USA'),['driver','nurse','doctor']);
});

test('aceita abreviações de profissão e WhatsApp com separadores',()=>{
  const out=parseRegionalCrewClipboard('COND: Teste; TÉC. Maria\nEnf.: Fulana\nDR: Beltrano');
  assert.deepEqual(out.members.map(m=>m.key),['driver','tech','nurse','doctor']);
});

test('não inventa pessoas quando há somente conversa, sem papel rotulado',()=>{
  const out=parseRegionalCrewClipboard('Alexânia: Boa noite equipe pronta. Até amanhã!');
  assert.ok(out.error);
  assert.equal(out.members.length,0);
});

test('não aceita texto maior que o limite ou nomes que parecem links',()=>{
  assert.match(parseRegionalCrewClipboard('x'.repeat(12001)).error,/extensa/i);
  assert.ok(parseRegionalCrewClipboard('Condutor: www.exemplo.com').warnings.length);
});

test('identifica duplicidade de função em várias mensagens',()=>{
  const out=parseRegionalCrewClipboard('Condutor: Exemplo Um\nCondutor: Exemplo Dois\nTécnica: Teste');
  assert.equal(out.members.length,3);
  assert.ok(out.warnings.some(w=>/mais de um Condutor/.test(w)));
});

test('profissional existente é reutilizado pelo nome completo ou nome de guerra',()=>{
  const list=[person('a','JAMERILSON SOUZA','Condutor',{nome_de_guerra:'JAMERILSON'})];
  const out=resolveRegionalCrewName('Jamerilson','driver',list);
  assert.equal(out.status,'MATCHED');
  assert.equal(out.professional.id,'a');
});

test('nome ausente é novo, e apelido parcial pede confirmação para evitar cadastro duplicado',()=>{
  const list=[person('a','JAMERILSON PEREIRA','Condutor',{nome_de_guerra:'JP'})];
  assert.equal(resolveRegionalCrewName('Jamerilson','driver',list).status,'POSSIBLE_DUPLICATE');
  assert.equal(resolveRegionalCrewName('Raíssa','tech',list).status,'NEW');
});

test('nome de guerra ambíguo bloqueia associação automática',()=>{
  const list=[
    person('a','JAMERILSON PEREIRA','Condutor',{nome_de_guerra:'JAMERILSON'}),
    person('b','JAMERILSON SILVA','Condutor',{nome_de_guerra:'JAMERILSON'})
  ];
  const out=resolveRegionalCrewName('Jamerilson','driver',list);
  assert.equal(out.status,'AMBIGUOUS');
  assert.equal(out.professional,undefined);
});

test('não trata Condutor como Médico só porque existe nome igual',()=>{
  const list=[person('a','FULANO TESTE','Condutor')];
  assert.equal(resolveRegionalCrewName('Fulano Teste','doctor',list).status,'ROLE_REVIEW');
});

test('Enfermeiro cadastrado pode cobrir campo técnico de USB, médico não',()=>{
  assert.ok(regionalCanFillRole(person('a','ENFERMEIRO','Enfermeiro'),'tech'));
  assert.ok(!regionalCanFillRole(person('b','MÉDICO','Médico'),'tech'));
  assert.deepEqual(regionalSlotsForVehicle('USB'),['driver','tech']);
});

test('técnico de enfermagem em texto e médico regulador não criam médicos falsos',()=>{
  const out=parseRegionalCrewClipboard(
    'Equipe de Alexânia\nTécnico de Enfermagem: Raíssa\nMédico regulador: Nome da Central\nCondutor: Jamerilson'
  );
  assert.equal(out.members.length,2);
  assert.deepEqual(out.members.map(x=>x.key),['tech','driver']);
  assert.equal(out.members[0].name,'Raíssa');
});
