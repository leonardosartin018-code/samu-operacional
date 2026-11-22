import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const functionsSource=readFileSync(new URL('../professional-functions.js',import.meta.url),'utf8');
const helpers=new Function(
  functionsSource.replace(/export (const|function) /g,'$1 ')+
  ';return {professionalFunctions,hasProfessionalFunction,vehicleRoleChoices,'+
  'professionalCanFillSlot,normalizeProfessionalFunctions,canonicalProfessionalFunction};'
)();
const {professionalFunctions,hasProfessionalFunction,vehicleRoleChoices,
  professionalCanFillSlot,normalizeProfessionalFunctions}=helpers;
const monthlySource=readFileSync(new URL('../monthly-roster-match.js',import.meta.url),'utf8');
const {resolveMonthlyRosterEntry}=new Function(
  'hasProfessionalFunction','canonicalProfessionalFunction',
  monthlySource.replace(/^import[^\n]+\n/gm,'').replace(/export function /g,'function ')+
  ';return {resolveMonthlyRosterEntry};'
)(helpers.hasProfessionalFunction,helpers.canonicalProfessionalFunction);

const person={
 id:'a',ativo:true,nome_completo:'PESSOA EXEMPLO',
 nome_de_guerra:'EXEMPLO',funcao_sistema:'Condutor',
 funcoes_habilitadas:['Condutor','Rádio-operador','TARM']
};

test('pessoa possui várias funções, sem duplicar sua função principal',()=>{
 assert.deepEqual(professionalFunctions(person),['Condutor','Rádio-operador','TARM']);
 assert.equal(hasProfessionalFunction(person,'TARM'),true);
 assert.equal(hasProfessionalFunction(person,'Rádio-operador'),true);
 assert.equal(hasProfessionalFunction(person,'Enfermeiro'),false);
 assert.deepEqual(vehicleRoleChoices(person),['driver']);
});
test('cadastro antigo sem lista continua usando função principal',()=>{
 assert.deepEqual(professionalFunctions({funcao_sistema:'Condutor'}),['Condutor']);
 assert.deepEqual(normalizeProfessionalFunctions(['TARM','Condutor','TARM'],'Condutor'),['Condutor','TARM']);
});
test('a função principal não desaparece quando recebe funções adicionais',()=>{
 assert.deepEqual(normalizeProfessionalFunctions(['Rádio-operador','TARM'],'Condutor'),[
   'Condutor','Rádio-operador','TARM'
 ]);
});
test('Rádio, TARM e Lavador só são preenchidos automaticamente por habilitados',()=>{
 assert.equal(professionalCanFillSlot(person,'RADIO-01'),true);
 assert.equal(professionalCanFillSlot(person,'TARM-03'),true);
 assert.equal(professionalCanFillSlot(person,'LAVADOR-01'),false);
});
test('pessoa com TARM e Condutor aparece em ambas as seleções, sem duplicar registro',()=>{
 const person2={...person,funcao_sistema:'TARM',funcoes_habilitadas:['TARM','Condutor']};
 assert.equal(hasProfessionalFunction(person2,'Condutor'),true);
 assert.deepEqual(vehicleRoleChoices(person2),['driver']);
});
test('futuro importador mensal aceita nome exato quando função está confirmada',()=>{
 const match=resolveMonthlyRosterEntry({name:'Pessoa Exemplo',position:'TARM',professionals:[person]});
 assert.equal(match.status,'MATCHED');
 assert.equal(match.professional.id,'a');
});
test('importador mensal bloqueia função não habilitada e nomes ambíguos',()=>{
 const mismatch=resolveMonthlyRosterEntry({name:'PESSOA EXEMPLO',position:'Lavador',professionals:[person]});
 assert.equal(mismatch.status,'ROLE_MISMATCH');
 const ambiguous=resolveMonthlyRosterEntry({name:'EXEMPLO',position:'Condutor',
   professionals:[person,{...person,id:'b',nome_completo:'OUTRA PESSOA'}]});
 assert.equal(ambiguous.status,'AMBIGUOUS');
 assert.equal(ambiguous.professional,null);
});
test('importador mensal não adivinha nome parcial, nem muda o cadastro',()=>{
 assert.equal(resolveMonthlyRosterEntry({name:'PESSOA',position:'TARM',professionals:[person]}).status,'NOT_FOUND');
 assert.deepEqual(person.funcoes_habilitadas,['Condutor','Rádio-operador','TARM']);
});
