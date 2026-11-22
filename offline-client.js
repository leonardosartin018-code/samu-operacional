import {readLocalState, saveLocalState, withLocalLock} from './offline-store.js';
import {sameValue, matchesFilters, scopeCovers, tableRows, materializedTables, applyChanges, queryRows, queryResult} from './offline-query.js';
import {OFFLINE_SCHEMA} from './offline-schema.js';
import {runLocalRpc} from './offline-rpc.js';

const TABLES = new Set([
  ...Object.keys(OFFLINE_SCHEMA), 'bases', 'usuarios_perfis',
  'escala_fixa_anapolis', 'escala_fixa_interna_anapolis', 'revezamento_plantao'
]);
const VOLATILE = new Set(['criado_em', 'atualizado_em', 'alterado_em']);
const copy = value => structuredClone(value);
const rowKey = row => row.id || row.user_id;
const localError = message => ({data: null, error: {code: 'SAMU_LOCAL', message}});

class LocalQuery {
  constructor(owner, table) {
    this.owner = owner;
    this.spec = {table, method: 'select', filters: [], orders: [], selection: '*', offset: 0,
      limit: null, cardinality: null, returned: true};
  }
  select(selection = '*') { this.spec.selection = selection; this.spec.returned = true; return this; }
  insert(values) { return this.write('insert', values); }
  upsert(values, options = {}) { this.spec.conflict = options.onConflict; return this.write('upsert', values); }
  update(values) { return this.write('update', values); }
  delete() { return this.write('delete', null); }
  write(method, values) { Object.assign(this.spec, {method, values, returned: false}); return this; }
  eq(column, value) { this.spec.filters.push({column, value, operator: 'eq'}); return this; }
  is(column, value) { this.spec.filters.push({column, value, operator: 'is'}); return this; }
  in(column, value) { this.spec.filters.push({column, value, operator: 'in'}); return this; }
  order(column, options = {}) { this.spec.orders.push({column, ...options}); return this; }
  range(start, end) { this.spec.offset = start; this.spec.limit = end - start + 1; return this; }
  limit(value) { this.spec.limit = value; return this; }
  single() { this.spec.cardinality = 'single'; return this; }
  maybeSingle() { this.spec.cardinality = 'maybeSingle'; return this; }
  then(resolve, reject) {
    this.promise ||= this.owner.execute(this.spec);
    return this.promise.then(resolve, reject);
  }
}

export function createOfflineClient(remote, {onStatus, onChange, onRollback, beforeAction} = {}) {
  let userId = null;
  let state = null;
  let draft = null;
  let action = null;
  let connected = navigator.onLine;
  let flushing = false;
  let lastError = '';
  let shellReady = false;
  let timer;
  let refreshing = false;
  let destroyed = false;
  let offlineIdentity = false;
  let userActionInFlight = false;

  function status() {
    const conflict = state?.pending.find(item => item.error);
    return {connected: connected && navigator.onLine, shellReady, prepared: !!state?.prepared, pending: state?.pending.length || 0,
      syncing: flushing, busy: !!action || userActionInFlight, error: lastError, conflict: conflict?.error || '',
      lastSync: state?.lastSync || null, userId, archiveCount: state?.archives.length || 0};
  }
  function notify() { onStatus?.(status()); }
  function view() { return draft || materializedTables(state); }
  function isCovered(spec) {
    return (state.scopes[spec.table] || []).some(scope => scopeCovers(scope, spec.filters));
  }
  function rememberScope(spec) {
    const scopes = state.scopes[spec.table] ||= [];
    if (!scopes.some(scope => scopeCovers(scope, spec.filters))) scopes.push(copy(spec.filters));
  }
  async function locked(callback) {
    if (!userId) throw new Error('Entre no sistema antes de acessar os dados locais.');
    return withLocalLock(userId, async () => {
      state = await readLocalState(userId);
      return callback();
    });
  }
  function fail(message, alreadyNotified = false) {
    if (action) {
      action.error ||= String(message);
      action.alreadyNotified ||= alreadyNotified;
    }
  }
  function guard(spec) {
    if (!action || action.changes.size) return;
    // Antes de alterar dados, guardar a versão consultada no começo da ação.
    const fields = spec.selection.includes('*') ? null : spec.selection.split(',').filter(key => !key.includes('('));
    const rows = tableRows(action.start, spec.table).filter(row => matchesFilters(row, spec.filters));
    const key = JSON.stringify([spec.table, spec.filters, fields]);
    if (action.guards.some(item => item.key === key)) return;
    if (action.guards.length >= 96) throw new Error('Consultas demais na mesma ação. Divida a alteração em grupos menores.');
    action.guards.push({key, table: spec.table, filters: copy(spec.filters),
      rows: rows.map(row => {
        const result = {};
        for (const name of fields || Object.keys(row)) {
          if (!VOLATILE.has(name)) result[name] = row[name] ?? null;
        }
        result.id = rowKey(row);
        return result;
      })});
  }
  async function fetchRows(spec) {
    let query = remote.from(spec.table).select('*');
    for (const {column, operator, value} of spec.filters) query = query[operator](column, value);
    for (const {column, ...options} of spec.orders) query = query.order(column, options);
    const primaryKey = spec.table === 'usuarios_perfis' ? 'user_id' : 'id';
    if (!spec.orders.some(order => order.column === primaryKey)) query = query.order(primaryKey);
    // Paginar os cadastros que ultrapassam o limite padrão da API.
    const rows = [];
    let offset = 0;
    while (true) {
      const result = await query.range(offset, offset + 499).abortSignal(AbortSignal.timeout(8000));
      if (result.error) {
        if (result.status >= 500 || !result.error.code || /fetch|network|abort|timeout/i.test(result.error.message)) {
          connected = false;
          throw new Error('Conexão indisponível.');
        }
        throw Object.assign(new Error(result.error.message), {remote: true});
      }
      rows.push(...result.data);
      if (result.data.length < 500) break;
      offset += 500;
    }
    connected = true;
    return rows;
  }
  async function read(spec) {
    if (!action && navigator.onLine && connected && !offlineIdentity) {
      try {
        const rows = await fetchRows(spec);
        await locked(async () => {
          const table = state.tables[spec.table] ||= {};
          for (const row of Object.values(table)) {
            if (matchesFilters(row, spec.filters)) delete table[rowKey(row)];
          }
          for (const row of rows) table[rowKey(row)] = row;
          rememberScope(spec);
          await saveLocalState(state);
        });
      } catch (error) {
        if (error.remote) throw error;
        if (!isCovered(spec)) throw new Error('Estes dados ainda não foram preparados neste computador. Conecte à internet.');
      }
    }
    if (!isCovered(spec)) throw new Error('Consulta indisponível na cópia local. Conecte à internet para carregá-la.');
    guard(spec);
    return queryResult(queryRows(view(), spec), spec.cardinality);
  }
  function record(table, before, after) {
    const id = rowKey(after || before);
    const key = table + ':' + id;
    const previous = action.changes.get(key);
    action.changes.set(key, {table, id, before: previous ? previous.before : copy(before), after: copy(after)});
    const rows = draft[table] ||= {};
    if (after) rows[id] = copy(after);
    else delete rows[id];
  }
  async function write(spec) {
    if (!action) return transaction('Atualizar ' + spec.table, () => write(spec));
    if (!state.prepared) throw new Error('A preparação offline precisa terminar antes de gravar.');
    const profile = state.tables.usuarios_perfis?.[userId];
    if (!profile?.ativo || !['ADMIN', 'RADIO_OPERADOR'].includes(profile.papel)) {
      throw new Error('Este perfil não pode alterar o plantão.');
    }
    const schema = OFFLINE_SCHEMA[spec.table];
    if (!schema) throw new Error('Esta tabela é somente leitura na operação local.');
    if (['update', 'delete'].includes(spec.method) && !spec.filters.length) {
      throw new Error('A gravação precisa identificar os registros.');
    }
    let affected = [];
    const existing = tableRows(draft, spec.table);
    if (spec.method === 'insert' || spec.method === 'upsert') {
      const values = Array.isArray(spec.values) ? spec.values : [spec.values];
      for (const input of values) {
        const keys = spec.conflict ? spec.conflict.split(',') : ['id'];
        const before = spec.method === 'upsert'
          ? existing.find(row => keys.every(key => input[key] != null && sameValue(row[key], input[key]))) || null : null;
        if (input.id && !before && draft[spec.table]?.[input.id]) throw new Error('Registro local duplicado.');
        const defaults = {};
        if (!before) {
          for (const [column, value] of Object.entries(schema.defaults)) {
            defaults[column] = value === '$now' ? new Date().toISOString() : value;
          }
        }
        const after = {...defaults, ...before, ...input, id: before?.id || input.id || crypto.randomUUID()};
        for (const column of Object.keys(after)) {
          if (!schema.columns.includes(column)) throw new Error('Coluna não reconhecida: ' + column);
        }
        record(spec.table, before, after);
        affected.push(after);
      }
    } else {
      affected = existing.filter(row => matchesFilters(row, spec.filters));
      if (spec.method === 'update') {
        if (Object.keys(spec.values).some(key => key === 'id' || !schema.columns.includes(key))) {
          throw new Error('Coluna inválida para edição.');
        }
        affected = affected.map(before => {
          const after = {...before, ...spec.values};
          record(spec.table, before, after);
          return after;
        });
      } else {
        for (const before of affected) record(spec.table, before, null);
      }
    }
    return queryResult(affected, spec.cardinality, spec.returned);
  }
  async function execute(spec) {
    try {
      if (!state) throw new Error('Acesso local ainda não inicializado.');
      return spec.method === 'select' ? await read(spec) : await write(spec);
    } catch (error) {
      fail(error.message);
      lastError = error.message;
      notify();
      return localError(error.message);
    }
  }
  async function transaction(label, callback) {
    if (action) return callback();
    let committedCallbacks = [];
    try {
      const result = await locked(async () => {
        const initial = materializedTables(state);
        draft = copy(initial);
        action = {id: crypto.randomUUID(), label, createdAt: new Date().toISOString(),
          changes: new Map(), guards: [], start: initial, error: null, afterCommit: []};
        notify();
        let result;
        try {
          result = await callback();
          if (action.error === 'Operação cancelada pelo operador.' && !action.changes.size) return result;
          if (action.error) {
            const error = new Error(action.error);
            error.alreadyNotified = action.alreadyNotified;
            throw error;
          }
          const changes = [...action.changes.values()].filter(item =>
            JSON.stringify(item.before) !== JSON.stringify(item.after));
          if (changes.length) {
            const pending = {id: action.id, label, createdAt: action.createdAt,
              changes, guards: action.guards.map(({key, ...guard}) => guard)};
            if (changes.length > 500 || new Blob([JSON.stringify(pending)]).size > 1800000) {
              throw new Error('A ação excede o tamanho permitido. Faça a alteração em grupos menores.');
            }
            const committedState = copy(state);
            committedState.pending.push(pending);
            // Nenhuma confirmação local acontece antes deste commit atômico.
            await saveLocalState(committedState);
            state = committedState;
            lastError = '';
          }
          committedCallbacks = action.afterCommit;
          return result;
        } catch (error) {
          error.rollbackNeeded = action.changes.size > 0;
          throw error;
        } finally {
          draft = null;
          action = null;
          notify();
        }
      });
      for (const callback of committedCallbacks) {
        try { callback(); }
        catch (error) {
          lastError = 'Ação salva localmente. Não foi possível atualizar a tela: ' + error.message;
          notify();
        }
      }
      queueMicrotask(() => synchronize());
      return result;
    } catch (error) {
      lastError = 'Alteração cancelada: ' + error.message;
      notify();
      await onRollback?.(lastError, {alreadyNotified: error.alreadyNotified, changed: error.rollbackNeeded});
      return localError(lastError);
    }
  }
  async function rpc(name, params) {
    return transaction('Operação ' + name, async () => {
      try {
        return {data: await runLocalRpc(name, params, {
          from: table => new LocalQuery(api, table),
          rows: (table, filters = []) => {
            const projection = {
              ocorrencias: 'id,plantao_id,viatura_id,status,inicio_retorno_em,creditou_revezamento,acionada_em',
              profissionais: 'id,ativo,funcao_sistema,nome_completo',
              bases: 'id,nome'
            };
            guard({table, filters, selection: projection[table] || '*'});
            return tableRows(view(), table).filter(row => matchesFilters(row, filters));
          },
          userId
        }), error: null};
      } catch (error) {
        fail(error.message);
        return localError(error.message);
      }
    });
  }
  async function synchronize() {
    if (destroyed || !userId || flushing || action || !navigator.onLine) return;
    const syncUser = userId;
    const wasConnected = connected;
    flushing = true;
    notify();
    let drained = false;
    try {
      // Separar o bloqueio de envio do bloqueio da gravação local.
      // Uma conexão lenta não impede o rádio de continuar trabalhando.
      await withLocalLock(syncUser + '-envio', async () => {
        const authentication = await Promise.race([
          remote.auth.getSession(),
          new Promise(resolve => setTimeout(() => resolve({data: {session: null}}), 6000))
        ]);
        const {data: {session}, error: sessionError} = authentication;
        if (sessionError || session?.user.id !== syncUser) {
          throw new Error('Entre novamente na mesma conta para enviar as pendências.');
        }
        const profile = await remote.from('usuarios_perfis').select('*').eq('user_id', syncUser)
          .maybeSingle().abortSignal(AbortSignal.timeout(5000));
        if (profile.error) {
          connected = false;
          throw new Error('Conexão indisponível. A cópia local continua disponível.');
        }
        connected = true;
        offlineIdentity = false;
        await locked(async () => {
          const profiles = state.tables.usuarios_perfis ||= {};
          if (profile.data) profiles[syncUser] = profile.data;
          else delete profiles[syncUser];
          await saveLocalState(state);
        });
        if (!profile.data?.ativo) {
          throw new Error('O perfil não está autorizado.');
        }
        if (state.pending.length && !['ADMIN', 'RADIO_OPERADOR'].includes(profile.data.papel)) {
          throw new Error('O perfil precisa de autorização para enviar as pendências.');
        }
        while (!destroyed && userId === syncUser && navigator.onLine) {
          const pending = await locked(async () => copy(state.pending[0] || null));
          if (!pending || pending.error) break;
          const response = await remote.rpc('samu_aplicar_acao_offline', {p_action: pending})
            .abortSignal(AbortSignal.timeout(12000));
          if (response.error) {
            if (response.status >= 500 || ['57014', '55P03'].includes(response.error.code) ||
                !response.error.code || /fetch|network|abort|timeout/i.test(response.error.message)) {
              connected = false;
              lastError = 'Conexão interrompida. As pendências continuam neste computador.';
              break;
            }
            if (response.error.code === 'PGRST202') {
              lastError = 'Preparação do banco offline pendente de instalação.';
              break;
            }
            await locked(async () => {
              const head = state.pending[0];
              if (head?.id !== pending.id) throw new Error('A fila mudou durante o envio.');
              head.error = response.error.message;
              head.errorCode = response.error.code;
              await saveLocalState(state);
            });
            lastError = 'Sincronização pausada para conferência.';
            break;
          }
          if (response.data?.id !== pending.id || !response.data.appliedAt) {
            throw new Error('Confirmação do banco incompleta. A ação permanece na fila local.');
          }
          await locked(async () => {
            if (state.pending[0]?.id !== pending.id) throw new Error('A fila mudou durante o envio.');
            applyChanges(state.tables, pending.changes);
            state.pending.shift();
            state.lastSync = response.data.appliedAt;
            lastError = '';
            await saveLocalState(state);
            drained = !state.pending.length;
          });
        }
      });
    } catch (error) {
      lastError = error.message;
    } finally {
      flushing = false;
      notify();
    }
    if (drained || (!wasConnected && connected)) onChange?.();
  }
  async function setUser(id, {offline = false} = {}) {
    offlineIdentity = offline;
    connected = offline ? false : navigator.onLine;
    if (userId === id && state) return;
    if (userId) {
      await withLocalLock(userId + '-envio', async () => {});
      await withLocalLock(userId, async () => {});
    }
    userId = id;
    state = id ? await readLocalState(id) : null;
    if (id) localStorage.setItem('samu-offline-usuario', id);
    notify();
  }
  async function prepare(plantaoId) {
    if (!userId || action || refreshing || !navigator.onLine) return;
    refreshing = true;
    try {
      const capabilities = await remote.rpc('samu_offline_capacidades')
        .abortSignal(AbortSignal.timeout(6000));
      if (capabilities.error || capabilities.data?.version !== 1) {
        throw new Error('O banco ainda não confirmou a instalação desta versão offline.');
      }
      const specs = [
        ['bases', []], ['viaturas', []], ['profissionais', []],
        ['plantoes', []], ['escala_fixa_anapolis', []], ['escala_fixa_interna_anapolis', []],
        ...['equipe_plantao', 'ocorrencias', 'revezamento_plantao', 'prioridade_manual_revezamento',
          'escala_interna_plantao', 'livro_plantao'].map(table =>
          [table, plantaoId ? [{column: 'plantao_id', operator: 'eq', value: plantaoId}] : []]),
        // Ocupação de médicos e registros pendentes de outros turnos também são relevantes.
        ['equipe_ocorrencia', []], ['ocorrencias', []]
      ];
      for (const [table, filters] of specs) {
        const result = await execute({table, filters, method: 'select', selection: '*',
          orders: [], offset: 0, limit: null, cardinality: null});
        if (result.error) throw new Error(result.error.message);
      }
      await locked(async () => {
        state.prepared = true;
        await saveLocalState(state);
      });
      navigator.storage?.persist?.().catch(() => {});
      lastError = '';
    } catch (error) {
      lastError = 'Preparação incompleta: ' + error.message;
    } finally {
      refreshing = false;
      notify();
    }
  }
  async function resumeIdentity() {
    const id = localStorage.getItem('samu-offline-usuario');
    if (!id) return null;
    const stored = await readLocalState(id);
    if (!stored.prepared || !stored.tables.usuarios_perfis?.[id]?.ativo) return null;
    return {user: {id}, offline: true};
  }
  async function archivePending() {
    if (flushing || action) throw new Error('Aguarde o envio ou a gravação atual antes de arquivar.');
    await locked(async () => {
      state.archives.push({createdAt: new Date().toISOString(), actions: state.pending});
      state.pending = [];
      state.prepared = false;
      state.scopes = {};
      await saveLocalState(state);
    });
    lastError = '';
    notify();
    onChange?.();
  }
  function exportPending() {
    const blob = new Blob([JSON.stringify({userId, exportedAt: new Date().toISOString(),
      pending: state.pending, archives: state.archives}, null, 2)], {type: 'application/json'});
    const anchor = document.createElement('a');
    const url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = 'samu-pendencias-' + new Date().toISOString().slice(0, 10) + '.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const api = {
    from(table) {
      if (!TABLES.has(table)) throw new Error('Tabela não preparada para uso local: ' + table);
      return new LocalQuery(api, table);
    },
    execute, rpc, transaction, setUser, prepare, synchronize, resumeIdentity,
    async userAction(label, callback) {
      if (userActionInFlight) return localError('Aguarde a gravação da ação anterior.');
      userActionInFlight = true;
      notify();
      try { await beforeAction?.(); return await transaction(label, callback); }
      finally { userActionInFlight = false; notify(); }
    },
    status, fail, archivePending, exportPending,
    afterCommit(callback) {
      if (!action) return false;
      action.afterCommit.push(callback);
      return true;
    },
    cancel() { if (action) action.error = 'Operação cancelada pelo operador.'; },
    setShellReady(value) { shellReady = value; notify(); },
    async clearIdentity() {
      localStorage.removeItem('samu-offline-usuario');
      await setUser(null);
    },
    destroy() { destroyed = true; clearInterval(timer); }
  };
  window.addEventListener('online', () => { connected = true; notify(); synchronize(); });
  window.addEventListener('offline', () => { connected = false; notify(); });
  timer = setInterval(() => synchronize(), 15000);
  return api;
}
