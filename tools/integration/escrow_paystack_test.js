/*
  Simple integration tester for escrow create + release that triggers Paystack remittance.

  Usage:
    Set environment variables and run:
      node escrow_paystack_test.js

  Environment variables (recommended):
    BASE_URL - e.g. http://localhost:3000/api/v1  (include /api/v1 if your app uses versioning)
    TEST_BUYER_TOKEN - Bearer token for buyer user used to create escrow
    SELLER_IDENTIFIER - seller username or phone (string)
    AMOUNT - escrow amount (number)
    PIN - buyer PIN (4-6 digits) used by API
    PAYSTACK_SECRET_KEY - optional; if omitted the PaystackService returns a mock response

  Note: Running against a real staging Paystack account requires valid PAYSTACK_SECRET_KEY
  and a running backend connected to the database. Running without a real key will still
  exercise the endpoints but Paystack calls will be mocked by the server.
*/

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = process.env.TEST_BUYER_TOKEN || '';
const SELLER = process.env.SELLER_IDENTIFIER || process.env.SELLER || 'test_seller';
const AMOUNT = Number(process.env.AMOUNT || '10');
const PIN = process.env.PIN || '0000';

if (!TOKEN) {
  console.warn('Warning: TEST_BUYER_TOKEN not set. Requests will likely be unauthorized.');
}

async function createEscrow() {
  console.log(`Creating escrow: seller=${SELLER} amount=${AMOUNT}`);
  const url = `${BASE_URL}/escrow`;
  try {
    const res = await axios.post(url, {
      seller_identifier: SELLER,
      amount: AMOUNT,
      title: 'Integration test escrow',
      description: 'Integration test created by script',
      pin: PIN,
    }, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    console.log('Create response status:', res.status);
    console.log('Body:', JSON.stringify(res.data, null, 2));
    return res.data?.data;
  } catch (e) {
    console.error('Create escrow failed:', e.response?.status, e.response?.data || e.message);
    throw e;
  }
}

async function releaseEscrow(escrowId) {
  console.log(`Releasing escrow ${escrowId}`);
  const url = `${BASE_URL}/escrow/${escrowId}/release`;
  try {
    const res = await axios.post(url, {}, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 30000,
    });
    console.log('Release response status:', res.status);
    console.log('Body:', JSON.stringify(res.data, null, 2));
    return res.data;
  } catch (e) {
    console.error('Release escrow failed:', e.response?.status, e.response?.data || e.message);
    throw e;
  }
}

(async () => {
  try {
    const escrow = await createEscrow();
    if (!escrow || !escrow.id) {
      console.error('No escrow id found in create response. Aborting.');
      process.exit(2);
    }

    console.log('Waiting 2s before release...');
    await new Promise((r) => setTimeout(r, 2000));

    await releaseEscrow(escrow.id);

    console.log('\nIntegration flow completed.\n');
    console.log('Check backend logs and Paystack dashboard/webhook receipts for transfer details.');
  } catch (err) {
    console.error('Integration test failed:', err.message || err);
    process.exit(1);
  }
})();
