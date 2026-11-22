import { PROFESSIONAL_FUNCTIONS, canonicalProfessionalFunction, professionalFunctions } from './professional-functions.js';
export async function openNamesReview({client,canEdit,isReady,afterSave}){
 if(document.getElementById('namesReview'))return;
 const dialog=document.createElement('dialog');dialog.id='namesReview';dialog.innerHTML=`<header><div><h2>Conferir nomes das equipes</h2><p>Nomes e funções conferidos serão usados nas escalas e ficarão protegidos no histórico.</p></div><button type="button" data-close>Fechar</button></header><p>Os nomes já estão preenchidos como aparecem no sistema. Corrija apenas os errados e marque OK. O nome de guerra será também o nome exibido. Em Função principal, escolha o grupo de organização. Em Funções habilitadas, marque todas em que a pessoa pode atuar, por exemplo Condutor, Rádio e TARM. Isso não modifica escalas encerradas.</p><div class="names-tools"><input type="search" placeholder="Buscar nome ou categoria" aria-label="Buscar nome ou categoria"><button type="button" data-save>Salvar correções e OKs</button></div><p data-status role="status">Carregando…</p><div data-rows></div>`;
 document.body.append(dialog);dialog.showModal();
 let rows=[],dirty=new Set(),busy=false;
 const status=dialog.querySelector('[data-status]');
 const categories=PROFESSIONAL_FUNCTIONS;
 const normalizeRole=value=>canonicalProfessionalFunction(value)||value;
 const category=p=>categories.find(([value])=>value===normalizeRole(p.funcao_sistema))?.[1]||'Categoria não identificada';
 const shown=p=>p.nome_exibicao||p.nome_de_guerra||String(p.nome_completo||'').trim().split(/\s+/).slice(0,2).join(' ');
 const original=p=>[p.nome_completo,p.nome_de_guerra,p.nome_exibicao];
 function close(){if(busy)return;if(dirty.size&&!confirm('Há correções não salvas. Deseja sair?'))return;dialog.close();dialog.remove();}
 dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 async function load(){
  rows=[];for(let offset=0;;offset+=1000){const res=await client.from('profissionais').select('id,nome_completo,nome_de_guerra,nome_exibicao,funcao_sistema,funcoes_habilitadas,ativo').order('id').range(offset,offset+999);if(res.error)throw res.error;rows.push(...res.data);if(res.data.length<1000)break;}
  const confirmed=[];for(let offset=0;;offset+=1000){const res=await client.from('profissionais_nomes_conferidos').select('*').order('profissional_id').range(offset,offset+999);if(res.error)throw res.error;confirmed.push(...res.data);if(res.data.length<1000)break;}
  const map=new Map(confirmed.map(p=>[p.profissional_id,p]));
  rows.sort((a,b)=>a.nome_completo.localeCompare(b.nome_completo,'pt-BR'));
  const root=dialog.querySelector('[data-rows]');root.replaceChildren();
  for(const group of [...categories.map(c=>c[1]),'Categoria não identificada']){
   const section=document.createElement('section');section.dataset.group=group;const heading=document.createElement('h3');heading.textContent=group;section.append(heading);
   const table=document.createElement('table');table.innerHTML='<thead><tr><th>Nome completo registrado</th><th>Nome de guerra / nome que aparece</th><th>Função principal / Funções habilitadas</th><th>Conferido</th><th>Histórico</th></tr></thead>';const body=document.createElement('tbody');
   for(const p of rows.filter(p=>category(p)===group)){
    const tr=document.createElement('tr');tr.dataset.id=p.id;tr.dataset.search=[group,p.nome_completo,p.nome_de_guerra,p.nome_exibicao,...professionalFunctions(p)].join(' ').toLocaleLowerCase('pt-BR');
    for(const key of ['nome_completo','nome_de_guerra']){const td=document.createElement('td'),input=document.createElement('input');input.value=key==='nome_de_guerra'?shown(p):(p[key]||'');input.readOnly=key==='nome_completo';input.dataset.field=key;input.maxLength=key==='nome_completo'?200:120;input.disabled=!canEdit;input.setAttribute('aria-label',key+' de '+p.nome_completo);input.oninput=()=>{dirty.add(p.id);tr.querySelector('[data-field=conferido]').checked=true;};td.append(input);if(key==='nome_completo'){const small=document.createElement('small');small.textContent=p.funcao_sistema+(p.ativo===false?' · Inativo':'');td.append(small);}tr.append(td);}
    const roleCell=document.createElement('td');
    const roleSelect=document.createElement('select');
    roleSelect.dataset.field='funcao_sistema';
    roleSelect.setAttribute('aria-label','Função principal de '+p.nome_completo);
    roleSelect.disabled=!canEdit;
    for(const [value,label] of categories){
      const option=document.createElement('option');option.value=value;option.textContent=label;roleSelect.append(option);
    }
    roleSelect.value=normalizeRole(p.funcao_sistema);
    const multi=document.createElement('details');multi.className='names-functions';
    const summary=document.createElement('summary');multi.append(summary);
    const grid=document.createElement('div');grid.className='names-functions-grid';
    const existing=professionalFunctions(p);
    for(const [value,label] of categories){
      const choice=document.createElement('label');choice.className='names-functions-choice';
      const input=document.createElement('input');input.type='checkbox';
      input.dataset.role=value;input.checked=existing.includes(value);input.disabled=!canEdit;
      const caption=document.createElement('span');caption.textContent=label;
      choice.append(input,caption);grid.append(choice);
      input.onchange=()=>{
        if(value===roleSelect.value&&!input.checked){
          input.checked=true;
          status.textContent='A função principal deve permanecer marcada. Para removê-la, escolha outra função principal.';
          return;
        }
        dirty.add(p.id);tr.querySelector('[data-field=conferido]').checked=true;
        updateFunctionSummary();
      };
    }
    multi.append(grid);
    function updateFunctionSummary(){
      const selected=[...multi.querySelectorAll('[data-role]:checked')];
      summary.textContent='Funções habilitadas ('+selected.length+') · '+
        (selected.length<=2?selected.map(el=>el.dataset.role).join(' / '):'ver / alterar');
    }
    roleSelect.onchange=()=>{
      multi.querySelectorAll('[data-role]').forEach(box=>{if(box.dataset.role===roleSelect.value)box.checked=true;});
      dirty.add(p.id);tr.querySelector('[data-field=conferido]').checked=true;
      updateFunctionSummary();
      status.textContent='Função principal alterada. As funções adicionais foram preservadas.';
    };
    updateFunctionSummary();
    roleCell.append(roleSelect,multi);
    tr.append(roleCell);
    const td=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.dataset.field='conferido';check.checked=map.has(p.id);check.disabled=!canEdit;check.setAttribute('aria-label','OK '+p.nome_completo);check.onchange=()=>{if(check.checked)dirty.add(p.id);else{dirty.delete(p.id);check.checked=map.has(p.id);}};td.append(check,document.createTextNode(' OK'));tr.append(td);
    const hist=document.createElement('td'),previous=map.get(p.id)?.historico||[];
    if(previous.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=previous.length+' registro(s)';details.append(summary);for(const item of previous.slice().reverse()){const line=document.createElement('p');line.textContent=new Date(item.quando).toLocaleString('pt-BR')+' · Antes: '+[item.nome_completo,item.nome_de_guerra,item.nome_exibicao,item.funcao_sistema].filter(Boolean).join(' / ');details.append(line);}const undo=document.createElement('button');undo.type='button';undo.textContent='Usar versão anterior';undo.disabled=!canEdit;undo.onclick=()=>{const prev=previous[previous.length-1];tr.querySelector('[data-field=nome_de_guerra]').value=shown(prev);if(prev.funcao_sistema)tr.querySelector('[data-field=funcao_sistema]').value=normalizeRole(prev.funcao_sistema);
    const restored=Array.isArray(prev.funcoes_habilitadas)?prev.funcoes_habilitadas:[prev.funcao_sistema||p.funcao_sistema];
    const selectedRoles=new Set([tr.querySelector('[data-field=funcao_sistema]').value,...restored]);
    tr.querySelectorAll('[data-role]').forEach(input=>{input.checked=selectedRoles.has(input.dataset.role);});
    tr.querySelector('.names-functions summary').textContent='Funções habilitadas ('+
      tr.querySelectorAll('[data-role]:checked').length+') · conferir lista';
    check.checked=true;dirty.add(p.id);status.textContent='Versão anterior preenchida. Clique em salvar para aplicar.';};details.append(undo);hist.append(details);}else hist.textContent='Não conferido';tr.append(hist);body.append(tr);
   }
   table.append(body);section.append(table);root.append(section);
  }
  status.textContent=rows.length+' profissionais. As alterações são aplicadas ao salvar. Uma pessoa pode ter várias funções. Os plantões encerrados não são reescritos.';
 }
 dialog.querySelector('[type=search]').oninput=e=>{const q=e.target.value.toLocaleLowerCase('pt-BR');dialog.querySelectorAll('tbody tr').forEach(tr=>tr.hidden=!tr.dataset.search.includes(q));};
 const save=dialog.querySelector('[data-save]');save.disabled=!canEdit;
 save.onclick=async()=>{
  if(!isReady()){status.textContent='Conecte à internet e aguarde o envio das pendências offline antes de corrigir nomes.';return;}
  if(!dirty.size){status.textContent='Marque OK ou edite um nome antes de salvar.';return;}
  const changes=[...dirty].map(id=>{const p=rows.find(x=>x.id===id),tr=dialog.querySelector('tr[data-id="'+id+'"]');const item={id,expected:original(p)};item.funcao_sistema=tr.querySelector('[data-field=funcao_sistema]').value;item.expected_funcao=p.funcao_sistema;item.expected_funcoes=p.funcoes_habilitadas||[];item.funcoes_habilitadas=[...tr.querySelectorAll('[data-role]:checked')].map(el=>el.dataset.role);item.nome_completo=p.nome_completo;item.nome_de_guerra=tr.querySelector('[data-field=nome_de_guerra]').value.trim();item.nome_exibicao=item.nome_de_guerra;return item;});
  if(changes.length>500){status.textContent='Salve até 500 profissionais por vez.';return;}
  if(changes.some(p=>!p.funcoes_habilitadas.includes(p.funcao_sistema))){status.textContent='A função principal precisa estar marcada nas funções habilitadas.';return;}
  if(changes.some(p=>!p.nome_de_guerra)){status.textContent='Informe o nome que deve aparecer para os profissionais marcados.';return;}
  if(changes.some(p=>p.nome_completo.length<3)){status.textContent='Preencha o nome completo com pelo menos 3 caracteres.';return;}
  busy=true;save.disabled=true;
  try{const res=await client.rpc('samu_conferir_nomes',{p_changes:changes});if(res.error)throw res.error;dirty.clear();await afterSave();await load();status.textContent=res.data+' profissional(is) com nomes e funções confirmados e protegidos.';}
  catch(e){status.textContent='Não foi possível concluir: '+e.message;}
  finally{busy=false;save.disabled=!canEdit;}
 };
 try{await load();}catch(e){status.textContent='Não foi possível carregar: '+e.message;}
}
