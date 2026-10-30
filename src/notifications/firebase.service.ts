import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Messaging } from 'firebase-admin/messaging';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  public readonly messaging: Messaging | null;

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
        this.logger.warn(
          'Firebase credentials not fully configured. Firebase features will be disabled.',
        );
      }
    }

    this.messaging = admin.apps.length > 0 ? admin.messaging() : null;
  }
}
