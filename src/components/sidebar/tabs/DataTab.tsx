import React from 'react';
import type { FeatureCollection } from 'geojson';
import DataReportTable from '../components/DataReportTable';
import { getFeatureId } from '../../../lib/ids';

type Props = {
  datasetName?: string;
  columnAliases?: Record<string, string>;
  featureCollection?: FeatureCollection;
  onRowHover?: (id: string | number | null) => void;
  onRowClick?: (id: string | number | null) => void;
  onRowDoubleClick?: (id: string | number | null) => void;
  highlightId?: string | number | null;
  fields?: Array<{ name: string; type: string; alias?: string }>;
  layerTotal?: number | null;
  onStyleByField?: (fieldName: string) => void;
};

export default function DataTab({
  datasetName = 'features',
  columnAliases,
  featureCollection,
  onRowHover,
  onRowClick,
  onRowDoubleClick,
  highlightId,
  fields,
  layerTotal = null,
  onStyleByField,
}: Props) {
  const rows: Record<string, any>[] = React.useMemo(() => {
    if (!featureCollection?.features) return [];
    return featureCollection.features.map((f: any) => ({ ...(f?.properties || {}) }));
  }, [featureCollection]);

  const rowIds: Array<string | number | null> = React.useMemo(() => {
    if (!featureCollection?.features) return [];
    return featureCollection.features.map((f: any) => getFeatureId(f));
  }, [featureCollection]);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 6 }} onMouseLeave={() => onRowHover?.(null)}>
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
        totalInDataset={typeof layerTotal === 'number' ? layerTotal : null}
        onRowHover={(_row, idx) => onRowHover?.(rowIds[idx] ?? null)}
        onRowClick={(_row, idx) => onRowClick?.(rowIds[idx] ?? null)}
        onRowDoubleClick={(_row, idx) => onRowDoubleClick?.(rowIds[idx] ?? null)}
        onStyleByField={onStyleByField}
      />
    </div>
  );
}
