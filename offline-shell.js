export async function prepareOfflineShell(onReady) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    throw new Error('O modo offline precisa de HTTPS ou localhost.');
  }
  const registration = await navigator.serviceWorker.register('./service-worker.js', {scope: './'});
  await navigator.serviceWorker.ready;
  const updateReadiness = async () => {
    const cache = await caches.open('samu-shell-20261122-3');
    const index = await cache.match(new URL('./index.html', location.href).href);
    onReady(!!index);
  };
  await updateReadiness();
  navigator.serviceWorker.addEventListener('controllerchange', updateReadiness);
  registration.addEventListener('updatefound', () => {
    registration.installing?.addEventListener('statechange', updateReadiness);
  });
}
