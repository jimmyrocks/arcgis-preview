import React from 'react';

export default function TimeBadge({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <span style={{ display: 'inline-block', fontSize: 11, background: 'var(--panel-strong)', color: 'var(--accent)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 999 }}>
      {text}
    </span>
  );
}
