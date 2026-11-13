import {
  backfillCost,
  evaluateBackfillSend,
  fundMicroAlgos,
  parseBackfillArgs,
  parseBackfillHttpInput,
  redactOperatorMessage,
} from './backfill-wallets-policy';

describe('backfill wallet policy', () => {
  it('uses CHAIN_WALLET_FUND_MICROALGOS, defaulting to 0.31 ALGO', () => {
    expect(fundMicroAlgos({})).toBe(310_000n);
    expect(fundMicroAlgos({ CHAIN_WALLET_FUND_MICROALGOS: '500000' })).toBe(
      500_000n,
    );
    expect(fundMicroAlgos({ CHAIN_WALLET_FUND_MICROALGOS: 'nope' })).toBe(
      310_000n,
    );
    expect(backfillCost(3, 310_000n)).toBe(930_000n);
    expect(backfillCost(0, 310_000n)).toBe(0n);
  });

  it('parses dry by default and caps the batch', () => {
    expect(parseBackfillArgs([])).toEqual({
      mode: 'dry',
      limit: 25,
      expectCount: undefined,
    });
    expect(
      parseBackfillArgs(['--mode=send', '--limit=10', '--expect-count=10']),
    ).toEqual({ mode: 'send', limit: 10, expectCount: 10 });
    expect(parseBackfillArgs(['--limit=99999']).limit).toBe(500);
    expect(parseBackfillArgs(['--mode=execute']).mode).toBe('dry');
  });

  it('refuses send unless expect-count matches the selected batch', () => {
    expect(evaluateBackfillSend({ mode: 'dry', selected: 4 }).ok).toBe(true);
    expect(evaluateBackfillSend({ mode: 'send', selected: 4 }).ok).toBe(false);
    expect(
      evaluateBackfillSend({ mode: 'send', selected: 4, expectCount: 9 }),
    ).toEqual({
      ok: false,
      selected: 4,
      reason:
        'Refusing send: --expect-count 9 does not match dry-run selected count 4',
    });
    expect(
      evaluateBackfillSend({ mode: 'send', selected: 4, expectCount: 4 }).ok,
    ).toBe(true);
  });

  it('parses the HTTPS request with a dry default and a 1..100 cap', () => {
    expect(parseBackfillHttpInput({})).toEqual({
      mode: 'dry',
      limit: 25,
      expectCount: undefined,
    });
    expect(
      parseBackfillHttpInput({
        mode: ['send'],
        limit: ['4'],
        expectCount: ['4'],
      }),
    ).toEqual({ mode: 'send', limit: 4, expectCount: 4 });
    expect(
      parseBackfillHttpInput({
        mode: ['SEND'],
        limit: [4],
        expectCount: [4, '4'],
      }).mode,
    ).toBe('send');
    expect(parseBackfillHttpInput({ mode: ['execute'] }).mode).toBe('dry');
    expect(parseBackfillHttpInput({ limit: [1000] }).limit).toBe(100);
    expect(parseBackfillHttpInput({ limit: ['0'] }).refusal).toMatch(
      /1 to 100/,
    );
    expect(parseBackfillHttpInput({ limit: ['nope'] }).refusal).toMatch(
      /1 to 100/,
    );
    expect(parseBackfillHttpInput({ expectCount: [4, 5] }).refusal).toMatch(
      /disagree/,
    );
    expect(parseBackfillHttpInput({ mode: ['dry', 'send'] }).refusal).toMatch(
      /mode/,
    );
    expect(parseBackfillHttpInput({ limit: [4, '10'] }).refusal).toMatch(
      /limit/,
    );
  });

  it('redacts database URLs and credentials from operator errors', () => {
    const message = redactOperatorMessage(
      'connect postgres://farm:secret@db.internal/farm and redis://:pw@localhost:6379 password=hunter2 bearer abc.def',
    );
    expect(message).not.toMatch(/postgres:\/\/|redis:\/\/|hunter2|abc\.def/i);
    expect(message).toContain('[redacted]');
    expect(redactOperatorMessage('Refusing send: expect-count 4')).toBe(
      'Refusing send: expect-count 4',
    );
  });
});
