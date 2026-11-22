import { hasProfessionalFunction, canonicalProfessionalFunction, isBombeiroProfessional } from './professional-functions.js';

// Resolver de nomes para a FUTURA importação mensal do PDF.
// A função/viatura do turno vêm da escala, nunca do cadastro de nome de guerra.
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
export function canonicalDisplayName(p){
  return String(p?.nome_exibicao||p?.nome_de_guerra||p?.nome_completo||'').trim();
}
export function resolveMonthlyRosterEntry({
  name,position,professionalId=null,professionals=[]
}={}){
  const originalName=String(name||'').trim(),query=foldName(originalName);
  const category=canonicalProfessionalFunction(position);
  if(!query||!category)return {status:'INVALID_ENTRY',professional:null,candidates:[]};
  // Um ID vindo de escala previamente vinculada é mais confiável do que um
  // apelido, mas nunca aceita ID inexistente ou função clínica não habilitada.
  let matches=[];
  if(professionalId){
    const selected=professionals.find(p=>p.id===professionalId&&p.ativo!==false);
    if(!selected)return {status:'NOT_FOUND',professional:null,candidates:[]};
    matches=[selected];
  }else{
    matches=professionals.filter(p=>p?.ativo!==false&&matchingNames(p).has(query));
  }
  if(!matches.length)return {status:'NOT_FOUND',professional:null,candidates:[]};
  if(matches.length>1)return {status:'AMBIGUOUS',professional:null,candidates:matches};
  const chosen=matches[0];
  if(!hasProfessionalFunction(chosen,category)){
    return {status:'ROLE_MISMATCH',professional:null,candidates:matches};
  }
  return {
    status:'MATCHED',professional:chosen,candidates:[chosen],
    profissional_id:chosen.id,
    nome_referencia:canonicalDisplayName(chosen),
    nome_importado:originalName,
    funcao_escala:category,
    isBombeiro:isBombeiroProfessional(chosen)
  };
}
