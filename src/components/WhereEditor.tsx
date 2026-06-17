import React from 'react';
import type { WhereEditorHandle, WhereEditorProps } from './WhereEditor.types';

let whereEditorCMPromise: Promise<{ default: React.ComponentType<any> }> | null = null;
function loadWhereEditorCM() {
  whereEditorCMPromise ||= import('./WhereEditorCM');
  return whereEditorCMPromise;
}

const LazyWhereEditor = React.lazy(loadWhereEditorCM);

// Lightweight fallback input while CodeMirror chunk loads
function BasicWhereInputInner(props: WhereEditorProps, ref: React.ForwardedRef<WhereEditorHandle>) {
  const { value, onChange, onCommit, placeholder = '1=1', height = '32px', wrap = false, commitKey = 'enter', readOnly = false, fields, fieldsMeta, valueSamples, fieldAliases, keywords, richLoad, onFocus, onBlur, onRequestRichEditor, onBasicFocusChange, ...rest } = props as any;
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const requestRichEditor = () => {
    try { onRequestRichEditor?.(); } catch {}
  };
  React.useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      requestRichEditor();
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
      requestRichEditor();
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
    focus() { requestRichEditor(); try { inputRef.current?.focus(); } catch {} },
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
  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    try { onBasicFocusChange?.(true); } catch {}
    requestRichEditor();
    try { onFocus?.(e); } catch {}
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    try { onBasicFocusChange?.(false); } catch {}
    try { onBlur?.(e); } catch {}
  };
  if (isMulti) {
    return (
      <textarea
        ref={inputRef as any}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
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
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      readOnly={readOnly}
      style={commonStyle}
      {...rest}
    />
  );
}
const BasicWhereInput = React.forwardRef(BasicWhereInputInner as any) as any;

function WhereEditorInner(props: WhereEditorProps, ref: React.ForwardedRef<WhereEditorHandle>) {
  const richLoad = props.richLoad || 'on-focus';
  const [richReady, setRichReady] = React.useState(false);
  const [basicFocused, setBasicFocused] = React.useState(false);
  const requestRichEditor = React.useCallback(() => {
    if (richLoad === 'never') return;
    void loadWhereEditorCM().then(() => setRichReady(true));
  }, [richLoad]);

  React.useEffect(() => {
    if (richLoad === 'immediate') requestRichEditor();
    if (richLoad === 'never') setRichReady(false);
  }, [richLoad, requestRichEditor]);

  const shouldLoadRich = richLoad !== 'never' && (richLoad === 'immediate' || (richReady && !basicFocused));

  const handleRequestRich = React.useCallback(() => {
    requestRichEditor();
  }, [requestRichEditor]);
  const basicProps = React.useMemo(
    () => ({ ...props, onRequestRichEditor: handleRequestRich, onBasicFocusChange: setBasicFocused }),
    [props, handleRequestRich],
  );

  return (
    <div style={{ flex: '1 1 auto' }}>
      {shouldLoadRich ? (
        <React.Suspense fallback={<BasicWhereInput ref={ref as any} {...basicProps} />}>
          {React.createElement(LazyWhereEditor as any, { ...(props as any), ref: ref as any })}
        </React.Suspense>
      ) : (
        <BasicWhereInput ref={ref as any} {...basicProps} />
      )}
    </div>
  );
}
const WhereEditor = React.forwardRef(WhereEditorInner as any) as any;

export default WhereEditor;
export type { WhereEditorHandle, WhereEditorProps };
