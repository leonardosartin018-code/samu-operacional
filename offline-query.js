export function sameValue(left, right) {
  if (left == null || right == null) return left == null && right == null;
  if (typeof left === 'object' || typeof right === 'object') return JSON.stringify(left) === JSON.stringify(right);
  return String(left) === String(right);
}

export function matchesFilters(row, filters) {
  return filters.every(({column, operator, value}) => {
    if (operator === 'in') return value.some(item => sameValue(row[column], item));
    if (operator === 'is' || operator === 'eq') return sameValue(row[column], value);
    throw new Error('Filtro local não suportado: ' + operator);
  });
}

export function scopeCovers(scope, filters) {
  // Um conjunto completo por plantão cobre filtros adicionais por pessoa/id.
  return scope.every(expected => filters.some(actual =>
    actual.column === expected.column && actual.operator === expected.operator &&
    sameValue(actual.value, expected.value)));
}

export function tableRows(tables, table) {
  return Object.values(tables[table] || {});
}

export function applyChanges(tables, changes) {
  for (const change of changes) {
    const rows = tables[change.table] ||= {};
    if (change.after === null) delete rows[change.id];
    else rows[change.id] = {...rows[change.id], ...change.after};
  }
}

export function materializedTables(state) {
  const tables = structuredClone(state.tables);
  for (const action of state.pending) applyChanges(tables, action.changes);
  return tables;
}

function splitColumns(selection) {
  let depth = 0;
  let start = 0;
  const parts = [];
  for (let index = 0; index < selection.length; index++) {
    if (selection[index] === '(') depth++;
    if (selection[index] === ')') depth--;
    if (selection[index] === ',' && depth === 0) {
      parts.push(selection.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(selection.slice(start).trim());
  return parts;
}

export function projectRow(row, selection, tables) {
  const columns = splitColumns(selection || '*');
  const result = columns.includes('*') ? {...row} : {};
  for (const column of columns) {
    if (column === '*') continue;
    const relation = column.match(/^(profissionais|viaturas|bases)\((.*)\)$/);
    if (!relation) {
      result[column] = row[column] ?? null;
      continue;
    }
    const foreignKey = {profissionais: 'profissional_id', viaturas: 'viatura_id', bases: 'base_id'}[relation[1]];
    const linked = tables[relation[1]]?.[row[foreignKey]];
    result[relation[1]] = linked ? projectRow(linked, relation[2], tables) : null;
  }
  return result;
}

export function queryRows(tables, spec) {
  let rows = tableRows(tables, spec.table).filter(row => matchesFilters(row, spec.filters));
  if (spec.orders.length) {
    rows.sort((left, right) => {
      for (const {column, ascending = true, nullsFirst = false} of spec.orders) {
        const a = left[column], b = right[column];
        if (sameValue(a, b)) continue;
        if (a == null) return nullsFirst ? -1 : 1;
        if (b == null) return nullsFirst ? 1 : -1;
        const comparison = a < b ? -1 : 1;
        return ascending ? comparison : -comparison;
      }
      return 0;
    });
  }
  rows = rows.slice(spec.offset, spec.limit == null ? undefined : spec.offset + spec.limit);
  return rows.map(row => projectRow(row, spec.selection, tables));
}

export function queryResult(rows, cardinality, returned = true) {
  if (!returned) return {data: null, error: null};
  if (cardinality && (rows.length > 1 || (cardinality === 'single' && rows.length !== 1))) {
    return {data: null, error: {code: 'PGRST116', message: 'A consulta não encontrou um único registro.'}};
  }
  return {data: cardinality ? rows[0] || null : rows, error: null, count: rows.length};
}
