import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const platformAddress = process.env.PLATFORM_WALLET_ADDRESS || 'PLATFORM_MAIN_WALLET';

  // Ensure a single active platform wallet exists
  const existing = await prisma.wallets.findUnique({ where: { wallet_address: platformAddress } });

  if (existing) {
    console.log('Platform wallet already exists:', platformAddress);
    // Ensure it is marked active and has correct type
    await prisma.wallets.update({
      where: { wallet_address: platformAddress },
      data: { wallet_type: 'platform', is_active: true },
    });
    return;
  }

  const created = await prisma.wallets.create({
    data: {
      wallet_address: platformAddress,
      wallet_name: 'Platform Wallet',
      wallet_type: 'platform',
      balance: 0,
      is_active: true,
    },
  });

  console.log('Created platform wallet:', created.wallet_address);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
