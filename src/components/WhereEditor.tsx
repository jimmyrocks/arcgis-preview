import React from 'react';
import type { WhereEditorHandle, WhereEditorProps } from './WhereEditor.types';

const LazyWhereEditor = React.lazy(() => import('./WhereEditorCM'));

// Lightweight fallback input while CodeMirror chunk loads
function BasicWhereInputInner(props: WhereEditorProps, ref: React.ForwardedRef<WhereEditorHandle>) {
  const { value, onChange, onCommit, placeholder = '1=1', height = '32px', wrap = false, commitKey = 'enter', readOnly = false, fields, fieldsMeta, valueSamples, fieldAliases, keywords, ...rest } = props as any;
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  React.useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const el = inputRef.current as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return;
      const start = (el.selectionStart ?? String(value || '').length);
      const end = (el.selectionEnd ?? String(value || '').length);
      const next = String(value || '').slice(0, start) + text + String(value || '').slice(end);
      onChange(next);
      try {
        const pos = start + text.length;
        el.setSelectionRange(pos, pos);
        el.focus();
      } catch {}
    },
    insertSnippet(text: string, cursorBack: number) {
      const el = inputRef.current as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return;
      const start = (el.selectionStart ?? String(value || '').length);
      const end = (el.selectionEnd ?? String(value || '').length);
      const next = String(value || '').slice(0, start) + text + String(value || '').slice(end);
      onChange(next);
      try {
        const pos = start + text.length - Math.max(0, cursorBack || 0);
        el.setSelectionRange(pos, pos);
        el.focus();
      } catch {}
    },
    focus() { try { inputRef.current?.focus(); } catch {} },
  }), [value, onChange]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!onCommit) return;
    const isMod = e.metaKey || e.ctrlKey;
    if ((commitKey === 'enter' && e.key === 'Enter') || (commitKey === 'mod-enter' && isMod && e.key === 'Enter')) {
      e.preventDefault();
      onCommit();
    }
  };

  const commonStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--panel-subtle)',
    color: 'var(--text)'
  };
  const isMulti = wrap || (parseInt(String(height).replace(/[^0-9]/g, ''), 10) || 0) > 40;
  if (isMulti) {
    return (
      <textarea
        ref={inputRef as any}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={Math.max(2, Math.min(8, Math.round(((parseInt(String(height).replace(/[^0-9]/g, ''), 10) || 60) - 8) / 18)))}
        readOnly={readOnly}
        style={{ ...commonStyle, resize: 'vertical' }}
        {...rest}
      />
    );
  }
  return (
    <input
      ref={inputRef as any}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      readOnly={readOnly}
      style={commonStyle}
      {...rest}
    />
  );
}
const BasicWhereInput = React.forwardRef(BasicWhereInputInner as any) as any;

function WhereEditorInner(props: WhereEditorProps, ref: React.ForwardedRef<WhereEditorHandle>) {
  return (
    <div style={{ flex: '1 1 auto' }}>
      <React.Suspense fallback={<BasicWhereInput ref={ref as any} {...props} />}>
        {React.createElement(LazyWhereEditor as any, { ...(props as any), ref: ref as any })}
      </React.Suspense>
    </div>
  );
}
const WhereEditor = React.forwardRef(WhereEditorInner as any) as any;

export default WhereEditor;
export type { WhereEditorHandle, WhereEditorProps };
