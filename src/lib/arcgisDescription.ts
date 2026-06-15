import type { MapServiceInfo, MapServiceLayerInfo } from './types/arcgis-rest';

export type MetadataDescription = {
  text: string;
  source: 'layer' | 'service' | 'document';
};

export function htmlToPlainText(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || /^null$/i.test(raw)) return '';
  let text = raw;
  try {
    if (typeof document !== 'undefined') {
      const element = document.createElement('div');
      element.innerHTML = raw;
      text = element.textContent || element.innerText || raw;
    } else {
      text = raw.replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]*>/g, ' ');
      text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
    }
  } catch {
    text = raw;
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function summarizePlainText(value: string, maxLength = 320): string {
  const text = htmlToPlainText(value);
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (sentenceEnd > maxLength * 0.45) return `${slice.slice(0, sentenceEnd + 1).trim()}`;
  const lastSpace = slice.lastIndexOf(' ');
  return `${slice.slice(0, lastSpace > 80 ? lastSpace : maxLength).trim()}...`;
}

export function getServiceDescription(serviceMeta?: MapServiceInfo | null): MetadataDescription | null {
  if (!serviceMeta) return null;
  const candidates: Array<{ value: unknown; source: MetadataDescription['source'] }> = [
    { value: serviceMeta.serviceDescription, source: 'service' },
    { value: serviceMeta.description, source: 'service' },
    { value: serviceMeta.documentInfo?.Comments, source: 'document' },
    { value: serviceMeta.documentInfo?.Subject, source: 'document' },
  ];
  return firstDescription(candidates);
}

export function getLayerDescription(
  layerMeta?: MapServiceLayerInfo | null,
  serviceMeta?: MapServiceInfo | null
): MetadataDescription | null {
  const layerDescription = firstDescription([{ value: layerMeta?.description, source: 'layer' }]);
  return layerDescription || getServiceDescription(serviceMeta);
}

function firstDescription(candidates: Array<{ value: unknown; source: MetadataDescription['source'] }>): MetadataDescription | null {
  for (const candidate of candidates) {
    const text = htmlToPlainText(candidate.value);
    if (text.length < 3) continue;
    if (/^(none|n\/a|not available)$/i.test(text)) continue;
    return { text, source: candidate.source };
  }
  return null;
}
