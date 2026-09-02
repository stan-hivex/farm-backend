import { ConfigService } from '@nestjs/config';
export declare class AlgorandService {
    private cfg;
    private readonly logger;
    private algodClient;
    private indexerClient;
    private farmAsaId;
    constructor(cfg: ConfigService);
    getFarmBalance(address: string): Promise<number>;
    transferFarm(fromMnemonic: string, toAddress: string, amount: number): Promise<string>;
    generateWallet(): {
        address: string;
        mnemonic: string;
    };
    isValidAddress(address: string): boolean;
}
