export async function prepareOfflineShell(onReady) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    throw new Error('O modo offline precisa de HTTPS ou localhost.');
  }
  // Nunca recarregar automaticamente: o operador pode estar preenchendo uma ocorrência.
  let loadedController = navigator.serviceWorker.controller;
  const showUpdate = () => {
    if (!loadedController) { loadedController = navigator.serviceWorker.controller; return; }
    if (document.getElementById('shellUpdateNotice')) return;
    const notice = document.createElement('aside');
    notice.id = 'shellUpdateNotice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:sticky;top:0;z-index:10000;padding:12px;background:#fef3c7;color:#713f12;display:flex;align-items:center;justify-content:center;gap:12px;font:600 14px system-ui';
    const message = document.createElement('span');
    message.textContent = 'Nova versão disponível. Termine e salve o formulário aberto antes de atualizar.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Atualizar sistema';
    button.style.cssText = 'padding:8px 12px;border:1px solid #854d0e;border-radius:6px;background:white;color:#713f12;font:inherit;cursor:pointer';
    button.onclick = () => {
      if (document.querySelector('#app')?.inert) return;
      location.reload();
    };
    notice.append(message, button);
    document.body.prepend(notice);
  };
  navigator.serviceWorker.addEventListener('controllerchange', showUpdate);
  const registration = await navigator.serviceWorker.register('./service-worker.js', {scope: './'});
  await navigator.serviceWorker.ready;
  const updateReadiness = async () => {
    const cache = await caches.open('samu-shell-20261122-7');
    const index = await cache.match(new URL('./index.html', location.href).href);
    onReady(!!index);
  };
  await updateReadiness();
  navigator.serviceWorker.addEventListener('controllerchange', updateReadiness);
  registration.addEventListener('updatefound', () => {
    registration.installing?.addEventListener('statechange', updateReadiness);
  });
}
