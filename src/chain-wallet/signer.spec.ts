import algosdk from 'algosdk';
import { randomBytes } from 'crypto';
import { falcon1024 } from '@algorandfoundation/falcon-wasm';
import { keyScheme, roleScheme, signerFromMnemonic, signerFromSeed, FEE_MULTIPLIER } from './signer';
import { sealSecret, walletSigner } from './key-vault';
import { AlgorandWalletClient } from './algorand-wallet.client';

const sp: algosdk.SuggestedParams = {
  fee: 0n, minFee: 1000n, flatFee: true, firstValid: 1000n, lastValid: 2000n,
  genesisID: 'testnet-v1.0', genesisHash: new Uint8Array(32),
};
const pay = (sender: string) =>
  algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: sender, amount: 0, suggestedParams: sp });

describe('Falcon / ed25519 signer', () => {
  it('defaults to falcon1024; per-role override wins', () => {
    expect(keyScheme({})).toBe('falcon1024');
    expect(keyScheme({ ALGORAND_KEY_SCHEME: 'ed25519' })).toBe('ed25519');
    expect(roleScheme('FARM_RESERVE', { ALGORAND_KEY_SCHEME: 'ed25519', FARM_RESERVE_KEY_SCHEME: 'falcon1024' })).toBe('falcon1024');
    expect(FEE_MULTIPLIER.falcon1024).toBe(3n);
  });
  it('ed25519 from a mnemonic matches algosdk', async () => {
    const a = algosdk.generateAccount();
    const s = signerFromMnemonic(algosdk.secretKeyToMnemonic(a.sk), 'ed25519');
    expect(s.address).toBe(a.addr.toString());
    const [b] = await s.sign([pay(s.address)]);
    expect(algosdk.decodeSignedTransaction(b).sig).toBeDefined();
  });
  it('falcon1024 derives a deterministic PQ address (same 25 words => same account) and signs verifiably', async () => {
    const mn = algosdk.mnemonicFromSeed(randomBytes(32));
    const s1 = signerFromMnemonic(mn, 'falcon1024');
    const s2 = signerFromMnemonic(mn, 'falcon1024');
    expect(s1.address).toBe(s2.address);
    expect(s1.address).not.toBe(algosdk.mnemonicToSecretKey(mn).addr.toString());
    expect(algosdk.isValidAddress(s1.address)).toBe(true);
    const t = pay(s1.address);
    const [b] = await s1.sign([t]);
    const st = algosdk.decodeSignedTransaction(b);
    expect(st.sig).toBeUndefined();
    const pq: any = st.pqsig;
    expect(pq?.sig?.length).toBeGreaterThan(500);
    expect(algosdk.addressFromPQSig(pq).toString()).toBe(s1.address);
    expect(falcon1024.verifyCompressed(pq.pk ?? pq.key, pq.sig, new Uint8Array(t.bytesToSign()))).toBe(true);
    s1.wipe();
    s2.wipe();
  });
  it('custodial rows: new falcon seed rows and legacy ed25519 64-byte rows both open; tampered address rejected', async () => {
    const env = { WALLET_KEY_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
    const seed = new Uint8Array(randomBytes(32));
    const f = signerFromSeed(seed, 'falcon1024');
    const row = { address: f.address, key_scheme: 'falcon1024', ...sealSecret(seed, f.address, env) };
    expect(walletSigner(row, env).address).toBe(f.address);
    const legacy = algosdk.generateAccount();
    const la = legacy.addr.toString();
    expect(walletSigner({ address: la, key_scheme: 'ed25519', ...sealSecret(legacy.sk, la, env) }, env).address).toBe(la);
    // same sealed seed claimed as ed25519 => address mismatch
    expect(() => walletSigner({ ...row, key_scheme: 'ed25519' }, env)).toThrow(/does not match/);
  });
  it('new custodial accounts keep only a 32-byte seed', () => {
    const a = new AlgorandWalletClient().newAccount('falcon1024');
    expect(a.seed.length).toBe(32);
    expect(a.scheme).toBe('falcon1024');
    expect(signerFromSeed(a.seed, 'falcon1024').address).toBe(a.address);
  });
  it('fees: falcon txn = 3x min fee', () => {
    expect(AlgorandWalletClient.fee(1000n, 'falcon1024')).toBe(3000n);
    expect(AlgorandWalletClient.fee(1000n, 'ed25519')).toBe(1000n);
  });
  it('reserve key must match FARM_RESERVE_ADDRESS', () => {
    const mn = algosdk.mnemonicFromSeed(randomBytes(32));
    const OLD = { ...process.env };
    Object.assign(process.env, { FARM_RESERVE_MNEMONIC: mn, FARM_RESERVE_ADDRESS: signerFromMnemonic(mn, 'falcon1024').address });
    delete process.env.ALGORAND_KEY_SCHEME;
    expect(new AlgorandWalletClient().reserveSigner().scheme).toBe('falcon1024');
    process.env.FARM_RESERVE_KEY_SCHEME = 'ed25519';
    expect(() => new AlgorandWalletClient().reserveSigner()).toThrow(/does not match/);
    process.env = OLD;
  });
  it('FARM transfer group: funder pays 3x per Falcon signature, sender fee 0, txId known before send', async () => {
    const OLD = { ...process.env };
    process.env.ALGORAND_FUNDER_MNEMONIC = algosdk.mnemonicFromSeed(randomBytes(32));
    delete process.env.ALGORAND_KEY_SCHEME;
    const c = new AlgorandWalletClient();
    const sent: Uint8Array[][] = [];
    jest.spyOn(c as any, 'algod').mockReturnValue({
      getTransactionParams: () => ({ do: () => Promise.resolve(sp) }),
      sendRawTransaction: (b: Uint8Array[]) => ({ do: () => (sent.push(b), Promise.resolve({})) }),
    });
    jest.spyOn(algosdk, 'waitForConfirmation').mockResolvedValue({} as any);
    const from = signerFromSeed(new Uint8Array(randomBytes(32)), 'falcon1024');
    const p = await c.prepareFarmTransfer({ from: from.address, signer: from, to: from.address, assetId: 42n, amount: 5n, note: 'n' });
    expect(sent).toHaveLength(0);
    expect(p.lastValid).toBe(2000n);
    await p.send();
    const [fee, ax] = sent[0].map((b) => algosdk.decodeSignedTransaction(b));
    expect(fee.txn.fee).toBe(6000n);
    expect(ax.txn.fee).toBe(0n);
    expect(ax.txn.txID()).toBe(p.txId);
    expect(fee.pqsig && ax.pqsig).toBeTruthy();
    expect(Buffer.from(fee.txn.group!)).toEqual(Buffer.from(ax.txn.group!));
    process.env = OLD;
  });
});
