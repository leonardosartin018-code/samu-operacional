// Catálogo de funções do SAMU: uma pessoa pode atuar em mais de uma posição.
// funcao_sistema permanece a função PRINCIPAL para compatibilidade histórica.
export const PROFESSIONAL_FUNCTIONS = [
  ['Condutor','Condutores — USB / USA'],
  ['Sanitária','Ambulância sanitária'],
  ['TARM','TARM'],
  ['Rádio-operador','Rádio'],
  ['Lavador','Lavadores'],
  ['Motolância','Motolância'],
  ['Técnico de Enfermagem','Técnicos'],
  ['Enfermeiro','Enfermeiros'],
  ['Médico','Médicos']
];

function folded(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
}
const canonical = new Map(PROFESSIONAL_FUNCTIONS.map(([value])=>[folded(value),value]));
export function canonicalProfessionalFunction(value){
  return canonical.get(folded(value))||null;
}
export function normalizeProfessionalFunctions(values, primary){
  const result=[];
  const add=v=>{
    const key=canonicalProfessionalFunction(v);
    if(key&&!result.includes(key))result.push(key);
  };
  add(primary);
  if(Array.isArray(values))values.forEach(add);
  return result;
}
export function professionalFunctions(p){
  return normalizeProfessionalFunctions(p?.funcoes_habilitadas,p?.funcao_sistema);
}
export function hasProfessionalFunction(p, role){
  return professionalFunctions(p).includes(canonicalProfessionalFunction(role));
}
export function functionForInternalSlot(code){
  const key=folded(code);
  if(key.startsWith('RADIO'))return 'Rádio-operador';
  if(key.startsWith('TARM'))return 'TARM';
  if(key.startsWith('LAVADOR'))return 'Lavador';
  if(key.startsWith('SANITARIA'))return 'Sanitária';
  return null;
}
export function vehicleRoleChoices(p){
  const roles=professionalFunctions(p);
  const options=[];
  if(roles.includes('Condutor'))options.push('driver');
  if(roles.includes('Técnico de Enfermagem'))options.push('tech');
  if(roles.includes('Enfermeiro'))options.push('nurse');
  if(roles.includes('Médico'))options.push('doctor');
  if(roles.includes('Motolância'))options.push('moto');
  return options;
}
export function professionalCanFillSlot(p, code){
  const role=functionForInternalSlot(code);
  return !role||hasProfessionalFunction(p,role);
}
