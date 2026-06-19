const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    const failedWithdrawals = await prisma.withdrawal.findMany({
      where: { status: 'FAILED' },
      select: { reference: true },
    });

    const references = failedWithdrawals.map((w) => w.reference);
    if (references.length === 0) {
      console.log('No failed withdrawals found. Nothing to delete.');
      return;
    }

    const transactionDelete = await prisma.transactions.deleteMany({
      where: {
        transaction_type: 'withdrawal',
        transaction_reference: { in: references },
      },
    });

    const withdrawalDelete = await prisma.withdrawal.deleteMany({
      where: { reference: { in: references } },
    });

    console.log(`Deleted ${transactionDelete.count} failed withdrawal transaction(s)`);
    console.log(`Deleted ${withdrawalDelete.count} failed withdrawal record(s)`);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();