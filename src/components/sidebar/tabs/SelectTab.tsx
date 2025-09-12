import React, { useEffect, useMemo, useState } from 'react';
import { getRestServiceUrlInfo } from '../../../lib/arcgis';
import { fetchServiceMetadata, fetchLayerExtent4326 } from '../../../lib/esriLayer';
import { extentToBounds } from '../../../lib/geometry';
import type { SidebarProps } from '../components/Sidebar';

type ServiceRef = { path: string; name: string; type: 'MapServer' | 'FeatureServer' | 'ImageServer' };

export default function SelectTab({ serviceUrl, onSelectServiceUrl, onZoomToExtent, serviceMeta, layerMeta }: SidebarProps) {
  const defaultRoot = 'https://sampleserver6.arcgisonline.com/arcgis/rest/services';
  const parsed = useMemo(() => {
    try { return getRestServiceUrlInfo(serviceUrl); } catch { return null; }
  }, [serviceUrl]);

  const [root, setRoot] = useState<string>(parsed?.baseRoot || defaultRoot);
  const [services, setServices] = useState<ServiceRef[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>(parsed?.servicePath ? `${parsed.servicePath}/${parsed.serviceType}` : '');
  const [layers, setLayers] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(() => parsed?.layerId !== undefined ? String(parsed.layerId) : '');
  const [zoomBusy, setZoomBusy] = useState<boolean>(false);
  // No details state here; details are owned by App/MapView

  // Load ALL services under root with bounded concurrency + cancellation
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const signal = controller.signal;
    const CONCURRENCY = 6;
    const MAX_REQUESTS = 300;
    const results: ServiceRef[] = [];
    const queue: string[][] = [[]]; // folders as arrays of parts
    let inFlight = 0;
    let started = 0;
    let hadError = false;

    async function fetchFolder(parts: string[]): Promise<void> {
      if (cancelled || started > MAX_REQUESTS) return;
      const base = root.replace(/\/+$/, '');
      const sub = parts.length ? `/${parts.join('/')}` : '';
      const url = `${base}${sub}?f=pjson`;
      started++;
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) return;
        const json = await res.json();
        const list: ServiceRef[] = Array.isArray(json?.services)
          ? json.services
              .filter((s: any) => s && (s.type === 'MapServer' || s.type === 'FeatureServer' || s.type === 'ImageServer'))
              .map((s: any) => {
                const name = s.name.split('/').pop();
                const path = [...parts, name].join('/');
                return { path, name, type: s.type } as ServiceRef;
              })
          : [];
        results.push(...list);
        const folders: string[] = Array.isArray(json?.folders) ? json.folders : [];
        for (const f of folders) {
          if (started + queue.length < MAX_REQUESTS) queue.push([...parts, f]);
        }
      } catch {
        hadError = true;
      }
    }

    async function pump(): Promise<void> {
      if (cancelled) return;
      while (inFlight < CONCURRENCY && queue.length) {
        const next = queue.shift()!;
        inFlight++;
        fetchFolder(next).finally(() => {
          inFlight--;
          // Schedule another pump tick
          setTimeout(() => pump(), 0);
        });
      }
      // Done condition: nothing queued and none in flight
      if (inFlight === 0 && queue.length === 0) {
        setLoading(false);
        if (!cancelled) {
          setServices(results);
          setLoadError(results.length === 0 && hadError ? 'Failed to list services. The server may block cross-origin requests (CORS).' : '');
        }
      }
    }

    setLoading(true);
    pump();

    return () => {
      cancelled = true;
      try { controller.abort(); } catch {}
    };
  }, [root]);

  // Load layers for selected service
  useEffect(() => {
    let cancelled = false;
    async function loadLayers() {
      setLayers([]);
      // details are handled upstream
      if (!selectedService) return;
      const lastSlash = selectedService.lastIndexOf('/');
      const servicePath = selectedService.slice(0, lastSlash);
      const type = selectedService.slice(lastSlash + 1) as ServiceRef['type'];
      const svcUrl = `${root.replace(/\/+$/, '')}/${servicePath}/${type}`;
      try {
        const meta = await fetchServiceMetadata(svcUrl);
        if (cancelled) return;
        const ls = Array.isArray(meta?.layers) ? meta.layers.map((l: any) => ({ id: l.id, name: l.name })) : [];
        setLayers(ls);
        // Update app URL, preserve layer id if present (e.g., user entered /MapServer/:id)
        if (type === 'MapServer') {
          const next = selectedLayerId ? `${svcUrl}/${selectedLayerId}` : svcUrl;
          if (next !== (serviceUrl || '')) onSelectServiceUrl(next);
        } else {
          const id = selectedLayerId || '0';
          const next = `${svcUrl}/${id}`;
          if (next !== (serviceUrl || '')) onSelectServiceUrl(next);
          setSelectedLayerId(id);
        }
      } catch { if (!cancelled) { setLayers([]); } }
    }
    loadLayers();
    return () => { cancelled = true; };
  }, [selectedService, root]);

  function applyLayer(id: string) {
    setSelectedLayerId(id);
    if (!selectedService) return;
    const lastSlash = selectedService.lastIndexOf('/');
    const servicePath = selectedService.slice(0, lastSlash);
    const type = selectedService.slice(lastSlash + 1) as ServiceRef['type'];
    const svcUrl = `${root.replace(/\/+$/, '')}/${servicePath}/${type}`;
    if (type === 'MapServer') {
      const next = id ? `${svcUrl}/${id}` : svcUrl;
      if (next !== (serviceUrl || '')) onSelectServiceUrl(next);
    } else {
      const next = `${svcUrl}/${id || '0'}`;
      if (next !== (serviceUrl || '')) onSelectServiceUrl(next);
    }
    // Details (layer meta/count) are handled upstream when URL changes
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Root</label>
        <input
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          placeholder={defaultRoot}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)' }}
        />
      </div>
      {/* PBF toggle removed */}
      {/* Folders UI removed: we list all services recursively */}
      <div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Service</label>
        <select
          value={selectedService}
          onChange={(e) => setSelectedService(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)' }}
        >
          <option value="">— Select Service —</option>
          {loading ? <option value="">Loading…</option> : null}
          {!loading && services.length === 0 ? <option value="">(no services)</option> : null}
          {services.map(s => (
            <option key={`${s.path}/${s.type}`} value={`${s.path}/${s.type}`}>{s.path} ({s.type})</option>
          ))}
        </select>
        {loadError ? <div style={{ marginTop: 6, color: 'tomato', fontSize: 12 }}>{loadError}</div> : null}
      </div>
      {selectedService ? (
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Layer</label>
          <select
            value={selectedLayerId}
            onChange={(e) => applyLayer(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)' }}
          >
            {/* MapServer can be dynamic (blank) or specific id; FeatureServer defaults to 0 */}
            {selectedService.endsWith('/MapServer') ? <option value="">Dynamic (all layers)</option> : null}
            {layers.length === 0 ? (
              <option value="0">0 — Layer</option>
            ) : (
              layers.map(l => <option key={l.id} value={String(l.id)}>{l.id} — {l.name}</option>)
            )}
          </select>
          {selectedService.endsWith('/MapServer') && selectedLayerId === '' ? (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
              Dynamic layers provide an overview and are not clickable or queryable.
            </div>
          ) : null}
          {onZoomToExtent ? (
            <div style={{ marginTop: 6 }}>
              <button
                onClick={async () => {
                  if (zoomBusy) return;
                  setZoomBusy(true);
                  const ext0: any = (layerMeta?.extent || serviceMeta?.fullExtent || serviceMeta?.initialExtent) as any;
                  if (ext0) {
                    const canUse = !!extentToBounds(ext0 as any);
                    if (canUse) {
                      const clone = { ...ext0, spatialReference: ext0.spatialReference ? { ...ext0.spatialReference } : undefined } as any;
                      onZoomToExtent(clone);
                      setZoomBusy(false);
                      return;
                    }
                  }
                  try {
                    // Build layer URL when possible and ask server for 4326 extent
                    const lastSlash = selectedService.lastIndexOf('/');
                    const servicePath = selectedService.slice(0, lastSlash);
                    const type = selectedService.slice(lastSlash + 1) as any;
                    const svcUrl = `${root.replace(/\/+$/, '')}/${servicePath}/${type}`;
                    const lid = Number(selectedLayerId);
                    const lyrUrl = Number.isFinite(lid) ? `${svcUrl}/${lid}` : undefined;
                    if (lyrUrl) {
                      const ext = await fetchLayerExtent4326(lyrUrl);
                      if (ext) { onZoomToExtent({ ...ext, spatialReference: ext.spatialReference ? { ...ext.spatialReference } : undefined } as any); setZoomBusy(false); return; }
                    }
                  } catch { }
                  setZoomBusy(false);
                }}
                disabled={zoomBusy || (!((layerMeta as any)?.extent || (serviceMeta as any)?.fullExtent || (serviceMeta as any)?.initialExtent) && !(selectedService && selectedService.endsWith('/MapServer') ? selectedLayerId !== '' : !!selectedService))}
                style={{ padding: '8px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: (zoomBusy ? 'wait' : 'pointer'), opacity: (zoomBusy ? 0.6 : 1), outlineStyle: 'none' }}
              >
                {zoomBusy ? 'Zooming…' : 'Zoom to Extent'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
