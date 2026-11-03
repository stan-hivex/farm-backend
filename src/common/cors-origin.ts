const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  isProduction: boolean,
  allowLocalhost: boolean,
): boolean {
  if (!origin) return true;

  if (LOCALHOST_ORIGIN.test(origin) && (!isProduction || allowLocalhost)) {
    return true;
  }

  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === '*') return !isProduction;
    if (allowedOrigin.startsWith('*.')) {
      return origin.endsWith(allowedOrigin.slice(1));
    }
    if (!allowedOrigin.includes('*')) return origin === allowedOrigin;

    const escaped = allowedOrigin
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    // nosemgrep: detect-non-literal-regexp -- configured origin segments are escaped above
    const pattern = new RegExp(`^${escaped}$`);
    return pattern.test(origin);
  });
}
