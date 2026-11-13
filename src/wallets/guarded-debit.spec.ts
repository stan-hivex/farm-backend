import { BadRequestException } from '@nestjs/common';
import { debitAvailable, debitLocked } from './guarded-debit';

describe('guarded debit', () => {
  it('debits only when the conditional update matches one row', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };
    await debitAvailable(tx, '11111111-1111-4111-8111-111111111111', 10);
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('reports insufficient balance when the row is not updated', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(0) };
    await expect(
      debitAvailable(tx, '11111111-1111-4111-8111-111111111111', 10),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      debitLocked(tx, '11111111-1111-4111-8111-111111111111', 10),
    ).rejects.toThrow('Insufficient balance');
  });
});
