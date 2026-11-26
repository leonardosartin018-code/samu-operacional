import { isBombeiroProfessional, canonicalProfessionalFunction } from './professional-functions.js';

// Conferência destinada exclusivamente ao nome que será exibido nos cards.
// A divisão é somente visual: esta tela não altera funções nem vínculos de base.
export async function openNamesReview({client,canEdit,isReady,afterSave}){
 if(document.getElementById('namesReview'))return;
 const dialog=document.createElement('dialog');dialog.id='namesReview';
 dialog.innerHTML=`<header><div><h2>Conferir nomes das equipes</h2><p>Confirme uma única vez o nome que aparecerá nos cards e nas próximas escalas.</p></div><button type="button" data-close>Fechar</button></header>
 <p>Confira o nome de guerra. Se estiver errado, corrija, marque <b>OK</b> e salve. Os grupos seguem a função cadastrada e a última base registrada. Esta tela altera somente nomes. Nomes confirmados não serão substituídos pelo texto de uma escala importada.</p>
 <div class="names-tools">
   <input type="search" placeholder="Pesquisar nome completo, guerra ou nome antigo" aria-label="Pesquisar profissional">
   <label class="names-pending-filter"><input type="checkbox" data-only-pending> Mostrar somente não conferidos</label>
   <button type="button" data-save>Salvar nomes conferidos</button>
 </div>
 <p data-status role="status">Carregando cadastro…</p><div data-rows></div>`;
 document.body.append(dialog);dialog.showModal();
 let rows=[],confirmed=new Map(),dirty=new Set(),busy=false;
 let lastBaseByPerson=null;
 const status=dialog.querySelector('[data-status]');
 const search=dialog.querySelector('[type=search]');
 const pending=dialog.querySelector('[data-only-pending]');
 const save=dialog.querySelector('[data-save]');
 save.disabled=!canEdit;
 const shown=p=>p.nome_exibicao||p.nome_de_guerra||String(p.nome_completo||'').trim().split(/\s+/).slice(0,2).join(' ');
 const original=p=>[p.nome_completo,p.nome_de_guerra,p.nome_exibicao];
 const findRow=id=>dialog.querySelector('tr[data-id="'+id+'"]');
 function close(){
   if(busy)return;
   if(dirty.size&&!confirm('Há nomes não salvos. Deseja sair?'))return;
   dialog.close();dialog.remove();
 }
 dialog.querySelector('[data-close]').onclick=close;
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 function updateVisibility(){
   const query=search.value.toLocaleLowerCase('pt-BR').trim();
   for(const tr of dialog.querySelectorAll('tbody tr[data-id]')){
     tr.hidden=Boolean((query&&!tr.dataset.search.includes(query))||
       (pending.checked&&tr.dataset.confirmed==='true'&&!dirty.has(tr.dataset.id)));
   }
   for(const label of dialog.querySelectorAll('[data-base-label]')){
     label.hidden=![...label.parentElement.querySelectorAll('tr[data-id]')].some(tr=>!tr.hidden&&tr.dataset.base===label.dataset.baseLabel);
   }
   for(const group of dialog.querySelectorAll('[data-group]')){
     group.hidden=![...group.querySelectorAll('tbody tr[data-id]')].some(tr=>!tr.hidden);
   }
 }
 function markEdited(id){
   dirty.add(id);
   const tr=findRow(id);
   tr.querySelector('[data-field=conferido]').checked=true;
   tr.dataset.confirmed='true';
   save.textContent='Salvar '+dirty.size+' nome(s)';
 }
 function makeHistory(p,tr){
   const history=confirmed.get(p.id)?.historico||[];
   const cell=document.createElement('td');
   if(!history.length){cell.textContent='Não conferido';return cell;}
   const details=document.createElement('details'),summary=document.createElement('summary');
   summary.textContent=history.length+' registro(s)';details.append(summary);
   for(const item of [...history].reverse()){
     const line=document.createElement('p');
     line.textContent=new Date(item.quando).toLocaleString('pt-BR')+' · Anterior: '+
       (item.nome_de_guerra||item.nome_exibicao||item.nome_completo||'—');
     details.append(line);
   }
   const undo=document.createElement('button');undo.type='button';
   undo.textContent='Restaurar nome anterior';undo.disabled=!canEdit;
   undo.onclick=()=>{
     const previous=history[history.length-1];
     tr.querySelector('[data-field=nome_de_guerra]').value=shown(previous);
     markEdited(p.id);status.textContent='Nome anterior selecionado. Salve para confirmar.';
   };
   details.append(undo);cell.append(details);return cell;
 }
 async function pageAll(table,fields,order='id'){
   const all=[];
   for(let offset=0;;offset+=1000){
     const response=await client.from(table).select(fields).order(order).range(offset,offset+999);
     if(response.error)throw response.error;
     all.push(...response.data);if(response.data.length<1000)return all;
   }
 }
 async function loadLastBases(){
   const [bases,vehicles,assignments]=await Promise.all([
     pageAll('bases','id,nome'),pageAll('viaturas','id,base_id'),
     pageAll('equipe_plantao','id,profissional_id,viatura_id,entrou_em,criado_em')
   ]);
   const baseById=new Map(bases.map(b=>[b.id,b])),vehicleById=new Map(vehicles.map(v=>[v.id,v]));
   const latest=new Map();
   assignments.sort((a,b)=>String(b.entrou_em||b.criado_em||'').localeCompare(String(a.entrou_em||a.criado_em||''))||String(b.id).localeCompare(String(a.id)));
   for(const assignment of assignments){
     if(!assignment.profissional_id||latest.has(assignment.profissional_id))continue;
     latest.set(assignment.profissional_id,baseById.get(vehicleById.get(assignment.viatura_id)?.base_id)?.nome||null);
   }
   return latest;
 }
 const folded=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
 const regionalBase=p=>{
   const base=lastBaseByPerson?.get(p.id);
   if(base&&folded(base)!=='ANAPOLIS')return base;
   if(!base&&/REGIONAL|DESCENTRALIZ/.test(folded(p.categoria_origem)))return 'Base não identificada';
   return null;
 };
 const category=p=>{
   if(regionalBase(p))return 'Bases descentralizadas';
   if(isBombeiroProfessional(p))return 'Bombeiros militares';
   return ({'Técnico de Enfermagem':'Técnicos de enfermagem','Enfermeiro':'Enfermeiros','Médico':'Médicos'})[canonicalProfessionalFunction(p.funcao_sistema)]||'Outros cadastros — sem categoria identificada';
 };
 async function load(){
   rows=[];confirmed=new Map();
   if(!lastBaseByPerson)lastBaseByPerson=await loadLastBases();
   for(let offset=0;;offset+=1000){
     const res=await client.from('profissionais')
       .select('id,nome_completo,nome_de_guerra,nome_exibicao,nomes_anteriores,funcao_sistema,categoria_origem,ativo')
       .order('id').range(offset,offset+999);
     if(res.error)throw res.error;
     rows.push(...res.data);
     if(res.data.length<1000)break;
   }
   for(let offset=0;;offset+=1000){
     const res=await client.from('profissionais_nomes_conferidos')
       .select('profissional_id,historico,aliases').order('profissional_id').range(offset,offset+999);
     if(res.error)throw res.error;
     res.data.forEach(item=>confirmed.set(item.profissional_id,item));
     if(res.data.length<1000)break;
   }
   rows.sort((a,b)=>a.nome_completo.localeCompare(b.nome_completo,'pt-BR'));
   const root=dialog.querySelector('[data-rows]');root.replaceChildren();
   const groups=['Bombeiros militares','Técnicos de enfermagem','Enfermeiros','Médicos','Bases descentralizadas','Outros cadastros — sem categoria identificada'];
   for(const groupName of groups){
     const selected=rows.filter(p=>category(p)===groupName);if(!selected.length)continue;
     if(groupName==='Bases descentralizadas')selected.sort((a,b)=>regionalBase(a).localeCompare(regionalBase(b),'pt-BR')||a.nome_completo.localeCompare(b.nome_completo,'pt-BR'));
     const section=document.createElement('section');section.dataset.group=groupName;
     const heading=document.createElement('h3');heading.textContent=groupName+' ('+selected.length+')';
     section.append(heading);
     const table=document.createElement('table');
     table.innerHTML='<thead><tr><th>Nome completo registrado</th><th>Nome de guerra — aparece nos cards</th><th>Conferido</th><th>Histórico</th></tr></thead>';
     const body=document.createElement('tbody');
     let previousBase=null;
     for(const p of selected){
       const base=groupName==='Bases descentralizadas'?regionalBase(p):null;
       if(base&&base!==previousBase){
         const divider=document.createElement('tr'),label=document.createElement('th');
         divider.dataset.baseLabel=base;label.colSpan=4;label.scope='rowgroup';
         label.textContent=base+' — última base registrada';divider.append(label);body.append(divider);previousBase=base;
       }
       const tr=document.createElement('tr');tr.dataset.id=p.id;if(base)tr.dataset.base=base;
       tr.dataset.confirmed=String(confirmed.has(p.id));
       tr.dataset.search=[p.nome_completo,p.nome_de_guerra,p.nome_exibicao,groupName,base||'',
         ...(p.nomes_anteriores||[]),...(confirmed.get(p.id)?.aliases||[])].join(' ').toLocaleLowerCase('pt-BR');
       const full=document.createElement('td'),fullInput=document.createElement('input');
       fullInput.value=p.nome_completo||'';fullInput.readOnly=true;
       fullInput.setAttribute('aria-label','Nome completo de '+p.nome_completo);
       full.append(fullInput);
       if(p.ativo===false){const small=document.createElement('small');small.textContent='Inativo';full.append(small);}
       const war=document.createElement('td'),warInput=document.createElement('input');
       warInput.dataset.field='nome_de_guerra';warInput.value=shown(p);warInput.maxLength=120;
       warInput.disabled=!canEdit;warInput.autocomplete='off';
       warInput.setAttribute('aria-label','Nome de guerra de '+p.nome_completo);
       warInput.oninput=()=>{markEdited(p.id);updateVisibility();};
       war.append(warInput);
       const checkCell=document.createElement('td'),check=document.createElement('input');
       check.type='checkbox';check.dataset.field='conferido';check.checked=confirmed.has(p.id);
       check.disabled=!canEdit;check.setAttribute('aria-label','OK '+p.nome_completo);
       check.onchange=()=>{
         if(check.checked)markEdited(p.id);
         else{check.checked=confirmed.has(p.id);if(!check.checked)dirty.delete(p.id);}
         updateVisibility();
       };
       checkCell.append(check,document.createTextNode(' OK'));
       tr.append(full,war,checkCell,makeHistory(p,tr));body.append(tr);
     }
     table.append(body);section.append(table);root.append(section);
   }
   updateVisibility();
   save.textContent='Salvar nomes conferidos';
   status.textContent=rows.length+' profissionais · '+confirmed.size+' nomes protegidos · '+
     (rows.length-confirmed.size)+' pendentes. Grupos por função cadastrada e última base registrada; nenhuma função é alterada aqui.';
 }
 search.oninput=updateVisibility;pending.onchange=updateVisibility;
 save.onclick=async()=>{
   if(!isReady()){status.textContent='Para confirmar nomes, conecte à internet e conclua as pendências offline.';return;}
   if(!dirty.size){status.textContent='Corrija o nome ou marque OK nos profissionais conferidos.';return;}
   const changes=[...dirty].map(id=>{
     const p=rows.find(x=>x.id===id),tr=findRow(id);
     const value=tr.querySelector('[data-field=nome_de_guerra]').value.trim();
     return {id,expected:original(p),expected_funcao:p.funcao_sistema,
       nome_completo:p.nome_completo,nome_de_guerra:value,nome_exibicao:value};
   });
   if(changes.length>500){status.textContent='Salve até 500 profissionais por vez.';return;}
   if(changes.some(c=>!c.nome_de_guerra||c.nome_completo.length<3)){
     status.textContent='Confira os nomes completos e preencha o nome de guerra de todos os marcados.';return;
   }
   busy=true;save.disabled=true;
   try{
     const response=await client.rpc('samu_conferir_nomes',{p_changes:changes});
     if(response.error)throw response.error;
     dirty.clear();await afterSave();await load();
     status.textContent=response.data+' nome(s) de guerra confirmados e protegidos contra novas escalas.';
   }catch(error){status.textContent='Não foi possível salvar: '+error.message;}
   finally{busy=false;save.disabled=!canEdit;}
 };
 try{await load();}catch(error){status.textContent='Não foi possível carregar: '+error.message;}
}
