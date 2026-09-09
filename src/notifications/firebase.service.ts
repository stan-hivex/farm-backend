import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import type { Messaging } from 'firebase-admin/messaging';
import * as path from 'path';

@Injectable()
export class FirebaseService {
  constructor() {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(
          path.join(process.cwd(), 'firebase', 'firebase-adminsdk.json'),
        ),
      });
    }
  }

  get messaging(): Messaging {
    return admin.messaging();
  }

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return admin.auth().verifyIdToken(idToken);
  }
}
