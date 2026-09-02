import { PrismaService } from '../database/prisma.service';
import { IvorypayService } from './ivorypay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { CurrencyConversionService } from '../currency/currency-conversion.service';
export declare class IvorypayDepositService {
    private readonly prisma;
    private readonly ivorypayService;
    private readonly notificationsService;
    private readonly websocket;
    private readonly currencyConversionService;
    private readonly logger;
    constructor(prisma: PrismaService, ivorypayService: IvorypayService, notificationsService: NotificationsService, websocket: WebsocketGateway, currencyConversionService: CurrencyConversionService);
    createDeposit(userId: string, dto: any): Promise<{
        success: boolean;
        data: {
            reference: string;
            payment_url: any;
            authorization_url: any;
        };
        message: string;
    }>;
    getStatus(reference: string): Promise<{
        success: boolean;
        data: {
            reference: string;
            status: import("@prisma/client").$Enums.DepositStatus;
            provider: string | null;
        };
    }>;
    handleWebhook(payload: any, verified?: boolean): Promise<{
        processed: boolean;
        reason: string;
        duplicate?: undefined;
        reference?: undefined;
        status?: undefined;
    } | {
        processed: boolean;
        duplicate: boolean;
        reference: string;
        reason?: undefined;
        status?: undefined;
    } | {
        processed: boolean;
        reference: string;
        status: string;
        reason?: undefined;
        duplicate?: undefined;
    } | {
        processed: boolean;
        reason: string;
        reference: string;
        duplicate?: undefined;
        status?: undefined;
    } | {
        processed: boolean;
        reason: string;
        reference: string;
        status: any;
        duplicate?: undefined;
    }>;
    private resolveReference;
    private isSuccess;
    private isFailure;
}
