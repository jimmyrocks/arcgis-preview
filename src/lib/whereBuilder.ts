export type WhereFieldKind = 'string' | 'numeric' | 'date' | 'other';

export type WhereOperator =
  | '='
  | '<>'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'LIKE'
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'IN'
  | 'BETWEEN'
  | 'IS NULL'
  | 'IS NOT NULL';

export function getWhereFieldKind(type: string | undefined | null): WhereFieldKind {
  const t = String(type || '').toLowerCase();
  if (/date/.test(t)) return 'date';
  if (/integer|double|float|small|short|long|oid|int|number/.test(t)) return 'numeric';
  if (/string/.test(t)) return 'string';
  return 'other';
}

export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function formatDateLiteral(raw: unknown): string {
  const asNumber = typeof raw === 'number' ? raw : Number(String(raw));
  const date = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return `DATE '${escapeSqlString(String(raw))}'`;
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  if (hh === '00' && min === '00' && ss === '00') return `DATE '${yyyy}-${mm}-${dd}'`;
  return `TIMESTAMP '${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}'`;
}

export function formatWhereValue(kind: WhereFieldKind, raw: unknown): string {
  if (raw == null) return 'NULL';
  if (kind === 'numeric') return String(raw);
  if (kind === 'date') return formatDateLiteral(raw);
  return `'${escapeSqlString(String(raw))}'`;
}

export function formatWhereValuePreview(kind: WhereFieldKind, raw: unknown): string {
  if (raw == null) return 'NULL';
  if (kind === 'date') {
    const asNumber = typeof raw === 'number' ? raw : Number(String(raw));
    const date = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(String(raw));
    if (!Number.isNaN(date.getTime())) return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  }
  return String(raw);
}

export function isBlankWhere(where: string | undefined | null): boolean {
  const trimmed = String(where || '').trim();
  return !trimmed || trimmed === '1=1';
}

export function buildWhereCondition(field: string, operator: WhereOperator, rawValue?: unknown, kind: WhereFieldKind = 'other'): string {
  const cleanField = String(field || '').trim();
  if (!cleanField) return '';
  if (operator === 'IS NULL' || operator === 'IS NOT NULL') return `${cleanField} ${operator}`;

  if (operator === 'CONTAINS' || operator === 'STARTS_WITH' || operator === 'ENDS_WITH') {
    const rawText = String(rawValue ?? '');
    const escaped = escapeSqlString(rawText);
    const pattern =
      operator === 'STARTS_WITH' ? `${escaped}%` :
      operator === 'ENDS_WITH' ? `%${escaped}` :
      `%${escaped}%`;
    return `${cleanField} LIKE '${pattern}'`;
  }

  if (operator === 'IN') {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return `${cleanField} IN (${values.map((value) => formatWhereValue(kind, value)).join(', ')})`;
  }

  if (operator === 'BETWEEN') {
    const values = Array.isArray(rawValue) ? rawValue : [];
    const first = values[0] ?? '';
    const second = values[1] ?? '';
    return `${cleanField} BETWEEN ${formatWhereValue(kind, first)} AND ${formatWhereValue(kind, second)}`;
  }

  const value = formatWhereValue(kind, rawValue ?? '');
  return `${cleanField} ${operator} ${value}`;
}

export function joinWhereCondition(current: string | undefined | null, condition: string, connector: 'AND' | 'OR' = 'AND'): string {
  const cleanCondition = condition.trim();
  if (!cleanCondition) return String(current || '').trim();
  const base = String(current || '').trim();
  if (isBlankWhere(base)) return cleanCondition;
  if (/\b(AND|OR|NOT)$/i.test(base) || /\($/.test(base)) return `${base} ${cleanCondition}`;
  return `${base} ${connector} ${cleanCondition}`;
}
