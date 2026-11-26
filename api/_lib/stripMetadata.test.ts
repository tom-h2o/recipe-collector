import { describe, expect, it } from 'vitest';
import exifr from 'exifr';
import { decodeBase64 } from './imageBytes';
import { stripImageMetadata } from './stripMetadata';
import { CAMERA_JPEG, SCREEN_PNG } from './testFixtures/images';

// Every test image is put together here, byte by byte, around the pixels of
// the two tiny real files in testFixtures, so each case shows exactly what
// went in and what must come out.

const join = (...parts: (ArrayLike<number> | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : Array.from(p))));

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// --- JPEG -------------------------------------------------------------------

const SOI = [0xff, 0xd8];
const segment = (marker: number, payload: ArrayLike<number> | string) => {
  const body = join(payload);
  return join([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff], body);
};

// CAMERA_JPEG is SOI, JFIF APP0, an EXIF APP1 (Make, Model, exposure; no
// orientation), then the image: tables, frame, scan. Its parts:
const camera = decodeBase64(CAMERA_JPEG);
const JFIF = camera.subarray(2, 20);
const IMAGE = camera.subarray(22 + ((camera[22] << 8) | camera[23]));
// The image's parts: tables and frame up to its SOS, one DHT from among them, EOI.
const TABLES = IMAGE.subarray(0, 589);
const DHT = camera.subarray(311, 344);
const EOI = [0xff, 0xd9];

type Entry = [tag: number, type: number, count: number, value: number | string];
const LATITUDE: [number, number][] = [[52, 1], [31, 1], [1234, 100]];
const LONGITUDE: [number, number][] = [[13, 1], [24, 1], [5678, 100]];

/** An EXIF APP1 payload: IFD0 with Make, optionally Orientation, optionally a pointer to a GPS IFD. */
function exif({ orientation, gps = false, little = false }: { orientation?: number; gps?: boolean; little?: boolean }): Uint8Array {
  const ifd0: Entry[] = [[0x010f, 2, 6, 0]];
  if (orientation !== undefined) ifd0.push([0x0112, 3, 1, orientation]);
  if (gps) ifd0.push([0x8825, 4, 1, 0]);
  const makeAt = 8 + 2 + ifd0.length * 12 + 4;
  const gpsAt = makeAt + 6;
  const latAt = gpsAt + 2 + 4 * 12 + 4;
  const lonAt = latAt + 24;
  ifd0[0][3] = makeAt;
  if (gps) ifd0[ifd0.length - 1][3] = gpsAt;

  const tiff = new Uint8Array(gps ? lonAt + 24 : gpsAt);
  const view = new DataView(tiff.buffer);
  tiff.set(join(little ? 'II' : 'MM'));
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  const writeIfd = (at: number, entries: Entry[]) => {
    view.setUint16(at, entries.length, little);
    entries.forEach(([tag, type, count, value], n) => {
      const e = at + 2 + n * 12;
      view.setUint16(e, tag, little);
      view.setUint16(e + 2, type, little);
      view.setUint32(e + 4, count, little);
      if (typeof value === 'string') tiff.set(join(value), e + 8);
      else if (type === 3) view.setUint16(e + 8, value, little);
      else view.setUint32(e + 8, value, little);
    });
    view.setUint32(at + 2 + entries.length * 12, 0, little);
  };
  const writeRationals = (at: number, values: [number, number][]) => values.forEach(([num, den], n) => {
    view.setUint32(at + n * 8, num, little);
    view.setUint32(at + n * 8 + 4, den, little);
  });
  writeIfd(8, ifd0);
  tiff.set(join('Apple\0'), makeAt);
  if (gps) {
    writeIfd(gpsAt, [[0x0001, 2, 2, 'N\0'], [0x0002, 5, 3, latAt], [0x0003, 2, 2, 'E\0'], [0x0004, 5, 3, lonAt]]);
    writeRationals(latAt, LATITUDE);
    writeRationals(lonAt, LONGITUDE);
  }
  return join('Exif\0\0', tiff);
}

/** The APP1 this module must write for an orientation, spelled out: big-endian TIFF, IFD0, one SHORT. */
const orientationApp1 = (o: number) => join([
  0xff, 0xe1, 0x00, 0x22,
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  0x00, 0x01,
  0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
]);

/** The segments before the first scan, and the scan onwards. */
function jpegParts(jpeg: Uint8Array): { markers: number[]; payloads: Uint8Array[]; scan: Uint8Array } {
  const markers: number[] = [];
  const payloads: Uint8Array[] = [];
  let i = 2;
  while (i < jpeg.length) {
    while (jpeg[i + 1] === 0xff) i += 1;
    const marker = jpeg[i + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { markers.push(marker); payloads.push(new Uint8Array()); i += 2; continue; }
    if (marker === 0xda) return { markers, payloads, scan: jpeg.subarray(i) };
    const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
    markers.push(marker);
    payloads.push(jpeg.subarray(i + 4, i + 2 + length));
    i += 2 + length;
  }
  throw new Error('no scan');
}

const latitudeBytes = (little: boolean) => {
  const out = new Uint8Array(24);
  const view = new DataView(out.buffer);
  LATITUDE.forEach(([num, den], n) => { view.setUint32(n * 8, num, little); view.setUint32(n * 8 + 4, den, little); });
  return out;
};

describe('stripImageMetadata: JPEG', () => {
  it('takes out EXIF with its GPS and writes back only the orientation', async () => {
    const input = join(SOI, JFIF, segment(0xe1, exif({ orientation: 6, gps: true })), IMAGE);
    // The test file really carries a location to remove.
    expect(contains(input, latitudeBytes(false))).toBe(true);
    expect((await exifr.parse(input))?.latitude).toBeCloseTo(52.5201, 3);

    const out = stripImageMetadata(input, 'image/jpeg');

    expect(contains(out, latitudeBytes(false))).toBe(false);
    expect(contains(out, join('Apple'))).toBe(false);
    const parts = jpegParts(out);
    expect(parts.markers.filter((m) => m === 0xe1)).toHaveLength(1);
    // Straight after JFIF, where EXIF belongs.
    expect(parts.markers.slice(0, 2)).toEqual([0xe0, 0xe1]);
    expect(out.subarray(20, 56)).toEqual(orientationApp1(6));
    expect(parts.scan).toEqual(jpegParts(input).scan);
    expect(out).toEqual(join(SOI, JFIF, orientationApp1(6), IMAGE));

    expect(await exifr.orientation(out)).toBe(6);
    const meta = await exifr.parse(out);
    expect(meta?.latitude).toBeUndefined();
    expect(meta?.longitude).toBeUndefined();
    expect(meta?.Make).toBeUndefined();
  });

  it.each([
    { orientation: 8, little: true },
    { orientation: 3, little: false },
    { orientation: 2, little: true },
  ])('reads orientation $orientation from either byte order (little-endian: $little)', async ({ orientation, little }) => {
    const input = join(SOI, JFIF, segment(0xe1, exif({ orientation, gps: true, little })), IMAGE);
    const out = stripImageMetadata(input, 'image/jpeg');
    expect(contains(out, latitudeBytes(little))).toBe(false);
    expect(out).toEqual(join(SOI, JFIF, orientationApp1(orientation), IMAGE));
    expect(await exifr.orientation(out)).toBe(orientation);
  });

  it.each([1, undefined, 0, 9])('leaves no EXIF at all for orientation %s', (orientation) => {
    const input = join(SOI, JFIF, segment(0xe1, exif({ orientation, gps: true })), IMAGE);
    const out = stripImageMetadata(input, 'image/jpeg');
    expect(jpegParts(out).markers).not.toContain(0xe1);
    expect(out).toEqual(join(SOI, JFIF, IMAGE));
  });

  it('strips a real camera file down to JFIF and the image, byte for byte', async () => {
    const out = stripImageMetadata(camera, 'image/jpeg');
    expect(out).toEqual(join(SOI, JFIF, IMAGE));
    expect(await exifr.parse(camera)).toHaveProperty('Make', 'Apple');
    expect(await exifr.parse(out)).toBeUndefined();
  });

  it('puts the orientation first when there is no JFIF segment', () => {
    const input = join(SOI, segment(0xe1, exif({ orientation: 6 })), IMAGE);
    expect(stripImageMetadata(input, 'image/jpeg')).toEqual(join(SOI, orientationApp1(6), IMAGE));
  });

  it('reads the orientation from EXIF even when an XMP APP1 comes first', () => {
    const xmp = segment(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>52,31.2N</exif:GPSLatitude></x:xmpmeta>');
    const input = join(SOI, JFIF, xmp, segment(0xe1, exif({ orientation: 6 })), IMAGE);
    expect(stripImageMetadata(input, 'image/jpeg')).toEqual(join(SOI, JFIF, orientationApp1(6), IMAGE));
  });

  it('keeps the ICC profile (APP2) and Adobe (APP14); drops XMP, IPTC, comments and other APPn', () => {
    const icc = segment(0xe2, join('ICC_PROFILE\0', [1, 1], [0, 0, 2, 0x30, 0x61, 0x70, 0x70, 0x6c]));
    const adobe = segment(0xee, join('Adobe', [0, 100, 0, 0, 0, 0, 1]));
    const input = join(
      SOI, JFIF,
      segment(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>52,31.2N</exif:GPSLatitude></x:xmpmeta>'),
      icc,
      segment(0xed, 'Photoshop 3.0\x008BIM\x04\x04\0\0\0\0\0\x0a\x1c\x02\x5a\0\x06Berlin'),
      adobe,
      segment(0xfe, 'shot at home'),
      segment(0xe3, 'Meta'),
      segment(0xef, 'anything'),
      IMAGE,
    );
    const out = stripImageMetadata(input, 'image/jpeg');
    expect(out).toEqual(join(SOI, JFIF, icc, adobe, IMAGE));
    expect(contains(out, join('GPSLatitude'))).toBe(false);
    expect(contains(out, join('Berlin'))).toBe(false);
  });

  it('keeps 0xFF00 and RSTn inside scan data as data, not markers', () => {
    const sos = segment(0xda, [1, 1, 0, 0, 0x3f, 0]);
    // Outside a scan, each of these would be read as a marker or a segment.
    const data = join([0x12, 0xff, 0x00, 0xe1, 0x00, 0x10, 0xff, 0xd0, 0x56, 0xff, 0xd7, 0xff, 0xff, 0x00, 0x34]);
    const input = join(SOI, JFIF, segment(0xe1, exif({ orientation: 3 })), TABLES, sos, data, EOI);
    expect(stripImageMetadata(input, 'image/jpeg')).toEqual(join(SOI, JFIF, orientationApp1(3), TABLES, sos, data, EOI));
  });

  it('walks every scan of a progressive file: tables between scans stay, metadata there goes', () => {
    const sos1 = segment(0xda, [1, 1, 0, 0, 0, 0]);
    const scan1 = join([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x9a]);
    const sos2 = segment(0xda, [1, 1, 0, 1, 5, 0]);
    const scan2 = join([0x56, 0xff, 0xd1, 0x78]);
    const dri = segment(0xdd, [0, 4]);
    const input = join(
      SOI, JFIF,
      segment(0xe1, exif({ orientation: 6, gps: true })),
      TABLES,
      sos1, scan1,
      DHT,
      segment(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>52,31.2N</exif:GPSLatitude></x:xmpmeta>'),
      segment(0xfe, 'between scans'),
      dri,
      [0xff, 0xff], segment(0xe1, exif({ gps: true, little: true })),
      sos2, scan2,
      EOI,
    );
    const out = stripImageMetadata(input, 'image/jpeg');
    expect(out).toEqual(join(SOI, JFIF, orientationApp1(6), TABLES, sos1, scan1, DHT, dri, sos2, scan2, EOI));
    expect(contains(out, latitudeBytes(false)) || contains(out, latitudeBytes(true))).toBe(false);
    expect(contains(out, join('GPSLatitude'))).toBe(false);
  });

  it('ends at the first EOI, dropping an appended image with its own EXIF and GPS', async () => {
    const mpf = segment(0xe2, join('MPF\0', 'MM', [0, 0x2a, 0, 0, 0, 8], [0, 0]));
    const gainMap = join(SOI, segment(0xe1, exif({ gps: true })), IMAGE);
    const input = join(SOI, JFIF, segment(0xe1, exif({ orientation: 6 })), mpf, IMAGE, gainMap);
    expect(contains(input, latitudeBytes(false))).toBe(true);

    const out = stripImageMetadata(input, 'image/jpeg');
    expect(out).toEqual(join(SOI, JFIF, orientationApp1(6), IMAGE));
    expect(Array.from(out.subarray(-2))).toEqual([0xff, 0xd9]);
    expect(contains(out, latitudeBytes(false))).toBe(false);
    expect(await exifr.orientation(out)).toBe(6);
    expect((await exifr.parse(out))?.latitude).toBeUndefined();
  });

  it('drops junk after EOI even when there is no metadata', () => {
    expect(stripImageMetadata(join(SOI, JFIF, IMAGE, 'GPS 52.52N 13.41E'), 'image/jpeg')).toEqual(join(SOI, JFIF, IMAGE));
  });

  it('drops an MPF APP2, and any APP2 but the ICC profile', () => {
    const icc = segment(0xe2, join('ICC_PROFILE\0', [1, 1], [0, 0, 2, 0x30, 0x61, 0x70, 0x70, 0x6c]));
    const mpf = segment(0xe2, join('MPF\0', 'MM', [0, 0x2a, 0, 0, 0, 8], [0, 0]));
    const fpxr = segment(0xe2, join('FPXR\0', [0, 1, 2]));
    const input = join(SOI, JFIF, mpf, icc, fpxr, IMAGE);
    expect(stripImageMetadata(input, 'image/jpeg')).toEqual(join(SOI, JFIF, icc, IMAGE));
  });

  it('handles fill bytes and the standalone markers (TEM, RSTn) before the scan', () => {
    const input = join(
      SOI, JFIF,
      segment(0xe1, exif({ orientation: 6 })),
      [0xff, 0xff, 0xff], segment(0xfe, 'a comment'),
      [0xff, 0x01],
      [0xff, 0xd3],
      [0xff, 0xff], IMAGE,
    );
    const out = stripImageMetadata(input, 'image/jpeg');
    // Fill bytes go with a segment that is left out and stay with one that is kept.
    expect(out).toEqual(join(SOI, JFIF, orientationApp1(6), [0xff, 0x01], [0xff, 0xd3], [0xff, 0xff], IMAGE));
  });

  it('returns the same bytes when there is nothing to take out, and is idempotent', () => {
    const clean = join(SOI, JFIF, IMAGE);
    expect(stripImageMetadata(clean, 'image/jpeg')).toBe(clean);
    const once = stripImageMetadata(join(SOI, JFIF, segment(0xe1, exif({ orientation: 6, gps: true })), IMAGE), 'image/jpeg');
    expect(stripImageMetadata(once, 'image/jpeg')).toEqual(once);
  });

  it('accepts a Node Buffer that is a slice of a larger pool', () => {
    const input = join(SOI, JFIF, segment(0xe1, exif({ orientation: 6, gps: true })), IMAGE);
    const pooled = Buffer.concat([Buffer.from('padding'), Buffer.from(input)]).subarray(7);
    expect(stripImageMetadata(pooled, 'image/jpeg')).toEqual(join(SOI, JFIF, orientationApp1(6), IMAGE));
  });
});

// --- PNG --------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const be32 = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const pngChunk = (type: string, data: ArrayLike<number> | string) => {
  const typed = join(type, data);
  return join(be32(typed.length - 4), typed, be32(crc32(typed)));
};

// SCREEN_PNG is the signature, IHDR, IDAT, IEND and nothing else.
const screen = decodeBase64(SCREEN_PNG);
const PNG_SIG = screen.subarray(0, 8);
const IHDR = screen.subarray(8, 33);
const IDAT = screen.subarray(33, 66);
const IEND = screen.subarray(66, 78);

describe('stripImageMetadata: PNG', () => {
  it('drops text, EXIF and time chunks and keeps the rest byte for byte, CRCs included', () => {
    const kept = [pngChunk('iCCP', join('sRGB\0\0', [0x78, 0x9c, 0x63, 0x60])), pngChunk('gAMA', be32(45455)), pngChunk('pHYs', [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])];
    const input = join(
      PNG_SIG, IHDR, kept[0], kept[1],
      pngChunk('tEXt', 'Comment\0taken at home'),
      pngChunk('eXIf', exif({ orientation: 1, gps: true }).subarray(6)),
      kept[2],
      pngChunk('tIME', [0x07, 0xea, 11, 26, 12, 0, 0]),
      IDAT,
      pngChunk('zTXt', 'Author\0\0x'),
      pngChunk('iTXt', 'XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>'),
      IEND,
    );
    expect(stripImageMetadata(input, 'image/png')).toEqual(join(PNG_SIG, IHDR, ...kept, IDAT, IEND));
  });

  it('gives back the real file exactly once its metadata is gone', () => {
    const input = join(PNG_SIG, IHDR, pngChunk('eXIf', exif({ gps: true }).subarray(6)), IDAT, pngChunk('tEXt', 'Software\0iOS'), IEND);
    expect(stripImageMetadata(input, 'image/png')).toEqual(screen);
  });

  it('leaves out bytes after IEND, which no decoder reads', () => {
    expect(stripImageMetadata(join(screen, 'GPS 52.52N 13.41E'), 'image/png')).toEqual(screen);
  });

  it('returns the same bytes when there is nothing to take out', () => {
    expect(stripImageMetadata(screen, 'image/png')).toBe(screen);
  });
});

// --- WebP -------------------------------------------------------------------

const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, n >>> 24];
const webpChunk = (fourcc: string, data: ArrayLike<number> | string) => {
  const body = join(data);
  return join(fourcc, le32(body.length), body, body.length % 2 ? [0] : []);
};
const riff = (...chunks: Uint8Array[]) => {
  const body = join('WEBP', ...chunks);
  return join('RIFF', le32(body.length), body);
};
// Flags, three reserved bytes, canvas width - 1 and height - 1 (24-bit each).
const vp8x = (flags: number) => webpChunk('VP8X', [flags, 0, 0, 0, 7, 0, 0, 5, 0, 0]);
const ICC = 0x20;
const ALPHA = 0x10;
const EXIF = 0x08;
const XMP = 0x04;

describe('stripImageMetadata: WebP', () => {
  const iccp = webpChunk('ICCP', [1, 2, 3, 4, 5]); // odd: one pad byte
  const vp8l = webpChunk('VP8L', [0x2f, 7, 0x40, 1, 0, 0, 0, 0, 0]); // odd

  it('drops EXIF and XMP, clears their flags, keeps padding and rewrites the RIFF size', () => {
    const input = riff(
      vp8x(ICC | ALPHA | EXIF | XMP),
      iccp,
      webpChunk('EXIF', exif({ orientation: 6, gps: true }).subarray(6, 13)), // odd, padded
      vp8l,
      webpChunk('XMP ', '<x:xmpmeta><exif:GPSLatitude>52,31.2N</exif:GPSLatitude></x:xmpmeta>'),
    );
    const out = stripImageMetadata(input, 'image/webp');
    expect(out).toEqual(riff(vp8x(ICC | ALPHA), iccp, vp8l));
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
    expect(out[20]).toBe(ICC | ALPHA);
    expect(contains(out, join('GPSLatitude'))).toBe(false);
  });

  it('clears a flag that promises metadata the file does not hold', () => {
    expect(stripImageMetadata(riff(vp8x(EXIF), vp8l), 'image/webp')).toEqual(riff(vp8x(0), vp8l));
  });

  it('returns a simple WebP, which has no place for metadata, unchanged', () => {
    const simple = riff(vp8l);
    expect(stripImageMetadata(simple, 'image/webp')).toBe(simple);
  });

  it('returns the same bytes when there is nothing to take out', () => {
    const clean = riff(vp8x(ICC), iccp, vp8l);
    expect(stripImageMetadata(clean, 'image/webp')).toBe(clean);
  });
});

// --- Anything else, or anything broken ---------------------------------------

describe('stripImageMetadata: never throws, gives the original back when unsure', () => {
  it('returns a GIF unchanged', () => {
    const gif = join('GIF89a', [1, 0, 1, 0, 0, 0, 0], ',', [0, 0, 0, 0, 1, 0, 1, 0, 0], [2, 2, 0x44, 1, 0], ';');
    expect(stripImageMetadata(gif, 'image/gif')).toBe(gif);
  });

  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const)('returns empty or foreign bytes as they are (%s)', (type) => {
    const empty = new Uint8Array();
    const text = join('just some text, not a picture at all');
    expect(stripImageMetadata(empty, type)).toBe(empty);
    expect(stripImageMetadata(text, type)).toBe(text);
  });

  it('returns a JPEG whose segment runs past the end unchanged', () => {
    const full = join(SOI, JFIF, segment(0xe1, exif({ orientation: 6, gps: true })), IMAGE);
    const cut = full.subarray(0, 60);
    expect(stripImageMetadata(cut, 'image/jpeg')).toBe(cut);
  });

  it('returns a JPEG without a scan, without an EOI, or with garbage between segments, unchanged', () => {
    const noScan = join(SOI, JFIF, segment(0xe1, exif({ orientation: 6, gps: true })), EOI);
    const noEnd = join(SOI, JFIF, segment(0xe1, exif({ orientation: 6, gps: true })), IMAGE.subarray(0, IMAGE.length - 2));
    const secondStart = join(SOI, JFIF, segment(0xe1, exif({ gps: true })), IMAGE.subarray(0, IMAGE.length - 2), SOI, IMAGE);
    const garbage = join(SOI, JFIF, [0x00, 0x12], segment(0xe1, exif({ gps: true })), IMAGE);
    for (const file of [noScan, noEnd, secondStart, garbage]) expect(stripImageMetadata(file, 'image/jpeg')).toBe(file);
  });

  it('still drops an EXIF block whose TIFF header cannot be read, without an orientation', () => {
    const broken = join('Exif\0\0', 'MM', [0, 42], be32(0xffff), [0, 0]);
    const out = stripImageMetadata(join(SOI, JFIF, segment(0xe1, broken), IMAGE), 'image/jpeg');
    expect(out).toEqual(join(SOI, JFIF, IMAGE));
  });

  it('returns a PNG without IEND, or with an impossible chunk length, unchanged', () => {
    const noEnd = join(PNG_SIG, IHDR, pngChunk('tEXt', 'a\0b'), IDAT);
    const tooLong = join(PNG_SIG, IHDR, [0x7f, 0xff, 0xff, 0xff], 'tEXt', IEND);
    expect(stripImageMetadata(noEnd, 'image/png')).toBe(noEnd);
    expect(stripImageMetadata(tooLong, 'image/png')).toBe(tooLong);
  });

  it('returns a WebP whose RIFF size or chunk size overruns the file unchanged', () => {
    const good = riff(vp8x(EXIF), webpChunk('EXIF', [1, 2, 3]), webpChunk('VP8L', [1, 2]));
    const riffTooBig = join('RIFF', le32(good.length), good.subarray(8));
    const chunkTooBig = good.slice();
    chunkTooBig[34] = 0xff; // the EXIF chunk's size
    expect(stripImageMetadata(riffTooBig, 'image/webp')).toBe(riffTooBig);
    expect(stripImageMetadata(chunkTooBig, 'image/webp')).toBe(chunkTooBig);
  });

  it('survives every truncation of every format', () => {
    const samples = [
      ['image/jpeg', join(SOI, JFIF, segment(0xe1, exif({ orientation: 6, gps: true })), segment(0xfe, 'x'), IMAGE)],
      ['image/png', join(PNG_SIG, IHDR, pngChunk('tEXt', 'a\0b'), IDAT, IEND)],
      ['image/webp', riff(vp8x(EXIF | XMP), webpChunk('EXIF', [1, 2, 3]), webpChunk('VP8L', [1, 2]), webpChunk('XMP ', 'x'))],
    ] as const;
    for (const [type, sample] of samples) {
      for (let n = 0; n <= sample.length; n += 1) {
        expect(() => stripImageMetadata(sample.subarray(0, n), type)).not.toThrow();
      }
    }
  });
});
