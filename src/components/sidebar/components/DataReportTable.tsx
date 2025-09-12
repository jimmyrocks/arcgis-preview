import React from 'react';

type Row = Record<string, any>;

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

type Props = {
    data: Row[];
    displayFields?: string[];
    onRowClick?: (row: Row, index: number) => void;
    onRowHover?: (row: Row, index: number) => void;
    maxHeight?: number;
    displayOnLoad?: boolean;
    datasetName?: string;
    columnAliases?: Record<string, string>;
    showHideButton?: boolean;
    fullHeight?: boolean;
    highlightId?: string | number | null;
    // Optional: id per row (aligned by index) so we don't depend on a __id property on the row
    rowIds?: Array<string | number | null>;
    // Field metadata for type-aware formatting
    fields?: Array<{ name: string; type: string; alias?: string; }>;
};

export default function DataReportTable({ data, displayFields, onRowClick, onRowHover, maxHeight = 260, displayOnLoad = false, datasetName = 'data', columnAliases, showHideButton = true, fullHeight = false, highlightId = null, rowIds = [], fields = [] }: Props) {
  const [open, setOpen] = React.useState(displayOnLoad || fullHeight || showHideButton === false);
  const [sortConfig, setSortConfig] = React.useState<SortConfig>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  
  const columns = React.useMemo(() => {
    if (displayFields && displayFields.length) return displayFields;
    const sample = data?.[0] || {};
    return Object.keys(sample);
  }, [data, displayFields]);

  // Create a map of field names to their types for efficient lookup
  const fieldTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const field of fields) {
      map.set(field.name, field.type.toLowerCase());
    }
    return map;
  }, [fields]);

  // Filter data based on search term
  const filteredData = React.useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(row => 
      columns.some(col => {
        const value = String(row[col] || '').toLowerCase();
        return value.includes(term);
      })
    );
  }, [data, columns, searchTerm]);

  // Sort filtered data
  const sortedData = React.useMemo(() => {
    if (!sortConfig) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue == null) return sortConfig.direction === 'asc' ? -1 : 1;
      
      // Handle numbers
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      // Handle strings (convert everything else to string)
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  const hasData = Array.isArray(data) && data.length > 0 && columns.length > 0;

  // Auto-scroll highlighted row into view (nearest) when highlight changes
  React.useEffect(() => {
    if (highlightId == null) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    try {
      const el = scroller.querySelector(`[data-row-id="${CSS.escape(String(highlightId))}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: 'nearest' });
    } catch { }
  }, [highlightId]);

  const handleSort = (column: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === column && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: column, direction });
  };

  const clearSort = () => {
    setSortConfig(null);
  };

  const getSortIndicator = (column: string) => {
    if (!sortConfig || sortConfig.key !== column) return '⇅';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  return (
    <div style={{ 
      marginTop: fullHeight && showHideButton === false ? 0 : 10,
      height: fullHeight && showHideButton === false ? '100%' : 'auto',
      display: fullHeight && showHideButton === false ? 'flex' : 'block',
      flexDirection: fullHeight && showHideButton === false ? 'column' : undefined
    }}>
      {showHideButton !== false ? (
        <button
          onClick={() => setOpen(o => !o)}
          style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: 'pointer', marginBottom: 6 }}
        >
          {open ? `Hide ${datasetName}` : `Show ${datasetName} (${(Array.isArray(data) ? data.length : 0).toLocaleString()})`}
        </button>
      ) : null}
      {!hasData ? (
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>(no data)</div>
      ) : open ? (
        <div className="data-table-wrapper" style={{ 
          border: '1px solid var(--border)', 
          borderRadius: 6, 
          overflow: 'hidden', 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: 0,
          flex: fullHeight && showHideButton === false ? '1 1 0%' : undefined,
          height: fullHeight && showHideButton === false ? '100%' : undefined
        }}>
          {/* Table toolbar with search and info */}
          <div className="data-table-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                placeholder={`Search ${datasetName}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="data-table-search"
              />
              {sortConfig && (
                <button
                  onClick={clearSort}
                  title="Clear sort and return to original order"
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'var(--panel-subtle)',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Clear Sort
                </button>
              )}
            </div>
            <div className="data-table-info">
              {filteredData.length !== data.length ? (
                <>{filteredData.length.toLocaleString()} of {data.length.toLocaleString()} rows</>
              ) : (
                <>{data.length.toLocaleString()} rows</>
              )}
              {sortConfig && (
                <> • sorted by {columnAliases?.[sortConfig.key] || sortConfig.key} {sortConfig.direction === 'asc' ? '↑' : '↓'}</>
              )}
            </div>
          </div>
          
          {/* Scrollable table */}
          <div ref={scrollRef} className="data-table-scroll" style={{ maxHeight: fullHeight ? 'unset' as any : maxHeight, height: fullHeight ? '100%' : undefined, flex: '1 1 0%' }}>
            <table className="data-table">
              <thead>
                <tr className="data-header-row">
                  {columns.map((c) => (
                    <th 
                      key={c} 
                      className={`data-header-cell sortable${sortConfig?.key === c ? ' active' : ''}`} 
                      onClick={() => handleSort(c)}
                      title={`Click to sort by ${columnAliases?.[c] || c}`}
                    >
                      {columnAliases?.[c] || c}
                      <span className="sort-indicator">{getSortIndicator(c)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row) => {
                  // Find original index to get correct rowId
                  const originalIndex = data.indexOf(row);
                  const rid = rowIds[originalIndex] != null ? rowIds[originalIndex] : (row as any)?.__id;
                  const selected = isActiveRow(rid, highlightId);
                  const rowClass = `data-row${selected ? ' is-selected' : ''}${onRowClick ? ' is-clickable' : ''}`;
                  return (
                    <tr
                      key={originalIndex}
                      className={rowClass}
                      data-row-id={safeId(rid)}
                      onClick={() => onRowClick?.(row, originalIndex)}
                      onMouseEnter={() => onRowHover?.(row, originalIndex)}
                      title={selected ? 'Selected' : undefined}
                    >
                      {columns.map((c) => {
                        const v = row[c];
                        const fieldType = fieldTypeMap.get(c);
                        const isNumber = typeof v === 'number';
                        const isDate = fieldType === 'esrifieldtypedate';
                        const isLongText = typeof v === 'string' && v.length > 50;
                        return (
                          <td 
                            key={c} 
                            className={`data-cell${isNumber && !isDate ? ' is-number' : ''}${isLongText ? ' is-long-text' : ''}`}
                            title={isLongText ? String(v) : undefined}
                          >
                            {formatCell(v, fieldType)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Show message when search has no results */}
          {searchTerm.trim() && sortedData.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              No results found for "{searchTerm}"
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatCell(v: any, fieldType?: string): string {
    if (v == null) return '';
    
    // Handle esriFieldTypeDate - convert from Unix epoch timestamp
    if (fieldType === 'esrifieldtypedate' && typeof v === 'number') {
        try {
            // ArcGIS stores dates as Unix epoch time in milliseconds
            const date = new Date(v);
            // Check if the date is valid
            if (!isNaN(date.getTime())) {
                // Use simple date formatting to avoid locale number formatting on year
                const year = date.getFullYear();
                const month = date.toLocaleDateString(undefined, { month: 'short' });
                const day = date.getDate();
                const time = date.toLocaleTimeString(undefined, { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                });
                return `${month} ${day}, ${year}, ${time}`;
            }
        } catch {
            // If date conversion fails, fall through to number formatting
        }
    }
    
    // Handle regular numbers with appropriate formatting
    if (typeof v === 'number') {
        // OID fields should not have comma formatting
        if (fieldType === 'esrifieldtypeoid' || fieldType?.toLowerCase().includes('oid')) {
            return String(v);
        }
        if (Number.isInteger(v)) return v.toLocaleString();
        return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
    }
    
    // Handle booleans
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    
    // Handle Date objects
    if (v instanceof Date) {
        if (!isNaN(v.getTime())) {
            // Use simple date formatting to avoid locale number formatting on year
            const year = v.getFullYear();
            const month = v.toLocaleDateString(undefined, { month: 'short' });
            const day = v.getDate();
            const time = v.toLocaleTimeString(undefined, { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
            return `${month} ${day}, ${year}, ${time}`;
        }
        return 'Invalid Date';
    }
    
    // Handle objects and arrays
    if (typeof v === 'object') {
        try { 
            const json = JSON.stringify(v);
            // Truncate very long JSON strings
            return json.length > 100 ? json.substring(0, 97) + '...' : json;
        } catch { 
            return String(v);
        }
    }
    
    // Handle strings - truncate very long ones
    const str = String(v);
    if (str.length > 200) {
        return str.substring(0, 197) + '...';
    }
    
    return str;
}

function safeId(v: any): string {
    if (v == null) return '';
    return String(v);
}

function isActiveRow(id: any, highlightId: any): boolean {
    if (id == null || highlightId == null) return false;
    try { return String(id) === String(highlightId); } catch { return false; }
}
