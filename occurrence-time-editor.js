export function datetimeLocal(value){
 if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const pad=n=>String(n).padStart(2,'0');return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());
}
export function occurrenceTimeValue(value,original){return value===datetimeLocal(original)?(original||null):(value?new Date(value).toISOString():null);}
export function validateOccurrenceTimes(values){
 const fields=['acionada_em','saida_em','chegada_qth_em','inicio_retorno_em','retorno_base_em','finalizado_em'];let previous=null;
 for(const key of fields){if(!values[key])continue;const at=Date.parse(values[key]);if(!Number.isFinite(at))return 'Data ou hora inválida.';if(at>Date.now()+120000)return 'Um horário informado está no futuro.';if(previous!==null&&at<previous)return 'Confira a sequência: saída, QTH, retorno e chegada à base.';previous=at;}
 return values.saida_em?null:'Informe a data e hora de saída.';
}
export function openOccurrenceEditor(row,onSave){
 if(document.getElementById('occurrenceTimeEditor'))return;
 const dialog=document.createElement('dialog');dialog.id='occurrenceTimeEditor';dialog.innerHTML='<h2>Editar ocorrência e horários</h2><p>Confira a data completa. Uma saída de ontem e chegada de hoje inclui esse dia na duração.</p><form><div class="time-editor-fields"></div><p role="status"></p><footer><button type="button" data-cancel>Cancelar</button><button type="submit">Salvar correção</button></footer></form>';
 const fields=dialog.querySelector('.time-editor-fields');let busy=false,dirty=false;
 const specs=[['numero','Número da ocorrência','text'],['natureza','Natureza','text'],['acionada_em','Acionamento','datetime-local'],['saida_em','Início / saída','datetime-local'],['chegada_qth_em','Chegada ao QTH','datetime-local'],['inicio_retorno_em','Início do retorno','datetime-local'],['retorno_base_em','Chegada à base','datetime-local']];
 if(row.finalizado_em)specs.push(['finalizado_em','Finalização','datetime-local']);
 for(const [key,title,type] of specs){const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type=type;input.name=key;input.value=type==='datetime-local'?datetimeLocal(row[key]):row[key]||'';if(type==='text')input.maxLength=key==='numero'?80:200;input.oninput=()=>dirty=true;label.append(input);fields.append(label);}
 const close=()=>{if(busy)return;if(dirty&&!confirm('Descartar a correção não salva?'))return;dialog.close();dialog.remove();};dialog.querySelector('[data-cancel]').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(busy)return;const values={};for(const [key,,type] of specs){const value=dialog.querySelector('[name='+key+']').value.trim();values[key]=type==='datetime-local'?occurrenceTimeValue(value,row[key]):(value||null);}
 const status=dialog.querySelector('[role=status]'),error=validateOccurrenceTimes(values);if(error){status.textContent=error;return;}if(!values.numero){status.textContent='Informe o número da ocorrência.';return;}
 busy=true;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);
 try{await onSave(values);dirty=false;dialog.close();dialog.remove();}catch(err){status.textContent=err.message;}finally{busy=false;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
 };
 document.body.append(dialog);dialog.showModal();
}
