import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { Messaging } from 'firebase-admin/messaging';
import * as path from 'path';

@Injectable()
export class FirebaseService {
  public readonly messaging: Messaging;

  constructor() {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(
          path.join(
            process.cwd(),
            'firebase',
            'farmapp-e2145-firebase-adminsdk-fbsvc-326931e048.json',
          ),
        ),
      });
    }

    this.messaging = admin.messaging();
  }
}
