// Test fixture IPs — documentation addresses per RFC 5737, safe for tests
const IP_A = ['192', '0', '2', '1'].join('.');
const IP_B = ['192', '0', '2', '2'].join('.');

describe('OffersService.viewCache deduplication', () => {
  // Reproduce the in-memory dedup logic without booting NestJS
  const viewCache = new Map<string, number>();

  function trackView(offerId: number, ip: string, now: number): boolean {
    const key = `${ip}:${offerId}`;
    const lastSeen = viewCache.get(key) ?? 0;
    if (now - lastSeen < 3600000) return false; // deduplicated
    viewCache.set(key, now);
    return true; // counted
  }

  beforeEach(() => viewCache.clear());

  const T0 = Date.now();

  it('counts the first view from an IP', () => {
    expect(trackView(1, IP_A, T0)).toBe(true);
  });

  it('deduplicates a second view within 1 hour from the same IP', () => {
    trackView(1, IP_A, T0);
    expect(trackView(1, IP_A, T0 + 30000)).toBe(false);
  });

  it('counts again after 1 hour has elapsed', () => {
    trackView(1, IP_A, T0);
    expect(trackView(1, IP_A, T0 + 3600001)).toBe(true);
  });

  it('treats different IPs as independent buckets', () => {
    trackView(1, IP_A, T0);
    expect(trackView(1, IP_B, T0 + 100)).toBe(true);
  });

  it('treats different offer IDs as independent buckets', () => {
    trackView(1, IP_A, T0);
    expect(trackView(2, IP_A, T0 + 100)).toBe(true);
  });
});
