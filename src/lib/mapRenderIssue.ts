export type MapRenderIssueKind =
  | 'authentication'
  | 'cors'
  | 'filter'
  | 'not_found'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'service';

export type MapRenderIssue = {
  kind: MapRenderIssueKind;
  title: string;
  message: string;
  technicalDetail?: string;
};

function getStatus(error: unknown): number | undefined {
  const candidate = error as any;
  const values = [candidate?.status, candidate?.statusCode, candidate?.response?.status, candidate?.error?.status];
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const match = String(candidate?.message || candidate || '').match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : undefined;
}

export function classifyMapRenderIssue(error: unknown, context?: { hasFilter?: boolean }): MapRenderIssue {
  const detail = String((error as any)?.message || error || 'Unknown map rendering error').trim();
  const normalized = detail.toLowerCase();
  const status = getStatus(error);
  const technicalDetail = status ? `HTTP ${status}: ${detail}` : detail;

  if (status === 401 || status === 403 || /token|required credential|unauthori[sz]ed|forbidden/.test(normalized)) {
    return {
      kind: 'authentication',
      title: 'This map requires access',
      message: 'The ArcGIS service rejected the published-map request. Open the service to sign in or confirm that it is shared publicly.',
      technicalDetail,
    };
  }
  if (context?.hasFilter && (status === 400 || status === 422 || /layerdefs|where clause|sql|invalid query/.test(normalized))) {
    return {
      kind: 'filter',
      title: 'The service could not apply this filter',
      message: 'This MapServer may not support layer definitions for its published map. Clear the filter or switch to Interactive features.',
      technicalDetail,
    };
  }
  if (status === 404) {
    return {
      kind: 'not_found',
      title: 'Published map unavailable',
      message: 'The map image or tile endpoint was not found. The service may have moved or its cache may not cover this area.',
      technicalDetail,
    };
  }
  if (status === 429) {
    return {
      kind: 'rate_limit',
      title: 'The service is receiving too many requests',
      message: 'ArcGIS is temporarily rate-limiting map images. Wait a moment, then retry.',
      technicalDetail,
    };
  }
  if (/cors|cross-origin|blocked by access-control|access-control-allow-origin/.test(normalized)) {
    return {
      kind: 'cors',
      title: 'The browser blocked this map',
      message: 'The ArcGIS server does not allow map images from this site. Open the service to verify access or try Interactive features.',
      technicalDetail,
    };
  }
  if (/timed?\s*out|timeout/.test(normalized)) {
    return {
      kind: 'timeout',
      title: 'The map is taking too long',
      message: 'The ArcGIS server did not finish a map image in time. Retry, zoom in, or switch rendering modes.',
      technicalDetail,
    };
  }
  if (/failed to fetch|network|load failed|connection|offline/.test(normalized)) {
    return {
      kind: 'network',
      title: 'Could not reach the map service',
      message: 'Check your connection and confirm that the ArcGIS service is online, then retry.',
      technicalDetail,
    };
  }
  return {
    kind: 'service',
    title: 'The published map could not load',
    message: 'ArcGIS returned an unexpected rendering error. Retry or switch to Interactive features to keep working with the layer.',
    technicalDetail,
  };
}
