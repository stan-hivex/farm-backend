import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
export interface JwtPayload {
    sub: string;
    role: string;
    wallet_id?: string;
    jti: string;
}
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private cfg;
    private prisma;
    constructor(cfg: ConfigService, prisma: PrismaService);
    validate(req: Request, payload: JwtPayload): Promise<{
        id: string;
        role: import("@prisma/client").$Enums.user_role | null;
        wallet_id: string | undefined;
        jti: string;
    }>;
}
export {};
