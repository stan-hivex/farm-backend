import { QrService } from './qr.service';
declare class ValidateQrDto {
    qr_payload: string;
}
export declare class MerchantPayDto {
    qr_payload: string;
    amount: number;
    pin?: string;
    biometric_auth?: boolean;
    device_fingerprint?: string;
}
export declare class QrController {
    private readonly svc;
    constructor(svc: QrService);
    validate(dto: ValidateQrDto, u: any): Promise<{
        data: {
            valid: boolean;
            type: string;
            merchant_id: string;
            business_name: any;
            fee_percent: number;
            daily_limit: number;
            wallet_address?: undefined;
            suggested_amount?: undefined;
        };
    } | {
        data: {
            valid: boolean;
            type: string;
            wallet_address: any;
            suggested_amount: any;
            merchant_id?: undefined;
            business_name?: undefined;
            fee_percent?: undefined;
            daily_limit?: undefined;
        };
    }>;
    pay(dto: MerchantPayDto, u: any): Promise<{
        data: {
            reference: string;
            amount: number;
            fee: number;
            status: string;
        };
        message: string;
    }>;
    receive(u: any, amount?: number): Promise<{
        data: {
            qr_payload: string;
            qr_image_base64: string;
        };
    }>;
}
export {};
