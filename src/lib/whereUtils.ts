export function beautifyWhere(s: string, fieldsMeta: Array<{ name: string; type?: string; length?: number }> = []): string {
  try {
    const K = ['AND','OR','NOT','LIKE','IN','BETWEEN','IS','NULL','NOT NULL','IS NULL','IS NOT NULL'];
    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === "'") {
        out += ch; i++;
        while (i < s.length) {
          const c2 = s[i]; out += c2; i++;
          if (c2 === "'" && s[i] !== "'") break;
          if (c2 === "'" && s[i] === "'") { out += s[i]; i++; }
        }
        continue;
      }
      const rest = s.slice(i);
      const op = rest.match(/^(<=|>=|<>|!=|=|<|>)/);
      if (op) {
        const operator = op[1] === '!=' ? '<>' : op[1];
        out = out.trimEnd() + ' ' + operator + ' ';
        i += op[1].length;
        continue;
      }
      const mSpace = rest.match(/^\s+/); if (mSpace) { out += ' '; i += mSpace[0].length; continue; }
      const w = rest.match(/^[A-Za-z_][A-Za-z0-9_\.]*/);
      if (w) { const upper = w[0].toUpperCase(); out += (K.includes(upper) ? upper : w[0]); i += w[0].length; continue; }
      out += ch; i++;
    }
    out = out.replace(/\s+/g, ' ').trim();

    const stringFields = new Set((fieldsMeta || [])
      .filter((f: any) => String(f?.type || '').toLowerCase().includes('string'))
      .map((f: any) => String(f.name || '').toUpperCase()));
    const dateFields = new Set((fieldsMeta || [])
      .filter((f: any) => String(f?.type || '').toLowerCase().includes('date'))
      .map((f: any) => String(f.name || '').toUpperCase()));
    const esc = (v: string) => v.replace(/'/g, "''");
    out = out.replace(/\b([A-Za-z_][\w\.]*)\s+IN\s*\(([^)]*)\)/gi, (m, field, list) => {
      if (!stringFields.has(String(field).toUpperCase())) return m;
      const items = String(list).split(',').map((t: string) => t.trim()).filter(Boolean).map((t: string) => /^'.*'$/.test(t) ? t : `'${esc(t)}'`);
      return `${field} IN (${items.join(', ')})`;
    });
    out = out.replace(/\b([A-Za-z_][\w\.]*)\s*(=|<>|LIKE)\s*(\((?:[^)(]+|\([^)]*\))*\)|'(?:[^']|'')*'|[^\s\)]+)/gi, (m, field, op, val) => {
      if (!stringFields.has(String(field).toUpperCase())) return m;
      if (/^'(?:[^']|'')*'$/.test(val)) return `${field} ${op} ${val}`;
      if (val === 'NULL') return `${field} ${op} ${val}`;
      return `${field} ${op} '${esc(val)}'`;
    });
    out = out.replace(/\b([A-Za-z_][\w\.]*)\s+BETWEEN\s+([^\s]+)\s+AND\s+([^\s\)]+)/gi, (m, field, a, b) => {
      const UF = String(field).toUpperCase();
      if (stringFields.has(UF)) {
        const qa = /^'.*'$/.test(a) ? a : `'${esc(a)}'`;
        const qb = /^'.*'$/.test(b) ? b : `'${esc(b)}'`;
        return `${field} BETWEEN ${qa} AND ${qb}`;
      }
      if (dateFields.has(UF)) {
        const qa = /^DATE\s+'/.test(a) || /^TIMESTAMP\s+'/.test(a) || /^'.*'$/.test(a) ? a : `DATE '${esc(a)}'`;
        const qb = /^DATE\s+'/.test(b) || /^TIMESTAMP\s+'/.test(b) || /^'.*'$/.test(b) ? b : `DATE '${esc(b)}'`;
        return `${field} BETWEEN ${qa} AND ${qb}`;
      }
      return m;
    });
    out = out.replace(/\b([A-Za-z_][\w\.]*)\s*(=|<>|>=|<=|<|>)\s*(\((?:[^)(]+|\([^)]*\))*\)|'(?:[^']|'')*'|[^\s\)]+)/gi, (m, field, op, val) => {
      const UF = String(field).toUpperCase();
      if (!dateFields.has(UF)) return m;
      if (/^DATE\s+'/.test(val) || /^TIMESTAMP\s+'/.test(val)) return `${field} ${op} ${val}`;
      if (/^'(?:[^']|'')*'$/.test(val)) return `${field} ${op} ${val}`;
      return `${field} ${op} DATE '${esc(val)}'`;
    });

    // Unquote numeric values for numeric fields
    const numericFields = new Set((fieldsMeta || []).filter((f: any) => /integer|double|float|small|short|long|oid|int|number/i.test(String(f?.type || ''))).map((f: any) => String(f.name || '').toUpperCase()));
    if (numericFields.size) {
      out = out.replace(/\b([A-Za-z_][\w\.]*)\s*(=|!=|<>|>=|<=|<|>)\s*'(.*?)'/gi, (m, field, op, inner) => {
        const UF = String(field).toUpperCase();
        if (!numericFields.has(UF)) return m;
        return `${field} ${op} ${inner.replace(/''/g, "'")}`;
      });
      // IN list: remove quotes around items for numeric fields
      out = out.replace(/\b([A-Za-z_][\w\.]*)\s+IN\s*\(([^)]*)\)/gi, (m, field, list) => {
        const UF = String(field).toUpperCase();
        if (!numericFields.has(UF)) return m;
        const items = String(list).split(',').map((t: string) => t.trim()).filter(Boolean).map((t: string) => t.replace(/^'(.*)'$/s, '$1'));
        return `${field} IN (${items.join(', ')})`;
      });
      // BETWEEN quoted bounds
      out = out.replace(/\b([A-Za-z_][\w\.]*)\s+BETWEEN\s+([^\s]+)\s+AND\s+([^\s\)]+)/gi, (m, field, a, b) => {
        const UF = String(field).toUpperCase();
        if (!numericFields.has(UF)) return m;
        const aa = a.replace(/^'(.*)'$/s, '$1');
        const bb = b.replace(/^'(.*)'$/s, '$1');
        return `${field} BETWEEN ${aa} AND ${bb}`;
      });
    }
    return out;
  } catch { return s; }
}

export function validateWhere(
  text: string,
  fieldSet: Set<string>,
  fieldsMeta?: Array<{ name: string; type?: string; length?: number }>
): { errors: string[]; unknown: string[]; warnings: string[] } {
  const errors: string[] = [];
  const unknown: string[] = [];
  const warnings: string[] = [];
  let inStr = false; let strStart = -1; const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inStr && ch === '(') stack.push(i);
    else if (!inStr && ch === ')') { if (stack.length === 0) errors.push('Unmatched )'); else stack.pop(); }
    if (ch === "'") {
      if (!inStr) { inStr = true; strStart = i; }
      else { if (text[i + 1] === "'") { i++; } else { inStr = false; strStart = -1; } }
    }
  }
  if (inStr && strStart >= 0) errors.push('Unterminated string');
  if (stack.length) errors.push('Unmatched (');
  const keywordSet = new Set(['AND','OR','NOT','LIKE','IN','BETWEEN','IS','NULL','TRUE','FALSE']);
  const seen = new Set<string>();
  let i = 0; let inside = false;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") { inside = !inside; i++; continue; }
    if (!inside && /[A-Za-z_]/.test(ch)) {
      const from = i; i++;
      while (i < text.length && /[A-Za-z0-9_\.]/.test(text[i])) i++;
      const word = text.slice(from, i);
      const upper = word.toUpperCase();
      if (!fieldSet.has(upper) && !keywordSet.has(upper) && !/^[0-9]/.test(word)) {
        if (!seen.has(upper)) { unknown.push(word); seen.add(upper); }
      }
      continue;
    }
    i++;
  }
  // Numeric field quoted value / LIKE misuse warnings
  try {
    const typeMap: Record<string, string> = {};
    for (const f of (fieldsMeta || [])) { if (f?.name) typeMap[f.name.toUpperCase()] = String(f.type || '').toLowerCase(); }
    const isNumeric = (t: string) => /integer|double|float|small|short|long|oid|int|number/.test(t);
    const isDate = (t: string) => /date/.test(t);
    const re = /\b([A-Za-z_][\w\.]*)\s*(=|!=|<>|>=|<=|<|>|LIKE|IN|BETWEEN)\s*(\((?:[^)(]+|\([^)]*\))*\)|'(?:[^']|'')*'|[^\s)]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) != null) {
      const field = m[1];
      const op = m[2].toUpperCase();
      const val = m[3];
      const metaType = typeMap[field.toUpperCase()] || '';
      if (!metaType) continue;
      if (isNumeric(metaType)) {
        if (op === 'LIKE') warnings.push(`Numeric field ${field} used with LIKE; likely invalid`);
        const hasQuoted = /^'.*'$/.test(val.trim());
        if (hasQuoted) {
          const unq = val.replace(/^'(.*)'$/s, '$1');
          warnings.push(`Numeric field ${field} compared to quoted value ${val}; remove quotes (e.g., ${field} ${op} ${unq})`);
        }
        if (op === 'IN' && /^\(.+\)$/.test(val)) {
          const inner = val.slice(1, -1);
          if (/(^|,)\s*'/.test(inner)) warnings.push(`Numeric field ${field} IN (...) contains quoted values; remove quotes`);
        }
        if (op === 'BETWEEN') {
          const tail = text.slice(m.index + m[0].length);
          const m2 = /^\s+(AND)\s+([^\s)]+)/i.exec(tail);
          if (m2) {
            const b = m2[2];
            if (/^'.*'$/.test(val.trim()) || /^'.*'$/.test(b.trim())) warnings.push(`Numeric field ${field} BETWEEN has quoted bounds; remove quotes`);
          }
        }
      }
      if (isDate(metaType) && op === 'LIKE') warnings.push(`Date field ${field} used with LIKE; verify format`);
    }
  } catch { }
  // Unsupported operator "!="
  if (text.includes('!=')) errors.push('!= is not supported; use <>');
  return { errors, unknown, warnings };
}
