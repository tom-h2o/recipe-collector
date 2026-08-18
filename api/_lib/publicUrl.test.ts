import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPublicHttpUrl, fetchPublicUrl } from './publicUrl';

const PRIVATE_URL_ERROR = 'Private or local network URLs cannot be imported.';

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

describe('assertPublicHttpUrl', () => {
  it('rejects non-http protocols', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow('Only http and https URLs can be imported.');
  });

  it('rejects localhost hostnames', async () => {
    await expect(assertPublicHttpUrl('https://localhost/recipe')).rejects.toThrow('Local URLs cannot be imported.');
  });

  it('rejects private IPv4 addresses before fetching', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('Private or local network URLs cannot be imported.');
  });

  it('allows direct public IP URLs', async () => {
    await expect(assertPublicHttpUrl('https://93.184.216.34/recipe')).resolves.toMatchObject({
      protocol: 'https:',
      hostname: '93.184.216.34',
    });
  });

  it('rejects CGNAT addresses', async () => {
    await expect(assertPublicHttpUrl('http://100.64.1.1/')).rejects.toThrow(PRIVATE_URL_ERROR);
  });

  it('rejects IPv4-mapped IPv6 loopback', async () => {
    await expect(assertPublicHttpUrl('http://[::ffff:127.0.0.1]/')).rejects.toThrow(PRIVATE_URL_ERROR);
  });

  it('rejects IPv4-mapped IPv6 metadata endpoint in hex form', async () => {
    await expect(assertPublicHttpUrl('http://[::ffff:a9fe:a9fe]/latest/meta-data/')).rejects.toThrow(PRIVATE_URL_ERROR);
  });

  it('rejects deprecated IPv4-compatible IPv6 form', async () => {
    await expect(assertPublicHttpUrl('http://[::169.254.169.254]/')).rejects.toThrow(PRIVATE_URL_ERROR);
  });

  it('still allows public IPv6 addresses', async () => {
    await expect(assertPublicHttpUrl('https://[2606:2800:220:1:248:1893:25c8:1946]/recipe')).resolves.toMatchObject({
      protocol: 'https:',
    });
  });
});

describe('fetchPublicUrl', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('rejects a redirect into the metadata endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirectTo('http://169.254.169.254/latest/meta-data/')));
    await expect(fetchPublicUrl('https://93.184.216.34/recipe')).rejects.toThrow(PRIVATE_URL_ERROR);
  });

  it('rejects a redirect into an IPv4-mapped IPv6 loopback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirectTo('http://[::ffff:127.0.0.1]/')));
    await expect(fetchPublicUrl('https://93.184.216.34/recipe')).rejects.toThrow(PRIVATE_URL_ERROR);
  });

  it('follows a redirect to another public URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectTo('https://93.184.216.35/final'))
      .mockResolvedValueOnce(new Response('<html>recipe</html>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchPublicUrl('https://93.184.216.34/recipe');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('recipe');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('gives up after too many redirects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirectTo('https://93.184.216.34/loop')));
    await expect(fetchPublicUrl('https://93.184.216.34/recipe')).rejects.toThrow('Too many redirects while fetching the URL.');
  });

  it('resolves relative redirect targets against the current URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectTo('/moved'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPublicUrl('https://93.184.216.34/recipe');
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://93.184.216.34/moved');
  });
});
