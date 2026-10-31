import algosdk from 'algosdk';
import { X402Service, PaymentPayload } from './x402.service';
import { isPublicIp } from './safe-fetch';
import { toUnits, fromUnits } from './x402-config';

const GH = Buffer.from(
  'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
  'base64',
);
const NET = 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe';
const FARM = 3759208862n;
const payer = algosdk.generateAccount();
const biz = algosdk.generateAccount();
const fee = algosdk.generateAccount();
const sp = (f = 0n) => ({
  fee: f,
  flatFee: true,
  firstValid: 1000n,
  lastValid: 2000n,
  genesisHash: GH,
  genesisID: 'testnet-v1.0',
  minFee: 1000n,
});
const enc = (b: Uint8Array) => Buffer.from(b).toString('base64');

function axfer(
  o: Partial<{ amount: bigint; to: string; asset: bigint; close: string }> = {},
) {
  return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: payer.addr,
    receiver: o.to ?? biz.addr.toString(),
    amount: o.amount ?? 500n,
    assetIndex: o.asset ?? FARM,
    closeRemainderTo: o.close,
    suggestedParams: sp(1000n),
  });
}
function req(extra: any = {}) {
  return {
    scheme: 'exact',
    network: NET,
    amount: '500',
    asset: FARM.toString(),
    payTo: biz.addr.toString(),
    maxTimeoutSeconds: 120,
    extra,
  };
}
function payload(
  group: string[],
  idx = group.length - 1,
  r = req(),
): PaymentPayload {
  return {
    x402Version: 2,
    accepted: r,
    payload: { paymentGroup: group, paymentIndex: idx },
  };
}
function single(t = axfer()) {
  return [enc(t.signTxn(payer.sk))];
}
function sponsored(feeAmt = 2000n, mutate?: (f: algosdk.Transaction) => void) {
  const f = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: fee.addr,
    receiver: fee.addr,
    amount: 0n,
    suggestedParams: sp(feeAmt),
  });
  const t = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: payer.addr,
    receiver: biz.addr,
    amount: 500n,
    assetIndex: FARM,
    suggestedParams: sp(0n),
  });
  mutate?.(f);
  algosdk.assignGroupID([f, t]);
  return [
    enc(algosdk.encodeMsgpack(new algosdk.SignedTransaction({ txn: f }))),
    enc(t.signTxn(payer.sk)),
  ];
}

const ENV = {
  X402_ENABLED: 'true',
  ALGORAND_NETWORK: 'testnet',
  ALGORAND_NODE_URL: 'https://node.example',
  WALLET_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  FARM_ASA_ID: FARM.toString(),
};
let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = process.env;
  process.env = { ...saved, ...ENV };
  delete process.env.X402_FEE_PAYER_ENABLED;
  delete process.env.USDC_ASA_ID;
});
afterEach(() => (process.env = saved));

function mk() {
  const rows = new Map<string, any>();
  const prisma: any = {
    x402_payments: {
      findUnique: jest.fn(
        ({ where }) => rows.get(where.network_tx_id.tx_id) ?? null,
      ),
      create: jest.fn(({ data }) => {
        if (rows.has(data.tx_id)) throw new Error('P2002');
        const r = { id: 'p' + rows.size, ...data };
        rows.set(data.tx_id, r);
        return r;
      }),
      update: jest.fn(({ where, data }) => {
        for (const r of rows.values())
          if (r.id === where.id) Object.assign(r, data);
      }),
      updateMany: jest.fn(() => ({ count: 0 })),
    },
  };
  const feeSigner = {
    address: fee.addr.toString(),
    scheme: 'ed25519',
    sign: jest.fn(async (txns: algosdk.Transaction[]) =>
      txns.map((t) => t.signTxn(fee.sk)),
    ),
    wipe: jest.fn(),
  };
  const chain: any = {
    currentRound: jest.fn().mockResolvedValue(1500n),
    simulate: jest.fn().mockResolvedValue(null),
    send: jest.fn().mockResolvedValue(1501n),
    optedIn: jest.fn().mockResolvedValue(true),
    feePayer: jest.fn(() => feeSigner),
    feePayerAddress: jest.fn(() => fee.addr.toString()),
  };
  const webhooks = { emit: jest.fn() };
  const svc = new X402Service(prisma, chain, {} as any, webhooks as any);
  return { svc, prisma, chain, webhooks, rows, feeSigner };
}

describe('x402 config & helpers', () => {
  it('is off unless X402_ENABLED and refuses mainnet without the allow flag', () => {
    const { svc } = mk();
    expect(svc.status().enabled).toBe(true);
    process.env.X402_ENABLED = 'false';
    expect(svc.status().enabled).toBe(false);
    expect(svc.status().missing).toContain('X402_ENABLED');
    process.env.X402_ENABLED = 'true';
    process.env.ALGORAND_NETWORK = 'mainnet';
    expect(svc.status().enabled).toBe(false);
    process.env.ALGORAND_ALLOW_MAINNET = 'true';
    expect(svc.status().network).toBe(
      'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k',
    );
  });
  it('converts units exactly and blocks private hosts', () => {
    expect(toUnits('12.5', 'FARM')).toBe(1250n);
    expect(toUnits('0.000001', 'USDC')).toBe(1n);
    expect(() => toUnits('1.001', 'FARM')).toThrow();
    expect(fromUnits(1250n, 'FARM')).toBe('12.50');
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.1',
      '169.254.169.254',
      '172.16.0.1',
      '100.64.0.1',
      '::1',
      'fd00::1',
      '::ffff:10.0.0.1',
    ])
      expect(isPublicIp(ip)).toBe(false);
    expect(isPublicIp('8.8.8.8')).toBe(true);
  });
});

describe('x402 verify (exact scheme on Algorand)', () => {
  it('accepts a correct signed ASA transfer and simulates it', async () => {
    const { svc, chain } = mk();
    const v = await svc.verify(payload(single()), req(), biz.addr.toString());
    expect(v.isValid).toBe(true);
    expect(v.payer).toBe(payer.addr.toString());
    expect(chain.simulate).toHaveBeenCalled();
  });
  it.each([
    ['wrong amount', () => single(axfer({ amount: 499n })), 'Amount'],
    [
      'wrong receiver',
      () => single(axfer({ to: fee.addr.toString() })),
      'Receiver',
    ],
    ['wrong asset', () => single(axfer({ asset: 1n })), 'Wrong asset'],
    ['close-out', () => single(axfer({ close: fee.addr.toString() })), 'Close'],
    [
      'unsigned',
      () => [
        enc(
          algosdk.encodeMsgpack(
            new algosdk.SignedTransaction({ txn: axfer() }),
          ),
        ),
      ],
      'not signed',
    ],
  ])('rejects %s', async (_n, g, msg) => {
    const { svc, chain } = mk();
    const v = await svc.verify(payload(g()), req());
    expect(v.isValid).toBe(false);
    expect(v.invalidMessage).toContain(msg);
    expect(chain.simulate).not.toHaveBeenCalled();
  });
  it('rejects mismatched requirements, other networks, foreign payTo and expired txns', async () => {
    const { svc, chain } = mk();
    expect(
      (await svc.verify(payload(single(), 0, { ...req(), amount: '1' }), req()))
        .invalidReason,
    ).toBe('invalid_payment_requirements');
    expect(
      (
        await svc.verify(
          payload(single(), 0, { ...req(), network: 'algorand:x' }),
          { ...req(), network: 'algorand:x' },
        )
      ).invalidReason,
    ).toBe('invalid_network');
    expect(
      (await svc.verify({ ...payload(single()), x402Version: 1 }, req()))
        .invalidReason,
    ).toBe('invalid_x402_version');
    expect(
      (await svc.verify(payload(single()), req(), fee.addr.toString()))
        .invalidMessage,
    ).toContain('payTo');
    chain.currentRound.mockResolvedValue(3000n);
    expect(
      (await svc.verify(payload(single()), req())).invalidMessage,
    ).toContain('expired');
  });
  it('maps a failed simulation to insufficient_funds', async () => {
    const { svc, chain } = mk();
    chain.simulate.mockResolvedValue('asset 3759208862 overspend');
    const v = await svc.verify(payload(single()), req());
    expect(v).toMatchObject({
      isValid: false,
      invalidReason: 'insufficient_funds',
    });
  });
  it('fee sponsorship: signs only a valid 0-ALGO fee txn, and only when enabled', async () => {
    const { svc, feeSigner } = mk();
    expect(
      (await svc.verify(payload(sponsored()), req())).invalidMessage,
    ).toContain('must be signed');
    process.env.X402_FEE_PAYER_ENABLED = 'true';
    process.env.ALGORAND_FUNDER_MNEMONIC = 'x';
    const ok = await svc.verify(payload(sponsored()), req());
    expect(ok.isValid).toBe(true);
    expect(ok.sponsored).toBe(true);
    expect(feeSigner.sign).toHaveBeenCalledTimes(1);
    expect(
      (await svc.verify(payload(sponsored(10_000_000n)), req())).invalidMessage,
    ).toContain('too high');
    const sneaky = sponsored(2000n, (f) => ((f.payment as any).amount = 5n));
    expect((await svc.verify(payload(sneaky), req())).invalidMessage).toContain(
      '0 ALGO',
    );
  });
});

describe('x402 settle', () => {
  const meta = { source: 'facilitator' as const, businessId: 'b1' };
  it('broadcasts once, records the payment and emits a webhook', async () => {
    const { svc, chain, webhooks, rows } = mk();
    const s = await svc.settle(payload(single()), req(), meta);
    expect(s).toMatchObject({
      success: true,
      network: NET,
      payer: payer.addr.toString(),
    });
    expect(chain.send).toHaveBeenCalledTimes(1);
    expect([...rows.values()][0]).toMatchObject({
      status: 'settled',
      amount_units: 500n,
      asset: 'FARM',
    });
    expect(webhooks.emit).toHaveBeenCalledWith(
      'b1',
      'live',
      'x402.payment.settled',
      expect.objectContaining({ amount: '5.00' }),
    );
    const again = await svc.settle(payload(single()), req(), meta);
    expect(again).toMatchObject({
      success: false,
      errorReason: 'invalid_transaction_state',
    });
    expect(chain.send).toHaveBeenCalledTimes(1);
  });
  it('keeps a timed-out broadcast as pending (never reused)', async () => {
    const { svc, chain, rows } = mk();
    chain.send.mockRejectedValue(
      new Error('Transaction not confirmed after 6 rounds'),
    );
    const s = await svc.settle(payload(single()), req(), meta);
    expect(s).toMatchObject({
      success: false,
      errorReason: 'settlement_pending',
    });
    expect([...rows.values()][0].status).toBe('pending');
  });
});

jest.mock('../chain-wallet/key-vault', () => ({
  ...jest.requireActual('../chain-wallet/key-vault'),
  openSecret: jest.fn(() => 'k'.repeat(43)),
}));
jest.mock('./safe-fetch', () => ({
  ...jest.requireActual('./safe-fetch'),
  safeFetch: jest.fn(),
}));
import { safeFetch } from './safe-fetch';

describe('x402 gateway (402 -> payment -> verify -> service -> settle)', () => {
  const resource = {
    id: 'r1',
    business_id: 'b1',
    name: 'Weather',
    description: null,
    method: 'GET',
    upstream_url: 'https://api.example.com/w',
    mime_type: 'application/json',
    asset: 'FARM',
    price_units: 500n,
    pay_to: biz.addr.toString(),
    status: 'active',
    enc_secret: null,
    enc_iv: null,
    enc_tag: null,
  };
  const call = (headers: any = {}) => ({
    method: 'GET',
    url: 'https://farm/v1/x402/r/r1',
    query: '',
    headers,
  });
  const sig = () =>
    Buffer.from(JSON.stringify(payload(single()))).toString('base64');
  function withResource() {
    const m = mk();
    m.prisma.x402_resources = {
      findUnique: jest.fn().mockResolvedValue(resource),
    };
    return m;
  }
  it('answers 402 with PAYMENT-REQUIRED when no payment is attached', async () => {
    const { svc, chain } = withResource();
    const r: any = await svc.gateway('r1', call());
    expect(r.status).toBe(402);
    const body = JSON.parse(
      Buffer.from(r.headers['PAYMENT-REQUIRED'], 'base64').toString(),
    );
    expect(body.accepts[0]).toMatchObject({
      scheme: 'exact',
      network: NET,
      amount: '500',
      payTo: biz.addr.toString(),
    });
    expect(chain.send).not.toHaveBeenCalled();
  });
  it('does not charge when the service fails', async () => {
    const { svc, chain } = withResource();
    (safeFetch as jest.Mock).mockResolvedValue({
      status: 500,
      body: Buffer.from('x'),
      contentType: 'text/plain',
    });
    const r: any = await svc.gateway(
      'r1',
      call({ 'payment-signature': sig() }),
    );
    expect(r.note).toBe('not_charged');
    expect(chain.send).not.toHaveBeenCalled();
  });
  it('settles after a successful service response and returns PAYMENT-RESPONSE', async () => {
    const { svc, chain } = withResource();
    (safeFetch as jest.Mock).mockResolvedValue({
      status: 200,
      body: Buffer.from('{"ok":1}'),
      contentType: 'application/json',
    });
    const r: any = await svc.gateway(
      'r1',
      call({ 'payment-signature': sig() }),
    );
    expect(r.status).toBe(200);
    expect(chain.send).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(
        Buffer.from(r.headers['PAYMENT-RESPONSE'], 'base64').toString(),
      ).success,
    ).toBe(true);
  });
});
