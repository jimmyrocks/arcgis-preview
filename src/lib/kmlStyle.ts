// KML styling helpers — symbol-to-KML conversion and renderer evaluation.
// These are app-level export helpers used by kml.ts; they have no MapLibre dependency.

type ArcGISSymbolLike = Record<string, any> | null | undefined;
type ArcGISRendererLike = Record<string, any> | null | undefined;

export type KmlMarkerShape = 'circle' | 'square' | 'diamond' | 'triangle';
export type KmlStyleHint = {
  lineStyle?: string;
  lineDash?: number[];
  markerShape?: KmlMarkerShape;
  markerSize?: number;
};

function toHex2(n: number): string {
  const value = Math.max(0, Math.min(255, Math.round(n)));
  return value.toString(16).padStart(2, '0');
}

// KML colors use aabbggrr ordering.
export function esriColorToKml(color: any): string {
  try {
    const alpha = Array.isArray(color) ? (color[3] != null ? color[3] : 255) : typeof color?.a === 'number' ? color.a : 255;
    const red = Array.isArray(color) ? color[0] : typeof color?.r === 'number' ? color.r : 0;
    const green = Array.isArray(color) ? color[1] : typeof color?.g === 'number' ? color.g : 0;
    const blue = Array.isArray(color) ? color[2] : typeof color?.b === 'number' ? color.b : 0;
    return `${toHex2(alpha)}${toHex2(blue)}${toHex2(green)}${toHex2(red)}`;
  } catch {
    return 'ff000000';
  }
}

export function esriColorToCssRgba(color: any): string {
  try {
    const red = Array.isArray(color) ? color[0] : typeof color?.r === 'number' ? color.r : 0;
    const green = Array.isArray(color) ? color[1] : typeof color?.g === 'number' ? color.g : 0;
    const blue = Array.isArray(color) ? color[2] : typeof color?.b === 'number' ? color.b : 0;
    const alpha255 = Array.isArray(color) ? (color[3] != null ? color[3] : 255) : typeof color?.a === 'number' ? color.a : 255;
    const alpha = Math.max(0, Math.min(1, alpha255 / 255));
    return `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${alpha})`;
  } catch {
    return 'rgba(0,0,0,1)';
  }
}

export function buildKmlStyleFromRenderer(
  renderer: ArcGISRendererLike,
  geometryType?: string,
  inlineIcons = false
): string {
  try {
    if (!renderer) return '';
    let symbol: any = (renderer as any).symbol || (renderer as any).defaultSymbol || null;
    if (!symbol && Array.isArray((renderer as any).uniqueValueInfos) && (renderer as any).uniqueValueInfos.length) {
      symbol = (renderer as any).uniqueValueInfos[0]?.symbol;
    }
    if (!symbol) return '';
    return symbolToKmlStyleXml(symbol, geometryType, 'layer-style', inlineIcons);
  } catch {
    return '';
  }
}

export function symbolToKmlStyleXml(
  symbol: ArcGISSymbolLike,
  geometryType?: string,
  id = 'layer-style',
  inlineIcons = false
): string {
  try {
    if (!symbol) return '';

    const lineStyles: string[] = [];
    const polygonStyles: string[] = [];
    const iconStyles: string[] = [];
    const symbolType = String((symbol as any)?.type || '').toLowerCase();
    const outline = (symbol as any)?.outline || {};
    const outlineColor = outline?.color != null ? esriColorToKml(outline.color) : null;
    const outlineWidth = typeof outline?.width === 'number' ? outline.width : 1.5;

    if (/sls|simplelinesymbol/i.test(symbolType) || /line/i.test(String(geometryType || ''))) {
      const lineColor = (symbol as any)?.color != null ? esriColorToKml((symbol as any).color) : outlineColor || 'ff000000';
      lineStyles.push(`<LineStyle><color>${lineColor}</color><width>${outlineWidth}</width></LineStyle>`);
    }

    if (/sfs|simplefillsymbol/i.test(symbolType) || /polygon/i.test(String(geometryType || ''))) {
      const fillColor = (symbol as any)?.color != null ? esriColorToKml((symbol as any).color) : '7f0000ff';
      polygonStyles.push(`<PolyStyle><color>${fillColor}</color><fill>1</fill><outline>1</outline></PolyStyle>`);
      if (outlineColor) {
        lineStyles.push(`<LineStyle><color>${outlineColor}</color><width>${outlineWidth}</width></LineStyle>`);
      }
    }

    if (/sms|simplemarkersymbol|pms|picturemarkersymbol/i.test(symbolType) || /point/i.test(String(geometryType || ''))) {
      let hrefTag = '';
      if (typeof (symbol as any)?.url === 'string' && (symbol as any).url) {
        hrefTag = `<Icon><href>${(symbol as any).url}</href></Icon>`;
      } else if (inlineIcons) {
        const dataUri = buildKmlMarkerIconDataUri(symbol);
        if (dataUri) hrefTag = `<Icon><href>${dataUri}</href></Icon>`;
      }
      iconStyles.push(`<IconStyle><scale>1</scale>${hrefTag}</IconStyle>`);
    }

    const body = [iconStyles.join(''), lineStyles.join(''), polygonStyles.join('')].filter(Boolean).join('');
    if (!body) return '';
    return `<Style id="${id}">${body}</Style>`;
  } catch {
    return '';
  }
}

export function buildKmlMarkerIconDataUri(symbol: ArcGISSymbolLike): string | null {
  try {
    if (!symbol) return null;
    const shape = getSimpleMarkerShape(symbol);
    const size = typeof (symbol as any)?.size === 'number' ? Math.max(6, Math.min(48, (symbol as any).size)) : 12;
    const outline = (symbol as any)?.outline || {};
    const strokeWidth = typeof outline?.width === 'number' ? Math.max(0, Math.min(6, outline.width)) : 1;
    const fill = (symbol as any)?.color != null ? esriColorToCssRgba((symbol as any).color) : 'rgba(0,0,255,0.5)';
    const stroke = outline?.color != null ? esriColorToCssRgba(outline.color) : 'rgba(0,0,0,1)';
    return drawMarkerDataUri({ shape, size, fill, stroke, strokeWidth });
  } catch {
    return null;
  }
}

export function evaluateRendererSymbol(renderer: ArcGISRendererLike, props: any): ArcGISSymbolLike {
  try {
    const rendererType = String((renderer as any)?.type || '').toLowerCase();
    if (!rendererType) return (renderer as any)?.symbol || (renderer as any)?.defaultSymbol || null;
    if (rendererType === 'simple') return (renderer as any)?.symbol || (renderer as any)?.defaultSymbol || null;

    if (rendererType === 'uniquevalue') {
      const field1 = (renderer as any)?.field1 || (renderer as any)?.field || '';
      const field2 = (renderer as any)?.field2 || '';
      const field3 = (renderer as any)?.field3 || '';
      const delimiter = (renderer as any)?.fieldDelimiter ?? ', ';
      const parts = [field1, field2, field3].filter(Boolean).map((key: string) => props?.[key]);
      const value = parts.map((part: any) => (part == null ? '' : String(part))).join(delimiter);
      const infos: any[] = Array.isArray((renderer as any)?.uniqueValueInfos) ? (renderer as any).uniqueValueInfos : [];
      const hit = infos.find((info: any) => String(info?.value) === value);
      return hit?.symbol || (renderer as any)?.defaultSymbol || (renderer as any)?.symbol || null;
    }

    if (rendererType === 'classbreaks') {
      const field = (renderer as any)?.field || (renderer as any)?.attributeField || (renderer as any)?.normalizationField;
      const rawValue = props?.[field];
      const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      const infos: any[] = Array.isArray((renderer as any)?.classBreakInfos) ? (renderer as any).classBreakInfos : [];
      for (const classBreak of infos) {
        const min = classBreak?.classMinValue ?? classBreak?.minValue ?? -Infinity;
        const max = classBreak?.classMaxValue ?? classBreak?.maxValue ?? Infinity;
        if (numericValue >= min && numericValue <= max) return classBreak?.symbol || null;
      }
      return (renderer as any)?.defaultSymbol || (renderer as any)?.symbol || null;
    }

    return (renderer as any)?.symbol || (renderer as any)?.defaultSymbol || null;
  } catch {
    return (renderer as any)?.symbol || (renderer as any)?.defaultSymbol || null;
  }
}

export function buildKmlStyleHint(symbol: ArcGISSymbolLike, geometryType?: string): KmlStyleHint | null {
  try {
    if (!symbol) return null;
    const symbolType = String((symbol as any)?.type || '').toLowerCase();
    if (/simplelinesymbol|sls/i.test(symbolType) || /line/i.test(String(geometryType || ''))) {
      const style = String((symbol as any)?.style || '').toLowerCase();
      const dash = dashPatternForEsri(style);
      return dash ? { lineStyle: style, lineDash: dash } : { lineStyle: style };
    }
    if (/simplemarkersymbol|sms|point/i.test(symbolType) || /point/i.test(String(geometryType || ''))) {
      const markerShape = getSimpleMarkerShape(symbol);
      const markerSize = typeof (symbol as any)?.size === 'number' ? (symbol as any).size : undefined;
      return { markerShape, markerSize };
    }
    return null;
  } catch {
    return null;
  }
}

function dashPatternForEsri(style: string): number[] | null {
  const normalized = String(style || '').toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('dashdotdot')) return [8, 4, 2, 4, 2, 4];
  if (normalized.includes('dashdot')) return [8, 4, 2, 4];
  if (normalized.includes('dash')) return [8, 6];
  if (normalized.includes('dot')) return [2, 4];
  if (normalized.includes('solid')) return null;
  return null;
}

function getSimpleMarkerShape(symbol: ArcGISSymbolLike): KmlMarkerShape {
  try {
    const style = String((symbol as any)?.style || '').toLowerCase();
    if (!style) return 'circle';
    if (style.includes('square')) return 'square';
    if (style.includes('diamond')) return 'diamond';
    if (style.includes('triangle')) return 'triangle';
    if (style.includes('circle')) return 'circle';
    if (style === 'circle' || style === 'square' || style === 'diamond' || style === 'triangle') {
      return style;
    }
  } catch {
    // ignore
  }
  return 'circle';
}

function drawMarkerDataUri({
  shape,
  size = 16,
  fill,
  stroke,
  strokeWidth = 1
}: {
  shape: KmlMarkerShape;
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}): string | null {
  try {
    const diameter = Math.max(2, Math.min(128, Math.round(size)));
    const padding = Math.max(0, Math.ceil(strokeWidth));
    const width = diameter + padding * 2;
    const height = diameter + padding * 2;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas) return null;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = diameter / 2;

    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    } else if (shape === 'square') {
      ctx.rect(centerX - radius, centerY - radius, diameter, diameter);
    } else if (shape === 'diamond') {
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX + radius, centerY);
      ctx.lineTo(centerX, centerY + radius);
      ctx.lineTo(centerX - radius, centerY);
      ctx.closePath();
    } else if (shape === 'triangle') {
      const triangleHeight = radius * Math.sqrt(3);
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX - radius, centerY + (triangleHeight - radius));
      ctx.lineTo(centerX + radius, centerY + (triangleHeight - radius));
      ctx.closePath();
    }

    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke && strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
