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
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ].some(([base, bits]) => ipv4InRange(ip, base as string, bits as number));
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('ff');
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
