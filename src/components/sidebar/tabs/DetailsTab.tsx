import React from 'react';
import type { MapServiceInfo, MapServiceLayerInfo, Extent } from '../../../lib/types/arcgis-rest';
import DetailsPanel from '../components/DetailsPanel';

type Props = {
  serviceMeta: MapServiceInfo | null;
  layerMeta: MapServiceLayerInfo | null;
  featureCount?: number | null;
  onZoomToExtent?: (ext: Extent) => void;
  serviceUrl?: string;
  whereValue?: string;
  bbox?: string; // xmin,ymin,xmax,ymax
  center?: string; // lat, lng
  zoom?: number;
  isDynamic?: boolean;
  fallbackReason?: string;
  onClearWhere?: () => void;
};

export default function DetailsTab({ serviceMeta, layerMeta, featureCount, onZoomToExtent, serviceUrl, whereValue, bbox, center, zoom, isDynamic = false, fallbackReason, onClearWhere }: Props) {
  return (
    <DetailsPanel
      serviceMeta={serviceMeta}
      layerMeta={layerMeta}
      loading={false}
      isDynamic={!!isDynamic}
      onZoomToExtent={onZoomToExtent}
      featureCount={featureCount}
      serviceUrl={serviceUrl}
      whereValue={whereValue}
      bbox={bbox}
      center={center}
      zoom={zoom}
      fallbackReason={fallbackReason}
      onClearWhere={onClearWhere}
    />
  );
}
