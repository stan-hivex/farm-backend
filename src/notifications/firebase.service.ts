import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import type { Messaging } from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private initialized = false;

  constructor() {
    if (admin.apps.length > 0) {
      this.initialized = true;
      return;
    }

    try {
      const serviceAccount = this.getServiceAccount();
      if (serviceAccount) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        this.initialized = true;
        this.logger.log('Firebase Admin initialized with service account credentials');
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
        this.initialized = true;
        this.logger.log('Firebase Admin initialized with application default credentials');
      } else {
        this.logger.warn(
          'Firebase Admin credentials are not configured. Push notifications and Firebase phone verification are disabled.',
        );
      }
    } catch (error) {
      this.logger.error(`Firebase Admin initialization failed: ${(error as Error).message}`);
    }
  }

  get messaging(): Messaging {
    if (!this.initialized) {
      throw new Error('Firebase Admin is not configured');
    }
    return admin.messaging();
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    if (!this.initialized) {
      throw new Error('Firebase Admin is not configured');
    }
    return admin.auth().verifyIdToken(idToken);
  }

  private getServiceAccount(): admin.ServiceAccount | null {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (json) {
      return JSON.parse(json) as admin.ServiceAccount;
    }

    const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    const localPath = path.join(process.cwd(), 'firebase', 'firebase-adminsdk-fbsvc-326931e048.json');
    const filePath = credentialPath || (existsSync(localPath) ? localPath : '');
    if (!filePath || !existsSync(filePath)) {
      return null;
    }

    return JSON.parse(readFileSync(filePath, 'utf8')) as admin.ServiceAccount;
  }
}
