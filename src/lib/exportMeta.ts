export type ExportMeta = {
  export_type: 'on-screen' | 'attributes';
  geometry_type?: string | null;
  zoom?: number | null;
  bbox?: string | null;
  where?: string | null;
  rendered_count: number;
  total_in_view?: number | null;
  display_tolerance_m_approx?: { min: number; max: number } | 'exact' | null;
  drawn_at_iso: string;
  service_url?: string | null;
  layer_id?: number | null;
  crs?: number | null;
};

export function buildExportMeta({ exportType, geometryType, zoom, bbox, where, rendered, totalInView, tolerance, serviceUrl, layerId, crs }: {
  exportType: 'on-screen' | 'attributes';
  geometryType?: string | undefined;
  zoom?: number | undefined;
  bbox?: string | undefined;
  where?: string | undefined;
  rendered: number;
  totalInView?: number | undefined;
  tolerance?: [number, number] | undefined;
  serviceUrl?: string | undefined;
  layerId?: number | undefined;
  crs?: number | undefined;
}): ExportMeta {
  return {
    export_type: exportType,
    geometry_type: geometryType || null,
    zoom: zoom ?? null,
    bbox: bbox || null,
    where: where || null,
    rendered_count: rendered,
    total_in_view: typeof totalInView === 'number' ? totalInView : null,
    display_tolerance_m_approx: tolerance ? { min: tolerance[0], max: tolerance[1] } : (geometryType && /point/i.test(geometryType) ? 'exact' : null),
    drawn_at_iso: new Date().toISOString(),
    service_url: serviceUrl || null,
    layer_id: typeof layerId === 'number' ? layerId : null,
    crs: crs || null,
  };
}

export default buildExportMeta;

