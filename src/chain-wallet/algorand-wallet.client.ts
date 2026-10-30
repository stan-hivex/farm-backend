import { Injectable } from '@nestjs/common';
import algosdk from 'algosdk';

export interface IncomingTransfer {
  txId: string;
  assetId: bigint;
  sender: string;
  receiver: string;
  amount: bigint;
  round: bigint;
}

/** All algod/indexer access for Phase 6. Never logs keys. */
@Injectable()
export class AlgorandWalletClient {
  private algod() {
    return new algosdk.Algodv2(
      process.env.ALGORAND_TOKEN ?? '',
      process.env.ALGORAND_NODE_URL!,
      '',
    );
  }
  private indexer() {
    return new algosdk.Indexer(
      process.env.ALGORAND_INDEXER_TOKEN ?? '',
      process.env.ALGORAND_INDEXER_URL,
      '',
    );
  }
  private issuer() {
    return algosdk.mnemonicToSecretKey(process.env.ALGORAND_ISSUER_MNEMONIC!);
  }

  newAccount(): { address: string; sk: Uint8Array } {
    const a = algosdk.generateAccount();
    return { address: a.addr.toString(), sk: a.sk };
  }

  private async send(txn: algosdk.Transaction, sk: Uint8Array) {
    const algod = this.algod();
    const id = txn.txID();
    await algod.sendRawTransaction(txn.signTxn(sk)).do();
    await algosdk.waitForConfirmation(algod, id, 8);
    return id;
  }

  /** Issuer pays the min-balance; then the account opts in to an ASA. */
  async fund(address: string, microAlgos: bigint) {
    const iss = this.issuer();
    const sp = await this.algod().getTransactionParams().do();
    const t = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: iss.addr,
      receiver: address,
      amount: microAlgos,
      suggestedParams: sp,
    });
    return this.send(t, iss.sk);
  }

  async optIn(address: string, sk: Uint8Array, assetId: bigint) {
    const sp = await this.algod().getTransactionParams().do();
    const t = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: address,
      receiver: address,
      amount: 0,
      assetIndex: assetId,
      suggestedParams: sp,
    });
    return this.send(t, sk);
  }

  /** Move FARM from the issuer reserve to a custodial address. */
  async sendFromIssuer(receiver: string, assetId: bigint, amount: bigint) {
    const iss = this.issuer();
    const sp = await this.algod().getTransactionParams().do();
    const t = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: iss.addr,
      receiver,
      amount,
      assetIndex: assetId,
      suggestedParams: sp,
    });
    return this.send(t, iss.sk);
  }

  async assetBalance(address: string, assetId: bigint): Promise<bigint> {
    try {
      const r = await this.algod()
        .accountAssetInformation(address, assetId)
        .do();
      return BigInt(r.assetHolding?.amount ?? 0);
    } catch {
      return 0n;
    }
  }

  async currentRound(): Promise<bigint> {
    const s = await this.algod().status().do();
    return BigInt(s.lastRound);
  }

  /** Confirmed asset transfers of `assetId` from `minRound` (inclusive). */
  async transfersSince(
    assetId: bigint,
    minRound: bigint,
    limit = 500,
  ): Promise<IncomingTransfer[]> {
    const r = await this.indexer()
      .searchForTransactions()
      .assetID(assetId)
      .txType('axfer')
      .minRound(minRound)
      .limit(limit)
      .do();
    return (r.transactions ?? [])
      .filter(
        (t) => t.assetTransferTransaction && t.id && t.confirmedRound != null,
      )
      .map((t) => ({
        txId: t.id!,
        assetId,
        sender: t.sender,
        receiver: t.assetTransferTransaction!.receiver,
        amount: BigInt(t.assetTransferTransaction!.amount),
        round: BigInt(t.confirmedRound!),
      }));
  }
}
