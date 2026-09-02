import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
export declare class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private jwtService;
    private cfg;
    server: Server;
    private readonly logger;
    private userSockets;
    constructor(jwtService: JwtService, cfg: ConfigService);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleIdentify(data: {
        token: string;
    }, client: Socket): Promise<{
        event: string;
        data: {
            user_id: any;
            message?: undefined;
        };
    } | {
        event: string;
        data: {
            message: string;
            user_id?: undefined;
        };
    }>;
    emitToUser(userId: string, event: string, data: any): void;
    emitTransactionUpdate(userId: string, transaction: any): void;
    emitEscrowUpdate(userId: string, escrow: any): void;
    emitBalanceUpdate(userId: string, balance: number): void;
}
