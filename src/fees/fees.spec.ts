import { computeFee, FEE_DEFAULTS, feeFor, ruleFor } from './fee-defaults';
import { FeesService } from './fees.service';

describe('fee schedule', () => {
  it('has the agreed defaults', () => {
    expect(FEE_DEFAULTS).toEqual({
      escrow_creation: 1.5,
      escrow_release: 1.5,
      withdrawal: 1.5,
      investment: 3,
      travel_commission: 5,
      merchant: 1,
      transfer: 0,
      project_listing: 15,
      received_chain: 0,
      agent_payment: 0,
    });
    expect(FEE_DEFAULTS.escrow_creation + FEE_DEFAULTS.escrow_release).toBe(3);
  });

  it('computes percent + flat with min and a 0 = no cap max', () => {
    const r = {
      key: 'merchant' as const,
      percent: 1,
      flat: 0,
      min: 0,
      max: 0,
      source: 'db' as const,
    };
    expect(computeFee(r, 1000)).toBe(10);
    expect(computeFee({ ...r, max: 5 }, 1000)).toBe(5);
    expect(computeFee({ ...r, min: 2 }, 50)).toBe(2);
    expect(computeFee({ ...r, flat: 1 }, 100)).toBe(2);
    expect(computeFee(r, -5)).toBe(0);
    expect(computeFee(r, 33.333333, 8)).toBe(0.33333333);
  });

  it('falls back to env override then default without a service', async () => {
    expect(await feeFor(null, 'withdrawal', 200)).toBe(3);
    process.env.FEE_WITHDRAWAL_PCT = '2';
    expect(await feeFor(null, 'withdrawal', 200)).toBe(4);
    process.env.FEE_WITHDRAWAL_PCT = 'junk';
    expect((await ruleFor(null, 'withdrawal')).percent).toBe(1.5);
    delete process.env.FEE_WITHDRAWAL_PCT;
  });

  it('uses the DB row when present, defaults otherwise, and caches', async () => {
    const prisma: any = {
      fee_configurations: {
        findMany: jest.fn().mockResolvedValue([
          {
            transaction_type: 'merchant',
            percentage_fee: 2,
            flat_fee: 0,
            minimum_fee: 0,
            maximum_fee: 0,
          },
        ]),
      },
    };
    const svc = new FeesService(prisma);
    expect(await svc.fee('merchant', 100)).toBe(2);
    expect(await svc.fee('investment', 100)).toBe(3);
    expect((await svc.rule('investment')).source).toBe('default');
    await svc.fee('merchant', 1);
    expect(prisma.fee_configurations.findMany).toHaveBeenCalledTimes(1);
    svc.invalidate();
    await svc.fee('merchant', 1);
    expect(prisma.fee_configurations.findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps working on defaults when the table is unavailable', async () => {
    const prisma: any = {
      fee_configurations: {
        findMany: jest.fn().mockRejectedValue(new Error('x')),
      },
    };
    const svc = new FeesService(prisma);
    expect(await svc.fee('escrow_creation', 100)).toBe(1.5);
  });

  it('public schedule never exposes wallet ids; quote validates input', async () => {
    const prisma: any = {
      fee_configurations: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new FeesService(prisma);
    const s = await svc.publicSchedule();
    expect(JSON.stringify(s)).not.toContain('destination_wallet_id');
    expect((await svc.quote('merchant', 250)).data.fee).toBe(2.5);
    await expect(svc.quote('nope', 1)).rejects.toThrow('Unknown');
    await expect(svc.quote('merchant', 0)).rejects.toThrow('positive');
  });
});
