import React from 'react';

export function useRowFilter(rows: any[], query: string): any[] {
  return React.useMemo(() => {
    const q = (query || '').toLowerCase().trim();
    if (!q) return rows || [];
    try {
      return (rows || []).filter((r) => {
        for (const k of Object.keys(r || {})) {
          const v = r?.[k];
          if (v == null) continue;
          const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
          if (s.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    } catch { return rows || []; }
  }, [rows, query]);
}

