// Central configuration for client behavior

export const CACHE_TTLS = {
  // Metadata (service/layer) is relatively static
  metadataMs: 5 * 60 * 1000, // 5 minutes
  // Extents can change less often but are cheap to revalidate
  extentMs: 2 * 60 * 1000, // 2 minutes
};

