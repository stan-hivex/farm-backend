import { BadRequestException, ConflictException, ForbiddenException, GoneException } from '@nestjs/common';
import { MarketplaceService, presentProject } from './marketplace.service';
import { BusinessProjectsService, cleanProjectInput } from './business-projects.service';
import { ProjectReviewService } from './project-review.service';
import { RISK_DISCLOSURE_VERSION } from './project-rules';
import { ProjectsService } from '../projects/projects.service';
import { can } from '../business-ops/permissions';

const PID = '11111111-1111-1111-1111-111111111111';
const listed = { id: PID, project_name: 'Solar farm', status: 'listed', target_amount: 1000, raised_amount: 0, minimum_investment: 10, maximum_investment: null, roi_percent: 12, ends_at: null, business_id: 'b1' };

function marketMocks(over: any = {}) {
  const tx: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    transactions: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
    ledger_entries: { create: jest.fn() },
    user_investments: { create: jest.fn().mockResolvedValue({ id: 'i1', amount: 100, expected_roi: 5 }) },
    investment_projects: { findUnique: jest.fn().mockResolvedValue({ raised_amount: 100, target_amount: 1000 }), update: jest.fn() },
    ...over.tx,
  };
  const prisma: any = {
    investor_profiles: { findUnique: jest.fn().mockResolvedValue('profile' in over ? over.profile : { eligibility_status: 'eligible' }), upsert: jest.fn() },
    users: { findUnique: jest.fn().mockResolvedValue({ kyc_status: over.kyc ?? 'verified' }) },
    investment_projects: { findUnique: jest.fn().mockResolvedValue(over.project ?? listed) },
    user_investments: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: over.already ?? 0 } }) },
    wallets: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) },
    risk_disclosure_acceptances: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const auth: any = { verifyPin: jest.fn().mockResolvedValue(true) };
  const notif: any = { sendNotification: jest.fn().mockResolvedValue(undefined) };
  return { svc: new MarketplaceService(prisma, auth, notif), prisma, tx, auth };
}
const good = { amount: 100, pin: '1234', accept_risk: true, disclosure_version: RISK_DISCLOSURE_VERSION };

describe('Phase 4 – no guaranteed returns', () => {
  it('strips ROI fields and maps legacy open to listed', () => {
    const p = presentProject({ ...listed, status: 'open', expected_roi: 3, roi_percentage: 9 });
    expect(p).not.toHaveProperty('roi_percent');
    expect(p).not.toHaveProperty('roi_percentage');
    expect(p).not.toHaveProperty('expected_roi');
    expect(p.status).toBe('listed');
  });
  it('invest response has no expected_roi', async () => {
    const { svc } = marketMocks();
    const r = await svc.invest('u1', PID, good);
    expect(r.data).not.toHaveProperty('expected_roi');
  });
});

describe('Phase 4 – invest gates', () => {
  const OLD = process.env.INVESTOR_ELIGIBILITY_MODE;
  afterEach(() => (process.env.INVESTOR_ELIGIBILITY_MODE = OLD));

  it('blocks investors who are not eligible (manual mode, KYC alone is not enough)', async () => {
    delete process.env.INVESTOR_ELIGIBILITY_MODE;
    const { svc, auth, prisma } = marketMocks({ profile: null });
    await expect(svc.invest('u1', PID, good)).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.verifyPin).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('kyc mode lets KYC-verified users invest, but not restricted ones', async () => {
    process.env.INVESTOR_ELIGIBILITY_MODE = 'kyc';
    expect((await marketMocks({ profile: null }).svc.eligibility('u1')).data.eligible).toBe(true);
    expect((await marketMocks({ profile: { eligibility_status: 'restricted' } }).svc.eligibility('u1')).data.eligible).toBe(false);
    expect((await marketMocks({ profile: null, kyc: 'pending' }).svc.eligibility('u1')).data.eligible).toBe(false);
  });
  it('requires accepting the current risk disclosure', async () => {
    const { svc, prisma } = marketMocks();
    await expect(svc.invest('u1', PID, { ...good, accept_risk: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.invest('u1', PID, { ...good, disclosure_version: 'old' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.invest('u1', PID, { amount: 100, pin: '1234' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects projects that are not listed', async () => {
    const { svc } = marketMocks({ project: { ...listed, status: 'approved' } });
    await expect(svc.invest('u1', PID, good)).rejects.toThrow('not open');
  });
  it('enforces per-investor maximum', async () => {
    const { svc } = marketMocks({ project: { ...listed, maximum_investment: 150 }, already: 100 });
    await expect(svc.invest('u1', PID, good)).rejects.toThrow('Maximum');
  });
  it('never oversubscribes: capacity claim failure aborts before debit', async () => {
    const { svc, tx } = marketMocks({ tx: { $executeRaw: jest.fn().mockResolvedValueOnce(0) } });
    await expect(svc.invest('u1', PID, good)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.user_investments.create).not.toHaveBeenCalled();
  });
  it('insufficient balance aborts (whole transaction rolls back)', async () => {
    const { svc, tx } = marketMocks({ tx: { $executeRaw: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0) } });
    await expect(svc.invest('u1', PID, good)).rejects.toThrow('Insufficient');
    expect(tx.user_investments.create).not.toHaveBeenCalled();
  });
  it('happy path records disclosure, debits atomically and stores a committed investment', async () => {
    const { svc, tx, prisma } = marketMocks();
    await svc.invest('u1', PID, good, '1.2.3.4');
    expect(prisma.risk_disclosure_acceptances.create).toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.user_investments.create.mock.calls[0][0].data).toMatchObject({ status: 'committed', disclosure_acceptance_id: 'r1' });
  });
});

describe('Phase 4 – business projects', () => {
  it('validates input and never spreads unknown fields', () => {
    expect(() => cleanProjectInput({ sector: 'casino' } as any)).toThrow();
    expect(() => cleanProjectInput({ target_amount: -1 })).toThrow();
    const d = cleanProjectInput({ project_name: ' Farm ', sector: 'agriculture', status: 'listed', raised_amount: 9 } as any);
    expect(d).toEqual({ project_name: 'Farm', sector: 'agriculture', category: 'agriculture' });
  });

  function bizMocks(project: any) {
    const prisma: any = {
      investment_projects: { findFirst: jest.fn().mockResolvedValue(project), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      project_reviews: { create: jest.fn() },
    };
    const access: any = { resolve: jest.fn().mockResolvedValue({ business: { id: 'b1' }, role: 'owner' }) };
    return { svc: new BusinessProjectsService(prisma, access), prisma, access };
  }
  const full = {
    ...listed, status: 'draft', sector: 'energy', summary: 's', description: 'd', use_of_funds: 'u', risk_factors: 'r',
    instrument_type: 'equity', location: 'Nakuru', documents: [{ kind: 'business_plan' }, { kind: 'financial_statements' }], updates: [], reviews: [],
  };
  it('submit requires the mandatory documents', async () => {
    const { svc } = bizMocks({ ...full, documents: [{ kind: 'business_plan' }] });
    await expect(svc.submit('u', PID)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('submit moves to under review and logs it; never auto-approves', async () => {
    const { svc, prisma } = bizMocks(full);
    const r = await svc.submit('u', PID);
    expect(r.data.status).toBe('submitted');
    expect(prisma.investment_projects.updateMany.mock.calls[0][0].data.status).toBe('submitted');
    expect(prisma.project_reviews.create).toHaveBeenCalled();
  });
  it('requires projects:manage (KYB-approved business resolved by access service)', async () => {
    const { svc, access } = bizMocks(full);
    await svc.submit('u', PID);
    expect(access.resolve).toHaveBeenCalledWith('u', 'projects:manage');
    expect(can('finance', 'projects:manage')).toBe(false);
    expect(can('owner', 'projects:manage')).toBe(true);
  });
});

describe('Phase 4 – admin review', () => {
  function revMocks(p: any) {
    const prisma: any = {
      investment_projects: { findUnique: jest.fn().mockResolvedValue(p), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      project_reviews: { create: jest.fn() },
      user_investments: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { svc: new ProjectReviewService(prisma), prisma };
  }
  it('cannot list a project that was not approved', async () => {
    const { svc } = revMocks({ ...listed, status: 'submitted', business: { status: 'approved' } });
    await expect(svc.transition('a', PID, 'list')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('cannot approve when the business failed KYB', async () => {
    const { svc } = revMocks({ ...listed, status: 'submitted', business: { status: 'under_review' } });
    await expect(svc.transition('a', PID, 'approve')).rejects.toThrow('KYB');
  });
  it('reject needs notes; approve writes an audit row', async () => {
    const { svc, prisma } = revMocks({ ...listed, status: 'submitted', business: { status: 'approved' } });
    await expect(svc.transition('a', PID, 'reject')).rejects.toThrow('Notes');
    await svc.transition('a', PID, 'approve');
    expect(prisma.project_reviews.create.mock.calls[0][0].data).toMatchObject({ action: 'approve', to_status: 'approved' });
  });
});

describe('Phase 4 – legacy projects API', () => {
  it('create and invest are gone (old invest never charged the wallet)', () => {
    const svc = new ProjectsService({} as any);
    expect(() => svc.create({}, 'u')).toThrow(GoneException);
    expect(() => svc.invest('u', {}, '')).toThrow(GoneException);
  });
});
