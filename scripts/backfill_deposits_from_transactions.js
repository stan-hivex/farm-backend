#!/usr/bin/env node
// Backfill script: populate Deposit provider columns from transactions.metadata
// Usage: node scripts/backfill_deposits_from_transactions.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting backfill of Deposit fields from transactions.metadata');
  const txs = await prisma.transactions.findMany({
    where: { transaction_type: 'deposit', metadata: { not: null } },
    select: { id: true, transaction_reference: true, metadata: true },
  });

  console.log(`Found ${txs.length} deposit transactions with metadata`);

  let updated = 0;
  for (const tx of txs) {
    try {
      const meta = tx.metadata || {};
      const ref = tx.transaction_reference;
      if (!ref) continue;

      const deposit = await prisma.deposit.findFirst({ where: { reference: ref } });
      if (!deposit) continue;

      const payload = meta.providerPayload ?? meta.provider_payload ?? null;
      const providerTransactionId = meta.provider_ref ?? meta.provider_transaction_id ?? meta.providerTransactionId ?? meta.transaction_id ?? meta.tx_ref ?? meta.trxref ?? null;
      const providerReference = meta.provider_reference ?? null;
      const checkoutId = meta.provider_checkout_id ?? meta.checkout_id ?? null;
      const paymentReference = meta.payment_reference ?? meta.reference ?? null;

      const updateData = {};
      if (providerTransactionId && !deposit.providerTransactionId) updateData.providerTransactionId = providerTransactionId;
      if (providerReference && !deposit.providerReference) updateData.providerReference = providerReference;
      if (checkoutId && !deposit.checkoutId) updateData.checkoutId = checkoutId;
      if (paymentReference && !deposit.paymentReference) updateData.paymentReference = paymentReference;
      if (payload && !deposit.providerPayload) updateData.providerPayload = payload;

      if (Object.keys(updateData).length > 0) {
        await prisma.deposit.update({ where: { id: deposit.id }, data: updateData });
        updated++;
        console.log(`Updated deposit ${ref} with ${Object.keys(updateData).join(', ')}`);
      }
    } catch (e) {
      console.error('Failed to process transaction', tx.transaction_reference, e);
    }
  }

  console.log(`Backfill complete. Updated ${updated} deposits.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
