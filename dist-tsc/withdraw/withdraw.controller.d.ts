import { WithdrawService } from './withdraw.service';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';
import { TransferWithdrawDto } from './dto/transfer-withdraw.dto';
export declare class WithdrawController {
    private readonly withdrawService;
    constructor(withdrawService: WithdrawService);
    create(req: any, dto: CreateWithdrawDto): Promise<{
        success: boolean;
        reference: string;
        withdrawal: {
            id: string;
            status: string;
            currency: string;
            userId: string;
            amount: number;
            total: number;
            fee: number;
            reference: string;
            createdAt: Date;
            updatedAt: Date;
            method: string;
            settlement: number;
            accountName: string | null;
            accountNumber: string | null;
            bankName: string | null;
            phoneNumber: string | null;
            cryptoAddress: string | null;
            cryptoAsset: string | null;
            network: string | null;
            rejectionReason: string | null;
        };
    }>;
    transfer(req: any, dto: TransferWithdrawDto): Promise<{
        success: boolean;
        reference: string;
        withdrawal: {
            id: string;
            status: string;
            currency: string;
            userId: string;
            amount: number;
            total: number;
            fee: number;
            reference: string;
            createdAt: Date;
            updatedAt: Date;
            method: string;
            settlement: number;
            accountName: string | null;
            accountNumber: string | null;
            bankName: string | null;
            phoneNumber: string | null;
            cryptoAddress: string | null;
            cryptoAsset: string | null;
            network: string | null;
            rejectionReason: string | null;
        };
    }>;
    history(req: any): Promise<{
        id: string;
        status: string;
        currency: string;
        userId: string;
        amount: number;
        total: number;
        fee: number;
        reference: string;
        createdAt: Date;
        updatedAt: Date;
        method: string;
        settlement: number;
        accountName: string | null;
        accountNumber: string | null;
        bankName: string | null;
        phoneNumber: string | null;
        cryptoAddress: string | null;
        cryptoAsset: string | null;
        network: string | null;
        rejectionReason: string | null;
    }[]>;
    getStatus(req: any, reference: string): Promise<{
        success: boolean;
        message: string;
        status?: undefined;
    } | {
        success: boolean;
        status: any;
        message?: undefined;
    }>;
    getCryptoNetworks(req: any, token: string): Promise<{
        success: boolean;
        token: string;
        networks: string[];
    }>;
    getOne(id: string, req: any): Promise<{
        id: string;
        status: string;
        currency: string;
        userId: string;
        amount: number;
        total: number;
        fee: number;
        reference: string;
        createdAt: Date;
        updatedAt: Date;
        method: string;
        settlement: number;
        accountName: string | null;
        accountNumber: string | null;
        bankName: string | null;
        phoneNumber: string | null;
        cryptoAddress: string | null;
        cryptoAsset: string | null;
        network: string | null;
        rejectionReason: string | null;
    } | null>;
}
