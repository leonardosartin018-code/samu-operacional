const DATABASE = 'samu-operacao-local-v1';
const STORE = 'usuarios';
let databasePromise;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, {keyPath: 'userId'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Feche outras abas antigas do SAMU e tente novamente.'));
    });
  }
  return databasePromise;
}

export function emptyLocalState(userId) {
  return {userId, tables: {}, scopes: {}, pending: [], archives: [], lastSync: null, prepared: false};
}

export async function readLocalState(userId) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(userId);
    request.onsuccess = () => resolve(request.result || emptyLocalState(userId));
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalState(state) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    // Só a conclusão da transação permite mostrar "salvo neste computador".
    const transaction = database.transaction(STORE, 'readwrite', {durability: 'strict'});
    transaction.objectStore(STORE).put(state);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Gravação local cancelada.'));
  });
}

export function withLocalLock(userId, callback) {
  if (!navigator.locks) {
    throw new Error('Este navegador precisa ser atualizado para permitir gravação offline segura.');
  }
  return navigator.locks.request('samu-operacao-' + userId, callback);
}
