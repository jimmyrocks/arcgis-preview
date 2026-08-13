export function rowsToCSV(rows: Array<Record<string, unknown>>): string {
  const keys = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  if (keys.length === 0) return '';
  const escape = (value: unknown) => {
    if (value == null) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = rows.map((row) => keys.map((key) => escape(row[key])).join(','));
  return [keys.join(','), ...lines].join('\n');
}
