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

  it('normalizes withdrawal fields and includes linked user details', () => {
    const item = enrichAdminListItem(
      {
        id: 'withdrawal-1',
        reference: 'withdrawal-ref-1',
        userId: 'user-2',
        method: 'mobile_money',
        status: 'PENDING',
        amount: 125,
        currency: 'KES',
        createdAt: '2024-05-02T11:16:17.000Z',
      },
      {
        id: 'user-2',
        username: 'bob',
        first_name: 'Bob',
        last_name: 'Example',
        email: 'bob@example.com',
      },
    );

    expect(item.user_id).toBe('user-2');
    expect(item.username).toBe('bob');
    expect(item.user_name).toBe('Bob Example');
    expect(item.user_email).toBe('bob@example.com');
    expect(item.transaction_reference).toBe('withdrawal-ref-1');
    expect(item.method).toBe('MOBILE_MONEY');
    expect(item.amount_display).toBe('125.00 KES');
    expect(item.status).toBe('pending');
    expect(item.date).toBe('2024-05-02');
    expect(item.time).toBe('11:16:17');
  });
});
