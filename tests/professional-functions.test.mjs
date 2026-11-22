import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const functionsSource=readFileSync(new URL('../professional-functions.js',import.meta.url),'utf8');
const helpers=new Function(
  functionsSource.replace(/export (const|function) /g,'$1 ')+
  ';return {professionalFunctions,hasProfessionalFunction,vehicleRoleChoices,'+
  'professionalCanFillSlot,normalizeProfessionalFunctions,canonicalProfessionalFunction,isBombeiroProfessional};'
)();
const {professionalFunctions,hasProfessionalFunction,vehicleRoleChoices,
  professionalCanFillSlot,normalizeProfessionalFunctions}=helpers;
const monthlySource=readFileSync(new URL('../monthly-roster-match.js',import.meta.url),'utf8');
const {resolveMonthlyRosterEntry}=new Function(
  'hasProfessionalFunction','canonicalProfessionalFunction','isBombeiroProfessional',
  monthlySource.replace(/^import[^\n]+\n/gm,'').replace(/export function /g,'function ')+
  ';return {resolveMonthlyRosterEntry};'
)(helpers.hasProfessionalFunction,helpers.canonicalProfessionalFunction,helpers.isBombeiroProfessional);

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

test('todos os militares do grupo Bombeiro podem exercer postos operacionais sem cadastro um por um',()=>{
 const bombeiro={id:'bm',nome_completo:'MILITAR FICTÍCIO',ativo:true,
   categoria_origem:'Bombeiro',funcao_sistema:'Condutor',funcoes_habilitadas:[]};
 const functions=professionalFunctions(bombeiro);
 for(const role of ['Condutor','Rádio-operador','TARM','Lavador','Sanitária','Motolância']){
   assert.ok(functions.includes(role),role);
   assert.equal(hasProfessionalFunction(bombeiro,role),true,role);
 }
 assert.equal(professionalCanFillSlot(bombeiro,'RADIO-01'),true);
 assert.equal(professionalCanFillSlot(bombeiro,'TARM-02'),true);
 assert.equal(professionalCanFillSlot(bombeiro,'LAVADOR-01'),true);
 assert.equal(hasProfessionalFunction(bombeiro,'Médico'),false);
 assert.equal(hasProfessionalFunction(bombeiro,'Enfermeiro'),false);
 assert.equal(hasProfessionalFunction(bombeiro,'Técnico de Enfermagem'),false);
 assert.equal(bombeiro.funcoes_habilitadas.length,0,'não deve gravar funções no cadastro');
});

test('escala nova com apelido antigo mantém nome de guerra confirmado',()=>{
 const person={
   id:'id-ficticio',ativo:true,categoria_origem:'Bombeiro',
   nome_completo:'LEONARDO DE JESUS SARTIN',
   nome_de_guerra:'SARTIN',nome_exibicao:'SARTIN',
   nomes_anteriores:['LEONARDO','LEONARDO DE JESUS SARTIN'],
   funcao_sistema:'Condutor',funcoes_habilitadas:[]
 };
 const resolve=resolveMonthlyRosterEntry({
   name:'Leonardo',position:'Rádio',professionals:[person]
 });
 assert.equal(resolve.status,'MATCHED');
 assert.equal(resolve.profissional_id,person.id);
 assert.equal(resolve.nome_referencia,'SARTIN');
 assert.equal(resolve.nome_importado,'Leonardo');
 assert.equal(resolve.funcao_escala,'Rádio-operador');
 assert.equal(person.nome_exibicao,'SARTIN');
});

test('apelido comum entre militares não vincula pessoas erradas',()=>{
 const a={id:'a',ativo:true,categoria_origem:'Bombeiro',funcao_sistema:'Condutor',
   nome_completo:'NOME A',nome_de_guerra:'SARTIN',nomes_anteriores:['LEONARDO']};
 const b={...a,id:'b',nome_completo:'NOME B',nome_de_guerra:'OUTRO'};
 const result=resolveMonthlyRosterEntry({name:'LEONARDO',position:'TARM',professionals:[a,b]});
 assert.equal(result.status,'AMBIGUOUS');
 assert.equal(result.professional,null);
 const linked=resolveMonthlyRosterEntry({name:'LEONARDO',position:'TARM',
   professionalId:'b',professionals:[a,b]});
 assert.equal(linked.profissional_id,'b');
});

test('nomenclatura de médico ou técnico nunca é liberada só por ser Bombeiro',()=>{
 const p={id:'bm',ativo:true,categoria_origem:'Bombeiro',funcao_sistema:'Condutor'};
 assert.equal(resolveMonthlyRosterEntry({name:'A',position:'Médico',
   professionalId:'bm',professionals:[p]}).status,'ROLE_MISMATCH');
});
