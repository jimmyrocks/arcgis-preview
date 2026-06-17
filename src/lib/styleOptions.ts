export const POINT_ICON_OPTIONS = [
  { id: 'odl-marker', label: 'Pin' },
  { id: 'odl-circle-dot', label: 'Dot' },
  { id: 'odl-square', label: 'Square' },
  { id: 'odl-diamond', label: 'Diamond' },
  { id: 'odl-triangle', label: 'Triangle' },
  { id: 'odl-star', label: 'Star' },
  { id: 'odl-cross', label: 'Cross' },
  { id: 'odl-flag', label: 'Flag' },
] as const;

export const DEFAULT_POINT_ICON_ID = POINT_ICON_OPTIONS[0].id;

export type PointStyleOptions = {
  symbol?: 'circle' | 'icon';
  icon?: string;
  iconSize?: number; // intended display size in px
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

export type GeometryStyleOptions = {
  point?: PointStyleOptions;
  line?: LineStyleOptions;
  polygon?: PolygonStyleOptions;
  label?: LabelStyleOptions;
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
};
