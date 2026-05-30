import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import algosdk from 'algosdk';

@Injectable()
export class AlgorandService {
  private readonly logger = new Logger(AlgorandService.name);
  private algodClient: algosdk.Algodv2;
  private indexerClient: algosdk.Indexer;
  private farmAsaId: number;

  constructor(private cfg: ConfigService) {
    this.algodClient = new algosdk.Algodv2(
      cfg.get<string>('ALGORAND_TOKEN', ''),
      cfg.get<string>('ALGORAND_NODE_URL', 'https://testnet-api.algonode.cloud'),
      '',
    );
    this.indexerClient = new algosdk.Indexer(
      '',
      cfg.get<string>('ALGORAND_INDEXER_URL', 'https://testnet-idx.algonode.cloud'),
      '',
    );
    this.farmAsaId = Number(cfg.get<string>('FARM_ASA_ID', '0'));
  }

  async getFarmBalance(address: string): Promise<number> {
    try {
      const info = await this.algodClient.accountInformation(address).do();
      const asset = (info.assets ?? []).find((a: any) => a['asset-id'] === this.farmAsaId);
      return asset ? Number(asset.amount) / Math.pow(10, 6) : 0;
    } catch { return 0; }
  }

  async transferFarm(fromMnemonic: string, toAddress: string, amount: number): Promise<string> {
    const fromAccount = algosdk.mnemonicToSecretKey(fromMnemonic);
    const suggestedParams = await this.algodClient.getTransactionParams().do();
    const amountMicroFarm = Math.round(amount * Math.pow(10, 6));

    // algosdk v3: 'receiver' instead of 'to'
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: fromAccount.addr,
      receiver: toAddress,
      amount: amountMicroFarm,
      assetIndex: this.farmAsaId,
      suggestedParams,
    });

    const signed = txn.signTxn(fromAccount.sk);
    const response = await this.algodClient.sendRawTransaction(signed).do();

    // algosdk v3: txid (lowercase) instead of txId
    await algosdk.waitForConfirmation(this.algodClient, response.txid, 4);
    this.logger.log(`Algorand transfer: ${response.txid} | ${amount} FARM → ${toAddress}`);
    return response.txid;
  }

  generateWallet(): { address: string; mnemonic: string } {
    const account = algosdk.generateAccount();
    return {
      address: account.addr.toString(),
      mnemonic: algosdk.secretKeyToMnemonic(account.sk),
    };
  }

  isValidAddress(address: string): boolean {
    return algosdk.isValidAddress(address);
  }
}