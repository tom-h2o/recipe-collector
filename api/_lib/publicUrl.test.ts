import { describe, expect, it } from 'vitest';
import { assertPublicHttpUrl } from './publicUrl';

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
});
