import { WebhookService } from './webhook.service';

describe('WebhookService IvoryPay webhook processing', () => {
  it('marks a failed crypto payout as failed and releases the withdrawal funds', async () => {
    const transaction = {
      id: 'transaction-id',
      transaction_reference: 'withdrawal-reference',
      transaction_type: 'withdrawal',
      status: 'pending',
      amount: 100,
      metadata: {},
    };
    const rejectWithdrawal = jest.fn().mockResolvedValue(true);
    const failDeposit = jest.fn().mockResolvedValue(true);
    const service = new WebhookService(
      {
        $transaction: jest.fn((callback) =>
          callback({ transactions: { update: jest.fn() } }),
        ),
      } as any,
      { failDeposit } as any,
      { rejectWithdrawal } as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockReturnValue(60000) } as any,
      {} as any,
      { extractProviderIdentifiers: jest.fn().mockReturnValue({}) } as any,
      {} as any,
    );

    jest.spyOn(service as any, 'resolveIvorypayInternalReference').mockResolvedValue('withdrawal-reference');
    jest.spyOn(service as any, 'resolveIvorypayDepositAndTransaction').mockResolvedValue({
      transaction,
      deposit: null,
      resolvedReference: 'withdrawal-reference',
      matchedReference: 'withdrawal-reference',
    });
    jest.spyOn(service as any, 'acquireLock').mockResolvedValue(true);
    jest.spyOn(service as any, 'releaseLock').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'emitWithdrawalUpdate').mockResolvedValue(undefined);

    await service.handleIvorypayWebhookProcessing({
      event: 'cryptoPayout.failed',
      data: {
        reference: 'withdrawal-reference',
        status: 'FAILED',
        failureReason: 'Provider rejected payout',
      },
    });

    expect(rejectWithdrawal).toHaveBeenCalledWith(
      'withdrawal-reference',
      'Provider rejected payout',
    );
    expect(rejectWithdrawal).toHaveBeenCalledTimes(1);
    expect(failDeposit).not.toHaveBeenCalled();
  });
});
