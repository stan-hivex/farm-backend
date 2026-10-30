import { Injectable } from '@nestjs/common';
import algosdk from 'algosdk';
import { AlgoSigner, roleScheme, signerFromMnemonic } from '../chain-wallet/signer';

/** Thin algod adapter for x402 (mockable in tests). Keys are never logged. */
@Injectable()
export class X402Chain {
  private algod() {
    return new algosdk.Algodv2(process.env.ALGORAND_TOKEN ?? '', process.env.ALGORAND_NODE_URL!, '');
  }
  async currentRound(): Promise<bigint> {
    return BigInt((await this.algod().status().do()).lastRound);
  }
  /** Returns null when the group would succeed, else the node's failure message. */
  async simulate(group: Uint8Array[]): Promise<string | null> {
    const req = new algosdk.modelsv2.SimulateRequest({
      txnGroups: [new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns: group.map((b) => algosdk.decodeSignedTransaction(b)) })],
    });
    const r = await this.algod().simulateTransactions(req).do();
    const g = r.txnGroups?.[0];
    return g?.failureMessage ? String(g.failureMessage).slice(0, 300) : null;
  }
  /** Broadcasts and waits for confirmation. Returns the confirmed round. */
  async send(group: Uint8Array[], txId: string): Promise<bigint> {
    const algod = this.algod();
    await algod.sendRawTransaction(group).do();
    const p = await algosdk.waitForConfirmation(algod, txId, 6);
    return BigInt(p.confirmedRound ?? 0);
  }
  async optedIn(address: string, assetId: bigint): Promise<boolean> {
    try {
      await this.algod().accountAssetInformation(address, assetId).do();
      return true;
    } catch {
      return false;
    }
  }
  /** Fee payer = the existing ALGORAND_FUNDER account. Only used when X402_FEE_PAYER_ENABLED. */
  feePayer(): AlgoSigner {
    return signerFromMnemonic(process.env.ALGORAND_FUNDER_MNEMONIC!, roleScheme('ALGORAND_FUNDER'));
  }
  feePayerAddress(): string {
    const s = this.feePayer();
    try {
      return s.address;
    } finally {
      s.wipe();
    }
  }
}
