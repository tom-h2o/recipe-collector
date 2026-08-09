import { isIP } from 'net';
import { lookup } from 'dns/promises';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function ipv4InRange(ip: string, base: string, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function isPrivateIpv4(ip: string): boolean {
  return [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10], // CGNAT
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ].some(([base, bits]) => ipv4InRange(ip, base as string, bits as number));
}

/** Expand an IPv6 address to its eight 16-bit groups, or null if unparseable. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase();

  // Re-encode a trailing dotted quad (::ffff:127.0.0.1) as two hex groups
  const dotted = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const octets = dotted[1].split('.').map(Number);
    if (octets.some((o) => o > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, dotted.index)}${hi}:${lo}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  let parts: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    parts = head;
  } else {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    parts = [...head, ...Array<string>(fill).fill('0'), ...tail];
  }

  const groups = parts.map((p) => parseInt(p, 16));
  return groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff) ? null : groups;
}

/**
 * Return the embedded IPv4 address for v4-mapped (::ffff:a.b.c.d) and deprecated
 * v4-compatible (::a.b.c.d) forms. These otherwise slip past the prefix checks
 * below and reach loopback or the cloud metadata endpoint.
 */
function embeddedIpv4(ip: string): string | null {
  const groups = ipv6Groups(ip);
  if (!groups) return null;
  if (groups.slice(0, 5).some((g) => g !== 0)) return null;
  if (groups[5] !== 0xffff && groups[5] !== 0) return null;

  const value = (groups[6] * 65536 + groups[7]) >>> 0;
  if (value <= 1) return null; // :: and ::1 are handled by the literal checks
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('ff')) return true; // multicast

  const embedded = embeddedIpv4(normalized);
  return embedded ? isPrivateIpv4(embedded) : false;
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version === 6) return !isBlockedIpv6(address);
  return false;
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be imported.');
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials cannot be imported.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Local URLs cannot be imported.');
  }

  const directIpVersion = isIP(host);
  if (directIpVersion && !isPublicAddress(host)) {
    throw new Error('Private or local network URLs cannot be imported.');
  }
  if (directIpVersion) return url;

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error('Private or local network URLs cannot be imported.');
  }

  return url;
}

const MAX_REDIRECTS = 3;

/**
 * Fetch a URL, re-validating every redirect hop. Following redirects with the
 * platform default would let a public URL bounce the request to a private one.
 */
export async function fetchPublicUrl(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let current = await assertPublicHttpUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status > 399) return response;

    const location = response.headers.get('location');
    if (!location) return response;

    current = await assertPublicHttpUrl(new URL(location, current).toString());
  }

  throw new Error('Too many redirects while fetching the URL.');
}
