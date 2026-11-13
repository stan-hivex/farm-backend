import { idempotencyScope } from './idempotency.middleware';

function token(sub: string) {
  const body = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `h.${body}.sig`;
}

describe('idempotencyScope', () => {
  it('scopes a bearer token to its subject and keeps anonymous keys apart', () => {
    const a = {
      headers: { authorization: `Bearer ${token('user-a')}` },
    } as any;
    const b = {
      headers: { authorization: `Bearer ${token('user-b')}` },
    } as any;
    expect(idempotencyScope(a)).toBe('user-a');
    expect(idempotencyScope(b)).toBe('user-b');
    expect(idempotencyScope(a)).not.toBe(idempotencyScope(b));
    expect(idempotencyScope({ headers: {} } as any)).toBe('anon');
  });
});
