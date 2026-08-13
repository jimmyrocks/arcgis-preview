export function stringifyExactJSON(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, item) => typeof item === 'bigint' ? item.toString() : item,
    space,
  );
}
