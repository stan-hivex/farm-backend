import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Messaging } from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  public readonly messaging: Messaging | null;

  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    if (!admin.apps.length) {
      throw new Error('Firebase Admin is not configured');
    }
    return admin.auth().verifyIdToken(token);
  }

  get auth(): admin.auth.Auth {
    if (!admin.apps.length) {
      throw new Error('Firebase Admin is not configured');
    }
    return admin.auth();
  }

  constructor() {
    if (admin.apps.length === 0) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        try {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });
          this.logger.log('Firebase Admin initialized successfully');
        } catch (error) {
          this.logger.warn(
            `Firebase initialization skipped: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        const serviceAccountPath = resolve(
          process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
            'firebase/farmapp-e2145-firebase-adminsdk-fbsvc-326931e048.json',
        );

        if (existsSync(serviceAccountPath)) {
          try {
            const serviceAccount = JSON.parse(
              readFileSync(serviceAccountPath, 'utf8'),
            ) as admin.ServiceAccount;
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            });
            this.logger.log(
              `Firebase Admin initialized from ${serviceAccountPath}`,
            );
          } catch (error) {
            this.logger.warn(
              `Firebase service-account initialization skipped: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else {
          this.logger.warn(
            'Firebase credentials not fully configured. Firebase features will be disabled.',
          );
        }
      }
    }

    this.messaging = admin.apps.length > 0 ? admin.messaging() : null;
  }
}
