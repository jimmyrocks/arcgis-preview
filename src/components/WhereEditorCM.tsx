import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { keymap, EditorView } from '@codemirror/view';
import { autocompletion, Completion, CompletionContext, completeFromList } from '@codemirror/autocomplete';
import { Diagnostic, linter } from '@codemirror/lint';
import type { WhereEditorHandle, WhereEditorProps } from './WhereEditor.types';

function WhereEditorCMInner({ value, placeholder = '1=1', onChange, onCommit, height = '32px', wrap = false, fields = [], fieldsMeta = [], valueSamples = {}, keywords, fieldAliases = {}, commitKey = 'enter', readOnly = false, ...rest }: WhereEditorProps, ref: React.ForwardedRef<WhereEditorHandle>) {
  const viewRef = React.useRef<EditorView | null>(null);
  React.useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const v = viewRef.current; if (!v) return;
      const sel = v.state.selection.main;
      v.dispatch({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor: sel.from + text.length } });
      try { v.focus(); } catch {}
    },
    insertSnippet(text: string, cursorBack: number) {
      const v = viewRef.current; if (!v) return;
      const sel = v.state.selection.main;
      const pos = sel.from + text.length - Math.max(0, cursorBack || 0);
      v.dispatch({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor: pos } });
      try { v.focus(); } catch {}
    },
    focus() { try { viewRef.current?.focus(); } catch {} },
  }), []);
  const extensions = React.useMemo(() => {
    const keys: any[] = [];
    if (onCommit) {
      if (commitKey === 'enter') keys.push({ key: 'Enter', run: () => { onCommit(); return true; } });
      keys.push({ key: 'Mod-Enter', run: () => { onCommit(); return true; } });
    }
    const commitExt = keys.length ? keymap.of(keys) : null;
    const exts: any[] = [sql()];
    if (wrap && EditorView?.lineWrapping) exts.push(EditorView.lineWrapping);
    try { exts.push(EditorView.updateListener.of((vu) => { try { viewRef.current = vu.view; } catch {} })); } catch {}
    const kw = (keywords && keywords.length ? keywords : [
      'AND', 'OR', 'NOT', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
      '=', '<', '<=', '>', '>=', '<>'
    ]).map((k): Completion => ({ label: k, type: /[=<>]/.test(k) ? 'operator' : 'keyword' }));
    const metaMap: Record<string, { type?: string; length?: number }> = {};
    try { for (const m of fieldsMeta || []) { if (m?.name) metaMap[m.name] = { type: m.type, length: m.length }; } } catch {}
    const fieldComps: Completion[] = (fields || []).map((f) => {
      const alias = (fieldAliases && fieldAliases[f]) ? String(fieldAliases[f]) : '';
      const label = alias && alias !== f ? `${alias} (${f})` : f;
      const md = metaMap[f];
      const info = md ? `${md.type || ''}${typeof md.length === 'number' ? ` (len ${md.length})` : ''}`.trim() : undefined;
      return { label, apply: f, type: 'variable', boost: 100, detail: md?.type, info } as Completion;
    });
    const getValueOptions = (field?: string, quotedAlready: boolean = false): Completion[] => {
      const out: Completion[] = [];
      try {
        const add = (raw: unknown, preferNumeric: boolean) => {
          if (raw == null) return;
          const isNum = typeof raw === 'number' || (preferNumeric && !Number.isNaN(Number(String(raw))));
          const s = String(raw);
          if (isNum) out.push({ label: s, apply: s, type: 'number', boost: 50 });
          else {
            const esc = s.replace(/'/g, "''");
            const apply = quotedAlready ? esc : `'${esc}'`;
            out.push({ label: esc, apply, type: 'string', boost: 40 });
          }
        };
        const maxVals = 200;
        if (field && Array.isArray((valueSamples as any)[field])) {
          const arr = (valueSamples as any)[field] as unknown[];
          const firstNonNull = arr.find((v) => v != null);
          const preferNumeric = typeof firstNonNull === 'number';
          for (const v of arr) { add(v, !!preferNumeric); if (out.length >= maxVals) break; }
        }
      } catch {}
      return out;
    };
    const source = (ctx: CompletionContext) => {
      const before = ctx.matchBefore(/[A-Za-z_][\w\.]*/);
      // Value suggestions when user just typed a quote or is in a string
      const prev = ctx.state.sliceDoc(Math.max(0, ctx.pos - 2), ctx.pos);
      const inString = (() => {
        try {
          const text = ctx.state.doc.toString();
          let inside = false;
          for (let i = 0; i < ctx.pos; i++) { if (text[i] === "'") inside = !inside; }
          return inside;
        } catch { return false; }
      })();
      if (inString || prev.endsWith("'")) {
        // Try to offer values for the last referenced field
        const doc = ctx.state.doc.toString();
        const upToPos = doc.slice(0, ctx.pos);
        const m = upToPos.match(/([A-Za-z_][\w\.]*)\s*(?:=|LIKE|IN|BETWEEN)\s*$/i);
        const field = m ? m[1] : undefined;
        const quotedAlready = prev.endsWith("'");
        const options = getValueOptions(field, quotedAlready);
        if (options.length) return { from: before?.from ?? ctx.pos, options };
      }
      const options = [...fieldComps, ...kw];
      return { from: before ? before.from : ctx.pos, options };
    };
    exts.push(autocompletion({ override: [source], defaultKeymap: true }));
    const fieldSet = new Set((fields || []).map((f) => f.toUpperCase()));
    const keywordSet = new Set(kw.map(k => k.label.toUpperCase()).concat(['NULL', 'DATE', 'TIMESTAMP', 'CURRENT_TIMESTAMP', 'IS', 'NOT']));
    const whereLinter = linter((view) => {
      const text = view.state.doc.toString();
      const diags: Diagnostic[] = [];
      const stack: number[] = [];
      let inStr = false;
      let strStart = -1;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (!inStr && ch === '(') stack.push(i);
        else if (!inStr && ch === ')') {
          if (stack.length === 0) diags.push({ from: i, to: i + 1, severity: 'error', message: 'Unmatched )' });
          else stack.pop();
        }
        if (ch === "'") {
          if (!inStr) { inStr = true; strStart = i; }
          else {
            if (text[i + 1] === "'") { i++; }
            else { inStr = false; strStart = -1; }
          }
        }
      }
      if (inStr && strStart >= 0) diags.push({ from: strStart, to: strStart + 1, severity: 'error', message: 'Unterminated string' });
      while (stack.length) { const pos = stack.pop()!; diags.push({ from: pos, to: pos + 1, severity: 'error', message: 'Unmatched (' }); }
      const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
      const isIdent = (c: string) => /[A-Za-z0-9_\.]/.test(c);
      let i = 0;
      let inside = false;
      while (i < text.length) {
        const ch = text[i];
        if (ch === "'") { inside = !inside; i++; continue; }
        if (!inside && isIdentStart(ch)) {
          const from = i; i++;
          while (i < text.length && isIdent(text[i])) i++;
          const word = text.slice(from, i);
          const upper = word.toUpperCase();
          if (!fieldSet.has(upper) && !keywordSet.has(upper) && !/^(?:TRUE|FALSE|NULL)$/.test(upper)) {
            if (!/^[0-9]/.test(word)) diags.push({ from, to: i, severity: 'warning', message: `Unknown field: ${word}` });
          }
          continue;
        }
        i++;
      }
      try {
        const typeMap: Record<string, string> = {};
        for (const f of (fieldsMeta || [])) { if ((f as any)?.name) typeMap[String((f as any).name).toUpperCase()] = String((f as any).type || '').toLowerCase(); }
        const isNumeric = (t: string) => /integer|double|float|small|short|long|oid|int|number/.test(t || '');
        const re = /\b([A-Za-z_][\w\.]*)\s*(=|!=|<>|>=|<=|<|>|LIKE|IN|BETWEEN)\s*(\((?:[^)(]+|\([^)]*\))*\)|'(?:[^']|'')*'|[^\s)]+)/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) != null) {
          const field = m[1];
          const op = (m[2] || '').toUpperCase();
          const val = m[3] || '';
          const t = typeMap[field.toUpperCase()] || '';
          if (!isNumeric(t)) continue;
          const matchStr = m[0];
          const valueOffsetInMatch = matchStr.indexOf(val);
          const valueFrom = (valueOffsetInMatch >= 0) ? (m.index + valueOffsetInMatch) : m.index;
          const valueTo = valueFrom + val.length;
          const valTrim = val.trim();
          if (op === 'LIKE') { diags.push({ from: m.index, to: m.index + matchStr.length, severity: 'error', message: `Numeric field ${field} used with LIKE; likely invalid` }); }
          if (/^'.*'$/.test(valTrim)) { diags.push({ from: valueFrom, to: valueTo, severity: 'error', message: `Numeric field ${field} compared to quoted value; remove quotes` }); }
        }
      } catch { }
      try {
        let idx = text.indexOf('!=');
        while (idx !== -1) { diags.push({ from: idx, to: idx + 2, severity: 'error', message: '!= is not supported; use <>' }); idx = text.indexOf('!=', idx + 2); }
      } catch {}
      return diags;
    });
    exts.push(whereLinter);
    if (readOnly) exts.push(EditorView.editable.of(false));
    if (commitExt) exts.push(commitExt);
    return exts;
  }, [onCommit, commitKey, wrap, readOnly, JSON.stringify(fields || []), JSON.stringify(fieldsMeta || []), JSON.stringify(valueSamples || {}), JSON.stringify(keywords || []), JSON.stringify(fieldAliases || {})]);

  return (
    <div style={{ flex: '1 1 auto' }}>
      <CodeMirror
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        extensions={extensions}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          bracketMatching: true,
        }}
        height={height}
        style={{
          fontSize: 13,
          borderRadius: 8,
          border: '1px solid var(--border)',
          overflow: 'visible',
        }}
        {...rest}
      />
    </div>
  );
}
const WhereEditorCM = React.forwardRef(WhereEditorCMInner as any) as any;

export default WhereEditorCM;
