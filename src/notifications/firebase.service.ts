import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Messaging } from 'firebase-admin/messaging';

@Injectable()
export class FirebaseService {
  public readonly messaging: Messaging;

  constructor() {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }

    this.messaging = admin.messaging();
  }
}
