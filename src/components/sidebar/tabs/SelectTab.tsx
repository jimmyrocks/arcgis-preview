import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildArcgisJsonUrl, canonicalizeArcgisRestUrl, coerceArcgisRestServicesUrl, getRestServiceUrlInfo } from '../../../lib/arcgis';
import { fetchLayerExtent4326, fetchServiceMetadata } from '../../../lib/esriLayer';
import { extentToBounds } from '../../../lib/geometry';
import { getLayerDescription, getServiceDescription, summarizePlainText } from '../../../lib/arcgisDescription';
import type { RecentLayerEntry } from '../../../lib/layerFinderRecent';
import { readRecentLayerEntries } from '../../../lib/layerFinderRecent';
import {
  friendlyServiceLabel,
  serviceDataBadge,
  serviceShortHint,
  serviceSummaryHint,
  type ServiceSemanticsType as ServiceType,
} from '../../../lib/serviceSemantics';
import type { SidebarProps } from '../components/Sidebar';
import SearchableSelect from '../../ui/SearchableSelect';
import type { SearchableSelectHandle, SearchableSelectOption } from '../../ui/SearchableSelect';

type ServiceRef = {
  path: string;
  name: string;
  type: ServiceType;
  folderPath: string;
};

type LayerRef = {
  id: number;
  name: string;
  servicePath: string;
  serviceType: ServiceType;
  serviceUrl: string;
  layerUrl: string;
};

type FinderItem =
  | { kind: 'folder'; path: string; name: string; description: string; hint?: string; sortScore: number; rank: number }
  | { kind: 'service'; service: ServiceRef; description: string; hint?: string; sortScore: number; rank: number }
  | { kind: 'layer'; layer: LayerRef; description: string; hint?: string; sortScore: number; rank: number };

type RootDiscoveryCache = {
  timestamp: number;
  services: ServiceRef[];
  folderChildrenByPath?: Record<string, string[]>;
  crawlMode?: CrawlMode;
};

type ServiceLayersCache = {
  timestamp: number;
  layers: LayerRef[];
};

type FinderMode = 'full' | 'search-only' | 'details-only';
type FinderChrome = 'full' | 'compact';
type LoadErrorKind = '' | 'auth' | 'network' | 'empty';
type CrawlMode = 'eager' | 'lazy';
type FolderLoadState = {
  status: 'loading' | 'loaded' | 'error';
  errorKind?: Exclude<LoadErrorKind, ''>;
};
type FolderFetchResult = {
  folderPath: string;
  services: ServiceRef[];
  childFolders: string[];
  responseMs: number;
  errorKind?: Exclude<LoadErrorKind, ''>;
  aborted?: boolean;
};
export type SelectTabHandle = {
  focusFinder: () => void;
  browseServer: () => void;
  browseFolder: (path: string) => void;
  browseService: (serviceKey: string) => void;
};

const DISCOVERY_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const EAGER_RESPONSE_MS_THRESHOLD = 900;
const EAGER_ROOT_FOLDER_THRESHOLD = 14;
const EAGER_QUEUE_THRESHOLD = 36;
const EAGER_MAX_REQUESTS = 120;
const ROOT_CACHE_PREFIX = 'layerFinder:root:';
const SERVICE_CACHE_PREFIX = 'layerFinder:service:';
const PINNED_ROOTS_KEY = 'pinnedRootServers';
const EXAMPLE_URLS = [
  {
    label: 'USGS National Map',
    description: 'Topographic, hydrographic, and infrastructure data',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services',
  },
  {
    label: 'CDC Public Health GIS',
    description: 'Public health and disease surveillance layers',
    url: 'https://gis.cdc.gov/arcgis/rest/services',
  },
  {
    label: 'New York City Open Data',
    description: 'Streets, parcels, zoning, and city services',
    url: 'https://maps.nyc.gov/arcgis/rest/services',
  },
  {
    label: 'Esri Sample Server 6',
    description: 'Public demo layers for testing',
    url: 'https://sampleserver6.arcgisonline.com/arcgis/rest/services',
  },
] as const;

const SelectTab = React.forwardRef<SelectTabHandle, SidebarProps & { finderMode?: FinderMode; finderChrome?: FinderChrome }>(function SelectTab({
  serviceUrl,
  onSelectServiceUrl,
  onZoomToExtent,
  onZoomToLayer,
  serviceMeta,
  layerMeta,
  renderStatus = 'idle',
  renderedFeatureCount = 0,
  featureCount,
  renderMode = 'feature',
  finderMode = 'full',
  finderChrome = 'full',
}: SidebarProps & { finderMode?: FinderMode; finderChrome?: FinderChrome }, ref) {
  const showFinder = finderMode !== 'details-only';
  const showDetails = finderMode !== 'search-only';
  const isSearchOnly = finderMode === 'search-only';
  const isCompactFinder = finderChrome === 'compact';
  const finderRef = useRef<SearchableSelectHandle | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const parsed = useMemo(() => {
    try {
      return getRestServiceUrlInfo(serviceUrl);
    } catch {
      return null;
    }
  }, [serviceUrl]);

  const [root, setRoot] = useState<string>(parsed?.baseRoot || '');
  const [browsePath, setBrowsePath] = useState<string>(parsed?.folders.join('/') || '');
  const [services, setServices] = useState<ServiceRef[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [loadErrorKind, setLoadErrorKind] = useState<LoadErrorKind>('');
  const [finderInput, setFinderInput] = useState<string>('');
  const [finderFocused, setFinderFocused] = useState<boolean>(false);
  const [activeOptionValue, setActiveOptionValue] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string>(parsed?.servicePath && parsed?.serviceType ? `${parsed.servicePath}/${parsed.serviceType}` : '');
  const [selectedLayerId, setSelectedLayerId] = useState<string>(() => {
    if (parsed?.layerId !== undefined) return String(parsed.layerId);
    if (parsed?.serviceType === 'FeatureServer' && parsed?.servicePath) return '0';
    return '';
  });
  const canRenderDiscoveryState = showFinder || (showDetails && !selectedService);
  const shouldDiscover = finderMode === 'search-only'
    ? showFinder && (!selectedService || !!finderInput.trim() || finderFocused)
    : canRenderDiscoveryState;
  const [layers, setLayers] = useState<LayerRef[]>([]);
  const [layersLoading, setLayersLoading] = useState<boolean>(false);
  const [zoomBusy, setZoomBusy] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [recentEntries, setRecentEntries] = useState<RecentLayerEntry[]>([]);
  const [pinnedRoots, setPinnedRoots] = useState<string[]>([]);
  const [layersByServiceUrl, setLayersByServiceUrl] = useState<Record<string, LayerRef[]>>({});
  const [folderChildrenByPath, setFolderChildrenByPath] = useState<Record<string, string[]>>({});
  const [folderLoadStateByPath, setFolderLoadStateByPath] = useState<Record<string, FolderLoadState>>({});
  const [crawlMode, setCrawlMode] = useState<CrawlMode>('eager');
  const [hydratedRoot, setHydratedRoot] = useState<string>('');
  const [reloadToken, setReloadToken] = useState<number>(0);

  const layerIndexRef = useRef<Record<string, LayerRef[]>>({});
  const layerRequestRef = useRef<Map<string, Promise<LayerRef[]>>>(new Map());
  const folderLoadStateRef = useRef<Record<string, FolderLoadState>>({});
  const folderRequestRef = useRef<Map<string, Promise<FolderFetchResult>>>(new Map());

  useEffect(() => {
    layerIndexRef.current = layersByServiceUrl;
  }, [layersByServiceUrl]);

  useEffect(() => {
    folderLoadStateRef.current = folderLoadStateByPath;
  }, [folderLoadStateByPath]);

  useEffect(() => {
    try {
      setRecentEntries(readRecentLayerEntries());
      setPinnedRoots(readStringArray(PINNED_ROOTS_KEY));
    } catch {
      setRecentEntries([]);
      setPinnedRoots([]);
    }
  }, [serviceUrl, root]);

  useEffect(() => {
    try {
      localStorage.setItem(PINNED_ROOTS_KEY, JSON.stringify(pinnedRoots.slice(0, 8)));
    } catch {}
  }, [pinnedRoots]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const focusFinderDropdown = useCallback((select: boolean) => {
    if (!showFinder) return;
    window.requestAnimationFrame(() => {
      finderRef.current?.focus({ open: true, select });
    });
  }, [showFinder]);

  const browseServerInFinder = useCallback(() => {
    if (!showFinder) return;
    setFinderInput('');
    setBrowsePath('');
    setSelectedService('');
    setSelectedLayerId('');
    focusFinderDropdown(false);
  }, [focusFinderDropdown, showFinder]);

  const browseFolderInFinder = useCallback((path: string) => {
    if (!showFinder) return;
    setFinderInput('');
    setBrowsePath(path);
    setSelectedService('');
    setSelectedLayerId('');
    focusFinderDropdown(false);
  }, [focusFinderDropdown, showFinder]);

  const browseServiceInFinder = useCallback((serviceKey: string) => {
    if (!showFinder) return;
    const service = services.find((item) => `${item.path}/${item.type}` === serviceKey) || null;
    setFinderInput('');
    setSelectedService(serviceKey);
    setSelectedLayerId('');
    if (service) setBrowsePath(service.folderPath);
    focusFinderDropdown(false);
  }, [focusFinderDropdown, services, showFinder]);

  React.useImperativeHandle(ref, () => ({
    focusFinder: () => {
      focusFinderDropdown(true);
    },
    browseServer: browseServerInFinder,
    browseFolder: browseFolderInFinder,
    browseService: browseServiceInFinder,
  }), [browseFolderInFinder, browseServerInFinder, browseServiceInFinder, focusFinderDropdown]);

  useEffect(() => {
    setRoot(parsed?.baseRoot || '');
    setBrowsePath(parsed?.folders.join('/') || '');
    if (parsed?.servicePath && parsed?.serviceType) {
      setSelectedService(`${parsed.servicePath}/${parsed.serviceType}`);
    } else {
      setSelectedService('');
      setLayers([]);
    }
    if (parsed?.layerId !== undefined) {
      setSelectedLayerId(String(parsed.layerId));
    } else if (parsed?.serviceType === 'FeatureServer' && parsed?.servicePath) {
      setSelectedLayerId('0');
    } else {
      setSelectedLayerId('');
    }
  }, [parsed?.baseRoot, parsed?.folders, parsed?.layerId, parsed?.servicePath, parsed?.serviceType]);

  const applyRootUrl = useCallback((value: string, commitSelection: boolean = false) => {
    try {
      const info = getRestServiceUrlInfo(value);
      const nextRoot = info.baseRoot || value;
      setRoot((prev) => (prev === nextRoot ? prev : nextRoot));
      setBrowsePath(info.folders.join('/'));
      setFinderInput('');
      if (info.servicePath && info.serviceType) {
        const nextService = `${info.servicePath}/${info.serviceType}`;
        setSelectedService(nextService);
        if (info.layerId !== undefined && info.layerId !== null) {
          setSelectedLayerId(String(info.layerId));
        } else if (info.serviceType === 'FeatureServer') {
          setSelectedLayerId('0');
        } else {
          setSelectedLayerId('');
        }
      } else {
        setSelectedService('');
        setSelectedLayerId('');
      }
      if (!commitSelection) return true;
      if (info.layerUrl) {
        onSelectServiceUrl(info.layerUrl);
      } else if (info.serviceUrl) {
        onSelectServiceUrl(info.serviceType === 'FeatureServer' ? `${info.serviceUrl}/0` : info.serviceUrl);
      } else {
        onSelectServiceUrl(canonicalizeArcgisRestUrl(value));
      }
      return true;
    } catch {
      return false;
    }
  }, [onSelectServiceUrl]);

  useEffect(() => {
    if (!root || !canRenderDiscoveryState || hydratedRoot !== root) return;
    writeStorage(storageKey(ROOT_CACHE_PREFIX, root), {
      timestamp: Date.now(),
      services,
      folderChildrenByPath,
      crawlMode,
    } satisfies RootDiscoveryCache);
  }, [canRenderDiscoveryState, crawlMode, folderChildrenByPath, hydratedRoot, root, services]);

  const mergeFolderResult = useCallback((result: FolderFetchResult) => {
    setServices((prev) => sortServices([...prev, ...result.services]));
    setFolderChildrenByPath((prev) => {
      const nextChildren = mergeUniqueStrings(prev[result.folderPath] || [], result.childFolders);
      if (sameStringArray(prev[result.folderPath] || [], nextChildren)) return prev;
      return { ...prev, [result.folderPath]: nextChildren };
    });
    setFolderLoadStateByPath((prev) => ({ ...prev, [result.folderPath]: { status: 'loaded' } }));
  }, []);

  const loadFolder = useCallback(async (folderPath: string, signal?: AbortSignal): Promise<FolderFetchResult> => {
    if (!root) return { folderPath, services: [], childFolders: [], responseMs: 0, errorKind: 'network' };
    const requestKey = `${root}::${folderPath}`;
    const inFlight = folderRequestRef.current.get(requestKey);
    if (inFlight) return inFlight;
    setFolderLoadStateByPath((prev) => ({ ...prev, [folderPath]: { status: 'loading' } }));
    const promise = fetchFolderListing(root, folderPath, signal)
      .then((result) => {
        if (result.aborted) return result;
        if (result.errorKind) {
          setFolderLoadStateByPath((prev) => ({
            ...prev,
            [folderPath]: { status: 'error', errorKind: result.errorKind },
          }));
          return result;
        }
        mergeFolderResult(result);
        return result;
      })
      .finally(() => {
        folderRequestRef.current.delete(requestKey);
      });
    folderRequestRef.current.set(requestKey, promise);
    return promise;
  }, [mergeFolderResult, root]);

  useEffect(() => {
    if (!canRenderDiscoveryState) {
      setHydratedRoot('');
      setServices([]);
      setFolderChildrenByPath({});
      setFolderLoadStateByPath({});
      setLoading(false);
      setLoadError('');
      setLoadErrorKind('');
      setCrawlMode('eager');
      return;
    }
    if (!root) {
      setHydratedRoot('');
      setServices([]);
      setFolderChildrenByPath({});
      setFolderLoadStateByPath({});
      setLoading(false);
      setLoadError('');
      setLoadErrorKind('');
      setCrawlMode('eager');
      return;
    }
    if (!shouldDiscover) {
      setLoading(false);
      setLoadError('');
      setLoadErrorKind('');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const cached = readFreshCache<RootDiscoveryCache>(storageKey(ROOT_CACHE_PREFIX, root), DISCOVERY_CACHE_TTL_MS);
    const cachedFolders = cached?.folderChildrenByPath || {};
    const cachedMode = cached?.crawlMode || 'eager';
    setHydratedRoot(root);
    setServices(cached?.services || []);
    setFolderChildrenByPath(cachedFolders);
    setFolderLoadStateByPath(buildFolderLoadStateFromCache(cachedFolders));
    setCrawlMode(cachedMode);
    setLoading(true);
    setLoadError('');
    setLoadErrorKind('');

    const finishWithRootError = (errorKind: Exclude<LoadErrorKind, ''>) => {
      if (cancelled) return;
      setLoading(false);
      setLoadErrorKind(errorKind);
      if (errorKind === 'auth') setLoadError('This server requires authentication before the finder can browse it.');
      else if (errorKind === 'network') setLoadError('Unable to list folders and services. The server may block cross-origin requests.');
      else setLoadError('No folders or services were found under this server.');
    };

    void loadFolder('', controller.signal).then((rootResult) => {
      if (cancelled) return;
      if (rootResult.errorKind) {
        finishWithRootError(rootResult.errorKind);
        return;
      }
      const preferLazy = cachedMode === 'lazy' || shouldUseLazyCrawl(rootResult);
      setCrawlMode(preferLazy ? 'lazy' : 'eager');
      if (preferLazy || !rootResult.childFolders.length) {
        setLoading(false);
        return;
      }

      const queue = rootResult.childFolders.filter((path) => folderLoadStateRef.current[path]?.status !== 'loaded');
      const queued = new Set(queue);
      let inFlight = 0;
      let started = 0;
      let switchedToLazy = false;

      const pump = () => {
        if (cancelled) return;
        if (switchedToLazy && inFlight === 0) {
          setCrawlMode('lazy');
          setLoading(false);
          return;
        }
        while (!switchedToLazy && inFlight < 6 && queue.length) {
          const nextPath = queue.shift()!;
          queued.delete(nextPath);
          if (folderLoadStateRef.current[nextPath]?.status === 'loaded') continue;
          inFlight++;
          started++;
          if (started > EAGER_MAX_REQUESTS) {
            switchedToLazy = true;
            inFlight--;
            break;
          }
          void loadFolder(nextPath, controller.signal)
            .then((result) => {
              if (cancelled || result.errorKind) return;
              if (queue.length > EAGER_QUEUE_THRESHOLD || result.responseMs > EAGER_RESPONSE_MS_THRESHOLD) {
                switchedToLazy = true;
                return;
              }
              result.childFolders.forEach((childPath) => {
                if (folderLoadStateRef.current[childPath]?.status === 'loaded' || queued.has(childPath)) return;
                queued.add(childPath);
                queue.push(childPath);
              });
            })
            .finally(() => {
              inFlight--;
              if (!queue.length && inFlight === 0) {
                if (switchedToLazy) setCrawlMode('lazy');
                setLoading(false);
                return;
              }
              pump();
            });
        }
        if (!queue.length && inFlight === 0) {
          if (switchedToLazy) setCrawlMode('lazy');
          setLoading(false);
        }
      };

      pump();
    });

    return () => {
      cancelled = true;
      try {
        controller.abort();
      } catch {}
    };
  }, [canRenderDiscoveryState, loadFolder, reloadToken, root, shouldDiscover]);

  const selectedServiceInfo = useMemo(() => services.find((service) => `${service.path}/${service.type}` === selectedService) || null, [services, selectedService]);
  const selectedType = useMemo(() => {
    if (!selectedService) return '';
    return splitServiceKey(selectedService)?.serviceType || '';
  }, [selectedService]);
  const selectedServiceUrl = useMemo(() => {
    if (!root || !selectedService) return '';
    return buildServiceUrl(root, selectedService);
  }, [root, selectedService]);

  const ensureServiceLayers = useCallback(async (serviceKey: string, signal?: AbortSignal): Promise<LayerRef[]> => {
    if (!root || !serviceKey) return [];
    const parts = splitServiceKey(serviceKey);
    if (!parts) return [];
    if (parts.serviceType !== 'MapServer' && parts.serviceType !== 'FeatureServer') return [];
    const serviceUrl = buildServiceUrl(root, serviceKey);
    const inMemory = layerIndexRef.current[serviceUrl];
    if (inMemory?.length) return inMemory;

    const cached = readFreshCache<ServiceLayersCache>(storageKey(SERVICE_CACHE_PREFIX, serviceUrl), DISCOVERY_CACHE_TTL_MS);
    if (cached?.layers?.length) {
      setLayersByServiceUrl((prev) => (prev[serviceUrl] ? prev : { ...prev, [serviceUrl]: cached.layers }));
      return cached.layers;
    }

    const inFlight = layerRequestRef.current.get(serviceUrl);
    if (inFlight) return inFlight;

    const promise = fetchServiceMetadata(serviceUrl, { signal }).then((meta) => {
      const nextLayers = normalizeLayers(meta, parts.servicePath, parts.serviceType, serviceUrl);
      setLayersByServiceUrl((prev) => ({ ...prev, [serviceUrl]: nextLayers }));
      writeStorage(storageKey(SERVICE_CACHE_PREFIX, serviceUrl), {
        timestamp: Date.now(),
        layers: nextLayers,
      } satisfies ServiceLayersCache);
      return nextLayers;
    }).catch(() => [])
      .finally(() => {
        layerRequestRef.current.delete(serviceUrl);
      });

    layerRequestRef.current.set(serviceUrl, promise);
    return promise;
  }, [root]);

  useEffect(() => {
    if (!selectedService || !selectedServiceUrl) {
      setLayers([]);
      setLayersLoading(false);
      return;
    }
    if (selectedType !== 'MapServer' && selectedType !== 'FeatureServer') {
      setLayers([]);
      setLayersLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const cachedLayers = layerIndexRef.current[selectedServiceUrl];
    if (cachedLayers?.length) setLayers((prev) => (prev === cachedLayers ? prev : cachedLayers));
    setLayersLoading(!cachedLayers?.length);

    void ensureServiceLayers(selectedService, controller.signal).then((nextLayers) => {
      if (cancelled) return;
      setLayers((prev) => (prev === nextLayers ? prev : nextLayers));
      setLayersLoading(false);
      // Only default to the first layer when this service is the committed URL;
      // while merely browsing a service, no layer should appear selected.
      const committedHere = parsed?.servicePath && parsed.servicePath === splitServiceKey(selectedService)?.servicePath;
      if (selectedType === 'FeatureServer' && !selectedLayerId && nextLayers[0] && committedHere) {
        setSelectedLayerId(String(nextLayers[0].id));
      }
    }).catch(() => {
      if (!cancelled) {
        setLayers([]);
        setLayersLoading(false);
      }
    });

    return () => {
      cancelled = true;
      try {
        controller.abort();
      } catch {}
    };
  }, [ensureServiceLayers, parsed?.servicePath, selectedLayerId, selectedService, selectedServiceUrl, selectedType]);

  const knownLayers = useMemo(() => {
    const rootPrefix = root.replace(/\/+$/, '');
    return Object.entries(layersByServiceUrl)
      .filter(([serviceUrl]) => serviceUrl.startsWith(rootPrefix))
      .flatMap(([, value]) => value);
  }, [layersByServiceUrl, root]);

  const folderPaths = useMemo(() => buildFolderPaths(folderChildrenByPath, services), [folderChildrenByPath, services]);
  const directBrowseFolders = useMemo(
    () => (folderChildrenByPath[browsePath] || getDirectChildFolders(folderPaths, browsePath)).slice().sort((a, b) => a.localeCompare(b)),
    [browsePath, folderChildrenByPath, folderPaths],
  );
  const currentFolderLoadState = folderLoadStateByPath[browsePath || ''];

  const finderTokens = useMemo(() => finderInput.trim().toLowerCase().split(/\s+/).filter(Boolean), [finderInput]);

  useEffect(() => {
    if (!root || !shouldDiscover || !browsePath) return;
    const state = folderLoadStateRef.current[browsePath];
    if (state?.status === 'loaded' || state?.status === 'loading') return;
    const controller = new AbortController();
    void loadFolder(browsePath, controller.signal);
    return () => {
      try {
        controller.abort();
      } catch {}
    };
  }, [browsePath, loadFolder, root, shouldDiscover]);

  useEffect(() => {
    if (!showFinder) return;
    if (!root || !finderTokens.length || !services.length) return;
    const controller = new AbortController();
    const rankedServices = services
      .map((service) => ({
        service,
        score: matchScore(`${service.name} ${service.path} ${service.type}`, finderTokens),
      }))
      .filter((entry) => entry.score !== null)
      .sort((a, b) => (a.score as number) - (b.score as number))
      .slice(0, 6);

    rankedServices.forEach(({ service }) => {
      if (service.type !== 'MapServer' && service.type !== 'FeatureServer') return;
      void ensureServiceLayers(`${service.path}/${service.type}`, controller.signal);
    });

    return () => {
      try {
        controller.abort();
      } catch {}
    };
  }, [ensureServiceLayers, finderTokens, root, services, showFinder]);

  const currentSelectionValue = useMemo(() => {
    if (selectedService && selectedLayerId !== '') return `layer:${selectedService}::${selectedLayerId}`;
    if (selectedService) return `service:${selectedService}`;
    if (browsePath) return `folder:${browsePath}`;
    return '';
  }, [browsePath, selectedLayerId, selectedService]);

  const finderItems = useMemo(() => {
    if (!showFinder) return [] as FinderItem[];
    const query = finderInput.trim();
    if (!root) return [] as FinderItem[];

    if (!query) {
      // Drilled into a service: the menu is that service's layer list
      if (selectedService && selectedServiceUrl && (selectedType === 'MapServer' || selectedType === 'FeatureServer')) {
        return layers.map((layer, index): FinderItem => ({
          kind: 'layer',
          layer,
          description: `${layer.servicePath}/${layer.id}`,
          hint: summarizeLayerHint(layer, layerMeta, featureCount, selectedLayerId),
          sortScore: index,
          rank: 0,
        })).slice(0, 120);
      }
      const folderItems: FinderItem[] = directBrowseFolders.map((path, index) => ({
        kind: 'folder',
        path,
        name: path.split('/').pop() || path,
        description: path,
        hint: summarizeFolder(path, services),
        sortScore: index,
        rank: 0,
      }));
      const serviceItems: FinderItem[] = services
        .filter((service) => service.folderPath === browsePath)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((service, index) => ({
          kind: 'service',
          service,
          description: service.path,
          hint: summarizeServiceHint(service, layersByServiceUrl[buildServiceUrl(root, `${service.path}/${service.type}`)]),
          sortScore: index,
          rank: 1,
        }));
      return [...folderItems, ...serviceItems].slice(0, 120);
    }

    const allItems: FinderItem[] = [];

    folderPaths.forEach((path) => {
      const score = matchScore(path, finderTokens);
      if (score === null) return;
      allItems.push({
        kind: 'folder',
        path,
        name: path.split('/').pop() || path,
        description: path,
        hint: summarizeFolder(path, services),
        sortScore: score,
        rank: 2,
      });
    });

    services.forEach((service) => {
      const score = matchScore(`${service.name} ${service.path} ${service.type}`, finderTokens);
      if (score === null) return;
      const serviceUrl = buildServiceUrl(root, `${service.path}/${service.type}`);
      allItems.push({
        kind: 'service',
        service,
        description: service.path,
        hint: summarizeServiceHint(service, layersByServiceUrl[serviceUrl]),
        sortScore: score,
        rank: 1,
      });
    });

    knownLayers.forEach((layer) => {
      const score = matchScore(`${layer.name} ${layer.servicePath} ${layer.id} ${layer.serviceType}`, finderTokens);
      if (score === null) return;
      allItems.push({
        kind: 'layer',
        layer,
        description: `${layer.servicePath}/${layer.id}`,
        hint: summarizeLayerHint(layer, layerMeta, featureCount, selectedLayerId),
        sortScore: score,
        rank: 0,
      });
    });

    return allItems
      .sort((a, b) => (a.sortScore - b.sortScore) || (a.rank - b.rank) || getFinderLabel(a).localeCompare(getFinderLabel(b)))
      .slice(0, 120);
  }, [browsePath, directBrowseFolders, featureCount, finderInput, finderTokens, folderPaths, knownLayers, layerMeta, layers, layersByServiceUrl, root, selectedLayerId, selectedService, selectedServiceUrl, selectedType, services, showFinder]);

  const finderOptions = useMemo((): SearchableSelectOption[] => {
    const layerGroupLabel = selectedServiceInfo?.name ? `Layers in ${selectedServiceInfo.name}` : 'Layers in current service';
    const query = finderInput.trim();
    const urlCandidate = coerceArcgisRestServicesUrl(query);
    const mapped = finderItems.map((item) => ({
      value: item.kind === 'folder'
        ? `folder:${item.path}`
        : item.kind === 'service'
          ? `service:${item.service.path}/${item.service.type}`
          : `layer:${item.layer.servicePath}/${item.layer.serviceType}::${item.layer.id}`,
      label: getFinderLabel(item),
      groupKey: query
        ? undefined
        : item.kind === 'folder'
          ? 'folders'
          : item.kind === 'service'
            ? 'services'
            : 'layers',
      groupLabel: query
        ? undefined
        : item.kind === 'folder'
          ? 'Folders here'
          : item.kind === 'service'
            ? 'Services here'
            : layerGroupLabel,
      renderLabel: () => renderFinderLabel(item, finderInput, root, currentSelectionValue, browsePath),
    }));

    if (urlCandidate) {
      const completesRestPath = urlCandidate !== canonicalizeArcgisRestUrl(query);
      mapped.unshift({
        value: `url:${urlCandidate}`,
        label: `Open ${urlCandidate}`,
        groupKey: undefined,
        groupLabel: undefined,
        renderLabel: () => (
          <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ ...badgeStyle, color: 'var(--accent)' }}>URL</span>
              <span style={{ fontWeight: 700 }}>{completesRestPath ? 'Open services directory' : 'Open ArcGIS URL'}</span>
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {urlCandidate}
            </span>
          </span>
        ),
      });
    }

    // Drilled into a service: prepend "back" + (MapServer) "open whole service" rows
    const drilled = !query && !!selectedService && (selectedType === 'MapServer' || selectedType === 'FeatureServer');
    if (!drilled) return mapped;

    const serviceName = selectedServiceInfo?.name || serviceNameFromKey(selectedService) || 'service';
    const parentFolder = selectedServiceInfo?.folderPath ?? parentPathOf(splitServiceKey(selectedService)?.servicePath || '');
    const parentLabel = parentFolder ? (parentFolder.split('/').pop() || parentFolder) : (root ? rootLabel(root) : 'server');
    const extras: SearchableSelectOption[] = [{
      value: 'up:',
      label: `Back to ${parentLabel}`,
      renderLabel: () => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontWeight: 600 }}>
          <span aria-hidden="true">←</span> Back to {parentLabel}
        </span>
      ),
    }];
    if (selectedType === 'MapServer') {
      extras.push({
        value: `open-service:${selectedService}`,
        label: `Open ${serviceName} (whole map)`,
        renderLabel: () => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            Open {serviceName}
            <span style={badgeStyle}>Whole map</span>
          </span>
        ),
      });
    }
    return [...extras, ...mapped];
  }, [browsePath, currentSelectionValue, finderInput, finderItems, root, selectedService, selectedServiceInfo, selectedType]);

  const finderItemByValue = useMemo(() => {
    const next = new Map<string, FinderItem>();
    finderItems.forEach((item) => {
      const value = item.kind === 'folder'
        ? `folder:${item.path}`
        : item.kind === 'service'
          ? `service:${item.service.path}/${item.service.type}`
          : `layer:${item.layer.servicePath}/${item.layer.serviceType}::${item.layer.id}`;
      next.set(value, item);
    });
    return next;
  }, [finderItems]);

  const previewValue = useMemo(() => {
    if (activeOptionValue && finderItemByValue.has(activeOptionValue)) return activeOptionValue;
    if (currentSelectionValue && finderItemByValue.has(currentSelectionValue)) return currentSelectionValue;
    return null;
  }, [activeOptionValue, currentSelectionValue, finderItemByValue]);

  const previewItem = useMemo(() => {
    if (!previewValue) return null;
    return finderItemByValue.get(previewValue) || null;
  }, [finderItemByValue, previewValue]);

  const openService = useCallback((serviceKey: string) => {
    const service = services.find((item) => `${item.path}/${item.type}` === serviceKey) || null;
    const parts = splitServiceKey(serviceKey);
    setFinderInput('');
    setSelectedService(serviceKey);
    setSelectedLayerId(parts?.serviceType === 'FeatureServer' ? '0' : '');
    if (service) setBrowsePath(service.folderPath);
    if (!root || !parts) return;
    const nextServiceUrl = buildServiceUrl(root, serviceKey);
    const nextUrl = parts.serviceType === 'FeatureServer' ? `${nextServiceUrl}/0` : nextServiceUrl;
    if (nextUrl && nextUrl !== (serviceUrl || '')) onSelectServiceUrl(nextUrl);
  }, [onSelectServiceUrl, root, serviceUrl, services]);

  const openLayer = useCallback((serviceKey: string, layerId: string) => {
    const service = services.find((item) => `${item.path}/${item.type}` === serviceKey) || null;
    setFinderInput('');
    setSelectedService(serviceKey);
    setSelectedLayerId(layerId);
    if (service) setBrowsePath(service.folderPath);
    const serviceUrlForLayer = root ? buildServiceUrl(root, serviceKey) : '';
    const parts = splitServiceKey(serviceKey);
    if (!serviceUrlForLayer || !parts) return;
    const nextUrl = parts.serviceType === 'MapServer'
      ? `${serviceUrlForLayer}/${layerId}`
      : parts.serviceType === 'FeatureServer'
        ? `${serviceUrlForLayer}/${layerId || '0'}`
        : serviceUrlForLayer;
    if (nextUrl && nextUrl !== (serviceUrl || '')) onSelectServiceUrl(nextUrl);
  }, [onSelectServiceUrl, root, serviceUrl, services]);

  const navigateUpOneLevel = useCallback(() => {
    if (selectedService && selectedLayerId !== '' && selectedType === 'MapServer') {
      setSelectedLayerId('');
      return true;
    }
    if (selectedService) {
      const service = services.find((item) => `${item.path}/${item.type}` === selectedService) || null;
      setSelectedService('');
      setSelectedLayerId('');
      setFinderInput('');
      if (service) setBrowsePath(service.folderPath);
      return true;
    }
    if (browsePath) {
      setFinderInput('');
      setBrowsePath(parentPathOf(browsePath));
      return true;
    }
    return false;
  }, [browsePath, selectedLayerId, selectedService, selectedType, services]);

  const handleFinderPick = useCallback((value: string) => {
    if (value === 'up:') {
      navigateUpOneLevel();
      focusFinderDropdown(false);
      return;
    }
    if (value.startsWith('url:')) {
      const applied = applyRootUrl(value.slice('url:'.length), true);
      if (applied) {
        setFinderInput('');
        focusFinderDropdown(false);
      }
      return;
    }
    if (value.startsWith('folder:')) {
      setFinderInput('');
      setBrowsePath(value.slice('folder:'.length));
      setSelectedService('');
      setSelectedLayerId('');
      focusFinderDropdown(false);
      return;
    }
    if (value.startsWith('open-service:')) {
      openService(value.slice('open-service:'.length));
      return;
    }
    if (value.startsWith('service:')) {
      const serviceKey = value.slice('service:'.length);
      const parts = splitServiceKey(serviceKey);
      // Map/Feature services have layers to drill into; other types open directly
      if (parts && (parts.serviceType === 'MapServer' || parts.serviceType === 'FeatureServer')) {
        browseServiceInFinder(serviceKey);
      } else {
        openService(serviceKey);
      }
      return;
    }
    if (value.startsWith('layer:')) {
      const payload = value.slice('layer:'.length);
      const splitIndex = payload.lastIndexOf('::');
      if (splitIndex > 0) {
        const serviceKey = payload.slice(0, splitIndex);
        const layerId = payload.slice(splitIndex + 2);
        openLayer(serviceKey, layerId);
      }
    }
  }, [applyRootUrl, browseServiceInFinder, focusFinderDropdown, navigateUpOneLevel, openLayer, openService]);

  const openFinderUrl = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !looksLikeArcgisRestUrl(trimmed)) return false;
    const applied = applyRootUrl(trimmed, true);
    if (applied) setFinderInput('');
    return applied;
  }, [applyRootUrl]);

  const handleFinderKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !finderInput.trim()) {
      const moved = navigateUpOneLevel();
      if (moved) event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && openFinderUrl(finderInput)) {
      event.preventDefault();
    }
  }, [finderInput, navigateUpOneLevel, openFinderUrl]);

  const breadcrumbItems = useMemo(() => {
    const items: Array<{ key: string; label: string; active?: boolean; onClick?: () => void }> = [
      {
        key: 'server',
        label: root ? rootLabel(root) : 'Server',
        active: !browsePath && !selectedService,
        onClick: root ? () => {
          setFinderInput('');
          setBrowsePath('');
          setSelectedService('');
          setSelectedLayerId('');
        } : undefined,
      },
    ];

    let pathSoFar = '';
    browsePath.split('/').filter(Boolean).forEach((part) => {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      const target = pathSoFar;
      items.push({
        key: `folder:${target}`,
        label: part,
        active: target === browsePath && !selectedService,
        onClick: () => {
          setFinderInput('');
          setBrowsePath(target);
          setSelectedService('');
          setSelectedLayerId('');
        },
      });
    });

    if (selectedServiceInfo) {
      items.push({
        key: `service:${selectedServiceInfo.path}`,
        label: selectedServiceInfo.name,
        active: selectedServiceInfo.type === 'MapServer' ? selectedLayerId === '' : false,
        onClick: selectedServiceInfo.type === 'MapServer'
          ? () => {
              setFinderInput('');
              setSelectedLayerId('');
            }
          : undefined,
      });
    }

    const activeLayer = layers.find((layer) => String(layer.id) === selectedLayerId) || null;
    if (activeLayer) {
      items.push({
        key: `layer:${activeLayer.id}`,
        label: activeLayer.name,
        active: true,
      });
    }

    return items;
  }, [browsePath, layers, root, selectedLayerId, selectedService, selectedServiceInfo]);

  const hasPinnedCurrentRoot = !!root && pinnedRoots.includes(root);
  const selectionTitle = selectedLayerId !== ''
    ? (layers.find((layer) => String(layer.id) === selectedLayerId)?.name || `Layer ${selectedLayerId}`)
    : (selectedServiceInfo?.name || serviceNameFromKey(selectedService) || (selectedType ? friendlyServiceLabel(selectedType as ServiceType) : 'Service'));
  const selectionUrl = selectedLayerId !== '' && selectedServiceUrl ? `${selectedServiceUrl}/${selectedLayerId}` : selectedServiceUrl;
  const compactContextUrl = selectionUrl || selectedServiceUrl || root;
  const selectionHint = selectedType ? serviceSummaryHint(selectedType as ServiceType) : '';
  const selectionBadges = [
    selectedLayerId !== '' ? `Layer ${selectedLayerId}` : 'Service',
    selectedType ? friendlyServiceLabel(selectedType as ServiceType) : null,
    selectedType ? serviceDataBadge(selectedType as ServiceType) : null,
    selectedLayerId !== '' && layerMeta?.geometryType ? humanizeGeometry(layerMeta.geometryType) : null,
    selectedLayerId !== '' && typeof featureCount === 'number' ? `${featureCount.toLocaleString()} records` : null,
  ].filter(Boolean) as string[];

  const selectedLayerUrl = useMemo(() => {
    if (!selectedServiceUrl) return '';
    if (selectedType === 'MapServer') return selectedLayerId !== '' ? `${selectedServiceUrl}/${selectedLayerId}` : '';
    if (selectedType === 'FeatureServer') return `${selectedServiceUrl}/${selectedLayerId || '0'}`;
    return '';
  }, [selectedLayerId, selectedServiceUrl, selectedType]);

  const canFallbackZoom = !!((layerMeta as any)?.extent || (serviceMeta as any)?.fullExtent || (serviceMeta as any)?.initialExtent)
    || (selectedService ? (selectedType === 'MapServer' ? selectedLayerId !== '' : true) : false);
  const showLayerList = selectedType === 'MapServer' || selectedType === 'FeatureServer';
  const selectedMetadataDescription = useMemo(() => {
    const description = selectedLayerId !== '' && layerMeta
      ? getLayerDescription(layerMeta, serviceMeta)
      : getServiceDescription(serviceMeta);
    return description ? { ...description, text: summarizePlainText(description.text, 220) } : null;
  }, [layerMeta, selectedLayerId, serviceMeta]);
  const isFeatureRender = renderMode === 'feature';
  const directFolderPaths = directBrowseFolders;
  const directServices = useMemo(() => services.filter((service) => service.folderPath === browsePath), [browsePath, services]);
  const scopedServices = useMemo(() => {
    if (!browsePath) return services;
    return services.filter((service) => service.folderPath === browsePath || service.folderPath.startsWith(`${browsePath}/`));
  }, [browsePath, services]);
  const scopedFolderPaths = useMemo(() => {
    if (!browsePath) return folderPaths;
    return folderPaths.filter((path) => path.startsWith(`${browsePath}/`));
  }, [browsePath, folderPaths]);
  const summaryBreakdown = useMemo(() => {
    const counts = new Map<ServiceType, number>();
    scopedServices.forEach((service) => {
      counts.set(service.type, (counts.get(service.type) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => (b[1] - a[1]) || friendlyServiceLabel(a[0]).localeCompare(friendlyServiceLabel(b[0])))
      .map(([type, count]) => ({
        type,
        label: friendlyServiceLabel(type),
        hint: serviceSummaryHint(type),
        count,
      }));
  }, [scopedServices]);
  const summaryScopeTitle = browsePath ? (browsePath.split('/').pop() || browsePath) : rootLabel(root);
  const summaryScopeKind = browsePath ? 'Folder overview' : 'Server overview';
  const summaryScopeSubtitle = browsePath ? `${rootLabel(root)} / ${browsePath}` : shortUrl(root);
  const summaryScopeUrl = browsePath ? `${root.replace(/\/+$/, '')}/${browsePath}` : root;
  const summaryLead = browsePath
    ? `${directFolderPaths.length} direct folder${directFolderPaths.length === 1 ? '' : 's'} and ${directServices.length} direct service${directServices.length === 1 ? '' : 's'} at this level.`
    : `${services.length} service${services.length === 1 ? '' : 's'} discovered across ${folderPaths.length} folder${folderPaths.length === 1 ? '' : 's'}.`;
  const crawlModeHint = crawlMode === 'lazy'
    ? 'Large or slow server detected. Loading folders on demand.'
    : 'Server is being crawled eagerly for faster global browse.';
  const recentItems = useMemo(() => recentEntries.map((entry) => ({
    label: entry.layerName,
    description: [friendlyServiceLabel(entry.serviceType), serviceDataBadge(entry.serviceType), shortUrl(entry.serverRoot)]
      .filter(Boolean)
      .join(' • '),
    url: entry.layerUrl,
    group: shortUrl(entry.serverRoot),
  })), [recentEntries]);

  const finderScopeModel = useMemo(() => {
    if (!root) return null;
    const hasQuery = !!finderInput.trim();
    if (hasQuery) {
      return {
        title: browsePath ? `Searching from ${browsePath.split('/').pop() || browsePath}` : `Searching ${rootLabel(root)}`,
        detail: browsePath
          ? 'Search runs across the whole server from this breadcrumb. Indented rows sit deeper under the current branch.'
          : 'Search runs across the whole server. Indented rows show deeper folders, services, and layers.',
        badges: [
          `${finderItems.length.toLocaleString()} match${finderItems.length === 1 ? '' : 'es'}`,
          browsePath ? `Branch: ${browsePath.split('/').pop() || browsePath}` : 'Server-wide',
        ],
      };
    }
    if (selectedService && showLayerList) {
      const serviceScopeTitle = selectedServiceInfo?.name || serviceNameFromKey(selectedService) || 'Current service';
      return {
        title: `Showing layers in ${serviceScopeTitle}`,
        detail: selectedType === 'MapServer'
          ? 'The menu includes direct children in this breadcrumb plus sublayers inside the selected map service.'
          : 'The menu includes direct children in this breadcrumb plus layers exposed by the selected feature service.',
        badges: [
          `${layers.length.toLocaleString()} layer${layers.length === 1 ? '' : 's'}`,
          `${directBrowseFolders.length.toLocaleString()} folder${directBrowseFolders.length === 1 ? '' : 's'} here`,
          `${directServices.length.toLocaleString()} service${directServices.length === 1 ? '' : 's'} here`,
          selectedType ? friendlyServiceLabel(selectedType as ServiceType) : '',
          selectedType ? serviceDataBadge(selectedType as ServiceType) : '',
        ].filter(Boolean),
      };
    }
    return {
      title: browsePath ? `Showing contents of ${browsePath.split('/').pop() || browsePath}` : `Showing contents of ${rootLabel(root)}`,
      detail: 'Open the dropdown to browse direct children here. Type to search deeper across the whole server.',
      badges: [
        `${directBrowseFolders.length.toLocaleString()} folder${directBrowseFolders.length === 1 ? '' : 's'}`,
        `${directServices.length.toLocaleString()} service${directServices.length === 1 ? '' : 's'}`,
      ],
    };
  }, [browsePath, directBrowseFolders.length, directServices.length, finderInput, finderItems.length, layers.length, root, selectedService, selectedServiceInfo?.name, selectedType, showLayerList]);

  const finderHelperText = useMemo(() => {
    if (!root) {
      return 'Paste any ArcGIS REST URL. The menu will show folders, services, or direct layers as soon as the server resolves.';
    }
    if (finderInput.trim()) {
      return `Searches the whole server. Indented rows are deeper under the current breadcrumb. ${crawlModeHint}`;
    }
    if (selectedService && showLayerList) {
      return `The open menu shows layers inside the current service. Backspace on an empty query moves back up. ${crawlModeHint}`;
    }
    return `The open menu shows direct children of the active breadcrumb. Type to search deeper across the whole server. Backspace on an empty query moves up one level. ${crawlModeHint}`;
  }, [crawlModeHint, finderInput, root, selectedService, showLayerList]);

  const retryDiscovery = useCallback(() => {
    setLoadError('');
    setLoadErrorKind('');
    setReloadToken((value) => value + 1);
  }, []);

  const handleCopy = useCallback(async (key: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedKey(''), 1400);
    } catch {}
  }, []);

  const emptyState = useMemo<React.ReactNode>(() => {
    if (!showFinder) return null;
    if (!root) {
      return (
        <CompactFinderEmptyState
          examples={EXAMPLE_URLS.map((item) => ({ label: item.label, description: item.description, url: item.url }))}
          pinned={pinnedRoots.map((url) => ({ label: shortUrl(url), description: url, url }))}
          recent={recentItems}
          onOpen={(url) => {
            applyRootUrl(url, true);
          }}
        />
      );
    }
    const hasVisibleBrowseItems = directBrowseFolders.length > 0 || directServices.length > 0;
    if ((loading || currentFolderLoadState?.status === 'loading') && !hasVisibleBrowseItems && !services.length) {
      return browsePath ? 'Loading this folder…' : 'Scanning folders and services…';
    }
    if (loadError && !services.length && !directBrowseFolders.length) {
      if (loadErrorKind === 'auth') {
        return (
          <FinderErrorState
            message={loadError}
            actions={[
              {
                label: 'Open server page',
                kind: 'link',
                href: root,
              },
              {
                label: 'Retry',
                kind: 'button',
                onClick: retryDiscovery,
              },
            ]}
          />
        );
      }
      if (loadErrorKind === 'network') {
        return (
          <FinderErrorState
            message={loadError}
            actions={[{ label: 'Retry', kind: 'button', onClick: retryDiscovery }]}
          />
        );
      }
      return loadError;
    }
    if (finderInput.trim()) {
      if (looksLikeArcgisRestUrl(finderInput)) return 'Press Enter to open this ArcGIS URL directly.';
      return 'No matching folders, services, or layers.';
    }
    if (browsePath && currentFolderLoadState?.status === 'loading' && !hasVisibleBrowseItems) return 'Loading this folder…';
    if (browsePath && currentFolderLoadState?.status === 'error' && !hasVisibleBrowseItems) return 'Unable to load this folder. Try going back or retrying.';
    if (!services.length && !directBrowseFolders.length) return 'No folders or services found for this server.';
    if (browsePath && !hasVisibleBrowseItems) return 'No folders or services in this folder.';
    if (selectedService && !layers.length && (selectedType === 'MapServer' || selectedType === 'FeatureServer') && layersLoading) return 'Loading layers…';
    return 'Choose a folder, service, or layer.';
  }, [applyRootUrl, browsePath, currentFolderLoadState?.status, directBrowseFolders.length, directServices.length, finderInput, layers.length, layersLoading, loadError, loadErrorKind, loading, pinnedRoots, recentItems, retryDiscovery, root, selectedService, selectedType, services.length, showFinder]);

  const previewModel = useMemo(() => {
    if (!previewItem) return null;
    if (previewItem.kind === 'folder') {
      const folderUrl = `${root.replace(/\/+$/, '')}/${previewItem.path}`;
      return {
        title: previewItem.name,
        subtitle: folderUrl,
        badges: ['Folder'],
        hint: previewItem.hint || 'Browse this folder.',
        actionLabel: 'Browse folder',
        actionValue: `folder:${previewItem.path}`,
        rawType: '',
        copyValue: folderUrl,
        childLayers: [],
        childLayerOverflow: 0,
      };
    }
    if (previewItem.kind === 'service') {
      const serviceKey = `${previewItem.service.path}/${previewItem.service.type}`;
      const serviceUrl = buildServiceUrl(root, serviceKey);
      const serviceLayers = layersByServiceUrl[serviceUrl]
        || (selectedService === serviceKey ? layers : [])
        || [];
      return {
        title: previewItem.service.name,
        subtitle: serviceUrl,
        badges: [friendlyServiceLabel(previewItem.service.type), serviceDataBadge(previewItem.service.type)].filter(Boolean),
        hint: serviceLayers.length
          ? `This service exposes ${serviceLayers.length.toLocaleString()} layer${serviceLayers.length === 1 ? '' : 's'}. Open one directly below.`
          : (previewItem.hint || 'Browse this service.'),
        actionLabel: 'Browse service',
        actionValue: `service:${serviceKey}`,
        rawType: previewItem.service.type,
        copyValue: serviceUrl,
        childLayers: serviceLayers.slice(0, 8).map((layer) => ({
          id: layer.id,
          label: layer.name,
          actionValue: `layer:${layer.servicePath}/${layer.serviceType}::${layer.id}`,
        })),
        childLayerOverflow: Math.max(serviceLayers.length - 8, 0),
      };
    }
    const isActiveLayer = String(previewItem.layer.id) === selectedLayerId;
    const geometryLabel = isActiveLayer && layerMeta?.geometryType ? humanizeGeometry(layerMeta.geometryType) : '';
    const recordLabel = isActiveLayer && typeof featureCount === 'number' ? `${featureCount.toLocaleString()} records` : '';
    return {
      title: previewItem.layer.name,
      subtitle: previewItem.layer.layerUrl,
      badges: ['Layer', friendlyServiceLabel(previewItem.layer.serviceType), serviceDataBadge(previewItem.layer.serviceType), geometryLabel, recordLabel].filter(Boolean),
      hint: previewItem.hint || 'Open this layer.',
      actionLabel: 'Open layer',
      actionValue: `layer:${previewItem.layer.servicePath}/${previewItem.layer.serviceType}::${previewItem.layer.id}`,
      rawType: previewItem.layer.serviceType,
      copyValue: previewItem.layer.layerUrl,
      childLayers: [],
      childLayerOverflow: 0,
    };
  }, [featureCount, layerMeta?.geometryType, layers, layersByServiceUrl, previewItem, root, selectedLayerId, selectedService]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {showFinder ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {isCompactFinder && root ? (
            <div style={compactFinderContextStyle}>
              <div style={compactFinderRailStyle}>
                {breadcrumbItems.map((crumb, index) => (
                  <React.Fragment key={crumb.key}>
                    {index > 0 ? <span style={{ color: 'var(--muted)' }}>/</span> : null}
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      disabled={!crumb.onClick}
                      style={{
                        ...compactFinderCrumbStyle,
                        background: crumb.active ? 'var(--accent-row)' : 'var(--panel)',
                        color: crumb.active ? 'var(--accent)' : 'var(--text)',
                        cursor: crumb.onClick ? 'pointer' : 'default',
                        opacity: crumb.onClick ? 1 : 0.92,
                      }}
                      title={crumb.label}
                    >
                      {crumb.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              {compactContextUrl ? (
                <div
                  style={compactFinderUrlStyle}
                  title={compactContextUrl}
                >
                  {compactContextUrl}
                </div>
              ) : null}
            </div>
          ) : null}
          {!isCompactFinder ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6, minWidth: 0, flex: '1 1 240px' }}>
                <label className="u-label" style={{ marginBottom: 0 }}>Layer finder</label>
                {root ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {breadcrumbItems.map((crumb, index) => (
                      <React.Fragment key={crumb.key}>
                        {index > 0 ? <span style={{ color: 'var(--muted)' }}>/</span> : null}
                        <button
                          type="button"
                          onClick={crumb.onClick}
                          disabled={!crumb.onClick}
                          style={{
                            border: '1px solid var(--border)',
                            background: crumb.active ? 'var(--accent-row)' : 'var(--panel-subtle)',
                            color: crumb.active ? 'var(--accent)' : 'var(--text)',
                            padding: '4px 9px',
                            borderRadius: 999,
                            fontSize: 12,
                            cursor: crumb.onClick ? 'pointer' : 'default',
                            opacity: crumb.onClick ? 1 : 0.92,
                          }}
                        >
                          {crumb.label}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="u-small u-muted">
                    Paste or type any ArcGIS REST URL. The finder accepts servers, folders, services, and direct layer URLs.
                  </div>
                )}
              </div>
              {root ? (
                <button
                  type="button"
                  className="u-btn"
                  onClick={() => {
                    setPinnedRoots((prev) => {
                      if (prev.includes(root)) return prev.filter((item) => item !== root);
                      return [root, ...prev.filter((item) => item !== root)].slice(0, 8);
                    });
                  }}
                >
                  {hasPinnedCurrentRoot ? 'Unpin server' : 'Pin server'}
                </button>
              ) : null}
            </div>
          ) : null}
          <SearchableSelect
            ref={finderRef}
            options={finderOptions}
            value={currentSelectionValue}
            onChange={handleFinderPick}
            onInputChange={setFinderInput}
            inputValue={finderInput}
            placeholder={isCompactFinder
              ? (root ? 'Jump to another folder, service, or layer…' : 'Paste ArcGIS URL or find a layer…')
              : 'Find folders, services, or layers…'}
            loading={root ? (loading || layersLoading) : false}
            clearable={!!finderInput}
            onClear={() => setFinderInput('')}
            onInputKeyDown={handleFinderKeyDown}
            onInputFocus={() => setFinderFocused(true)}
            onInputBlur={() => setFinderFocused(false)}
            onActiveOptionChange={setActiveOptionValue}
            emptyState={emptyState}
            aria-label="Layer finder"
          />
          {!isCompactFinder && finderScopeModel ? (
            <div style={finderScopeStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{finderScopeModel.title}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{finderScopeModel.detail}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {finderScopeModel.badges.map((badge) => (
                    <span key={badge} style={badgeStyle}>{badge}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {!isCompactFinder ? (
            <div className="u-small u-muted">
            Arrow keys move through results. Enter opens a pasted ArcGIS URL. Ctrl/Cmd+K focuses the finder from anywhere. {finderHelperText}
            </div>
          ) : null}
          {loadError && services.length > 0 ? <div className="u-small" style={{ color: 'tomato' }}>{loadError}</div> : null}
          {isSearchOnly && !isCompactFinder ? (
            <div style={{ minHeight: previewModel ? 98 : 0 }}>
              {previewModel ? (
                <div style={{ ...selectionCardStyle, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{previewModel.title}</div>
                      <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', wordBreak: 'break-all' }}>
                        {previewModel.subtitle}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>{previewModel.hint}</div>
                      {previewModel.rawType ? (
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>{previewModel.rawType}</div>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {previewModel.badges.map((badge) => (
                        <span key={badge} style={badgeStyle} title={previewModel.rawType || undefined}>{badge}</span>
                      ))}
                      <button
                        type="button"
                        className="u-btn"
                        onClick={() => handleCopy('preview', previewModel.copyValue)}
                      >
                        {copiedKey === 'preview' ? 'Copied' : 'Copy URL'}
                      </button>
                      <button
                        type="button"
                        className="u-btn"
                        onClick={() => handleFinderPick(previewModel.actionValue)}
                      >
                        {previewModel.actionLabel}
                      </button>
                    </div>
                  </div>
                  {previewModel.childLayers?.length ? (
                    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                        Layers in this service
                      </div>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {previewModel.childLayers.map((layer) => (
                          <button
                            key={layer.actionValue}
                            type="button"
                            onClick={() => handleFinderPick(layer.actionValue)}
                            style={previewLayerButtonStyle}
                          >
                            <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {layer.label}
                            </span>
                            <span style={badgeStyle}>Layer {layer.id}</span>
                          </button>
                        ))}
                      </div>
                      {previewModel.childLayerOverflow ? (
                        <div className="u-small u-muted">
                          {previewModel.childLayerOverflow.toLocaleString()} more layer{previewModel.childLayerOverflow === 1 ? '' : 's'} available in the dropdown.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showDetails && selectedService ? (
        <div style={selectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 220px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{selectionTitle}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>{selectionUrl}</div>
              {selectionHint ? (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{selectionHint}</div>
              ) : null}
              {selectedMetadataDescription ? (
                <div style={selectionDescriptionStyle}>{selectedMetadataDescription.text}</div>
              ) : null}
            </div>
            <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {selectionBadges.map((badge) => (
                  <span key={badge} style={badgeStyle}>{badge}</span>
                ))}
              </div>
              {selectionUrl ? (
                <button
                  type="button"
                  className="u-btn"
                  onClick={() => handleCopy('selection', selectedLayerUrl || selectionUrl)}
                >
                  {copiedKey === 'selection'
                    ? 'Copied'
                    : (selectedLayerUrl ? 'Copy layer URL' : 'Copy service URL')}
                </button>
              ) : null}
            </div>
          </div>
          {(renderStatus === 'loading' || renderStatus === 'loaded') ? (
            <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
              {renderStatus === 'loading' ? (
                <span style={{ width: 12, height: 12, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              ) : null}
              <span>
                {(() => {
                  if (!isFeatureRender) {
                    const modeLabel = renderMode === 'vector' ? 'vector tiles' : 'imagery';
                    return renderStatus === 'loading' ? `Rendering ${modeLabel}…` : `Rendered as ${modeLabel}.`;
                  }
                  if (renderStatus === 'loaded' && renderedFeatureCount === 0) {
                    return featureCount === 0 ? 'No features in this layer.' : 'No features in view.';
                  }
                  if (!renderedFeatureCount) return 'Rendering features…';
                  const total = typeof featureCount === 'number' && featureCount > 0 ? ` / ${featureCount.toLocaleString()}` : '';
                  const suffix = total ? ' (in view / total)' : ' in view';
                  return `${renderStatus === 'loading' ? 'Rendering' : 'Rendered'} ${renderedFeatureCount.toLocaleString()}${total} features${suffix}`;
                })()}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {showDetails ? (
        selectedService ? (
          <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div className="u-label" style={{ marginBottom: 0 }}>Open layer</div>
              <div className="u-small u-muted">
                {showLayerList
                  ? 'Choose a layer to open immediately.'
                  : 'This service does not expose sublayers.'}
              </div>
            </div>
            {(onZoomToExtent || onZoomToLayer) ? (
              <button
                onClick={async () => {
                  if (zoomBusy) return;
                  setZoomBusy(true);
                  try {
                    if (selectedLayerUrl) {
                      const ext = await fetchLayerExtent4326(selectedLayerUrl);
                      if (ext) {
                        onZoomToExtent({ ...ext, spatialReference: ext.spatialReference ? { ...ext.spatialReference } : undefined } as any);
                        return;
                      }
                    }
                    const ext0: any = (layerMeta?.extent || serviceMeta?.fullExtent || serviceMeta?.initialExtent) as any;
                    if (ext0) {
                      const canUse = !!extentToBounds(ext0 as any);
                      if (canUse) {
                        const clone = { ...ext0, spatialReference: ext0.spatialReference ? { ...ext0.spatialReference } : undefined } as any;
                        onZoomToExtent(clone);
                        return;
                      }
                    }
                    onZoomToLayer?.();
                  } catch {
                    onZoomToLayer?.();
                  } finally {
                    setZoomBusy(false);
                  }
                }}
                disabled={zoomBusy || (!selectedLayerUrl && !canFallbackZoom && !onZoomToLayer)}
                className="u-btn"
              >
                {zoomBusy ? 'Zooming…' : 'Zoom to layer'}
              </button>
            ) : null}
          </div>

          {selectedMetadataDescription ? (
            <div style={chooserDescriptionStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                {selectedMetadataDescription.source === 'layer' ? 'About this layer' : 'About this service'}
              </div>
              <div>{selectedMetadataDescription.text}</div>
            </div>
          ) : null}

          {showLayerList ? (
            <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
              {selectedType === 'MapServer' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLayerId('');
                    if (selectedServiceUrl && selectedServiceUrl !== (serviceUrl || '')) onSelectServiceUrl(selectedServiceUrl);
                  }}
                  style={layerRowStyle(selectedLayerId === '')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Dynamic (all layers)</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: 'var(--muted)' }}>Uses the published map styling from this Map service. Good for cartography, not raw feature querying.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span style={badgeStyle}>{friendlyServiceLabel('MapServer')}</span>
                      <span style={badgeStyle}>{serviceDataBadge('MapServer')}</span>
                    </div>
                  </div>
                </button>
              ) : null}
              {layers.map((layer) => {
                const isActive = String(layer.id) === selectedLayerId;
                return (
                  <button
                    key={`${layer.serviceUrl}:${layer.id}`}
                    type="button"
                    onClick={() => openLayer(`${layer.servicePath}/${layer.serviceType}`, String(layer.id))}
                    style={layerRowStyle(isActive)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{layer.name}</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: 'var(--muted)' }}>{layer.servicePath}/{layer.id}</div>
                        <div style={{ marginTop: 3, fontSize: 12, color: 'var(--muted)' }}>{serviceShortHint(layer.serviceType)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span style={badgeStyle}>Layer {layer.id}</span>
                        <span style={badgeStyle}>{friendlyServiceLabel(layer.serviceType)}</span>
                        {serviceDataBadge(layer.serviceType) ? <span style={badgeStyle}>{serviceDataBadge(layer.serviceType)}</span> : null}
                        {isActive && layerMeta?.geometryType ? <span style={badgeStyle}>{humanizeGeometry(layerMeta.geometryType)}</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
              {layersLoading && !layers.length ? <div className="u-small u-muted">Loading layers…</div> : null}
              {!layersLoading && !layers.length ? <div className="u-small u-muted">No sublayers were reported for this service.</div> : null}
            </div>
          ) : (
            <div className="u-small u-muted">This service does not expose sublayers.</div>
          )}
          </div>
        ) : (
          root && services.length ? (
            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                  <div className="u-label" style={{ marginBottom: 0 }}>{summaryScopeKind}</div>
                  <div style={{ marginTop: 6, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{summaryScopeTitle}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>{summaryScopeSubtitle}</div>
                </div>
                <button
                  type="button"
                  className="u-btn"
                  onClick={() => handleCopy('summary', summaryScopeUrl)}
                >
                  {copiedKey === 'summary' ? 'Copied' : (browsePath ? 'Copy folder URL' : 'Copy server URL')}
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                {summaryLead}
                {loading ? ' Discovery is still running, so these totals may continue to grow.' : ` ${crawlModeHint}`}
              </div>

              <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <SummaryMetric
                  label={browsePath ? 'Services below' : 'Services'}
                  value={scopedServices.length}
                  hint={browsePath ? `${directServices.length} direct here` : 'All discovered services'}
                />
                <SummaryMetric
                  label={browsePath ? 'Folders below' : 'Folders'}
                  value={scopedFolderPaths.length}
                  hint={browsePath ? `${directFolderPaths.length} direct here` : 'All discovered folders'}
                />
                <SummaryMetric
                  label="At this level"
                  value={directFolderPaths.length + directServices.length}
                  hint={`${directFolderPaths.length} folder${directFolderPaths.length === 1 ? '' : 's'} • ${directServices.length} service${directServices.length === 1 ? '' : 's'}`}
                />
              </div>

              {summaryBreakdown.length ? (
                <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                  <div className="u-label" style={{ marginBottom: 0 }}>Service types</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {summaryBreakdown.map((item) => (
                      <span key={item.type} style={badgeStyle} title={`${item.type} • ${item.hint}`}>
                        {item.label} {item.count}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {showFinder ? (
                <div style={{ marginTop: 14 }} className="u-small u-muted">
                  Pick a folder, service, or layer above. If you already have a full ArcGIS URL, paste it directly into the finder and press Enter.
                </div>
              ) : null}
            </div>
          ) : root ? (
            <div style={sectionCardStyle}>
              {loading ? (
                <div className="u-small u-muted">Scanning folders and services…</div>
              ) : loadErrorKind === 'auth' ? (
                <FinderErrorState
                  message={loadError}
                  actions={[
                    {
                      label: 'Open server page',
                      kind: 'link',
                      href: root,
                    },
                    {
                      label: 'Retry',
                      kind: 'button',
                      onClick: retryDiscovery,
                    },
                  ]}
                />
              ) : loadErrorKind === 'network' ? (
                <FinderErrorState
                  message={loadError}
                  actions={[{ label: 'Retry', kind: 'button', onClick: retryDiscovery }]}
                />
              ) : (
                <div className="u-small u-muted">{loadError || 'No folders or services found for this server.'}</div>
              )}
            </div>
          ) : (
            <div className="u-small u-muted">
              {showFinder
                ? 'Pick a folder, service, or layer above. If you already have a full ArcGIS URL, paste it directly into the finder and press Enter.'
                : 'Use the layer finder in the header to browse servers and open a layer.'}
            </div>
          )
        )
      ) : null}
    </div>
  );
});

export default SelectTab;

function SummaryMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--panel-subtle)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{value.toLocaleString()}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>{hint}</div>
    </div>
  );
}

function QuickSection({
  title,
  items,
  emptyLabel,
  onOpen,
}: {
  title: string;
  items: Array<{ label: string; description: string; url: string }>;
  emptyLabel?: string;
  onOpen: (url: string) => void;
}) {
  return (
    <div style={sectionCardStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{title}</div>
      {items.length ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {items.map((item) => (
            <button
              key={`${title}:${item.url}`}
              type="button"
              onClick={() => onOpen(item.url)}
              style={quickLinkStyle}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--muted)' }}>{item.description}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="u-small u-muted">{emptyLabel || 'Nothing here yet.'}</div>
      )}
    </div>
  );
}

function CompactFinderEmptyState({
  recent,
  pinned,
  examples,
  onOpen,
}: {
  recent: Array<{ label: string; description: string; url: string; group?: string }>;
  pinned: Array<{ label: string; description: string; url: string }>;
  examples: Array<{ label: string; description: string; url: string }>;
  onOpen: (url: string) => void;
}) {
  const sections = [
    { title: 'Pinned', items: pinned },
    { title: 'Examples', items: examples },
  ].filter((section) => section.items.length);

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
        Paste an ArcGIS REST server, folder, service, or direct layer URL. You can also jump in from a recent or example entry below.
      </div>
      {recent.length ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Recent layers</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {groupRecentItems(recent).map((group) => (
              <div key={group.name} style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{group.name}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {group.items.map((item) => (
                    <button
                      key={`recent:${item.url}`}
                      type="button"
                      onClick={() => onOpen(item.url)}
                      style={compactLinkStyle}
                    >
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      <span style={{ display: 'block', marginTop: 2, color: 'var(--muted)', fontSize: 12 }}>{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {sections.map((section) => (
        <div key={section.title} style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{section.title}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {section.items.map((item) => (
              <button
                key={`${section.title}:${item.url}`}
                type="button"
                onClick={() => onOpen(item.url)}
                style={compactLinkStyle}
              >
                <span style={{ fontWeight: 600 }}>{item.label}</span>
                <span style={{ display: 'block', marginTop: 2, color: 'var(--muted)', fontSize: 12 }}>{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!recent.length && !sections.length ? <div className="u-small u-muted">No recent layers or pinned servers yet.</div> : null}
    </div>
  );
}

function FinderErrorState({
  message,
  actions,
}: {
  message: string;
  actions: Array<
    | { label: string; kind: 'button'; onClick: () => void }
    | { label: string; kind: 'link'; href: string }
  >;
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.map((action) => action.kind === 'button' ? (
          <button
            key={action.label}
            type="button"
            className="u-btn"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ) : (
          <a
            key={action.label}
            href={action.href}
            target="_blank"
            rel="noreferrer"
            className="u-btn"
            style={{ textDecoration: 'none' }}
          >
            {action.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function renderFinderLabel(item: FinderItem, query: string, root: string, currentSelectionValue: string, browsePath: string): React.ReactNode {
  const isActive = currentSelectionValue === (item.kind === 'folder'
    ? `folder:${item.path}`
    : item.kind === 'service'
      ? `service:${item.service.path}/${item.service.type}`
      : `layer:${item.layer.servicePath}/${item.layer.serviceType}::${item.layer.id}`);

  const label = getFinderLabel(item);
  const badges = item.kind === 'folder'
    ? ['Folder']
    : item.kind === 'service'
      ? [friendlyServiceLabel(item.service.type), serviceDataBadge(item.service.type)].filter(Boolean)
      : ['Layer', friendlyServiceLabel(item.layer.serviceType), serviceDataBadge(item.layer.serviceType)].filter(Boolean);
  const indentLevel = Math.min(getFinderIndentLevel(item, browsePath), 4);
  const secondary = getFinderSecondaryLabel(item, root);
  const locationLabel = getFinderLocationLabel(item, browsePath);
  const nestedOffset = indentLevel * 16;

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ position: 'relative', paddingLeft: nestedOffset }}>
        {indentLevel > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: Math.max(nestedOffset - 8, 0),
              top: 4,
              bottom: 4,
              width: 1,
              background: 'var(--border)',
            }}
          />
        ) : null}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, flexWrap: 'wrap' }}>
          <span style={finderMarkerStyle(item)} />
          <span style={{ fontWeight: isActive ? 700 : 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {highlightText(label, query)}
          </span>
          {badges.map((badge) => (
            <span
              key={badge}
              style={badgeStyle}
              title={item.kind === 'folder' ? undefined : item.kind === 'service' ? `${item.service.type} • ${serviceSummaryHint(item.service.type)}` : `${item.layer.serviceType} • ${serviceSummaryHint(item.layer.serviceType)}`}
            >
              {badge}
            </span>
          ))}
          {locationLabel ? <span style={finderLocationBadgeStyle}>{locationLabel}</span> : null}
          {!query && (item.kind === 'folder' || (item.kind === 'service' && (item.service.type === 'MapServer' || item.service.type === 'FeatureServer')))
            ? <span aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--muted)', fontWeight: 600 }}>›</span>
            : null}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--muted)',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingLeft: nestedOffset + 18,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        {highlightText(secondary, query)}
      </div>
      {item.hint ? (
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            paddingLeft: nestedOffset + 18,
          }}
        >
          {item.hint}
        </div>
      ) : null}
    </div>
  );
}

function normalizeLayers(meta: any, servicePath: string, serviceType: ServiceType, serviceUrl: string): LayerRef[] {
  const list = Array.isArray(meta?.layers)
    ? meta.layers
        .filter((layer: any) => layer && typeof layer.id === 'number')
        .map((layer: any) => ({
          id: layer.id,
          name: String(layer.name || `Layer ${layer.id}`),
          servicePath,
          serviceType,
          serviceUrl,
          layerUrl: `${serviceUrl}/${layer.id}`,
        }))
    : [];
  if (list.length || serviceType !== 'FeatureServer') return list;
  return [{
    id: 0,
    name: String(meta?.name || meta?.mapName || 'Layer 0'),
    servicePath,
    serviceType,
    serviceUrl,
    layerUrl: `${serviceUrl}/0`,
  }];
}

function buildFolderPaths(folderChildrenByPath: Record<string, string[]>, services: ServiceRef[]): string[] {
  const out = new Set<string>();
  Object.values(folderChildrenByPath).forEach((children) => {
    children.forEach((path) => {
      if (path) out.add(path);
    });
  });
  services.forEach((service) => {
    let path = '';
    service.path.split('/').slice(0, -1).forEach((part) => {
      path = path ? `${path}/${part}` : part;
      if (path) out.add(path);
    });
  });
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

function getDirectChildFolders(folderPaths: string[], browsePath: string): string[] {
  return folderPaths.filter((path) => parentPathOf(path) === browsePath).sort((a, b) => a.localeCompare(b));
}

function getFinderLabel(item: FinderItem): string {
  if (item.kind === 'folder') return item.name;
  if (item.kind === 'service') return item.service.name;
  return item.layer.name;
}

function summarizeFolder(path: string, services: ServiceRef[]): string {
  const directServices = services.filter((service) => service.folderPath === path).length;
  const nestedFolders = new Set(
    services
      .map((service) => service.folderPath)
      .filter((folderPath) => parentPathOf(folderPath) === path)
  ).size;
  const parts: string[] = [];
  if (nestedFolders) parts.push(`${nestedFolders} folder${nestedFolders === 1 ? '' : 's'}`);
  if (directServices) parts.push(`${directServices} service${directServices === 1 ? '' : 's'}`);
  return parts.join(' • ');
}

function getFinderIndentLevel(item: FinderItem, browsePath: string): number {
  const browseDepth = pathDepth(browsePath);
  if (item.kind === 'folder') {
    const parentDepth = pathDepth(parentPathOf(item.path));
    if (browsePath && !isSameOrChildPath(item.path, browsePath)) return 0;
    return Math.max(parentDepth - browseDepth, 0);
  }
  if (item.kind === 'service') {
    const folderDepth = pathDepth(item.service.folderPath);
    if (browsePath && !isSameOrChildPath(item.service.folderPath, browsePath)) return 0;
    return Math.max(folderDepth - browseDepth, 0);
  }
  const folderPath = parentPathOf(item.layer.servicePath);
  const folderDepth = pathDepth(folderPath);
  if (browsePath && !isSameOrChildPath(folderPath, browsePath)) return 0;
  return Math.max(folderDepth - browseDepth + 1, 1);
}

function getFinderLocationLabel(item: FinderItem, browsePath: string): string {
  const branchPath = item.kind === 'folder'
    ? parentPathOf(item.path)
    : item.kind === 'service'
      ? item.service.folderPath
      : parentPathOf(item.layer.servicePath);
  if (browsePath && !isSameOrChildPath(branchPath, browsePath)) return 'Other branch';
  if (item.kind === 'layer' && branchPath === browsePath) return 'Layer here';
  const indentLevel = getFinderIndentLevel(item, browsePath);
  if (indentLevel <= 0) return 'Current path';
  return indentLevel === 1 ? '1 level deeper' : `${indentLevel} levels deeper`;
}

function getFinderSecondaryLabel(item: FinderItem, root: string): string {
  if (item.kind === 'folder') {
    return [rootLabel(root), item.path].filter(Boolean).join(' / ');
  }
  if (item.kind === 'service') {
    const hierarchy = [rootLabel(root), item.service.path].filter(Boolean).join(' / ');
    return `${hierarchy} / ${friendlyServiceLabel(item.service.type)}`;
  }
  return `${[rootLabel(root), item.layer.servicePath, `Layer ${item.layer.id}`].filter(Boolean).join(' / ')}`;
}

function summarizeServiceHint(service: ServiceRef, layers?: LayerRef[]): string {
  const parts: string[] = [serviceShortHint(service.type)];
  if (layers?.length) parts.push(`${layers.length} layer${layers.length === 1 ? '' : 's'}`);
  return parts.join(' • ');
}

function summarizeLayerHint(layer: LayerRef, layerMeta: SidebarProps['layerMeta'], featureCount: number | null | undefined, selectedLayerId: string): string {
  const parts = [serviceShortHint(layer.serviceType)];
  if (String(layer.id) === selectedLayerId && layerMeta?.geometryType) parts.push(humanizeGeometry(layerMeta.geometryType));
  if (String(layer.id) === selectedLayerId && typeof featureCount === 'number') parts.push(`${featureCount.toLocaleString()} records`);
  return parts.join(' • ');
}

function serviceNameFromKey(serviceKey: string): string {
  const parts = splitServiceKey(serviceKey);
  if (!parts) return '';
  return parts.servicePath.split('/').pop() || parts.servicePath;
}

function humanizeGeometry(value: string): string {
  return String(value || '')
    .replace(/^esriGeometry/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || 'Geometry';
}

function rootLabel(root: string): string {
  try {
    const url = new URL(root);
    return url.hostname;
  } catch {
    return 'Server';
  }
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url;
  }
}

function groupRecentItems(items: Array<{ label: string; description: string; url: string; group?: string }>): Array<{
  name: string;
  items: Array<{ label: string; description: string; url: string; group?: string }>;
}> {
  const grouped = new Map<string, Array<{ label: string; description: string; url: string; group?: string }>>();
  items.forEach((item) => {
    const key = item.group || 'Recent';
    const list = grouped.get(key) || [];
    list.push(item);
    grouped.set(key, list);
  });
  return Array.from(grouped.entries()).map(([name, groupItems]) => ({ name, items: groupItems }));
}

function shortPath(path: string): string {
  return path || 'Top level';
}

function pathDepth(path: string): number {
  return String(path || '').split('/').filter(Boolean).length;
}

function parentPathOf(path: string): string {
  const parts = String(path || '').split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function isSameOrChildPath(path: string, basePath: string): boolean {
  if (!basePath) return true;
  return path === basePath || path.startsWith(`${basePath}/`);
}

function splitServiceKey(serviceKey: string): { servicePath: string; serviceType: ServiceType } | null {
  const lastSlash = serviceKey.lastIndexOf('/');
  if (lastSlash < 0) return null;
  return {
    servicePath: serviceKey.slice(0, lastSlash),
    serviceType: serviceKey.slice(lastSlash + 1) as ServiceType,
  };
}

function buildServiceUrl(root: string, serviceKey: string): string {
  const parts = splitServiceKey(serviceKey);
  if (!parts) return root;
  return `${root.replace(/\/+$/, '')}/${parts.servicePath}/${parts.serviceType}`;
}

function looksLikeArcgisRestUrl(value: string): boolean {
  return !!coerceArcgisRestServicesUrl(value);
}

function isFinderServiceType(value: string): value is ServiceType {
  return value === 'MapServer' || value === 'FeatureServer' || value === 'ImageServer' || value === 'VectorTileServer';
}

function shouldUseLazyCrawl(result: FolderFetchResult): boolean {
  return result.responseMs > EAGER_RESPONSE_MS_THRESHOLD || result.childFolders.length > EAGER_ROOT_FOLDER_THRESHOLD;
}

function sortServices(services: ServiceRef[]): ServiceRef[] {
  const seen = new Map<string, ServiceRef>();
  services.forEach((service) => {
    seen.set(`${service.path}/${service.type}`, service);
  });
  return Array.from(seen.values()).sort((a, b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));
}

function storageKey(prefix: string, value: string): string {
  return `${prefix}${encodeURIComponent(value)}`;
}

async function fetchFolderListing(root: string, folderPath: string, signal?: AbortSignal): Promise<FolderFetchResult> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const url = buildArcgisJsonUrl(root, folderPath);
  try {
    const res = await fetch(url, { signal });
    const responseMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    if (res.status === 401 || res.status === 403) {
      return { folderPath, services: [], childFolders: [], responseMs, errorKind: 'auth' };
    }
    if (!res.ok) {
      return { folderPath, services: [], childFolders: [], responseMs, errorKind: 'network' };
    }
    const json = await res.json();
    const services: ServiceRef[] = Array.isArray(json?.services)
      ? json.services
          .filter((service: any) => service && isFinderServiceType(service.type))
          .map((service: any) => {
            const name = String(service.name || '').split('/').pop() || String(service.name || 'Service');
            const fullPath = String(service.name || '').trim();
            return {
              path: fullPath,
              name,
              type: service.type,
              folderPath: parentPathOf(fullPath),
            } as ServiceRef;
          })
      : [];
    const childFolders = Array.isArray(json?.folders)
      ? json.folders
          .filter(Boolean)
          .map((folder: string) => folderPath ? `${folderPath}/${folder}` : String(folder))
      : [];
    return {
      folderPath,
      services,
      childFolders: mergeUniqueStrings([], childFolders),
      responseMs,
    };
  } catch (error) {
    const responseMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { folderPath, services: [], childFolders: [], responseMs, aborted: true };
    }
    return { folderPath, services: [], childFolders: [], responseMs, errorKind: 'network' };
  }
}

function buildFolderLoadStateFromCache(folderChildrenByPath: Record<string, string[]>): Record<string, FolderLoadState> {
  const next: Record<string, FolderLoadState> = {};
  Object.keys(folderChildrenByPath).forEach((path) => {
    next[path] = { status: 'loaded' };
  });
  return next;
}

function readFreshCache<T extends { timestamp: number }>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (!parsed || typeof parsed.timestamp !== 'number') return null;
    if ((Date.now() - parsed.timestamp) > ttlMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function mergeUniqueStrings(current: string[], incoming: string[]): string[] {
  const merged = new Set<string>(current);
  incoming.forEach((value) => {
    if (value) merged.add(value);
  });
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function readStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function highlightText(text: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const lower = text.toLowerCase();
  const target = trimmed.toLowerCase();
  const start = lower.indexOf(target);
  if (start >= 0) {
    const end = start + target.length;
    return (
      <>
        {text.slice(0, start)}
        <mark style={{ background: 'rgba(255, 214, 102, 0.6)', padding: 0 }}>{text.slice(start, end)}</mark>
        {text.slice(end)}
      </>
    );
  }

  const indexes = new Set<number>();
  let searchFrom = 0;
  for (const char of target) {
    const found = lower.indexOf(char, searchFrom);
    if (found === -1) return text;
    indexes.add(found);
    searchFrom = found + 1;
  }

  return (
    <>
      {text.split('').map((char, index) => (
        indexes.has(index)
          ? <mark key={`${char}:${index}`} style={{ background: 'rgba(255, 214, 102, 0.6)', padding: 0 }}>{char}</mark>
          : <React.Fragment key={`${char}:${index}`}>{char}</React.Fragment>
      ))}
    </>
  );
}

function matchScore(label: string, tokens: string[]): number | null {
  if (!tokens.length) return null;
  const haystack = label.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const term = token.toLowerCase();
    const exactIndex = haystack.indexOf(term);
    if (exactIndex >= 0) {
      score += exactIndex;
      continue;
    }
    let searchFrom = 0;
    for (const char of term) {
      const found = haystack.indexOf(char, searchFrom);
      if (found === -1) return null;
      score += found;
      searchFrom = found + 1;
    }
  }
  return score;
}

const heroStyle: React.CSSProperties = {
  padding: '14px 16px',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--panel-subtle)',
};

const sectionCardStyle: React.CSSProperties = {
  padding: '12px',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--panel)',
};

const selectionCardStyle: React.CSSProperties = {
  padding: '12px',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--panel)',
};

const selectionDescriptionStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '8px 10px',
  borderLeft: '3px solid var(--accent)',
  background: 'var(--panel-subtle)',
  color: 'var(--text)',
  fontSize: 12,
  lineHeight: 1.5,
};

const chooserDescriptionStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderLeft: '3px solid var(--accent)',
  borderRadius: 8,
  background: 'var(--panel-subtle)',
  color: 'var(--text)',
  fontSize: 12,
  lineHeight: 1.45,
};

const finderScopeStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--panel-subtle)',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--panel-subtle)',
  color: 'var(--muted)',
  fontSize: 11,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
};

const finderLocationBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 7px',
  borderRadius: 999,
  border: '1px dashed var(--border)',
  background: 'transparent',
  color: 'var(--muted)',
  fontSize: 10,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
};

const quickLinkStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  border: '1px solid var(--border)',
  background: 'var(--panel-subtle)',
  color: 'var(--text)',
  borderRadius: 10,
  padding: '10px 12px',
  cursor: 'pointer',
};

const compactLinkStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  border: '1px solid var(--border)',
  background: 'var(--panel-subtle)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '8px 10px',
  cursor: 'pointer',
};

const compactFinderContextStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  minWidth: 0,
};

const compactFinderRailStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  overflowX: 'auto',
  paddingBottom: 2,
  scrollbarWidth: 'thin',
};

const compactFinderCrumbStyle: React.CSSProperties = {
  flex: '0 0 auto',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '3px 8px',
  fontSize: 11,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
};

const compactFinderUrlStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const previewLayerButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  textAlign: 'left',
  border: '1px solid var(--border)',
  background: 'var(--panel-subtle)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '8px 10px',
  cursor: 'pointer',
};

function layerRowStyle(active: boolean): React.CSSProperties {
  return {
    width: '100%',
    textAlign: 'left',
    border: '1px solid var(--border)',
    background: active ? 'var(--accent-row)' : 'var(--panel)',
    color: active ? 'var(--accent)' : 'var(--text)',
    borderRadius: 10,
    padding: '10px 12px',
    cursor: 'pointer',
  };
}

function finderMarkerStyle(item: FinderItem): React.CSSProperties {
  const tone = item.kind === 'folder'
    ? { background: 'rgba(148, 163, 184, 0.22)', border: '1px solid rgba(148, 163, 184, 0.45)', borderRadius: 3 }
    : item.kind === 'service'
      ? markerToneForService(item.service.type)
      : markerToneForService(item.layer.serviceType);
  return {
    width: item.kind === 'layer' ? 8 : 10,
    height: item.kind === 'layer' ? 8 : 10,
    flexShrink: 0,
    ...tone,
  };
}

function markerToneForService(type: ServiceType): React.CSSProperties {
  switch (type) {
    case 'MapServer':
      return { background: 'rgba(14, 116, 144, 0.18)', border: '1px solid rgba(14, 116, 144, 0.38)', borderRadius: 999 };
    case 'FeatureServer':
      return { background: 'rgba(22, 163, 74, 0.18)', border: '1px solid rgba(22, 163, 74, 0.38)', borderRadius: 999 };
    case 'ImageServer':
      return { background: 'rgba(217, 119, 6, 0.18)', border: '1px solid rgba(217, 119, 6, 0.38)', borderRadius: 999 };
    case 'VectorTileServer':
      return { background: 'rgba(37, 99, 235, 0.18)', border: '1px solid rgba(37, 99, 235, 0.38)', borderRadius: 999 };
    default:
      return { background: 'rgba(148, 163, 184, 0.22)', border: '1px solid rgba(148, 163, 184, 0.45)', borderRadius: 999 };
  }
}
