export type PointStyleOptions = {
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

export type GeometryStyleOptions = {
  point?: PointStyleOptions;
  line?: LineStyleOptions;
  polygon?: PolygonStyleOptions;
};

export const defaultStyleOptions: GeometryStyleOptions = {
  point: {
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
    weight: 2,
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
};

