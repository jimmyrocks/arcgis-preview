import React from 'react';
import { fetchDistinctFieldValues } from '../../../lib/esriLayer';
import { beautifyWhere } from '../../../lib/whereUtils';
import {
  buildWhereCondition,
  formatWhereValuePreview,
  getWhereFieldKind,
  isBlankWhere,
  type WhereFieldKind,
  type WhereOperator
} from '../../../lib/whereBuilder';
import WhereEditor from '../../WhereEditor';

type Field = { name: string; alias?: string; type: string; length?: number };

type Props = {
  fields?: Field[];
  appliedWhere?: string;
  whereDraft?: string;
  onDraftChange?: (where: string) => void;
  onCommitDraft?: () => void;
  onClearWhere?: () => void;
  valueSamples?: Record<string, unknown[]>;
};

type ClickOperator = Extract<WhereOperator, '=' | '<>' | '>' | '>=' | '<' | '<=' | 'CONTAINS' | 'STARTS_WITH' | 'IS NULL' | 'IS NOT NULL'>;

const OPERATOR_LABELS: Record<ClickOperator, string> = {
  '=': '=',
  '<>': '<>',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  CONTAINS: 'contains',
  STARTS_WITH: 'starts with',
  'IS NULL': 'is blank',
  'IS NOT NULL': 'is filled',
};

function summarizeFilter(where: string): string {
  const text = isBlankWhere(where) ? 'All features' : where.trim().replace(/\s+/g, ' ');
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function normalizeWhereForCompare(where: string | undefined | null): string {
  return isBlankWhere(where || '') ? '1=1' : String(where || '').trim().replace(/\s+/g, ' ');
}

function fieldLabel(field: Field): string {
  return field.alias && field.alias !== field.name ? `${field.alias} (${field.name})` : field.name;
}

function operatorsForKind(kind: WhereFieldKind): ClickOperator[] {
  if (kind === 'string') return ['=', '<>', 'CONTAINS', 'STARTS_WITH', 'IS NULL', 'IS NOT NULL'];
  if (kind === 'numeric' || kind === 'date') return ['=', '<>', '>', '>=', '<', '<=', 'IS NULL', 'IS NOT NULL'];
  return ['=', '<>', 'IS NULL', 'IS NOT NULL'];
}

function needsValue(operator: ClickOperator): boolean {
  return operator !== 'IS NULL' && operator !== 'IS NOT NULL';
}

function operatorSnippet(operator: ClickOperator): string {
  if (operator === 'CONTAINS' || operator === 'STARTS_WITH') return ' LIKE ';
  if (operator === 'IS NULL' || operator === 'IS NOT NULL') return ` ${operator}`;
  return ` ${operator} `;
}

function conditionPrefix(where: string): string {
  const base = isBlankWhere(where) ? '' : where.trim();
  if (!base) return '';
  if (/\b(AND|OR|NOT)$/i.test(base) || /\($/.test(base)) return `${base} `;
  return `${base} AND `;
}

export default function QueryTab({
  fields = [],
  appliedWhere,
  whereDraft = '',
  onDraftChange,
  onCommitDraft,
  onClearWhere,
  valueSamples = {},
  layerUrl,
}: Props & { layerUrl?: string }) {
  const where = whereDraft || '';
  const editorValue = isBlankWhere(where) ? '' : where;
  const hasPendingDraft = normalizeWhereForCompare(where) !== normalizeWhereForCompare(appliedWhere ?? where);
  const editorRef = React.useRef<any>(null);
  const [fieldFilter, setFieldFilter] = React.useState('');
  const [selectedField, setSelectedField] = React.useState<string>('');
  const [selectedOperator, setSelectedOperator] = React.useState<ClickOperator | ''>('');
  const [typedValue, setTypedValue] = React.useState('');
  const [builderPrefix, setBuilderPrefix] = React.useState('');
  const [remoteValueSamples, setRemoteValueSamples] = React.useState<Record<string, unknown[]>>({});
  const [loadingField, setLoadingField] = React.useState<string>('');
  const [valueLoadError, setValueLoadError] = React.useState<string>('');

  const filteredFields = React.useMemo(() => {
    const q = fieldFilter.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter((field) => (
      field.name || ''
    ).toLowerCase().includes(q) || (
      field.alias || ''
    ).toLowerCase().includes(q));
  }, [fields, fieldFilter]);

  const fieldMap = React.useMemo(() => {
    const out = new Map<string, Field>();
    for (const field of fields) out.set(field.name, field);
    return out;
  }, [fields]);

  const mergedValueSamples = React.useMemo(() => {
    const out: Record<string, unknown[]> = {};
    const keys = new Set<string>([...Object.keys(valueSamples || {}), ...Object.keys(remoteValueSamples || {})]);
    for (const key of keys) {
      const next: unknown[] = [];
      const seen = new Set<string>();
      for (const source of [valueSamples, remoteValueSamples]) {
        const values = Array.isArray((source as any)?.[key]) ? ((source as any)[key] as unknown[]) : [];
        for (const value of values) {
          const dedupeKey = typeof value === 'string' ? value : JSON.stringify(value);
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          next.push(value);
        }
      }
      out[key] = next;
    }
    return out;
  }, [valueSamples, remoteValueSamples]);

  const selectedFieldMeta = selectedField ? fieldMap.get(selectedField) : undefined;
  const selectedFieldKind = selectedFieldMeta ? getWhereFieldKind(selectedFieldMeta.type) : 'other';
  const selectedFieldValues = selectedField ? (mergedValueSamples[selectedField] || []) : [];
  const operatorChoices = React.useMemo(() => operatorsForKind(selectedFieldKind), [selectedFieldKind]);
  const hasRemoteValues = selectedField ? Array.isArray(remoteValueSamples[selectedField]) && remoteValueSamples[selectedField].length > 0 : false;

  function formatValuePreview(fieldName: string, raw: unknown): string {
    return formatWhereValuePreview(getWhereFieldKind(fieldMap.get(fieldName)?.type), raw);
  }

  function selectField(name: string) {
    const prefix = conditionPrefix(where);
    setSelectedField(name);
    setSelectedOperator('');
    setTypedValue('');
    setBuilderPrefix(prefix);
    const kind = getWhereFieldKind(fieldMap.get(name)?.type);
    const nextOperators = operatorsForKind(kind);
    if (selectedOperator && !nextOperators.includes(selectedOperator)) setSelectedOperator('');
    onDraftChange?.(`${prefix}${name} `);
    try { editorRef.current?.focus?.(); } catch {}
  }

  function addCondition(operator: ClickOperator | '' = selectedOperator, raw?: unknown) {
    if (!selectedField) return;
    const effectiveOperator = operator || '=';
    const condition = buildWhereCondition(selectedField, effectiveOperator, raw, selectedFieldKind);
    if (!condition) return;
    onDraftChange?.(`${builderPrefix}${condition}`);
    setTypedValue('');
    try { editorRef.current?.focus?.(); } catch {}
  }

  function addTypedValue() {
    if (!typedValue.trim()) return;
    addCondition(selectedOperator, typedValue.trim());
  }

  function chooseOperator(operator: ClickOperator) {
    setSelectedOperator(operator);
    setTypedValue('');
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      addCondition(operator);
      return;
    }
    if (!selectedField) return;
    onDraftChange?.(`${builderPrefix}${selectedField}${operatorSnippet(operator)}`);
    try { editorRef.current?.focus?.(); } catch {}
  }

  function appendConnector(connector: 'AND' | 'OR') {
    const base = where.trim();
    if (isBlankWhere(base)) return;
    const next = /\b(AND|OR)$/i.test(base)
      ? base.replace(/\b(AND|OR)$/i, connector)
      : `${base} ${connector} `;
    onDraftChange?.(next);
    setSelectedField('');
    setSelectedOperator('');
    setTypedValue('');
    setBuilderPrefix(next);
    try { editorRef.current?.focus?.(); } catch {}
  }

  function handleEditorChange(value: string) {
    onDraftChange?.(value);
    setSelectedField('');
    setSelectedOperator('');
    setTypedValue('');
    setBuilderPrefix('');
  }

  React.useEffect(() => {
    if (!selectedField) return;
    if (!fieldMap.has(selectedField)) {
      setSelectedField('');
      return;
    }
    if (!layerUrl || Array.isArray(remoteValueSamples[selectedField])) return;
    const controller = new AbortController();
    const field = fieldMap.get(selectedField);
    const type = String(field?.type || '').toLowerCase();
    if (!field || /blob|raster|xml|geometry/i.test(type)) return () => controller.abort();
    setLoadingField(selectedField);
    setValueLoadError('');
    void fetchDistinctFieldValues(layerUrl, selectedField, { signal: controller.signal, where: '1=1', limit: 50 })
      .then((values) => {
        if (controller.signal.aborted) return;
        setRemoteValueSamples((prev) => ({ ...prev, [selectedField]: values }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setValueLoadError(`Could not load values for ${selectedField}.`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingField((current) => (current === selectedField ? '' : current));
      });
    return () => controller.abort();
  }, [selectedField, layerUrl, fieldMap, remoteValueSamples]);

  return (
    <div style={{ display: 'grid', gap: 12, color: 'var(--text)', minWidth: 0, padding: '0 6px 16px' }}>
      <section style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div className="u-muted u-small">Query</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
              {hasPendingDraft ? 'Draft filter' : isBlankWhere(where) ? 'Showing all features' : 'Filtering features'}
            </div>
          </div>
          <span
            className="u-small"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 9999,
              padding: '3px 8px',
              color: hasPendingDraft ? 'var(--accent)' : isBlankWhere(where) ? 'var(--muted)' : 'var(--text)',
              background: 'var(--panel-subtle)',
              flex: '0 0 auto',
            }}
          >
            {hasPendingDraft ? 'Draft' : isBlankWhere(where) ? 'No filter' : 'Active'}
          </span>
        </div>

        <WhereEditor
          ref={editorRef}
          value={editorValue}
          onChange={handleEditorChange}
          onCommit={() => { try { onCommitDraft?.(); } catch {} }}
          aria-label="WHERE editor"
          placeholder="Start with a field..."
          height="84px"
          wrap
          commitKey="mod-enter"
          fields={fields.map((field) => field.name)}
          fieldsMeta={fields}
          fieldAliases={Object.fromEntries(fields.map((field) => [field.name, field.alias || field.name]))}
          valueSamples={mergedValueSamples}
          keywords={[
            'AND', 'OR', 'NOT', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
            '=', '<', '<=', '>', '>=', '<>'
          ]}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { try { onCommitDraft?.(); } catch {} }} disabled={!hasPendingDraft} className="u-btn">Apply</button>
          <button type="button" onClick={() => onDraftChange?.(beautifyWhere(where, fields))} className="u-btn">Format</button>
          <button type="button" onClick={() => onDraftChange?.('')} className="u-btn">Clear</button>
          <button type="button" onClick={() => { if (onClearWhere) onClearWhere(); else onDraftChange?.('1=1'); }} className="u-btn">Show all</button>
        </div>

        {!isBlankWhere(where) ? (
          <code
            title={where.trim()}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--panel-subtle)',
              color: 'var(--muted)',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {summarizeFilter(where)}
          </code>
        ) : null}
      </section>

      <section style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className="u-muted u-small">Click builder</div>
          {selectedFieldMeta ? <div className="u-small u-muted">{selectedFieldKind}</div> : null}
        </div>

        <input
          placeholder="Search fields"
          value={fieldFilter}
          onChange={(event) => setFieldFilter(event.target.value)}
          className="u-input"
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 96, overflow: 'auto', padding: 1 }}>
          {filteredFields.map((field) => {
            const active = selectedField === field.name;
            const samples = Array.isArray(mergedValueSamples[field.name]) ? mergedValueSamples[field.name] : [];
            const samplePreview = samples.slice(0, 5).map((value) => formatValuePreview(field.name, value)).join(', ');
            const title = `${field.alias || field.name}${field.type ? ` - ${field.type}` : ''}${typeof field.length === 'number' ? ` (${field.length})` : ''}${samplePreview ? ` | ${samplePreview}` : ''}`;
            return (
              <button
                key={field.name}
                type="button"
                onClick={() => selectField(field.name)}
                title={title}
                aria-pressed={active}
                style={{
                  padding: '5px 9px',
                  borderRadius: 9999,
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(37, 99, 235, 0.12)' : 'var(--panel-subtle)',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {fieldLabel(field)}
              </button>
            );
          })}
          {!filteredFields.length ? <span className="u-small u-muted">No matching fields.</span> : null}
        </div>

        {selectedFieldMeta ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {operatorChoices.map((operator) => (
                <button
                  key={operator}
                  type="button"
                  onClick={() => chooseOperator(operator)}
                  aria-pressed={selectedOperator === operator}
                  style={{
                    padding: '5px 9px',
                    borderRadius: 9999,
                    border: `1px solid ${selectedOperator === operator ? 'var(--accent)' : 'var(--border)'}`,
                    background: selectedOperator === operator ? 'rgba(37, 99, 235, 0.12)' : 'var(--panel-subtle)',
                    color: 'var(--text)',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  {OPERATOR_LABELS[operator]}
                </button>
              ))}
            </div>

            {selectedOperator && needsValue(selectedOperator) ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                  <input
                    className="u-input"
                    value={typedValue}
                    onChange={(event) => setTypedValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTypedValue();
                      }
                    }}
                    placeholder="Type a value"
                  />
                  <button type="button" className="u-btn" onClick={addTypedValue} disabled={!typedValue.trim()}>
                    Add
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflow: 'auto', padding: 1 }}>
                  {selectedFieldValues.map((value, index) => (
                    <button
                      key={`${selectedField}-${index}-${String(value)}`}
                      type="button"
                      onClick={() => addCondition(selectedOperator, value)}
                      title={buildWhereCondition(selectedField, selectedOperator || '=', value, selectedFieldKind)}
                      style={{
                        padding: '5px 9px',
                        borderRadius: 9999,
                        border: '1px solid var(--border)',
                        background: 'var(--panel-subtle)',
                        color: 'var(--text)',
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      {formatValuePreview(selectedField, value)}
                    </button>
                  ))}
                  {!selectedFieldValues.length && loadingField !== selectedField ? <span className="u-small u-muted">No sample values.</span> : null}
                  {loadingField === selectedField ? <span className="u-small u-muted">Loading values...</span> : null}
                  {valueLoadError && loadingField !== selectedField ? <span className="u-small" style={{ color: 'tomato' }}>{valueLoadError}</span> : null}
                </div>
                {selectedFieldValues.length ? (
                  <div className="u-small u-muted">
                    {hasRemoteValues ? 'Distinct values from the server.' : 'Values from loaded features.'}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {!isBlankWhere(where) ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="u-small u-muted">Next</span>
            <button type="button" className="u-btn" style={{ padding: '5px 10px' }} onClick={() => appendConnector('AND')}>AND</button>
            <button type="button" className="u-btn" style={{ padding: '5px 10px' }} onClick={() => appendConnector('OR')}>OR</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
