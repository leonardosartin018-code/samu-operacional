/*
 * Leitura local de mensagens de escala recebidas por WhatsApp.
 * Nunca transmite o texto a um serviço externo, nem aceita identificações
 * por aproximação sem conferência. Somente funções explicitamente rotuladas.
 */
import { hasProfessionalFunction } from './professional-functions.js';

const ROLE_PATTERN=/\b(condutor(?:a)?|motorista|cond\.?|t[eé]cnic[oa](?:\s+de\s+enfermagem)?|t[eé]c\.?|enfermeir[oa]|enf\.?|m[eé]dic[oa]|m[eé]d\.?|doutor(?:a)?|dr\.?|dra\.?)\b\.?\s*(?:[:=\-–—]\s*|\s+(?=[A-Za-zÀ-ÿ]))/giu;
const MAX_LENGTH=12000;
const CITIES=[
  ['ABADIANIA',/\bABADI[AÂ]NIA\b/i],
  ['ALEXANIA',/\bALEX[AÂ]NIA\b/i],
  ['CORUMBA',/\bCORUMB[AÁ]\b/i],
  ['COCALZINHO',/\bCOCALZINHO\b/i],
  ['PIRENOPOLIS',/\bPIREN[OÓ]POLIS\b/i],
  ['JARANAPOLIS',/\bJARAN[AÁ]POLIS\b/i],
  ['GOIANAPOLIS',/\bGOIAN[AÁ]POLIS\b/i],
  ['TEREZOPOLIS',/\bTEREZ[OÓ]POLIS\b/i]
];
function fold(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
export function regionalRoleFromLabel(label){
  const value=fold(label).replace(/\s/g,'');
  if(/^(COND|CONDUTOR|CONDUTORA|MOTORISTA)$/.test(value))return 'driver';
  if(/^(TEC|TECNICA|TECNICO|TECNICADEENFERMAGEM|TECNICODEENFERMAGEM)$/.test(value))return 'tech';
  if(/^(ENF|ENFERMEIRO|ENFERMEIRA)$/.test(value))return 'nurse';
  if(/^(MED|MEDICO|MEDICA|DOUTOR|DOUTORA|DR|DRA)$/.test(value))return 'doctor';
  return null;
}
export const REGIONAL_ROLE={
  driver:{label:'Condutor',databaseRole:'Condutor'},
  tech:{label:'Técnico de Enfermagem',databaseRole:'Técnico de Enfermagem'},
  nurse:{label:'Enfermeiro',databaseRole:'Enfermeiro'},
  doctor:{label:'Médico',databaseRole:'Médico'}
};
function cleanPersonName(text){
  return String(text||'')
    .replace(/^\s*(?:(?:sr|sra|dr|dra)\.?\s+)/i,'')
    .replace(/\s*(?:\(|\[)\s*(?:plant[aã]o|entra|turno|24h).*$/i,'')
    .replace(/\s+[-–—]\s*(?:plant[aã]o|24h|diurno|noturno|escala).*$/i,'')
    .replace(/^\s*[\d\s.:|\-–—]+/,'')
    .replace(/[\s,;.|*\-–—]+$/,'')
    .replace(/\s+/g,' ').trim();
}
function stripWhatsAppHeader(line){
  return String(line||'')
    // [22/11/2026, 07:10] Nome: Condutor: PESSOA
    .replace(/^\s*\[\d{1,2}\/\d{1,2}\/\d{2,4}[^\]]*\]\s*[^:\n]{1,65}:\s*/,'')
    // 22/11/2026 07:10 - Nome: Condutor: PESSOA
    .replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4}[\s,]+\d{1,2}:\d{2}(?:\s*-\s*|\s+)[^:\n]{1,65}:\s*/,'')
    .trim();
}
export function parseRegionalCrewClipboard(raw){
  const text=String(raw||'').replace(/\r\n?/g,'\n');
  if(!text.trim())return {members:[],warnings:[],error:'Cole a mensagem da equipe.'};
  if(text.length>MAX_LENGTH)return {members:[],warnings:[],error:'Mensagem muito extensa. Copie apenas a escala da equipe (até 12 mil caracteres).'};
  const members=[],warnings=[];
  let recognizedBase=null;
  for(const [key,regex] of CITIES)if(regex.test(text)){
    if(recognizedBase&&recognizedBase!==key){
      warnings.push('O texto menciona mais de uma base. Confira a viatura selecionada.');
      recognizedBase=null;break;
    }
    recognizedBase=key;
  }
  for(const original of text.split('\n')){
    const normalized=stripWhatsAppHeader(original).replace(/[•*]/g,' ').trim();
    if(!normalized)continue;
    // WhatsApp costuma trazer mais de uma função no mesmo parágrafo.
    const lines=normalized.split(/\s*[;|]\s*/);
    for(const line of lines){
      // "Médico regulador" pertence ao relato da ocorrência, não à escala.
      if(/^\s*m[eé]dic[oa]\s+regulad[oa]r/i.test(line))continue;
      ROLE_PATTERN.lastIndex=0;
      const labels=[...line.matchAll(ROLE_PATTERN)];
      if(!labels.length)continue;
      for(let i=0;i<labels.length;i++){
        const match=labels[i],key=regionalRoleFromLabel(match[1]);
        if(!key)continue;
        const start=match.index+match[0].length,end=i+1<labels.length?labels[i+1].index:line.length;
        const rawName=line.slice(start,end).replace(/\s*\/\s*$/,'');
        const name=cleanPersonName(rawName);
        if(!name||name.length<3){
          warnings.push('Foi encontrada a função '+REGIONAL_ROLE[key].label+' sem nome válido.');
          continue;
        }
        if(/[\/]/.test(name)){
          const split=name.split(/\s*\/\s*/).filter(Boolean);
          if(split.length===2 && !/\d/.test(name)){
            // Não escolher entre duas pessoas na mesma função.
            warnings.push('Mais de um nome para '+REGIONAL_ROLE[key].label+': confira a mensagem.');
            continue;
          }
        }
        if(/\d|https?:|www\.|@|[<>{}]/i.test(name)||name.length>120){
          warnings.push('Nome de '+REGIONAL_ROLE[key].label+' precisa ser conferido manualmente.');
          continue;
        }
        members.push({key,name,source:original.trim()});
      }
    }
  }
  if(!members.length)return {members:[],base:recognizedBase,warnings,error:'Não encontrei funções identificadas como Condutor, Técnico, Enfermeiro ou Médico. Confira o texto.'};
  for(const key of ['driver','tech','nurse','doctor']){
    if(members.filter(item=>item.key===key).length>1)
      warnings.push('Há mais de um '+REGIONAL_ROLE[key].label+' na mensagem; confirme qual será escalado.');
  }
  return {members,base:recognizedBase,warnings,error:null};
}
function aliases(p){
  return [p.nome_completo,p.nome_de_guerra,p.nome_exibicao,
    ...(Array.isArray(p.nomes_anteriores)?p.nomes_anteriores:[])].map(fold).filter(Boolean);
}
export function resolveRegionalCrewName(name,role,professionals=[]){
  const query=fold(name);
  if(query.length<3||!REGIONAL_ROLE[role])return {status:'INVALID',candidates:[]};
  const list=professionals.filter(p=>p.ativo!==false);
  const exact=list.filter(p=>aliases(p).includes(query));
  if(exact.length>1)return {status:'AMBIGUOUS',candidates:exact};
  if(exact.length===1){
    const person=exact[0];
    if(!regionalCanFillRole(person,role))return {status:'ROLE_REVIEW',candidates:[person]};
    return {status:'MATCHED',professional:person,candidates:[person]};
  }
  const possible=list.filter(p=>{
    const values=aliases(p);
    return values.some(v=>v.startsWith(query+' ')||query.startsWith(v+' '));
  });
  if(possible.length)return {status:'POSSIBLE_DUPLICATE',candidates:possible.slice(0,12)};
  return {status:'NEW',candidates:[]};
}
export function regionalCanFillRole(p,key){
  if(!p||!REGIONAL_ROLE[key])return false;
  return key==='tech'
    ?hasProfessionalFunction(p,'Técnico de Enfermagem')||hasProfessionalFunction(p,'Enfermeiro')
    :hasProfessionalFunction(p,REGIONAL_ROLE[key].databaseRole);
}
export function regionalSlotsForVehicle(type){
  const value=fold(type);
  if(value.includes('USA'))return ['driver','nurse','doctor'];
  if(value.includes('USB'))return ['driver','tech'];
  return [];
}
