import { BadRequestException } from '@nestjs/common';

// Inline the magic-byte detector here so we can unit-test it independently
// of the full NestJS boot cycle.
function detectMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}

describe('detectMime (magic bytes)', () => {
  it('identifies JPEG', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(detectMime(buf)).toBe('image/jpeg');
  });

  it('identifies PNG', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(detectMime(buf)).toBe('image/png');
  });

  it('identifies GIF', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectMime(buf)).toBe('image/gif');
  });

  it('identifies WebP', () => {
    const buf = Buffer.alloc(12);
    buf.write('RIFF', 0, 'ascii');
    buf.write('WEBP', 8, 'ascii');
    expect(detectMime(buf)).toBe('image/webp');
  });

  it('returns null for plain text pretending to be an image', () => {
    const buf = Buffer.from('not an image at all');
    expect(detectMime(buf)).toBeNull();
  });

  it('returns null for SVG (XML text)', () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectMime(buf)).toBeNull();
  });

  it('returns null for too-short buffer', () => {
    expect(detectMime(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
