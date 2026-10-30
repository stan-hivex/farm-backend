import { lookup } from 'dns/promises';
import { isIP } from 'net';

/** Blocks loopback, private, link-local, CGNAT, multicast and reserved ranges (SSRF guard). */
export function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return false;
  if (v.startsWith('::ffff:')) return isPublicIp(v.slice(7));
  if (/^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff')) return false;
  return true;
}

/** Validates an upstream URL: https only, no credentials, public host. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'https:') throw new Error('Upstream URL must be https');
  if (u.username || u.password) throw new Error('Upstream URL must not contain credentials');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new Error('Upstream host is not public');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('Upstream host does not resolve');
  if (addrs.some((a) => !isPublicIp(a.address))) throw new Error('Upstream host is not public');
  return u;
}

export interface UpstreamResult {
  status: number;
  contentType: string | null;
  body: Buffer;
}

/** One request to a vetted upstream: no redirects, 15 s timeout, 2 MB cap. */
export async function safeFetch(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<UpstreamResult> {
  await assertSafeUrl(url);
  const r = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  const max = 2 * 1024 * 1024;
  const chunks: Buffer[] = [];
  let size = 0;
  if (r.body) {
    for await (const c of r.body as any) {
      size += c.length;
      if (size > max) throw new Error('Upstream response too large');
      chunks.push(Buffer.from(c));
    }
  }
  return { status: r.status, contentType: r.headers.get('content-type'), body: Buffer.concat(chunks) };
}
