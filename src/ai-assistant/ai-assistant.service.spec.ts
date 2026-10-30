import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { AiProvider } from './ai-provider';
import { AiToolsService } from './ai-tools.service';

const U = 'user-1';
function mkPrisma(perm: any = null, committed = 0) {
  const store: any = { req: null };
  return {
    store,
    ai_spend_permissions: { findUnique: jest.fn().mockResolvedValue(perm), upsert: jest.fn() },
    ai_action_requests: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: committed } }),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'req-1', created_at: new Date(), ...data })),
      findFirst: jest.fn().mockImplementation(({ where }) => (store.req && where.user_id === store.req.user_id && where.id === store.req.id ? store.req : null)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ai_audit_log: { create: jest.fn(), findMany: jest.fn() },
    ai_messages: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(({ data }) => ({ id: 'm', ...data })) },
    ai_conversations: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'c1' }), update: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  } as any;
}
const cfg = (env: Record<string, string>) => ({ get: (k: string) => env[k] }) as any;
const ON = { AI_ASSISTANT_ENABLED: 'true', AI_API_KEY: 'k' };
const PERM = { enabled: true, revoked_at: null, per_tx_cap: 1000, daily_cap: 2000, allowed_actions: ['send_farm'] };

function mk(prisma: any, env = ON, provider?: any, wallets?: any) {
  const p = provider ?? new AiProvider(cfg(env));
  return new AiAssistantService(prisma, p, new AiToolsService(prisma), wallets ?? { sendFunds: jest.fn() }, cfg(env));
}

describe('AiProvider', () => {
  it('is off unless enabled flag and all settings are present', () => {
    expect(new AiProvider(cfg({})).isConfigured()).toBe(false);
    expect(new AiProvider(cfg({ ...ON, AI_API_KEY: '' })).isConfigured()).toBe(false);
    expect(new AiProvider(cfg({ ...ON, AI_ASSISTANT_ENABLED: 'false' })).isConfigured()).toBe(false);
    expect(new AiProvider(cfg(ON)).isConfigured()).toBe(true);
  });
});

describe('AiAssistantService', () => {
  it('chat returns 503 when not configured', async () => {
    await expect(mk(mkPrisma(), {} as any).chat(U, 'hi')).rejects.toBeInstanceOf(HttpException);
  });

  it('enforces the daily message limit', async () => {
    const pr = mkPrisma();
    pr.ai_messages.count.mockResolvedValue(50);
    await expect(mk(pr).chat(U, 'hi')).rejects.toThrow('limit');
  });

  it('runs tools scoped to the caller and returns the reply', async () => {
    const pr = mkPrisma();
    pr.wallets = { findFirst: jest.fn().mockResolvedValue({ currency: 'FARM', balance: 500, locked_balance: 0, is_frozen: false }) };
    const provider = { isConfigured: () => true, complete: jest.fn()
      .mockResolvedValueOnce({ role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_wallet', arguments: '{"user_id":"someone-else"}' } }] })
      .mockResolvedValueOnce({ role: 'assistant', content: 'You have 500 FARM.' }) };
    const out = await mk(pr, ON, provider).chat(U, 'balance?');
    expect(pr.wallets.findFirst).toHaveBeenCalledWith({ where: { user_id: U, is_active: true } });
    expect(out.message.content).toBe('You have 500 FARM.');
    const toolMsg = provider.complete.mock.calls[1][0].find((m: any) => m.role === 'tool');
    expect(JSON.parse(toolMsg.content).available).toBe(500);
  });

  it('propose_payment via chat only creates a pending request', async () => {
    const pr = mkPrisma(PERM);
    const wallets = { sendFunds: jest.fn() };
    const provider = { isConfigured: () => true, complete: jest.fn()
      .mockResolvedValueOnce({ role: 'assistant', content: null, tool_calls: [{ id: 't', type: 'function', function: { name: 'propose_payment', arguments: '{"recipient_identifier":"jane","amount":100}' } }] })
      .mockResolvedValueOnce({ role: 'assistant', content: 'Please confirm in the app.' }) };
    const out = await mk(pr, ON, provider, wallets).chat(U, 'send jane 100');
    expect(out.pending_actions).toHaveLength(1);
    expect(wallets.sendFunds).not.toHaveBeenCalled();
  });

  it.each([
    ['no permissions', null, 10, 0],
    ['disabled', { ...PERM, enabled: false }, 10, 0],
    ['revoked', { ...PERM, revoked_at: new Date() }, 10, 0],
    ['not allowlisted', { ...PERM, allowed_actions: [] }, 10, 0],
    ['over per-tx cap', PERM, 1001, 0],
    ['over daily cap', PERM, 600, 1500],
  ])('rejects proposals when %s', async (_n, perm, amount, committed) => {
    await expect(mk(mkPrisma(perm, committed)).proposePayment(U, { recipient_identifier: 'jane', amount })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates permission updates', async () => {
    const s = mk(mkPrisma());
    await expect(s.updatePermissions(U, { enabled: true, per_tx_cap: 10, daily_cap: 5, allowed_actions: ['send_farm'] })).rejects.toThrow();
    await expect(s.updatePermissions(U, { enabled: true, per_tx_cap: 1, daily_cap: 5, allowed_actions: ['approve_business'] })).rejects.toThrow('Unknown action');
  });

  it('confirm requires the owner, executes via WalletsService with the PIN, and audits', async () => {
    const pr = mkPrisma(PERM);
    pr.store.req = { id: 'req-1', user_id: U, status: 'pending', amount: 100, recipient_identifier: 'jane', description: null, expires_at: new Date(Date.now() + 60000), created_at: new Date() };
    const wallets = { sendFunds: jest.fn().mockResolvedValue({ data: { transaction_reference: 'TX1' } }) };
    const s = mk(pr, ON, undefined, wallets);
    await expect(s.confirmAction('other', 'req-1', '1234', '')).rejects.toBeInstanceOf(NotFoundException);
    const r = await s.confirmAction(U, 'req-1', '1234', '1.1.1.1');
    expect(wallets.sendFunds).toHaveBeenCalledWith(U, expect.objectContaining({ recipient_identifier: 'jane', amount: 100, pin: '1234' }), '1.1.1.1');
    expect(wallets.sendFunds.mock.calls[0][1].biometric_auth).toBeUndefined();
    expect(r).toEqual({ id: 'req-1', status: 'executed', transaction_ref: 'TX1' });
    expect(pr.ai_audit_log.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ event: 'action_executed' }) }));
  });

  it('confirm re-checks caps and puts request back to pending on failure', async () => {
    const pr = mkPrisma({ ...PERM, enabled: false });
    pr.store.req = { id: 'req-1', user_id: U, status: 'pending', amount: 100, recipient_identifier: 'jane', expires_at: new Date(Date.now() + 60000), created_at: new Date() };
    await expect(mk(pr).confirmAction(U, 'req-1', '1234', '')).rejects.toBeInstanceOf(ForbiddenException);
    const pr2 = mkPrisma(PERM);
    pr2.store.req = { ...pr.store.req };
    const wallets = { sendFunds: jest.fn().mockRejectedValue(new Error('Invalid PIN')) };
    await expect(mk(pr2, ON, undefined, wallets).confirmAction(U, 'req-1', '0000', '')).rejects.toThrow('Invalid PIN');
    expect(pr2.ai_action_requests.update).toHaveBeenCalledWith({ where: { id: 'req-1' }, data: { status: 'pending', failure_reason: 'Invalid PIN' } });
  });

  it('revoke disables and cancels pending requests', async () => {
    const pr = mkPrisma();
    await mk(pr).revokePermissions(U);
    expect(pr.ai_action_requests.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: U, status: 'pending' } }));
  });
});
