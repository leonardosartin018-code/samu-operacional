import { hasProfessionalFunction, canonicalProfessionalFunction } from './professional-functions.js';

// Futuro importador de escala mensal: validação exata, SEM atribuição automática
// quando houver homônimos, nomes parciais ou função não habilitada.
function foldName(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}
function matchingNames(p){
  const all=[p?.nome_completo,p?.nome_de_guerra,p?.nome_exibicao,
    ...(Array.isArray(p?.nomes_anteriores)?p.nomes_anteriores:[]),
    ...(Array.isArray(p?.aliases)?p.aliases:[])];
  return new Set(all.map(foldName).filter(Boolean));
}
export function resolveMonthlyRosterEntry({name,position,professionals=[]}={}){
  const query=foldName(name);
  const category=canonicalProfessionalFunction(position);
  if(!query||!category)return {status:'INVALID_ENTRY',professional:null,candidates:[]};
  const matches=professionals.filter(p=>p?.ativo!==false&&matchingNames(p).has(query));
  if(matches.length===0)return {status:'NOT_FOUND',professional:null,candidates:[]};
  const authorized=matches.filter(p=>hasProfessionalFunction(p,category));
  if(authorized.length===1 && matches.length===1){
    return {status:'MATCHED',professional:authorized[0],candidates:authorized};
  }
  if(matches.length===1 && authorized.length===0){
    return {status:'ROLE_MISMATCH',professional:null,candidates:matches};
  }
  // Mesmo que um dos homônimos pareça ter a função certa, pede conferência
  // humana antes de associar a escala: nunca confundir dois profissionais.
  return {status:'AMBIGUOUS',professional:null,candidates:matches};
}
