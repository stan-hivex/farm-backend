import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class QrService {
    private prisma;
    private authService;
    private securityService;
    private cfg;
    private notificationsService;
    private readonly logger;
    constructor(prisma: PrismaService, authService: AuthService, securityService: SecurityService, cfg: ConfigService, notificationsService: NotificationsService);
    generateMerchantQr(merchantId: string): Promise<{
        data: {
            qr_payload: string;
            qr_image_base64: string;
            qr_image_data_url: string;
        };
    }>;
    getMerchantQr(merchantId: string): Promise<{
        data: {
            qr_payload: string;
            qr_image_base64: string;
            qr_image_data_url: string;
        };
    }>;
    generateReceiveQr(userId: string, amount?: number): Promise<{
        data: {
            qr_payload: string;
            qr_image_base64: string;
        };
    }>;
    validate(scannedPayload: string, customerId: string): Promise<{
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
    merchantPay(customerId: string, dto: {
        qr_payload: string;
        amount: number;
        pin?: string;
        biometric_auth?: boolean;
        device_fingerprint?: string;
    }): Promise<{
        data: {
            reference: string;
            amount: number;
            fee: number;
            status: string;
        };
        message: string;
    }>;
    private sign;
}
