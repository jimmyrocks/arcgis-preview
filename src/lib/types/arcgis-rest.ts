// Minimal ArcGIS REST types used by the app. These are intentionally partial
// and optional to stay resilient across server versions and service types.

export interface SpatialReference {
  wkid?: number;
  latestWkid?: number;
  vcsWkid?: number;
  latestVcsWkid?: number;
}

export interface Extent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: SpatialReference;
}

export interface MapServiceLayerStub {
  id: number;
  name: string;
  parentLayerId?: number;
  subLayerIds?: number[] | null;
  defaultVisibility?: boolean;
  type?: string; // e.g., "Feature Layer"
  geometryType?: string; // e.g., "esriGeometryPoint"
  minScale?: number,
  maxScale?: number
}

export interface DocumentInfo {
  Title?: string;
  Author?: string;
  Comments?: string;
  Subject?: string;
  Category?: string;
  [k: string]: any;
}

export interface MapServiceInfo {
  currentVersion?: number;
  serviceDescription?: string;
  mapName?: string;
  description?: string;
  copyrightText?: string;
  supportsDynamicLayers?: boolean;
  layers?: MapServiceLayerStub[];
  tables?: any[];
  spatialReference?: SpatialReference;
  singleFusedMapCache?: boolean;
  initialExtent?: Extent;
  fullExtent?: Extent;
  timeInfo?: any;
  maxRecordCount?: number;
  supportedQueryFormats?: string;
  capabilities?: string;
  documentInfo?: DocumentInfo;
  supportedExtensions?: string;
  [k: string]: any;
}

export interface Field {
  name: string;
  type: string; // esriFieldType*
  alias?: string;
  length?: number;
  domain?: any;
}

export interface DrawingInfo {
  renderer?: any;
  [k: string]: any;
}

export interface MapServiceLayerInfo {
  currentVersion?: number;
  id: number;
  name: string;
  type?: string;
  geometryType?: string; // esriGeometry*
  extent?: Extent;
  drawingInfo?: DrawingInfo;
  fields?: Field[];
  displayField?: string;
  description?: string;
  capabilities?: string; // e.g., "Map,Query,Data"
  supportedQueryFormats?: string; // e.g., "JSON, geoJSON, PBF"
  indexes?: Array<{ name?: string; fields?: string; isAscending?: boolean; isUnique?: boolean; description?: string }>;
  [k: string]: any;
}
