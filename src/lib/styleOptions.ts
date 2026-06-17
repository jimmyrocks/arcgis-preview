export const POINT_ICON_OPTIONS = [
  { id: 'odl-marker', label: 'Pin', group: 'Basic' },
  { id: 'odl-circle-dot', label: 'Dot', group: 'Basic' },
  { id: 'odl-square', label: 'Square', group: 'Basic' },
  { id: 'odl-diamond', label: 'Diamond', group: 'Basic' },
  { id: 'odl-triangle', label: 'Triangle', group: 'Basic' },
  { id: 'odl-star', label: 'Star', group: 'Basic' },
  { id: 'odl-cross', label: 'Cross', group: 'Basic' },
  { id: 'odl-flag', label: 'Flag', group: 'Basic' },
  { id: 'pinhead-p', label: 'Parking', group: 'Map symbols' },
  { id: 'pinhead-bus', label: 'Bus', group: 'Map symbols' },
  { id: 'pinhead-car', label: 'Car', group: 'Map symbols' },
  { id: 'pinhead-bicycle', label: 'Bicycle', group: 'Map symbols' },
  { id: 'pinhead-charging_station', label: 'Charging station', group: 'Map symbols' },
  { id: 'pinhead-campsite', label: 'Campsite', group: 'Map symbols' },
  { id: 'pinhead-broadleaved_tree', label: 'Tree', group: 'Map symbols' },
  { id: 'pinhead-bench', label: 'Bench', group: 'Map symbols' },
  { id: 'pinhead-spoon_and_fork', label: 'Food', group: 'Map symbols' },
  { id: 'pinhead-water_tap', label: 'Water tap', group: 'Map symbols' },
  { id: 'pinhead-wc_text', label: 'Restrooms', group: 'Map symbols' },
  { id: 'pinhead-bag_with_greek_cross', label: 'Medical', group: 'Map symbols' },
  { id: 'pinhead-book', label: 'Book', group: 'Map symbols' },
  { id: 'pinhead-camera', label: 'Camera', group: 'Map symbols' },
  { id: 'pinhead-town_buildings', label: 'Buildings', group: 'Map symbols' },
  { id: 'pinhead-utility_pole', label: 'Utility pole', group: 'Map symbols' },
] as const;

export const DEFAULT_POINT_ICON_ID = POINT_ICON_OPTIONS[0].id;

export const POINT_ICON_ANCHOR_OPTIONS = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

export const POINT_ICON_ALIGNMENT_OPTIONS = ['auto', 'map', 'viewport'] as const;

export type PointStyleOptions = {
  symbol?: 'circle' | 'icon';
  icon?: string;
  iconSize?: number; // intended display size in px
  iconAnchor?: typeof POINT_ICON_ANCHOR_OPTIONS[number];
  iconAllowOverlap?: boolean;
  iconIgnorePlacement?: boolean;
  iconRotate?: number; // degrees
  iconRotationAlignment?: typeof POINT_ICON_ALIGNMENT_OPTIONS[number];
  iconPitchAlignment?: typeof POINT_ICON_ALIGNMENT_OPTIONS[number];
  stroke?: boolean; // default true
  color?: string; // stroke color
  weight?: number; // stroke width in px
  opacity?: number; // stroke opacity 0..1
  fill?: boolean; // default true
  fillColor?: string;
  fillOpacity?: number; // 0..1
  radius?: number; // circle radius in px
};

export type LineStyleOptions = {
  stroke?: boolean; // default true
  color?: string;
  weight?: number;
  opacity?: number; // 0..1
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  dashArray?: string; // e.g. "5,10"
  dashOffset?: string; // e.g. "10"
};

export type PolygonStyleOptions = {
  stroke?: boolean; // default true
  color?: string;
  weight?: number;
  opacity?: number; // 0..1
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  dashArray?: string;
  dashOffset?: string;
  fill?: boolean; // default true
  fillColor?: string;
  fillOpacity?: number; // 0..1
  fillRule?: 'nonzero' | 'evenodd' | string;
};

export type LabelStyleOptions = {
  enabled?: boolean;
  field?: string;
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  color?: string;
  size?: number;
  haloColor?: string;
  haloWidth?: number;
};

export type DisplayStyleOptions = {
  hideSuspectedDuplicates?: boolean;
  showLegend?: boolean;
};

export type GeometryStyleOptions = {
  point?: PointStyleOptions;
  line?: LineStyleOptions;
  polygon?: PolygonStyleOptions;
  label?: LabelStyleOptions;
  display?: DisplayStyleOptions;
};

export type StyleMode = 'server' | 'custom' | 'attribute';

// One category → color stop (categorical sub-mode)
export type CategoryStop = {
  value: string | number | null; // null = catch-all fallback
  color: string;                 // hex color
  label?: string;
  enabled: boolean;
  count?: number;                // feature count for this value (from classification)
};

// One numeric bound → color stop (numeric ramp sub-mode)
export type NumericStop = {
  value: number;
  color: string; // hex color
};

export type AttributeStyleRule =
  | {
      kind: 'categorical';
      field: string;
      channel: 'color';
      stops: CategoryStop[];
      fallbackColor: string;
    }
  | {
      kind: 'numeric';
      field: string;
      channel: 'color';
      stops: NumericStop[];
      fallbackColor: string;
    };

export type AttributeStyleMeta = {
  paletteId?: string;
};

export type AttributeStyleOptions = {
  rule?: AttributeStyleRule;
  meta?: AttributeStyleMeta;
};

export const defaultStyleOptions: GeometryStyleOptions = {
  point: {
    symbol: 'circle',
    icon: DEFAULT_POINT_ICON_ID,
    iconSize: 24,
    iconAnchor: 'center',
    iconAllowOverlap: true,
    iconIgnorePlacement: false,
    iconRotate: 0,
    iconRotationAlignment: 'auto',
    iconPitchAlignment: 'auto',
    stroke: true,
    color: '#3388ff',
    weight: 2,
    opacity: 1,
    fill: true,
    fillColor: '#3388ff',
    fillOpacity: 0.2,
    radius: 6,
  },
  line: {
    stroke: true,
    color: '#3388ff',
    weight: 0.5,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    dashArray: '',
    dashOffset: '',
  },
  polygon: {
    stroke: true,
    color: '#3388ff',
    weight: 2,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    dashArray: '',
    dashOffset: '',
    fill: true,
    fillColor: '#3388ff',
    fillOpacity: 0.2,
    fillRule: 'evenodd',
  },
  label: {
    enabled: false,
    field: '',
    position: 'top',
    color: '#111827',
    size: 12,
    haloColor: '#ffffff',
    haloWidth: 1.5,
  },
  display: {
    hideSuspectedDuplicates: false,
    showLegend: true,
  },
};
