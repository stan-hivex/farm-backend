import { enrichAdminListItem } from './admin-response-utils';

describe('enrichAdminListItem', () => {
  it('adds username, user id, method, amount, status, and timestamp fields', () => {
    const item = enrichAdminListItem(
      {
        id: 'tx-1',
        transaction_reference: 'ref-1',
        transaction_type: 'deposit',
        status: 'PENDING',
        amount: 250,
        created_at: '2024-05-01T10:15:30.000Z',
        metadata: { user_id: 'user-1', payment_method: 'mobile' },
      },
      { id: 'user-1', username: 'alice' },
    );

    expect(item.user_id).toBe('user-1');
    expect(item.username).toBe('alice');
    expect(item.method).toBe('MOBILE');
    expect(item.amount).toBe(250);
    expect(item.status).toBe('pending');
    expect(item.date).toBe('2024-05-01');
    expect(item.time).toBe('10:15:30');
  });
});
