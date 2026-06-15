import React from 'react';

export function LabelValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="u-kv">
      <div className="u-kv-label">{label}:</div>
      <div className="u-kv-value">{children}</div>
    </div>
  );
}

export function HtmlValue({ html }: { html: string }) {
  const safe = html || '';
  if (!safe.trim()) return <span>—</span>;
  return <div className="u-htmlbox" dangerouslySetInnerHTML={{ __html: safe }} />;
}
