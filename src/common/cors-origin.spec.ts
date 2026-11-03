import { isCorsOriginAllowed } from './cors-origin';

describe('isCorsOriginAllowed', () => {
  it('allows configured origins and configured wildcard subdomains', () => {
    expect(
      isCorsOriginAllowed(
        'https://farmapp.africa',
        ['https://farmapp.africa', 'https://*.workers.dev'],
        true,
        false,
      ),
    ).toBe(true);
    expect(
      isCorsOriginAllowed(
        'https://preview.algorandfarm686.workers.dev',
        ['https://*.algorandfarm686.workers.dev'],
        true,
        false,
      ),
    ).toBe(true);
  });

  it('allows localhost only in development or when explicitly enabled', () => {
    expect(
      isCorsOriginAllowed('http://localhost:55319', [], false, false),
    ).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:55319', [], true, false)).toBe(
      false,
    );
    expect(isCorsOriginAllowed('http://localhost:55319', [], true, true)).toBe(
      true,
    );
    expect(
      isCorsOriginAllowed('https://localhost.evil.example', [], true, true),
    ).toBe(false);
  });

  it('rejects wildcard origins in production and allows requests without Origin', () => {
    expect(
      isCorsOriginAllowed('https://untrusted.example', ['*'], true, false),
    ).toBe(false);
    expect(isCorsOriginAllowed(undefined, [], true, false)).toBe(true);
  });
});
