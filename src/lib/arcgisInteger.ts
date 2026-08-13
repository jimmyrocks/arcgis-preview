const CANONICAL_INTEGER = /^(?:0|-[1-9]\d*|[1-9]\d*)$/;
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function parseArcGISFeatureId(value: string): string | number {
  if (!CANONICAL_INTEGER.test(value)) return value;
  const exact = BigInt(value);
  return exact >= MIN_SAFE && exact <= MAX_SAFE ? Number(exact) : value;
}

export function isUnsafeArcGISInteger(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_INTEGER.test(value)) return false;
  const exact = BigInt(value);
  return exact < MIN_SAFE || exact > MAX_SAFE;
}

export function safeNumericIdAlternative(value: string | number): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  const parsed = parseArcGISFeatureId(value);
  return typeof parsed === 'number' ? parsed : undefined;
}

export function compareExactIntegers(left: unknown, right: unknown): number | null {
  if (!isIntegerLike(left) || !isIntegerLike(right)) return null;
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function fieldHasUnsafeIntegers(features: Array<{ properties?: Record<string, unknown> | null }>, field: string): boolean {
  return features.some((feature) => isUnsafeArcGISInteger(feature.properties?.[field]));
}

function isIntegerLike(value: unknown): value is string | number | bigint {
  if (typeof value === 'bigint') return true;
  if (typeof value === 'number') return Number.isSafeInteger(value);
  return typeof value === 'string' && CANONICAL_INTEGER.test(value);
}
