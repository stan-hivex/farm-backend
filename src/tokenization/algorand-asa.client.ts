import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import algosdk from 'algosdk';
import { algorandConfig } from './algorand-config';

export interface AsaCreated {
  assetId: bigint;
  txId: string;
  confirmedRound: bigint;
  issuer: string;
}

/** Thin wrapper around algod. Secrets are read at call time and never logged. */
@Injectable()
export class AlgorandAsaClient {
  async createAsset(p: {
    assetName: string;
    unitName: string;
    total: bigint;
    url?: string;
    note?: string;
  }): Promise<AsaCreated> {
    const cfg = algorandConfig();
    if (!cfg.enabled)
      throw new ServiceUnavailableException('Tokenization is not configured');
    const algod = new algosdk.Algodv2(
      process.env.ALGORAND_TOKEN ?? '',
      process.env.ALGORAND_NODE_URL!,
      '',
    );
    let acct: algosdk.Account;
    try {
      acct = algosdk.mnemonicToSecretKey(process.env.ALGORAND_ISSUER_MNEMONIC!);
    } catch {
      throw new ServiceUnavailableException('Issuer account is misconfigured');
    }
    const issuer = acct.addr.toString();
    const sp = await algod.getTransactionParams().do();
    const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
      sender: issuer,
      total: p.total,
      decimals: 0,
      defaultFrozen: false,
      unitName: p.unitName,
      assetName: p.assetName,
      assetURL: p.url,
      manager: issuer,
      reserve: issuer,
      freeze: issuer,
      clawback: issuer,
      note: p.note ? new TextEncoder().encode(p.note) : undefined,
      suggestedParams: sp,
    });
    const signed = txn.signTxn(acct.sk);
    const txId = txn.txID();
    await algod.sendRawTransaction(signed).do();
    const res = await algosdk.waitForConfirmation(algod, txId, 8);
    if (res.assetIndex == null || res.confirmedRound == null)
      throw new Error('Asset creation was not confirmed');
    return {
      assetId: BigInt(res.assetIndex),
      txId,
      confirmedRound: BigInt(res.confirmedRound),
      issuer,
    };
  }
}
