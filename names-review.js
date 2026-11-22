export async function openNamesReview({client,canEdit,isReady,afterSave}){
 if(document.getElementById('namesReview'))return;
 const dialog=document.createElement('dialog');dialog.id='namesReview';dialog.innerHTML=`<header><div><h2>Conferir nomes das equipes</h2><p>Seu nome confirmado tem prioridade sobre as próximas atualizações de escala.</p></div><button type="button" data-close>Fechar</button></header><p>Marque OK para confirmar ou edite os campos. Nome para aparecer é opcional: sem ele, usamos o nome de guerra ou os dois primeiros nomes.</p><div class="names-tools"><input type="search" placeholder="Buscar nome ou categoria" aria-label="Buscar nome ou categoria"><button type="button" data-save>Salvar correções e OKs</button></div><p data-status role="status">Carregando…</p><div data-rows></div>`;
 document.body.append(dialog);dialog.showModal();
 let rows=[],dirty=new Set(),busy=false;
 const status=dialog.querySelector('[data-status]');
 const category=p=>/CONDUTOR/i.test(p.funcao_sistema)?'Condutores':/TECN/i.test(p.funcao_sistema)?'Técnicos':/ENFERM/i.test(p.funcao_sistema)?'Enfermeiros':'Outras funções';
 const original=p=>[p.nome_completo,p.nome_de_guerra,p.nome_exibicao];
 function close(){if(busy)return;if(dirty.size&&!confirm('Há correções não salvas. Deseja sair?'))return;dialog.close();dialog.remove();}
 dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 async function load(){
  rows=[];for(let offset=0;;offset+=1000){const res=await client.from('profissionais').select('id,nome_completo,nome_de_guerra,nome_exibicao,funcao_sistema,ativo').order('id').range(offset,offset+999);if(res.error)throw res.error;rows.push(...res.data);if(res.data.length<1000)break;}
  const confirmed=[];for(let offset=0;;offset+=1000){const res=await client.from('profissionais_nomes_conferidos').select('*').order('profissional_id').range(offset,offset+999);if(res.error)throw res.error;confirmed.push(...res.data);if(res.data.length<1000)break;}
  const map=new Map(confirmed.map(p=>[p.profissional_id,p]));
  rows.sort((a,b)=>a.nome_completo.localeCompare(b.nome_completo,'pt-BR'));
  const root=dialog.querySelector('[data-rows]');root.replaceChildren();
  for(const group of ['Condutores','Técnicos','Enfermeiros','Outras funções']){
   const section=document.createElement('section');section.dataset.group=group;const heading=document.createElement('h3');heading.textContent=group;section.append(heading);
   const table=document.createElement('table');table.innerHTML='<thead><tr><th>Nome completo</th><th>Nome de guerra</th><th>Nome para aparecer</th><th>Conferido</th><th>Histórico</th></tr></thead>';const body=document.createElement('tbody');
   for(const p of rows.filter(p=>category(p)===group)){
    const tr=document.createElement('tr');tr.dataset.id=p.id;tr.dataset.search=[group,p.nome_completo,p.nome_de_guerra,p.nome_exibicao].join(' ').toLocaleLowerCase('pt-BR');
    for(const key of ['nome_completo','nome_de_guerra','nome_exibicao']){const td=document.createElement('td'),input=document.createElement('input');input.value=p[key]||'';input.dataset.field=key;input.maxLength=key==='nome_completo'?200:120;input.disabled=!canEdit;input.setAttribute('aria-label',key+' de '+p.nome_completo);input.oninput=()=>{dirty.add(p.id);tr.querySelector('[type=checkbox]').checked=true;};td.append(input);if(key==='nome_completo'){const small=document.createElement('small');small.textContent=p.funcao_sistema+(p.ativo===false?' · Inativo':'');td.append(small);}tr.append(td);}
    const td=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=map.has(p.id);check.disabled=!canEdit;check.setAttribute('aria-label','OK '+p.nome_completo);check.onchange=()=>{if(check.checked)dirty.add(p.id);else{dirty.delete(p.id);check.checked=map.has(p.id);}};td.append(check,document.createTextNode(' OK'));tr.append(td);
    const hist=document.createElement('td'),previous=map.get(p.id)?.historico||[];
    if(previous.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=previous.length+' registro(s)';details.append(summary);for(const item of previous.slice().reverse()){const line=document.createElement('p');line.textContent=new Date(item.quando).toLocaleString('pt-BR')+' · Antes: '+[item.nome_completo,item.nome_de_guerra,item.nome_exibicao].filter(Boolean).join(' / ');details.append(line);}const undo=document.createElement('button');undo.type='button';undo.textContent='Usar versão anterior';undo.disabled=!canEdit;undo.onclick=()=>{const prev=previous[previous.length-1];for(const key of ['nome_completo','nome_de_guerra','nome_exibicao'])tr.querySelector('[data-field='+key+']').value=prev[key]||'';check.checked=true;dirty.add(p.id);status.textContent='Versão anterior preenchida. Clique em salvar para aplicar.';};details.append(undo);hist.append(details);}else hist.textContent='Não conferido';tr.append(hist);body.append(tr);
   }
   table.append(body);section.append(table);root.append(section);
  }
  status.textContent=rows.length+' profissionais. As alterações são aplicadas ao salvar. Os registros de plantões encerrados não são reescritos.';
 }
 dialog.querySelector('[type=search]').oninput=e=>{const q=e.target.value.toLocaleLowerCase('pt-BR');dialog.querySelectorAll('tbody tr').forEach(tr=>tr.hidden=!tr.dataset.search.includes(q));};
 const save=dialog.querySelector('[data-save]');save.disabled=!canEdit;
 save.onclick=async()=>{
  if(!isReady()){status.textContent='Conecte à internet e aguarde o envio das pendências offline antes de corrigir nomes.';return;}
  if(!dirty.size){status.textContent='Marque OK ou edite um nome antes de salvar.';return;}
  const changes=[...dirty].map(id=>{const p=rows.find(x=>x.id===id),tr=dialog.querySelector('tr[data-id="'+id+'"]');const item={id,expected:original(p)};for(const key of ['nome_completo','nome_de_guerra','nome_exibicao'])item[key]=tr.querySelector('[data-field='+key+']').value.trim();return item;});
  if(changes.length>500){status.textContent='Salve até 500 profissionais por vez.';return;}
  if(changes.some(p=>p.nome_completo.length<3)){status.textContent='Preencha o nome completo com pelo menos 3 caracteres.';return;}
  busy=true;save.disabled=true;
  try{const res=await client.rpc('samu_conferir_nomes',{p_changes:changes});if(res.error)throw res.error;dirty.clear();await afterSave();await load();status.textContent=res.data+' nome(s) confirmado(s) e protegido(s) contra importações.';}
  catch(e){status.textContent='Não foi possível concluir: '+e.message;}
  finally{busy=false;save.disabled=!canEdit;}
 };
 try{await load();}catch(e){status.textContent='Não foi possível carregar: '+e.message;}
}
