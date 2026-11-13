export type BackfillMode = 'dry' | 'send';

/** Min-balance funding transferred to each new custodial account. */
export const DEFAULT_FUND_MICROALGOS = 310_000n;

export function fundMicroAlgos(
  env: Record<string, string | undefined> = process.env,
): bigint {
  const raw =
    env.CHAIN_WALLET_FUND_MICROALGOS ?? String(DEFAULT_FUND_MICROALGOS);
  try {
    const n = BigInt(raw.trim());
    return n > 0n ? n : DEFAULT_FUND_MICROALGOS;
  } catch {
    return DEFAULT_FUND_MICROALGOS;
  }
}

export function backfillCost(selected: number, each: bigint): bigint {
  const count = BigInt(Math.max(0, Math.floor(selected)));
  return count * each;
}

export type BackfillDecision =
  | { ok: true; selected: number }
  | { ok: false; reason: string; selected: number };

/**
 * Send is refused unless --expect-count equals the dry-run selected count
 * for the same --limit (users this run would provision, FARM balances first).
 */
export function evaluateBackfillSend(input: {
  mode: BackfillMode;
  selected: number;
  expectCount?: number;
}): BackfillDecision {
  if (input.mode === 'dry') return { ok: true, selected: input.selected };
  if (input.expectCount == null || !Number.isInteger(input.expectCount)) {
    return {
      ok: false,
      selected: input.selected,
      reason:
        'Send mode requires --expect-count equal to the dry-run selected count. Run dry first.',
    };
  }
  if (input.expectCount !== input.selected) {
    return {
      ok: false,
      selected: input.selected,
      reason: `Refusing send: --expect-count ${input.expectCount} does not match dry-run selected count ${input.selected}`,
    };
  }
  return { ok: true, selected: input.selected };
}

/** CLI batch cap. The HTTPS route uses a tighter cap. */
export const CLI_BACKFILL_MAX_LIMIT = 500;
export const HTTP_BACKFILL_DEFAULT_LIMIT = 25;
export const HTTP_BACKFILL_MAX_LIMIT = 100;

/**
 * Only the word "send" provisions wallets. "execute" stays dry: the global
 * SafeInputValidationPipe rejects that keyword, and a typo must not go live.
 */
export function backfillModeFromRaw(mode?: string | null): BackfillMode {
  return String(mode ?? 'dry')
    .trim()
    .toLowerCase() === 'send'
    ? 'send'
    : 'dry';
}

export function clampBackfillLimit(
  raw: unknown,
  max: number,
  fallback = HTTP_BACKFILL_DEFAULT_LIMIT,
): number {
  if (raw == null || raw === '') return fallback;
  const limitRaw = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(limitRaw)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(limitRaw) || fallback));
}

export function parseOptionalCount(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  return Number(raw);
}

export type BackfillHttpRequest = {
  mode: BackfillMode;
  limit: number;
  expectCount?: number;
  /** Set when the request must be refused before any wallet work. */
  refusal?: string;
};

/**
 * HTTPS input. Dry unless mode is "send" (any case). Limit defaults to 25
 * and is capped at 100. expectCount and expect_count are aliases; if more
 * than one value is present they must be the same integer.
 */
export function parseBackfillHttpInput(sources: {
  mode?: Array<string | null | undefined>;
  limit?: unknown[];
  expectCount?: unknown[];
}): BackfillHttpRequest {
  const modes = (sources.mode ?? []).filter(
    (value): value is string => value != null && String(value).trim() !== '',
  );
  const normalizedModes = modes.map((value) => backfillModeFromRaw(value));
  if (new Set(normalizedModes).size > 1) {
    return {
      mode: 'dry',
      limit: HTTP_BACKFILL_DEFAULT_LIMIT,
      refusal:
        'Refusing backfill: mode was provided more than once with different values',
    };
  }
  const mode = normalizedModes[0] ?? 'dry';

  const limits = (sources.limit ?? []).filter(
    (value) => value != null && value !== '',
  );
  const limitNumbers = limits.map((value) =>
    typeof value === 'number' ? value : Number(value),
  );
  if (limitNumbers.some((value) => !Number.isFinite(value))) {
    return {
      mode,
      limit: HTTP_BACKFILL_DEFAULT_LIMIT,
      refusal: 'Refusing backfill: limit must be a number from 1 to 100',
    };
  }
  const floored = limitNumbers.map((value) => Math.floor(value));
  if (new Set(floored).size > 1) {
    return {
      mode,
      limit: HTTP_BACKFILL_DEFAULT_LIMIT,
      refusal:
        'Refusing backfill: limit was provided more than once with different values',
    };
  }
  if (floored.some((value) => value < 1)) {
    return {
      mode,
      limit: HTTP_BACKFILL_DEFAULT_LIMIT,
      refusal: 'Refusing backfill: limit must be a number from 1 to 100',
    };
  }
  const limit =
    floored.length === 0
      ? HTTP_BACKFILL_DEFAULT_LIMIT
      : clampBackfillLimit(
          floored[0],
          HTTP_BACKFILL_MAX_LIMIT,
          HTTP_BACKFILL_DEFAULT_LIMIT,
        );

  const expects = (sources.expectCount ?? []).filter(
    (value) => value != null && value !== '',
  );
  const expectNumbers = expects.map((value) => Number(value));
  if (expectNumbers.some((value) => !Number.isInteger(value) || value < 0)) {
    return {
      mode,
      limit,
      refusal:
        'Refusing backfill: expectCount must be a non-negative integer matching the dry-run selected count',
    };
  }
  if (new Set(expectNumbers).size > 1) {
    return {
      mode,
      limit,
      refusal: 'Refusing backfill: expectCount and expect_count disagree',
    };
  }
  return {
    mode,
    limit,
    expectCount: expectNumbers.length ? expectNumbers[0] : undefined,
  };
}

/** Strip connection strings and credentials before an error is returned or logged. */
export function redactOperatorMessage(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]')
    .replace(/rediss?:\/\/\S+/gi, '[redacted]')
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[redacted]')
    .replace(/\b(?:bearer\s+)\S+/gi, '[redacted]')
    .replace(
      /\b(?:mnemonics?|seed phrases?|private[_-]?keys?|api[_-]?keys?|secrets?|passwords?)\b\s*[:=]?\s*\S+/gi,
      '[redacted]',
    )
    .slice(0, 400);
}

export function parseBackfillArgs(argv: string[]) {
  const read = (name: string) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  return {
    mode: backfillModeFromRaw(read('mode')),
    limit: clampBackfillLimit(read('limit'), CLI_BACKFILL_MAX_LIMIT, 25),
    expectCount: parseOptionalCount(read('expect-count')),
  };
}
