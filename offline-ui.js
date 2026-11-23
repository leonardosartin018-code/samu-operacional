export function renderOfflineStatus(status) {
  const panel = document.getElementById('offlineStatus');
  if (!panel) return;
  panel.hidden = !status.userId;
  const text = document.getElementById('offlineStatusText');
  const detail = document.getElementById('offlineStatusDetail');
  const app = document.getElementById('app');
  app?.classList.toggle('offline-saving', status.busy);
  if (app) app.inert = status.busy;
  document.querySelectorAll('.modal').forEach(modal => { modal.inert = status.busy; });
  panel.dataset.mode = status.conflict || status.error ? 'error' :
    !status.connected || status.pending ? 'pending' : 'ready';
  if (status.busy) text.textContent = 'Gravando neste computador…';
  else if (!status.prepared) text.textContent = 'Preparando cópia local do plantão…';
  else if (status.conflict) text.textContent = 'Sincronização pausada · confira o conflito';
  else if (status.error) text.textContent = 'Atenção à sincronização · ver detalhes';
  else if (status.syncing) text.textContent = 'Enviando alterações · ' + status.pending + ' pendente(s)';
  else if (!status.connected) text.textContent = 'OFFLINE · ' + status.pending + ' ação(ões) pendente(s)';
  else if (status.pending) text.textContent = 'Salvo neste computador · ' + status.pending + ' ação(ões) aguardando envio';
  else text.textContent = status.lastSync ? 'ONLINE · alterações sincronizadas' : 'ONLINE · cópia local pronta';
  detail.textContent = status.conflict || status.error ||
    (status.shellReady ? 'Arquivos disponíveis para reabrir o sistema sem internet.' : 'Preparando arquivos para abertura offline.');
  text.title=text.textContent;
  document.getElementById('offlineArchive').hidden = !status.conflict;
  document.getElementById('offlineExport').disabled = !status.pending && !status.archiveCount;
  document.getElementById('offlineRetry').disabled = status.busy || status.syncing;
}
