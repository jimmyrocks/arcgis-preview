import React from 'react';
import type { Feature } from 'geojson';
import CopyButton from './ui/CopyButton';
import { formatAttrValue } from '../lib/format';

export default function PopupContent({ feature, layerName, maxWidth = 340, maxHeight = 240 }: { feature: Feature; layerName?: string; maxWidth?: number; maxHeight?: number }) {
  const { properties = {}, geometry, id } = feature as any;
  const [tab, setTab] = React.useState<'attrs' | 'json'>('attrs');

  const entries = React.useMemo(() => Object.entries(properties || {})
    .filter(([k]) => !['__id', '__precision_m', '__zoom'].includes(k)), [properties]);

  const jsonPretty = React.useMemo(() => JSON.stringify(properties || {}, null, 2), [properties]);

  return (
    <div
      className="odl-pop-react"
      style={{
        maxWidth,
        width: maxWidth,
        minWidth: 280,
        font: '12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
        color: '#e6e8ef',
        background: '#0c0f1a',
        border: '1px solid #2b3050',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid #2b3050', background: '#12162a' }}>
        <div style={{ fontWeight: 600, flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{layerName || 'Feature'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', color: '#c3c7d5' }}>
          <Badge title="Geometry type">{String((geometry && (geometry as any).type) || 'Unknown')}</Badge>
          {id !== undefined && id !== null ? <Badge title="Feature id">id: {String(id)}</Badge> : null}
          {layerName ? <Badge title="Layer name">{layerName}</Badge> : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '6px 8px', borderBottom: '1px solid #2b3050', background: '#0c0f1a', alignItems: 'center' }}>
        <TabButton active={tab === 'attrs'} onClick={() => setTab('attrs')}>Attributes</TabButton>
        <TabButton active={tab === 'json'} onClick={() => setTab('json')}>JSON</TabButton>
        <div style={{ marginLeft: 'auto' }} />
        <CopyButton text={tab === 'json' ? jsonPretty : jsonPretty} />
      </div>

      {tab === 'attrs' ? (
        <div style={{ maxHeight, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {entries.length === 0 ? (
                <tr><td style={{ color: '#9aa0b4', padding: '8px 10px' }} colSpan={2}>(no attributes)</td></tr>
              ) : entries.map(([k, v]) => (
                <tr key={k}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', whiteSpace: 'nowrap', color: '#e6e8ef', borderTop: '1px solid #1b2238' }}>{k}</th>
                  <td style={{ padding: '6px 10px', color: '#c3c7d5', borderTop: '1px solid #1b2238' }}>{formatAttrValue(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ maxHeight, overflow: 'auto', padding: '8px 10px', background: '#0c0f1a' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre', color: '#c3c7d5' }}>{jsonPretty}</pre>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: `1px solid ${active ? '#5b8cff' : '#2b3050'}`, background: active ? '#1b2238' : '#12162a', color: '#e6e8ef', cursor: 'pointer' }}
    >{children}</button>
  );
}

function Badge({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <span title={title} style={{ display: 'inline-block', fontSize: 11, border: '1px solid #2b3050', borderRadius: 999, padding: '2px 6px', background: '#0c0f1a' }}>{children}</span>
  );
}

// formatting moved to lib/format
