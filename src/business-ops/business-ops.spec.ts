import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { assignableRoles, can, permissionsFor } from './permissions';
import { BusinessAccessService } from './business-access.service';
import { BusinessCommerceService } from './business-commerce.service';
import { BusinessFinanceService, txStatusLabel } from './business-finance.service';
import { BusinessEscrowService } from './business-escrow.service';
import { BusinessTeamService } from './business-team.service';
import { detectDocumentKind } from '../uploads/uploads.controller';

const biz = { id: 'b1', owner_user_id: 'owner', merchant_id: 'm1', status: 'approved', legal_name: 'Acme', trading_name: null };

describe('permissions', () => {
  it('limits payouts to owner and finance', () => {
    expect(can('owner', 'payouts:create')).toBe(true);
    expect(can('finance', 'payouts:create')).toBe(true);
    expect(can('admin', 'payouts:create')).toBe(false);
    expect(can('developer', 'payouts:create')).toBe(false);
  });
  it('developer cannot see money', () => {
    expect(permissionsFor('developer')).not.toContain('wallet:read');
    expect(permissionsFor('developer')).not.toContain('transactions:read');
  });
  it('only owner can assign admin', () => {
    expect(assignableRoles('owner')).toContain('admin');
    expect(assignableRoles('admin')).not.toContain('admin');
    expect(assignableRoles('finance')).toEqual([]);
  });
});

describe('BusinessAccessService', () => {
  const prisma: any = { businesses: { findUnique: jest.fn() }, business_members: { findFirst: jest.fn() } };
  const svc = new BusinessAccessService(prisma);
  beforeEach(() => jest.resetAllMocks());

  it('resolves the owner of an approved business', async () => {
    prisma.businesses.findUnique.mockResolvedValue(biz);
    await expect(svc.resolve('owner', 'payouts:create')).resolves.toMatchObject({ role: 'owner' });
  });
  it('ignores an owned business that is not approved and falls back to membership', async () => {
    prisma.businesses.findUnique.mockResolvedValue({ ...biz, status: 'under_review' });
    prisma.business_members.findFirst.mockResolvedValue(null);
    await expect(svc.resolve('owner')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects a member without the permission', async () => {
    prisma.businesses.findUnique.mockResolvedValue(null);
    prisma.business_members.findFirst.mockResolvedValue({ role: 'developer', business: biz });
    await expect(svc.resolve('dev', 'wallet:read')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.resolve('dev', 'links:read')).resolves.toMatchObject({ role: 'developer' });
  });
});

function makeCommerce() {
  const prisma: any = {
    business_invoices: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    business_payment_links: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    businesses: { findUnique: jest.fn().mockResolvedValue({ status: 'approved', owner_user_id: 'owner', trading_name: 'Acme' }) },
    business_payments: { create: jest.fn() },
  };
  const finance: any = { walletFor: jest.fn().mockResolvedValue({ wallet_address: 'WAL-OWNER' }) };
  const wallets: any = { sendFunds: jest.fn().mockResolvedValue({ data: { transaction_reference: 'TX1', fee: 0 } }) };
  const svc = new BusinessCommerceService(prisma, {} as any, finance, wallets);
  return { prisma, wallets, svc };
}

describe('BusinessCommerceService payments', () => {
  const invoice = { id: 'i1', business_id: 'b1', invoice_number: 'INV-1', status: 'sent', total: 50 };

  it('pays an invoice through sendFunds to the business wallet and records it', async () => {
    const { prisma, wallets, svc } = makeCommerce();
    prisma.business_invoices.findUnique.mockResolvedValue(invoice);
    const res = await svc.payInvoice('payer', 'INV-1', '1234', '1.1.1.1');
    expect(wallets.sendFunds).toHaveBeenCalledWith('payer', expect.objectContaining({ recipient_identifier: 'WAL-OWNER', amount: 50, pin: '1234' }), '1.1.1.1');
    expect(prisma.business_payments.create).toHaveBeenCalled();
    expect(res.data.status).toBe('successful');
  });
  it('refuses a second payment when the claim fails', async () => {
    const { prisma, wallets, svc } = makeCommerce();
    prisma.business_invoices.findUnique.mockResolvedValue(invoice);
    prisma.business_invoices.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.payInvoice('payer', 'INV-1', '1234', 'ip')).rejects.toBeInstanceOf(BadRequestException);
    expect(wallets.sendFunds).not.toHaveBeenCalled();
  });
  it('restores the invoice status if the transfer fails', async () => {
    const { prisma, wallets, svc } = makeCommerce();
    prisma.business_invoices.findUnique.mockResolvedValue(invoice);
    wallets.sendFunds.mockRejectedValue(new BadRequestException('Insufficient balance'));
    await expect(svc.payInvoice('payer', 'INV-1', '1234', 'ip')).rejects.toThrow('Insufficient balance');
    expect(prisma.business_invoices.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { status: 'sent', paid_at: null } });
  });
  it('blocks the owner paying their own invoice and draft invoices', async () => {
    const { prisma, svc } = makeCommerce();
    prisma.business_invoices.findUnique.mockResolvedValue(invoice);
    await expect(svc.payInvoice('owner', 'INV-1', '1', 'ip')).rejects.toBeInstanceOf(ForbiddenException);
    prisma.business_invoices.findUnique.mockResolvedValue({ ...invoice, status: 'draft' });
    await expect(svc.payInvoice('payer', 'INV-1', '1', 'ip')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects expired or exhausted payment links and releases the reserved use on failure', async () => {
    const { prisma, wallets, svc } = makeCommerce();
    prisma.business_payment_links.findUnique.mockResolvedValue({ id: 'l1', business_id: 'b1', is_active: true, expires_at: new Date(Date.now() - 1000), amount: 10, use_count: 0 });
    await expect(svc.payLink('payer', 'c', '1', 'ip')).rejects.toBeInstanceOf(GoneException);
    prisma.business_payment_links.findUnique.mockResolvedValue({ id: 'l1', business_id: 'b1', is_active: true, expires_at: null, amount: 10, use_count: 0, max_uses: 1, title: 'T' });
    wallets.sendFunds.mockRejectedValue(new Error('boom'));
    await expect(svc.payLink('payer', 'c', '1', 'ip')).rejects.toThrow('boom');
    expect(prisma.business_payment_links.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { use_count: { decrement: 1 } } });
  });
});

describe('BusinessFinanceService', () => {
  it('maps stored statuses to business labels', () => {
    expect(txStatusLabel('completed')).toBe('successful');
    expect(txStatusLabel('reversed')).toBe('refunded');
    expect(txStatusLabel('failed')).toBe('failed');
  });
  it('rejects unknown analytics ranges and payouts above available balance', async () => {
    const prisma: any = {
      merchants: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', status: 'approved' }) },
      wallets: { findFirst: jest.fn().mockResolvedValue({ balance: 100, locked_balance: 0, is_frozen: false }) },
      merchant_payouts: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 80 } }), create: jest.fn() },
    };
    const access: any = { resolve: jest.fn().mockResolvedValue({ role: 'finance', business: biz }) };
    const auth: any = { verifyPin: jest.fn() };
    const svc = new BusinessFinanceService(prisma, access, auth);
    await expect(svc.analytics('u', '2w')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.requestPayout('u', { amount: 50, pin: '1', payout_method: 'bank', account_name: 'a', account_number: '1' })).rejects.toThrow('Insufficient available balance');
    expect(auth.verifyPin).toHaveBeenCalledWith('u', '1');
    expect(prisma.merchant_payouts.create).not.toHaveBeenCalled();
  });
});

describe('BusinessTeamService', () => {
  it('admin cannot add another admin', async () => {
    const access: any = { resolve: jest.fn().mockResolvedValue({ role: 'admin', business: biz }) };
    const svc = new BusinessTeamService({} as any, access, { verifyPin: jest.fn() } as any);
    await expect(svc.add('a', { identifier: 'x', role: 'admin', pin: '1' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('BusinessEscrowService', () => {
  it('requires milestones to sum to the amount', async () => {
    const prisma: any = { users: { findFirst: jest.fn().mockResolvedValue({ id: 'buyer' }) } };
    const access: any = { resolve: jest.fn().mockResolvedValue({ role: 'owner', business: biz }) };
    const svc = new BusinessEscrowService(prisma, access, {} as any);
    await expect(svc.create('owner', { buyer_identifier: 'b', title: 't', amount: 100, milestones: [{ title: 'a', amount: 40 }] })).rejects.toThrow('Milestone amounts');
  });
  it('funds through EscrowService and rolls back the claim on failure', async () => {
    const prisma: any = {
      business_escrows: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'e1', buyer_user_id: 'buyer', status: 'awaiting_payment', amount: 20, title: 't', business: biz }),
        update: jest.fn(),
      },
      users: { findUnique: jest.fn().mockResolvedValue({ username: 'acme' }) },
    };
    const escrow: any = { create: jest.fn().mockRejectedValue(new BadRequestException('Insufficient balance')) };
    const svc = new BusinessEscrowService(prisma, {} as any, escrow);
    await expect(svc.fund('buyer', 'e1', '1234')).rejects.toThrow('Insufficient balance');
    expect(escrow.create).toHaveBeenCalledWith('buyer', expect.objectContaining({ seller_identifier: 'acme', amount: 20, pin: '1234' }));
    expect(prisma.business_escrows.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { status: 'awaiting_payment' } });
  });
});

describe('detectDocumentKind', () => {
  it('detects pdf and images by magic bytes', () => {
    expect(detectDocumentKind(Buffer.from('%PDF-1.7 xxxxxxxx'))).toBe('pdf');
    expect(detectDocumentKind(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image');
    expect(detectDocumentKind(Buffer.from('MZ this is an exe file'))).toBeNull();
  });
});
