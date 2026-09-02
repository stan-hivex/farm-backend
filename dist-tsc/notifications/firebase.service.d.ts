import * as admin from 'firebase-admin';
import { Messaging } from 'firebase-admin/messaging';
export declare class FirebaseService {
    private readonly logger;
    readonly messaging: Messaging | null;
    verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken>;
    get auth(): admin.auth.Auth;
    constructor();
}
