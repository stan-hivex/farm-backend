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

export interface PreparedTransfer {
  txId: string;
  lastValid: bigint;
  send: () => Promise<void>;
}

/**
 * All algod/indexer access for Phase 6. Keys are only held in memory for the
 * duration of a call and never logged. FARM ASA is never created here: it is
 * created by the owner in Pera and referenced by FARM_ASA_ID.
 */
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
  /** Pays ALGO: min balance for new accounts and fees (fee pooling). */
  private funder() {
    return algosdk.mnemonicToSecretKey(process.env.ALGORAND_FUNDER_MNEMONIC!);
  }
  /** FARM reserve (the owner's Pera account). Only needed for server-side top-ups/sync. */
  reserveSk(): Uint8Array {
    const a = algosdk.mnemonicToSecretKey(process.env.FARM_RESERVE_MNEMONIC!);
    if (a.addr.toString() !== process.env.FARM_RESERVE_ADDRESS)
      throw new Error(
        'FARM_RESERVE_MNEMONIC does not match FARM_RESERVE_ADDRESS',
      );
    return a.sk;
  }

  newAccount(): { address: string; sk: Uint8Array } {
    const a = algosdk.generateAccount();
    return { address: a.addr.toString(), sk: a.sk };
  }

  private async sendOne(txn: algosdk.Transaction, sk: Uint8Array) {
    const algod = this.algod();
    const id = txn.txID();
    await algod.sendRawTransaction(txn.signTxn(sk)).do();
    await algosdk.waitForConfirmation(algod, id, 8);
    return id;
  }

  async fund(address: string, microAlgos: bigint) {
    const f = this.funder();
    const sp = await this.algod().getTransactionParams().do();
    const t = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: f.addr,
      receiver: address,
      amount: microAlgos,
      suggestedParams: sp,
    });
    return this.sendOne(t, f.sk);
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
    return this.sendOne(t, sk);
  }

  /**
   * Build a FARM transfer whose fee is paid by the funder (atomic group), so
   * custodial accounts never need ALGO top-ups. The txId and lastValid are
   * known BEFORE sending, so the caller can persist them first (outbox).
   */
  async prepareFarmTransfer(p: {
    from: string;
    fromSk: Uint8Array;
    to: string;
    assetId: bigint;
    amount: bigint;
    note: string;
  }): Promise<PreparedTransfer> {
    const f = this.funder();
    const sp = await this.algod().getTransactionParams().do();
    const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: p.from,
      receiver: p.to,
      amount: p.amount,
      assetIndex: p.assetId,
      note: new TextEncoder().encode(p.note),
      suggestedParams: { ...sp, fee: 0n, flatFee: true },
    });
    const feePay = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: f.addr,
      receiver: f.addr,
      amount: 0,
      suggestedParams: { ...sp, fee: BigInt(sp.minFee) * 2n, flatFee: true },
    });
    algosdk.assignGroupID([feePay, axfer]);
    const signed = [feePay.signTxn(f.sk), axfer.signTxn(p.fromSk)];
    const txId = axfer.txID();
    const algod = this.algod();
    return {
      txId,
      lastValid: BigInt(axfer.lastValid),
      send: async () => {
        await algod.sendRawTransaction(signed).do();
        await algosdk.waitForConfirmation(algod, txId, 8);
      },
    };
  }

  /** 'confirmed' | 'pending' | 'unknown' for a txId we may have sent before. */
  async txStatus(txId: string): Promise<'confirmed' | 'pending' | 'unknown'> {
    try {
      const p = await this.algod().pendingTransactionInformation(txId).do();
      return p.confirmedRound && p.confirmedRound > 0 ? 'confirmed' : 'pending';
    } catch {
      /* not in the node's pool any more - ask the indexer */
    }
    try {
      const r = await this.indexer().lookupTransactionByID(txId).do();
      return r.transaction?.confirmedRound ? 'confirmed' : 'unknown';
    } catch {
      return 'unknown';
    }
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
