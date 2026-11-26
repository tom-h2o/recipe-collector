import type { SupportedImageType } from './imageBytes.js';

/**
 * Taking location and other private metadata out of a picture before it is
 * stored in the public `recipe-images` bucket. A camera photo sent by the
 * iPhone Shortcut arrives as the original file, and its EXIF can say where
 * it was taken, which for a recipe is usually someone's kitchen: anyone with
 * the picture's address could read it.
 *
 * Only containers are rewritten, never pixels: segments and chunks are copied
 * or left out, so nothing is re-encoded and colour profiles stay.
 *
 * Never throws. A file this cannot make sense of is returned as it came: a
 * stored photo that still carries its metadata is the smaller harm next to an
 * import that fails, and a decoder forgives more than this parser does.
 */
export function stripImageMetadata(bytes: Uint8Array, type: SupportedImageType): Uint8Array {
  try {
    switch (type) {
      case 'image/jpeg': return stripJpeg(bytes) ?? bytes;
      case 'image/png': return stripPng(bytes) ?? bytes;
      case 'image/webp': return stripWebp(bytes) ?? bytes;
      // GIF has no standard place for a location; it is stored as it came.
      default: return bytes;
    }
  } catch {
    return bytes;
  }
}

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// --- JPEG -------------------------------------------------------------------

const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const SOS = 0xda;
const EOI = 0xd9;
const COM = 0xfe;
// Marks the entropy-coded data after an SOS header in the list of parts.
const SCAN_DATA = -1;

// APP0 (JFIF), the ICC profile in APP2 (without which colours shift) and
// APP14 (Adobe, which says how to convert the colours) stay; every other APPn
// and COM goes. APP1 is EXIF and XMP, APP13 is IPTC: the ones that hold
// places. Any other APP2 goes too: MPF there points at the images after the
// end of the picture, which are dropped. Non-APP segments are the image itself
// (tables, frame, scans, restart interval).
function keepJpegSegment(marker: number, payload: Uint8Array): boolean {
  if (marker === COM) return false;
  if (marker === APP2) return ascii(payload, 0, 12) === 'ICC_PROFILE\0';
  if (marker >= 0xe0 && marker <= 0xef) return marker === APP0 || marker === 0xee;
  return true;
}

/** The stripped file, or null when it is malformed or there was nothing to take out. */
function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: { marker: number; bytes: Uint8Array }[] = [];
  let orientation: number | null = null;
  let dropped = false;
  let scanned = false;
  let i = 2;
  for (;;) {
    const start = i;
    if (i >= bytes.length || bytes[i] !== 0xff) return null;
    // Any number of 0xFF fill bytes may come before a marker. They travel with
    // the segment they precede: kept with it, or left out with it.
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i += 1;
    if (marker === EOI) {
      if (!scanned) return null;
      kept.push({ marker, bytes: bytes.subarray(start, i) });
      // Whatever follows the end of the picture goes. On an iPhone that is a
      // second image (the HDR gain map, which the MPF APP2 points at) with
      // metadata of its own; a recipe photo does not need it.
      if (i < bytes.length) dropped = true;
      break;
    }
    // A stuffed zero outside a scan, or a second start: not a file we understand.
    if (marker === 0x00 || marker === 0xd8) return null;
    // TEM and RSTn stand alone, with no length after them.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push({ marker, bytes: bytes.subarray(start, i) });
      continue;
    }
    if (i + 2 > bytes.length) return null;
    const length = (bytes[i] << 8) | bytes[i + 1];
    const end = i + length;
    if (length < 2 || end > bytes.length) return null;
    const payload = bytes.subarray(i + 2, end);
    if (keepJpegSegment(marker, payload)) {
      kept.push({ marker, bytes: bytes.subarray(start, end) });
    } else {
      dropped = true;
      if (marker === APP1 && orientation === null) orientation = readExifOrientation(payload);
    }
    i = end;
    if (marker === SOS) {
      // The compressed data runs to the next marker. A progressive file has
      // several scans with tables between them, and could have APPn or COM
      // there as well, so the walk carries on after it under the same rules.
      const scanEnd = endOfScan(bytes, i);
      if (scanEnd === null) return null;
      kept.push({ marker: SCAN_DATA, bytes: bytes.subarray(i, scanEnd) });
      scanned = true;
      i = scanEnd;
    }
  }
  if (!dropped) return null;

  // An iPhone stores the pixels as the sensor saw them and says which way up
  // they go in EXIF; without that the photo shows sideways. So that one value
  // goes back, alone, where EXIF belongs: straight after SOI and any JFIF APP0.
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let next = 0;
  while (next < kept.length && kept[next].marker === APP0) parts.push(kept[next++].bytes);
  if (orientation !== null && orientation >= 2 && orientation <= 8) parts.push(orientationSegment(orientation));
  while (next < kept.length) parts.push(kept[next++].bytes);
  return concat(parts);
}

/**
 * Where the compressed data after an SOS header ends: at the first 0xFF that
 * starts a real marker. 0xFF 0x00 is a stuffed data byte and RST0-7 are part
 * of the scan; fill bytes before a stuffed zero are read the way libjpeg reads
 * them. Null when the file ends first.
 */
function endOfScan(bytes: Uint8Array, from: number): number | null {
  let j = from;
  for (;;) {
    j = bytes.indexOf(0xff, j);
    if (j < 0) return null;
    let k = j + 1;
    while (k < bytes.length && bytes[k] === 0xff) k += 1;
    if (k >= bytes.length) return null;
    if (bytes[k] !== 0x00 && (bytes[k] < 0xd0 || bytes[k] > 0xd7)) return j;
    j = k + 1;
  }
}

/** The Orientation tag (0x0112) from IFD0 of an APP1 payload, or null if it is not EXIF or has none. */
function readExifOrientation(payload: Uint8Array): number | null {
  if (payload.length < 14 || ascii(payload, 0, 6) !== 'Exif\0\0') return null;
  const tiff = payload.subarray(6);
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  const view = viewOf(tiff);
  if (view.getUint16(2, little) !== 42) return null;
  const ifd0 = view.getUint32(4, little);
  if (ifd0 < 8 || ifd0 + 2 > tiff.length) return null;
  const count = view.getUint16(ifd0, little);
  for (let n = 0; n < count; n += 1) {
    const entry = ifd0 + 2 + n * 12;
    if (entry + 12 > tiff.length) return null;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (view.getUint32(entry + 4, little) < 1) return null;
    const fieldType = view.getUint16(entry + 2, little);
    if (fieldType === 3) return view.getUint16(entry + 8, little);
    if (fieldType === 4) return view.getUint32(entry + 8, little);
    return null;
  }
  return null;
}

/** A complete APP1 segment holding EXIF with only IFD0 and only Orientation (SHORT, count 1). */
function orientationSegment(orientation: number): Uint8Array {
  const segment = new Uint8Array(36);
  const view = viewOf(segment);
  view.setUint16(0, 0xff00 | APP1);
  view.setUint16(2, 34); // the length counts itself, not the marker
  segment.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  segment.set([0x4d, 0x4d], 10); // TIFF header, big-endian ("MM")
  view.setUint16(12, 42);
  view.setUint32(14, 8); // IFD0 straight after the header
  view.setUint16(18, 1); // one entry
  view.setUint16(20, 0x0112);
  view.setUint16(22, 3);
  view.setUint32(24, 1);
  view.setUint16(28, orientation); // left-justified in the 4-byte value field
  view.setUint32(32, 0); // no further IFD
  return segment;
}

// --- PNG --------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// EXIF, the three kinds of text (where XMP and camera notes go) and the time
// it was made. Colour chunks (iCCP, sRGB, gAMA, cHRM) and pHYs are the picture.
const PNG_DROPPED = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, n) => bytes[n] !== b)) return null;
  const view = viewOf(bytes);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let dropped = false;
  let i = 8;
  for (;;) {
    if (i + 12 > bytes.length) return null; // ran out before IEND
    const end = i + 12 + view.getUint32(i);
    const type = ascii(bytes, i + 4, 4);
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) return null;
    if (PNG_DROPPED.has(type)) dropped = true;
    else parts.push(bytes.subarray(i, end)); // CRC included, untouched
    i = end;
    if (type === 'IEND') break;
  }
  // Bytes after IEND are no part of the picture and no decoder reads them,
  // so they could carry anything; they are left out too.
  if (i < bytes.length) dropped = true;
  return dropped ? concat(parts) : null;
}

// --- WebP -------------------------------------------------------------------

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const view = viewOf(bytes);
  const riffEnd = 8 + view.getUint32(4, true);
  if (riffEnd > bytes.length || riffEnd < 20) return null;
  // Only the extended format (VP8X first) can hold metadata chunks.
  if (ascii(bytes, 12, 4) !== 'VP8X') return null;
  const parts: Uint8Array[] = [];
  let changed = riffEnd < bytes.length; // bytes past the RIFF are no part of the picture
  let i = 12;
  while (i < riffEnd) {
    if (i + 8 > riffEnd) return null;
    const fourcc = ascii(bytes, i, 4);
    const size = view.getUint32(i + 4, true);
    const dataEnd = i + 8 + size;
    if (dataEnd > riffEnd) return null;
    // A chunk of odd size is followed by one pad byte. Some writers leave the
    // last one out; it is put back, since the new RIFF size must be even.
    const padded = dataEnd + (size & 1);
    const chunk = padded <= riffEnd ? bytes.subarray(i, padded) : concat([bytes.subarray(i, dataEnd), new Uint8Array(1)]);
    i = padded;
    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      changed = true;
    } else if (fourcc === 'VP8X' && parts.length === 0) {
      if (size < 10) return null;
      const flags = chunk[8] & ~(VP8X_EXIF | VP8X_XMP);
      if (flags !== chunk[8]) changed = true;
      const copy = chunk.slice();
      copy[8] = flags;
      parts.push(copy);
    } else {
      parts.push(chunk);
    }
  }
  if (!changed) return null;
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 4), 0); // "RIFF"
  viewOf(header).setUint32(4, 4 + parts.reduce((sum, p) => sum + p.length, 0), true);
  header.set(bytes.subarray(8, 12), 8); // "WEBP"
  return concat([header, ...parts]);
}
