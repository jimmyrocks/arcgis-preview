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
    onRowDoubleClick?: (row: Row, index: number) => void;
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
    // Optional: total rows in the dataset (for context in header info)
    totalInDataset?: number | null;
    // Optional: callback to style the map by a given field
    onStyleByField?: (fieldName: string) => void;
};

export default function DataReportTable({ data, displayFields, onRowClick, onRowHover, onRowDoubleClick, maxHeight = 260, displayOnLoad = false, datasetName = 'data', columnAliases, showHideButton = true, fullHeight = false, highlightId = null, rowIds = [], fields = [], totalInDataset = null, onStyleByField }: Props) {
  const [open, setOpen] = React.useState(displayOnLoad || fullHeight || showHideButton === false);
  const [sortConfig, setSortConfig] = React.useState<SortConfig>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showAll, setShowAll] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const INITIAL_LIMIT = 1000;

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
  const limitedData = React.useMemo(() => {
    if (!hasData) return [];
    return showAll ? sortedData : sortedData.slice(0, INITIAL_LIMIT);
  }, [sortedData, hasData, showAll]);
  const isLimited = hasData && !showAll && sortedData.length > INITIAL_LIMIT;
  const warnMessage = !showAll && sortedData.length > INITIAL_LIMIT
    ? `Showing first ${INITIAL_LIMIT.toLocaleString()} rows. Load more?`
    : '';

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

  // Column header right-click context menu for "Style by field"
  const [colMenu, setColMenu] = React.useState<{ x: number; y: number; col: string } | null>(null);
  React.useEffect(() => {
    if (!colMenu) return;
    const close = () => setColMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [!!colMenu]);

  // Keyboard navigation over rows
  const [selectedIndex, setSelectedIndex] = React.useState<number>(-1);
  React.useEffect(() => {
    if (!hasData) { setSelectedIndex(-1); return; }
    if (highlightId == null) return;
    try {
      const idx = limitedData.findIndex((row) => {
        const originalIndex = data.indexOf(row);
        const rid = rowIds[originalIndex] != null ? rowIds[originalIndex] : (row as any)?.__id;
        return String(rid) === String(highlightId);
      });
      if (idx >= 0) setSelectedIndex(idx);
    } catch {}
  }, [highlightId, limitedData, data, rowIds]);

  function handleKeyNav(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!hasData) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    e.preventDefault();
    let idx = selectedIndex;
    if (e.key === 'ArrowDown') idx = Math.min(limitedData.length - 1, Math.max(0, selectedIndex + 1));
    if (e.key === 'ArrowUp') idx = Math.max(0, selectedIndex <= 0 ? 0 : selectedIndex - 1);
    if (e.key === 'Enter') {
      if (idx >= 0) {
        const originalIndex = data.indexOf(limitedData[idx]);
        onRowClick?.(limitedData[idx], originalIndex);
      }
      return;
    }
    setSelectedIndex(idx);
    if (idx >= 0) {
      const originalIndex = data.indexOf(limitedData[idx]);
      onRowHover?.(limitedData[idx], originalIndex);
    }
  }

  // Removed copy/download actions; Download tab handles exporting

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
          className="u-btn"
          style={{ marginBottom: 6 }}
        >
          {open ? `Hide ${datasetName}` : `Show ${datasetName} (${(Array.isArray(data) ? data.length : 0).toLocaleString()})`}
        </button>
      ) : null}
      {!hasData ? (
        <div className="u-muted u-small">(no data)</div>
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
            <div className="u-row">
              <input
                type="text"
                placeholder={`Search ${datasetName}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="data-table-search"
              />
              {isLimited ? (
                <button
                  onClick={() => setShowAll(true)}
                  className="u-btn"
                  style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                  title="Warning: large dataset; may be slow to render"
                >
                  ⚠️ Load all ({sortedData.length.toLocaleString()}) 
                </button>
              ) : null}
              {sortConfig && (
                <button
                  onClick={clearSort}
                  title="Clear sort and return to original order"
                  className="u-btn"
                  style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                >
                  Clear Sort
                </button>
              )}
            </div>
            <div className="data-table-info">
              {filteredData.length !== data.length ? (
                <>
                  {filteredData.length.toLocaleString()} of {data.length.toLocaleString()} rows
                </>
              ) : (
                <>{data.length.toLocaleString()} rows</>
              )}
              {warnMessage ? <> • {warnMessage}</> : null}
              {typeof totalInDataset === 'number' && totalInDataset > data.length ? (
                <> ({totalInDataset.toLocaleString()} in dataset)</>
              ) : null}
              {sortConfig && (
                <> • sorted by {columnAliases?.[sortConfig.key] || sortConfig.key} {sortConfig.direction === 'asc' ? '↑' : '↓'}</>
              )}
            </div>
          </div>
          
          {/* Scrollable table */}
          <div ref={scrollRef} tabIndex={0} onKeyDown={handleKeyNav} className="data-table-scroll" style={{ maxHeight: fullHeight ? 'unset' as any : maxHeight, height: fullHeight ? '100%' : undefined, flex: '1 1 0%' }}>
            <table className="data-table">
              <thead>
                <tr className="data-header-row">
                  {columns.map((c) => (
                    <th
                      key={c}
                      className={`data-header-cell sortable${sortConfig?.key === c ? ' active' : ''}`}
                      onClick={() => handleSort(c)}
                      title={onStyleByField ? `Sort by ${columnAliases?.[c] || c} (right-click to style map by this field)` : `Click to sort by ${columnAliases?.[c] || c}`}
                      onContextMenu={onStyleByField ? (e) => { e.preventDefault(); setColMenu({ x: e.clientX, y: e.clientY, col: c }); } : undefined}
                    >
                      {columnAliases?.[c] || c}
                      <span className="sort-indicator">{getSortIndicator(c)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {limitedData.map((row, rowIdx) => {
                  // Find original index to get correct rowId
                  const originalIndex = data.indexOf(row);
                  const rid = rowIds[originalIndex] != null ? rowIds[originalIndex] : (row as any)?.__id;
                  const selected = isActiveRow(rid, highlightId) || (rowIdx === selectedIndex);
                  const rowClass = `data-row${selected ? ' is-selected' : ''}${onRowClick ? ' is-clickable' : ''}`;
                  return (
                    <tr
                      key={originalIndex}
                      className={rowClass}
                      data-row-id={safeId(rid)}
                      onClick={() => onRowClick?.(row, originalIndex)}
                      onDoubleClick={() => onRowDoubleClick?.(row, originalIndex)}
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

      {/* Column right-click context menu */}
      {colMenu && onStyleByField && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: colMenu.y,
            left: colMenu.x,
            zIndex: 9999,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 0',
            minWidth: 200,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            fontSize: 13,
          }}
        >
          <button
            type="button"
            onClick={() => { onStyleByField(colMenu.col); setColMenu(null); }}
            style={{
              display: 'block',
              width: '100%',
              padding: '7px 14px',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: 13,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-row)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            Style map by <strong>{columnAliases?.[colMenu.col] || colMenu.col}</strong>
          </button>
        </div>
      )}
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
        // Never use grouping to avoid 2,005 year formatting
        if (Number.isInteger(v)) return String(v);
        try { return new Intl.NumberFormat(undefined, { useGrouping: false, maximumFractionDigits: 6 }).format(v); } catch { return String(v); }
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
