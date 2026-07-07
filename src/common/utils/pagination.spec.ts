import { clampLimit, MAX_PAGE_SIZE } from './pagination';

describe('clampLimit', () => {
  it('passes through sane values', () => {
    expect(clampLimit(20)).toBe(20);
    expect(clampLimit(1)).toBe(1);
    expect(clampLimit(100)).toBe(100);
  });

  it('caps table-dump attempts at the max', () => {
    expect(clampLimit(1_000_000)).toBe(MAX_PAGE_SIZE);
    expect(clampLimit(101)).toBe(MAX_PAGE_SIZE);
  });

  it('honors a custom max (feed keeps its 500-row web contract)', () => {
    expect(clampLimit(500, 20, 500)).toBe(500);
    expect(clampLimit(1_000_000, 20, 500)).toBe(500);
  });

  it('falls back on garbage input', () => {
    expect(clampLimit(0)).toBe(20);
    expect(clampLimit(-5)).toBe(20);
    expect(clampLimit(NaN)).toBe(20);
    expect(clampLimit(undefined)).toBe(20);
    expect(clampLimit(null)).toBe(20);
    expect(clampLimit('50' as unknown as number)).toBe(50); // numeric strings coerce
    expect(clampLimit('abc' as unknown as number)).toBe(20);
  });

  it('floors fractional values', () => {
    expect(clampLimit(20.9)).toBe(20);
  });
});
