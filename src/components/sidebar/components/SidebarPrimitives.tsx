import React from 'react';

export function LabelValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ minWidth: 92, color: 'var(--muted)', fontSize: 12 }}>{label}:</div>
      <div style={{ fontSize: 12 }}>{children}</div>
    </div>
  );
}

export function HtmlValue({ html }: { html: string }) {
  const safe = html || '';
  if (!safe.trim()) return <span>—</span>;
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.4,
        maxHeight: 160,
        overflowY: 'auto',
        padding: '6px 8px',
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--panel-subtle)',
      }}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
