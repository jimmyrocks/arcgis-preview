import React from 'react';
import DataReportTable from '../components/DataReportTable';
import { FeatureCollection } from 'geojson';
import { getFeatureId } from '../../../lib/ids';

type Props = {
  rows: any[];
  datasetName?: string;
  columnAliases?: Record<string, string>;
  featureCollection?: FeatureCollection;
  onRowHover?: (id: string | number | null) => void;
  onRowClick?: (id: string | number | null) => void;
  highlightId?: string | number | null;
  fields?: Array<{ name: string; type: string; alias?: string; }>;
};

export default function DataTab({ datasetName = 'features', columnAliases, featureCollection, onRowHover, onRowClick, highlightId, fields }: Props) {
  const rows: Record<string, any>[] = React.useMemo(() => {
    if (!featureCollection?.features) return [];
    return featureCollection.features.map((f: any) => ({ ...(f?.properties || {}) }));
  }, [featureCollection]);

  const rowIds: Array<string | number | null> = React.useMemo(() => {
    if (!featureCollection?.features) return [];
    return featureCollection.features.map((f: any) => getFeatureId(f));
  }, [featureCollection]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <DataReportTable
        data={rows}
        datasetName={datasetName}
        columnAliases={columnAliases}
        rowIds={rowIds}
        displayOnLoad={true}
        showHideButton={false}
        fullHeight={true}
        highlightId={highlightId}
        fields={fields}
        onRowHover={(_row, idx) => { const id = rowIds[idx] ?? null; onRowHover?.(id as any); }}
        onRowClick={(_row, idx) => { const id = rowIds[idx] ?? null; onRowClick?.(id as any); }}
      />
    </div>
  );
}
