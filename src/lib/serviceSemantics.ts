export type ServiceSemanticsType = 'MapServer' | 'FeatureServer' | 'ImageServer' | 'VectorTileServer';

type ServiceSemantics = {
  label: string;
  dataLabel: string;
  shortSummary: string;
  summary: string;
};

const SERVICE_SEMANTICS: Record<ServiceSemanticsType, ServiceSemantics> = {
  MapServer: {
    label: 'Map service',
    dataLabel: 'Styled map',
    shortSummary: 'Published cartography and styling',
    summary: 'Usually published cartography with layer styling. Best for map display; raw feature access is often secondary.',
  },
  FeatureServer: {
    label: 'Feature service',
    dataLabel: 'Vector data',
    shortSummary: 'Raw vector features for query',
    summary: 'Raw vector features for query, filters, and download. Styling is usually much lighter than a map service.',
  },
  ImageServer: {
    label: 'Image service',
    dataLabel: 'Raster data',
    shortSummary: 'Raster imagery or surfaces',
    summary: 'Raster imagery or continuous surfaces such as aerials, elevation, and temperature.',
  },
  VectorTileServer: {
    label: 'Tile service',
    dataLabel: 'Vector tiles',
    shortSummary: 'Pre-styled vector tiles',
    summary: 'Pre-styled vector tiles for fast display. Great for cartography, not raw feature queries.',
  },
};

export function getServiceSemantics(type: string | null | undefined): ServiceSemantics | null {
  if (!type) return null;
  return SERVICE_SEMANTICS[type as ServiceSemanticsType] || null;
}

export function friendlyServiceLabel(type: string | null | undefined): string {
  return getServiceSemantics(type)?.label || (type ? String(type) : 'Layer');
}

export function serviceDataBadge(type: string | null | undefined): string {
  return getServiceSemantics(type)?.dataLabel || '';
}

export function serviceShortHint(type: string | null | undefined): string {
  return getServiceSemantics(type)?.shortSummary || '';
}

export function serviceSummaryHint(type: string | null | undefined): string {
  return getServiceSemantics(type)?.summary || '';
}
