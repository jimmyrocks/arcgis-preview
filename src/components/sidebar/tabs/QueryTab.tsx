import React from 'react';
import { beautifyWhere } from '../../../lib/whereUtils';
import WhereEditor from '../../WhereEditor';

type Field = { name: string; alias?: string; type: string; length?: number };

type Props = {
  fields?: Field[];
  // Draft WHERE mirrors the header input (not yet applied)
  whereDraft?: string;
  onDraftChange?: (where: string) => void;
  onCommitDraft?: () => void;
  valueSamples?: Record<string, unknown[]>;
};

export default function QueryTab({ fields = [], whereDraft = '', onDraftChange, onCommitDraft, valueSamples = {}, layerUrl }: Props & { layerUrl?: string }) {
  const where = whereDraft || '';
  const editorRef = React.useRef<any>(null);
  const [fieldFilter, setFieldFilter] = React.useState('');
  const filteredFields = React.useMemo(() => {
    const q = fieldFilter.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter(f => (f.name || '').toLowerCase().includes(q) || (f.alias || '').toLowerCase().includes(q));
  }, [fields, fieldFilter]);
  const lastFieldRef = React.useRef<string>('');
  const stringFields = React.useMemo(() => new Set(fields.filter(f => (f.type || '').toLowerCase().includes('string')).map(f => f.name.toUpperCase())), [fields]);
  const dateFields = React.useMemo(() => new Set(fields.filter(f => (f.type || '').toLowerCase().includes('date')).map(f => f.name.toUpperCase())), [fields]);
  function isDefaultWhere() { return where.trim() === '1=1'; }
  function ensureEditStart() { if (isDefaultWhere()) onDraftChange?.(''); }
  function append(snippet: string) {
    // If default 1=1, replace entirely with the snippet
    if (isDefaultWhere()) { onDraftChange?.(snippet + ' '); return; }
    if (editorRef.current?.insertAtCursor) {
      editorRef.current.insertAtCursor(snippet + ' ');
    } else {
      const base = where.trim();
      const next = base ? `${base} ${snippet}` : snippet;
      onDraftChange?.(next + ' ');
    }
  }
  function appendField(name: string) {
    lastFieldRef.current = name;
    // If default 1=1, replace entirely with the field name
    if (isDefaultWhere()) { onDraftChange?.(name + ' '); return; }
    if (editorRef.current?.insertAtCursor) {
      editorRef.current.insertAtCursor(name + ' ');
    } else {
      const base = where.trim();
      const next = base ? `${base} ${name}` : name;
      onDraftChange?.(next + ' ');
    }
  }
  function appendFilterSmart(k: string) {
    const fld = lastFieldRef.current || '';
    if (fld && editorRef.current?.insertSnippet) {
      if (k === 'IN') { editorRef.current.insertSnippet(`${fld} IN () `, 3); return; }
      if (k === 'LIKE') { editorRef.current.insertSnippet(`${fld} LIKE '' `, 2); return; }
      if (k === 'BETWEEN') { editorRef.current.insertAtCursor(`${fld} BETWEEN `); return; }
    }
    append(k);
  }

  return (
    <div style={{ display: 'grid', gap: 10, color: 'var(--text)' }}>
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>Compose a WHERE filter using fields and helpers</div>
      {/* Editor controls above the editor */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Cmd/Ctrl+Enter to apply
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => onDraftChange?.(beautifyWhere(where, fields))}
              title="Beautify WHERE clause"
              style={{
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--panel-subtle)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              Beautify
            </button>
            <button
              title="Clear WHERE clause"
              onClick={() => onDraftChange?.('')}
              style={{
                background: 'var(--panel-subtle)',
                border: '1px solid var(--border)',
                borderRadius: '50%',
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--muted)',
              }}
            >
              ✕
            </button>
          </div>
        </div>
        <WhereEditor
          ref={editorRef}
          value={where}
          onChange={(v: string) => onDraftChange?.(v)}
          onCommit={() => { try { onCommitDraft?.(); } catch {} }}
          aria-label="WHERE editor"
          height="120px"
          wrap
          commitKey="mod-enter"
          fields={fields.map(f => f.name)}
          fieldsMeta={fields}
          fieldAliases={Object.fromEntries(fields.map(f => [f.name, f.alias || f.name]))}
          valueSamples={valueSamples}
          keywords={[
            'AND', 'OR', 'NOT', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
            '=', '<', '<=', '>', '>=', '<>'
          ]}
        />
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => { try { onCommitDraft?.(); } catch {} }}
            style={{ padding: '8px 12px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: 'pointer' }}>Apply</button>
        </div>
      </div>

      {/* Fields (scrollable to ~3 rows) */}
      {fields.length ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Fields</div>
            {/* Optional: field search */}
            <input placeholder="Search fields" onChange={(e) => setFieldFilter(e.target.value)} value={fieldFilter}
              style={{ flex: '0 0 160px', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 84, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
            {filteredFields.map(f => {
              const samples = Array.isArray((valueSamples as any)[f.name]) ? (valueSamples as any)[f.name] as unknown[] : [];
              const samplePreview = samples.slice(0, 5).map(v => String(v)).join(', ');
              const title = `${f.alias || f.name}${f.type ? ` — ${f.type}` : ''}${typeof f.length === 'number' ? ` (${f.length})` : ''}${samplePreview ? ` • e.g.: ${samplePreview}` : ''}`;
              return (
                <button key={f.name} onClick={() => appendField(f.name)} title={title}
                  style={{ padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                  {(f.alias && f.alias !== f.name) ? `${f.alias} (${f.name})` : f.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {/* Filter helpers second (scrollable to ~3 rows) */}
      <div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Filters</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 84, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 6 }}>
          {['AND','OR','NOT','LIKE','IN','BETWEEN','IS NULL','IS NOT NULL','=', '<', '<=', '>', '>=', '<>'].map((k) => (
            <button key={k} onClick={() => (k === 'IN' || k === 'LIKE' || k === 'BETWEEN') ? appendFilterSmart(k) : append(k)} style={{ padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>{k}</button>
          ))}
          {dateFields.size ? (
            <>
              <button onClick={() => append("DATE 'YYYY-MM-DD'")} title="Insert DATE literal" style={{ padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>DATE 'YYYY-MM-DD'</button>
              <button onClick={() => append("TIMESTAMP 'YYYY-MM-DD HH:MM:SS'")} title="Insert TIMESTAMP literal" style={{ padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>TIMESTAMP 'YYYY-MM-DD HH:MM:SS'</button>
            </>
          ) : null}
        </div>
      </div>
      {/* Editor moved to top; removed duplicate block */}
    </div>
  );
}
