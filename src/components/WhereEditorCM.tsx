import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { autocompletion, Completion, CompletionContext, startCompletion } from '@codemirror/autocomplete';
import { Diagnostic, linter } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import type { WhereEditorHandle, WhereEditorProps } from './WhereEditor.types';

type FieldMeta = { name?: string; type?: string; length?: number };
type FieldKind = 'string' | 'numeric' | 'date' | 'other';

const FIELD_SECTION = { name: 'Fields', rank: 0 };
const OPERATOR_SECTION = { name: 'Operators', rank: 1 };
const VALUE_SECTION = { name: 'Values', rank: 2 };
const KEYWORD_SECTION = { name: 'Keywords', rank: 3 };

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function getFieldKind(type?: string): FieldKind {
  const t = String(type || '').toLowerCase();
  if (/date/.test(t)) return 'date';
  if (/integer|double|float|small|short|long|oid|int|number/.test(t)) return 'numeric';
  if (/string|guid|globalid/.test(t)) return 'string';
  return 'other';
}

function isInsideSqlString(text: string, pos: number): boolean {
  let inside = false;
  for (let i = 0; i < pos; i++) {
    if (text[i] !== "'") continue;
    if (inside && text[i + 1] === "'") {
      i++;
      continue;
    }
    inside = !inside;
  }
  return inside;
}

function findCurrentStringStart(text: string, pos: number): number | null {
  let inside = false;
  let start: number | null = null;
  for (let i = 0; i < pos; i++) {
    if (text[i] !== "'") continue;
    if (inside && text[i + 1] === "'") {
      i++;
      continue;
    }
    inside = !inside;
    start = inside ? i + 1 : null;
  }
  return inside ? start : null;
}

function dedupeCompletions(options: Completion[]): Completion[] {
  const seen = new Set<string>();
  const out: Completion[] = [];
  for (const option of options) {
    const key = `${option.label}::${typeof option.apply === 'string' ? option.apply : option.detail || ''}::${option.type || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

function snippetCompletion(label: string, snippet: string, type: string, section: string | { name: string; rank?: number }): Completion {
  const markerIndex = snippet.indexOf('|');
  const insert = markerIndex >= 0 ? `${snippet.slice(0, markerIndex)}${snippet.slice(markerIndex + 1)}` : snippet;
  return {
    label,
    type,
    section,
    apply(view, _completion, from, to) {
      const anchor = from + (markerIndex >= 0 ? markerIndex : insert.length);
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor },
      });
      queueNextCompletion(view);
    },
  };
}

function queueNextCompletion(view: EditorView): void {
  window.setTimeout(() => {
    try { startCompletion(view); } catch {}
  }, 0);
}

function formatDateLiteral(raw: unknown): string {
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

function formatValueLiteral(fieldName: string | undefined, raw: unknown, metaMap: Record<string, FieldMeta>, fieldNameByUpper: Record<string, string>, quotedAlready: boolean): string {
  const resolved = fieldName ? (fieldNameByUpper[fieldName.toUpperCase()] || fieldName) : undefined;
  const meta = resolved ? metaMap[resolved] : undefined;
  const kind = getFieldKind(meta?.type);
  if (raw == null) return 'NULL';
  if (kind === 'numeric') return String(raw);
  if (kind === 'date') return formatDateLiteral(raw);
  const escaped = escapeSqlString(String(raw));
  return quotedAlready ? escaped : `'${escaped}'`;
}

function buildValueCompletions(
  fieldName: string | undefined,
  metaMap: Record<string, FieldMeta>,
  valueSamples: Record<string, unknown[]>,
  fieldNameByUpper: Record<string, string>,
  quotedAlready: boolean
): Completion[] {
  const resolved = fieldName ? (fieldNameByUpper[fieldName.toUpperCase()] || fieldName) : undefined;
  const meta = resolved ? metaMap[resolved] : undefined;
  const kind = getFieldKind(meta?.type);
  const out: Completion[] = [];
  const seen = new Set<string>();
  const values = resolved && Array.isArray(valueSamples[resolved]) ? valueSamples[resolved] : [];
  for (const raw of values) {
    const label = kind === 'date' ? formatDateLiteral(raw) : String(raw);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      label,
      displayLabel: String(raw),
      apply(view, _completion, from, to) {
        const insert = formatValueLiteral(resolved, raw, metaMap, fieldNameByUpper, quotedAlready);
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
        });
        queueNextCompletion(view);
      },
      type: kind === 'numeric' ? 'number' : kind === 'date' ? 'constant' : 'string',
      boost: 60,
      section: VALUE_SECTION,
    });
    if (out.length >= 60) break;
  }
  if (kind === 'date') {
    out.push(snippetCompletion("DATE 'YYYY-MM-DD'", "DATE '|'", 'keyword', VALUE_SECTION));
    out.push(snippetCompletion("TIMESTAMP 'YYYY-MM-DD HH:MM:SS'", "TIMESTAMP '|'", 'keyword', VALUE_SECTION));
    out.push({ label: 'CURRENT_TIMESTAMP', type: 'keyword', section: VALUE_SECTION, apply: 'CURRENT_TIMESTAMP' });
  }
  return dedupeCompletions(out);
}

function buildOperatorCompletions(fieldName: string | undefined, metaMap: Record<string, FieldMeta>, fieldNameByUpper: Record<string, string>): Completion[] {
  const resolved = fieldName ? (fieldNameByUpper[fieldName.toUpperCase()] || fieldName) : undefined;
  const meta = resolved ? metaMap[resolved] : undefined;
  const kind = getFieldKind(meta?.type);
  const out: Completion[] = [
    snippetCompletion('=', ' = |', 'operator', OPERATOR_SECTION),
    snippetCompletion('<>', ' <> |', 'operator', OPERATOR_SECTION),
    snippetCompletion('IN', ' IN (|) ', 'operator', OPERATOR_SECTION),
    snippetCompletion('IS NULL', ' IS NULL ', 'keyword', OPERATOR_SECTION),
    snippetCompletion('IS NOT NULL', ' IS NOT NULL ', 'keyword', OPERATOR_SECTION),
  ];
  if (kind !== 'string') {
    out.push(snippetCompletion('>', ' > |', 'operator', OPERATOR_SECTION));
    out.push(snippetCompletion('>=', ' >= |', 'operator', OPERATOR_SECTION));
    out.push(snippetCompletion('<', ' < |', 'operator', OPERATOR_SECTION));
    out.push(snippetCompletion('<=', ' <= |', 'operator', OPERATOR_SECTION));
    out.push(snippetCompletion('BETWEEN', ' BETWEEN | AND ', 'operator', OPERATOR_SECTION));
  } else {
    out.push(snippetCompletion('LIKE', " LIKE '|'", 'operator', OPERATOR_SECTION));
    out.push(snippetCompletion('BETWEEN', " BETWEEN '|' AND ''", 'operator', OPERATOR_SECTION));
  }
  if (kind === 'date') {
    out.push(snippetCompletion('BETWEEN', " BETWEEN DATE '|' AND DATE ''", 'operator', OPERATOR_SECTION));
  }
  return dedupeCompletions(out);
}

function buildConnectorCompletions(): Completion[] {
  return [
    snippetCompletion('AND', ' AND ', 'keyword', KEYWORD_SECTION),
    snippetCompletion('OR', ' OR ', 'keyword', KEYWORD_SECTION),
  ];
}

function WhereEditorCMInner({ value, placeholder = '1=1', onChange, onCommit, height = '32px', wrap = false, fields = [], fieldsMeta = [], valueSamples = {}, keywords, fieldAliases = {}, commitKey = 'enter', readOnly = false, ...rest }: WhereEditorProps, ref: React.ForwardedRef<WhereEditorHandle>) {
  const viewRef = React.useRef<EditorView | null>(null);
  React.useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const sel = view.state.selection.main;
      view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor: sel.from + text.length } });
      try { view.focus(); } catch {}
    },
    insertSnippet(text: string, cursorBack: number) {
      const view = viewRef.current;
      if (!view) return;
      const sel = view.state.selection.main;
      const anchor = sel.from + text.length - Math.max(0, cursorBack || 0);
      view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor } });
      try { view.focus(); } catch {}
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

    const fieldNameByUpper: Record<string, string> = {};
    const metaMap: Record<string, FieldMeta> = {};
    for (const field of fields || []) fieldNameByUpper[String(field).toUpperCase()] = String(field);
    for (const meta of fieldsMeta || []) {
      if (!meta?.name) continue;
      metaMap[String(meta.name)] = { type: meta.type, length: meta.length };
      fieldNameByUpper[String(meta.name).toUpperCase()] = String(meta.name);
    }

    const kwLabels = (keywords && keywords.length ? keywords : [
      'AND', 'OR', 'NOT', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
      '=', '<', '<=', '>', '>=', '<>'
    ]);
    const keywordComps: Completion[] = kwLabels.map((label) => ({
      label,
      type: /[=<>]/.test(label) ? 'operator' : 'keyword',
      section: KEYWORD_SECTION,
    }));
    const fieldComps: Completion[] = (fields || []).map((field) => {
      const alias = fieldAliases && fieldAliases[field] ? String(fieldAliases[field]) : '';
      const meta = metaMap[field];
      return {
        label: alias && alias !== field ? `${alias} (${field})` : field,
        apply(view, _completion, from, to) {
          view.dispatch({
            changes: { from, to, insert: field },
            selection: { anchor: from + String(field).length },
          });
          queueNextCompletion(view);
        },
        type: 'variable',
        boost: 100,
        detail: meta?.type,
        info: meta ? `${meta.type || ''}${typeof meta.length === 'number' ? ` (len ${meta.length})` : ''}`.trim() : undefined,
        section: FIELD_SECTION,
      } as Completion;
    });

    const source = (ctx: CompletionContext) => {
      const doc = ctx.state.doc.toString();
      const upToPos = doc.slice(0, ctx.pos);
      const beforeIdent = ctx.matchBefore(/[A-Za-z_][\w\.]*/);
      const inString = isInsideSqlString(doc, ctx.pos);

      const stringStart = inString ? findCurrentStringStart(doc, ctx.pos) : null;
      if (stringStart != null) {
        const simpleString = upToPos.match(/([A-Za-z_][\w\.]*)\s*(=|<>|>=|<=|<|>|LIKE)\s*'(?:[^']|'')*$/i);
        if (simpleString) {
          const fieldName = fieldNameByUpper[simpleString[1].toUpperCase()] || simpleString[1];
          const options = buildValueCompletions(fieldName, metaMap, valueSamples as Record<string, unknown[]>, fieldNameByUpper, true);
          if (options.length) return { from: stringStart, options };
        }
      }

      const inListMatch = upToPos.match(/([A-Za-z_][\w\.]*)\s+IN\s*\(([^()]*)$/i);
      if (inListMatch) {
        const fieldName = fieldNameByUpper[inListMatch[1].toUpperCase()] || inListMatch[1];
        const part = (inListMatch[2].split(',').pop() || '');
        const trimmedStart = part.match(/^\s*/)?.[0] || '';
        const typedPart = part.slice(trimmedStart.length);
        const quotedAlready = typedPart.startsWith("'") || inString;
        const from = quotedAlready && stringStart != null ? stringStart : ctx.pos - (quotedAlready ? typedPart.slice(1).length : typedPart.length);
        const options = buildValueCompletions(fieldName, metaMap, valueSamples as Record<string, unknown[]>, fieldNameByUpper, quotedAlready);
        if (options.length) return { from: Math.max(0, from), options };
      }

      const betweenSecondMatch = upToPos.match(/([A-Za-z_][\w\.]*)\s+BETWEEN\s+.+?\s+AND\s*([A-Za-z0-9_:\-\.]*)$/i);
      if (betweenSecondMatch) {
        const fieldName = fieldNameByUpper[betweenSecondMatch[1].toUpperCase()] || betweenSecondMatch[1];
        const typed = betweenSecondMatch[2] || '';
        const options = buildValueCompletions(fieldName, metaMap, valueSamples as Record<string, unknown[]>, fieldNameByUpper, false);
        if (options.length) return { from: ctx.pos - typed.length, options };
      }

      const betweenFirstMatch = upToPos.match(/([A-Za-z_][\w\.]*)\s+BETWEEN\s*([A-Za-z0-9_:\-\.]*)$/i);
      if (betweenFirstMatch) {
        const fieldName = fieldNameByUpper[betweenFirstMatch[1].toUpperCase()] || betweenFirstMatch[1];
        const typed = betweenFirstMatch[2] || '';
        const options = buildValueCompletions(fieldName, metaMap, valueSamples as Record<string, unknown[]>, fieldNameByUpper, false);
        if (options.length) return { from: ctx.pos - typed.length, options };
      }

      const simpleValueMatch = upToPos.match(/([A-Za-z_][\w\.]*)\s*(=|<>|>=|<=|<|>|LIKE)\s*([A-Za-z0-9_:\-\.]*)$/i);
      if (simpleValueMatch) {
        const fieldName = fieldNameByUpper[simpleValueMatch[1].toUpperCase()] || simpleValueMatch[1];
        const typed = simpleValueMatch[3] || '';
        const options = buildValueCompletions(fieldName, metaMap, valueSamples as Record<string, unknown[]>, fieldNameByUpper, false);
        if (options.length) return { from: ctx.pos - typed.length, options };
      }

      if (beforeIdent && beforeIdent.to === ctx.pos) {
        const exactField = fieldNameByUpper[beforeIdent.text.toUpperCase()];
        const beforeField = upToPos.slice(0, beforeIdent.from);
        if (exactField && /(?:^|\(|\s)(?:AND\s+|OR\s+|NOT\s+)?$/i.test(beforeField)) {
          return { from: ctx.pos, options: buildOperatorCompletions(exactField, metaMap, fieldNameByUpper) };
        }
      }

      if (/(?:\)|NULL|TRUE|FALSE|CURRENT_TIMESTAMP|[0-9]+(?:\.[0-9]+)?|'(?:[^']|'')*')\s*$/i.test(upToPos)) {
        return { from: ctx.pos, options: buildConnectorCompletions() };
      }

      const fieldContext = /(?:^|\(|\s)(?:AND\s+|OR\s+|NOT\s+)?([A-Za-z_][\w\.]*)?$/i.test(upToPos);
      if (fieldContext || ctx.explicit || beforeIdent) {
        const from = beforeIdent ? beforeIdent.from : ctx.pos;
        return {
          from,
          options: dedupeCompletions([
            ...fieldComps,
            ...keywordComps.filter((item) => item.label === 'NOT'),
          ]),
        };
      }

      return null;
    };

    exts.push(autocompletion({ override: [source], defaultKeymap: true, activateOnTyping: true }));

    const fieldSet = new Set((fields || []).map((field) => String(field).toUpperCase()));
    const keywordSet = new Set(keywordComps.map((item) => item.label.toUpperCase()).concat([
      'NULL', 'DATE', 'TIMESTAMP', 'CURRENT_TIMESTAMP', 'IS', 'NOT', 'TRUE', 'FALSE',
      'WHERE', 'SELECT', 'FROM', 'ORDER', 'GROUP', 'BY',
    ]));

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
          if (!inStr) {
            inStr = true;
            strStart = i;
          } else if (text[i + 1] === "'") {
            i++;
          } else {
            inStr = false;
            strStart = -1;
          }
        }
      }
      if (inStr && strStart >= 0) diags.push({ from: strStart, to: strStart + 1, severity: 'error', message: 'Unterminated string' });
      while (stack.length) {
        const pos = stack.pop()!;
        diags.push({ from: pos, to: pos + 1, severity: 'error', message: 'Unmatched (' });
      }

      const leadingWhere = text.match(/^\s*where\b/i);
      if (leadingWhere) {
        const from = leadingWhere[0].toLowerCase().indexOf('where');
        diags.push({
          from,
          to: from + 5,
          severity: 'warning',
          message: 'Only the WHERE body is needed. "WHERE" will be stripped on apply.',
        });
      }
      const selectMatch = text.match(/\bselect\b/i);
      if (selectMatch?.index != null) {
        diags.push({
          from: selectMatch.index,
          to: selectMatch.index + selectMatch[0].length,
          severity: 'error',
          message: 'Only enter the WHERE clause, not a full SELECT statement.',
        });
      }
      const fromMatch = text.match(/\bfrom\b/i);
      if (fromMatch?.index != null) {
        diags.push({
          from: fromMatch.index,
          to: fromMatch.index + fromMatch[0].length,
          severity: 'error',
          message: 'Only enter the WHERE clause, not a full SELECT statement.',
        });
      }
      const trailingSemicolon = text.match(/;+\s*$/);
      if (trailingSemicolon?.index != null) {
        diags.push({
          from: trailingSemicolon.index,
          to: trailingSemicolon.index + trailingSemicolon[0].trimEnd().length,
          severity: 'warning',
          message: 'Trailing semicolons are ignored.',
        });
      }

      const isIdentStart = (char: string) => /[A-Za-z_]/.test(char);
      const isIdent = (char: string) => /[A-Za-z0-9_\.]/.test(char);
      let i = 0;
      let insideString = false;
      while (i < text.length) {
        const ch = text[i];
        if (ch === "'") {
          if (insideString && text[i + 1] === "'") {
            i += 2;
            continue;
          }
          insideString = !insideString;
          i++;
          continue;
        }
        if (!insideString && isIdentStart(ch)) {
          const from = i;
          i++;
          while (i < text.length && isIdent(text[i])) i++;
          const word = text.slice(from, i);
          const upper = word.toUpperCase();
          if (!fieldSet.has(upper) && !keywordSet.has(upper) && !/^(?:TRUE|FALSE|NULL)$/.test(upper) && !/^[0-9]/.test(word)) {
            diags.push({ from, to: i, severity: 'warning', message: `Unknown field: ${word}` });
          }
          continue;
        }
        i++;
      }

      try {
        const typeMap: Record<string, string> = {};
        for (const meta of fieldsMeta || []) {
          if ((meta as any)?.name) typeMap[String((meta as any).name).toUpperCase()] = String((meta as any).type || '').toLowerCase();
        }
        const isNumeric = (type: string) => /integer|double|float|small|short|long|oid|int|number/.test(type || '');
        const re = /\b([A-Za-z_][\w\.]*)\s*(=|!=|<>|>=|<=|<|>|LIKE|IN|BETWEEN)\s*(\((?:[^)(]+|\([^)]*\))*\)|'(?:[^']|'')*'|[^\s)]+)/gi;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) != null) {
          const field = match[1];
          const op = (match[2] || '').toUpperCase();
          const val = match[3] || '';
          const fieldType = typeMap[field.toUpperCase()] || '';
          if (!isNumeric(fieldType)) continue;
          const valueOffset = match[0].indexOf(val);
          const valueFrom = valueOffset >= 0 ? match.index + valueOffset : match.index;
          const valueTo = valueFrom + val.length;
          if (op === 'LIKE') diags.push({ from: match.index, to: match.index + match[0].length, severity: 'error', message: `Numeric field ${field} used with LIKE; likely invalid` });
          if (/^'.*'$/.test(val.trim())) diags.push({ from: valueFrom, to: valueTo, severity: 'error', message: `Numeric field ${field} compared to quoted value; remove quotes` });
        }
      } catch {}

      let invalidNotEqual = text.indexOf('!=');
      while (invalidNotEqual !== -1) {
        diags.push({ from: invalidNotEqual, to: invalidNotEqual + 2, severity: 'error', message: '!= is not supported; use <>' });
        invalidNotEqual = text.indexOf('!=', invalidNotEqual + 2);
      }

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
