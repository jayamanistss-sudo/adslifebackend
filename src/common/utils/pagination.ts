/**
 * Clamp a client-supplied page size to a sane window.
 * Prevents `?per_page=1000000`-style single-request table dumps.
 */
export const MAX_PAGE_SIZE = 100;

export function clampLimit(value: number | undefined | null, fallback = 20, max = MAX_PAGE_SIZE): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}
